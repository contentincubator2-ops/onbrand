/**
 * brandColorExtractor — extract dominant colors from a single product image.
 *
 * Riverflow-style pipeline:
 *   1. Download image to buffer
 *   2. Resize to a thumbnail (128×128) so K-means is fast
 *   3. Convert each pixel sRGB → linear RGB → XYZ → LAB
 *   4. K-means++ in LAB space (k=5 by default)
 *   5. Convert centroids back to RGB → hex
 *   6. Filter near-white / near-black / near-gray (controllable)
 *   7. De-duplicate similar colors via ΔE (CIE76 Euclidean in LAB)
 *   8. Sort by cluster frequency (most pixels first)
 *
 * Why LAB instead of RGB:
 *   - LAB is perceptually uniform — distance roughly matches what the eye
 *     calls "different colors". K-means in RGB merges visually distinct
 *     colors (e.g. burnt orange + lemon) into one cluster because they're
 *     near-equidistant on a color cube.
 *
 * Why custom (not node-vibrant):
 *   - node-vibrant uses Material Design color targets (vibrant / muted /
 *     light / dark) which are optimised for app theming, not brand palette
 *     extraction. For brand DNA we want the most-common true colors
 *     regardless of saturation.
 *   - Avoid the dependency (~80KB) since `sharp` already pixel-samples for us.
 *
 * 2026-06-21 (CJ「按 riverflow 標準」brand DNA sprint) — created.
 */
import sharp from "sharp";

// ── Types ────────────────────────────────────────────────────────────────

export interface ExtractedSwatch {
  /** "#RRGGBB" lowercase */
  hex: string;
  rgb: { r: number; g: number; b: number };
  lab: { L: number; a: number; b: number };
  /** Fraction of sampled pixels in this cluster (0-1) */
  frequency: number;
}

export interface ExtractOptions {
  /** Number of clusters. Default 5; useful range 4-8. */
  k?: number;
  /** Thumbnail size for clustering. Larger = slower but more accurate.
   *  Default 128 → 16,384 pixels (sub-second on average hardware). */
  thumbSize?: number;
  /** Drop swatches with chroma below this (gray-like). Default 5. Set 0 to keep all. */
  minChroma?: number;
  /** Drop swatches with L outside this range (true white / true black). Default [3, 97]. */
  lightnessRange?: [number, number];
  /** Merge swatches within this ΔE (CIE76). Default 12 — gentle de-dup. */
  mergeWithinDeltaE?: number;
  /** Max K-means iterations. Default 30. */
  maxIters?: number;
  /** Random seed for reproducibility. */
  seed?: number;
}

const DEFAULTS: Required<ExtractOptions> = {
  k: 5,
  thumbSize: 128,
  minChroma: 5,
  lightnessRange: [3, 97],
  mergeWithinDeltaE: 12,
  maxIters: 30,
  seed: 42,
};

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Extract a palette from an image URL or Buffer. Returns swatches in
 * frequency order (most prominent first). Throws on network / decode error.
 */
export async function extractPaletteFromImage(
  imageUrlOrBuffer: string | Buffer,
  opts: ExtractOptions = {},
): Promise<ExtractedSwatch[]> {
  const o = { ...DEFAULTS, ...opts };

  // 1. Load → raw RGBA pixels at thumbnail size
  const buf = typeof imageUrlOrBuffer === "string"
    ? await fetchToBuffer(imageUrlOrBuffer)
    : imageUrlOrBuffer;

  const { data, info } = await sharp(buf)
    .resize(o.thumbSize, o.thumbSize, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // 2. Walk pixels, skip transparent, convert to LAB
  const labPixels: Array<[number, number, number]> = []; // [L, a, b]
  const channels = info.channels; // 4 (RGBA)
  for (let i = 0; i < data.length; i += channels) {
    const alpha = data[i + 3] ?? 0;
    if (alpha < 128) continue; // skip transparent pixels (PNGs with cutouts)
    const lab = rgbToLab(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
    labPixels.push([lab.L, lab.a, lab.b]);
  }
  if (labPixels.length === 0) return [];

  // 3. K-means++ initialization + Lloyd's iterations
  const rng = mulberry32(o.seed);
  let centroids = kmeansPlusPlusInit(labPixels, o.k, rng);
  let assignments = new Int32Array(labPixels.length);

  for (let iter = 0; iter < o.maxIters; iter++) {
    // Assign
    let changed = 0;
    for (let i = 0; i < labPixels.length; i++) {
      const px = labPixels[i]!; // index is guaranteed in range by loop bound
      const best = nearestCentroid(px, centroids);
      if (assignments[i] !== best) {
        assignments[i] = best;
        changed++;
      }
    }
    // Recompute
    const newCentroids: Array<[number, number, number]> = Array.from(
      { length: o.k },
      () => [0, 0, 0],
    );
    const counts = new Int32Array(o.k);
    for (let i = 0; i < labPixels.length; i++) {
      const c = assignments[i]!;
      const px = labPixels[i]!;
      const target = newCentroids[c]!;
      target[0] += px[0];
      target[1] += px[1];
      target[2] += px[2];
      counts[c] = (counts[c] ?? 0) + 1;
    }
    for (let c = 0; c < o.k; c++) {
      const ct = counts[c] ?? 0;
      if (ct === 0) continue; // empty cluster — keep prior centroid
      const cen = newCentroids[c]!;
      cen[0] /= ct;
      cen[1] /= ct;
      cen[2] /= ct;
    }
    centroids = newCentroids;
    if (changed === 0) break;
  }

  // 4. Count cluster membership for frequency
  const counts = new Int32Array(o.k);
  for (let i = 0; i < labPixels.length; i++) {
    const idx = assignments[i]!;
    counts[idx] = (counts[idx] ?? 0) + 1;
  }
  const totalAssigned = labPixels.length;

  // 5. Build swatch records
  let swatches: ExtractedSwatch[] = centroids.map((c, idx) => {
    const [L, a, b] = c;
    const rgb = labToRgb(L, a, b);
    return {
      hex: rgbToHex(rgb.r, rgb.g, rgb.b),
      rgb,
      lab: { L, a, b },
      frequency: (counts[idx] ?? 0) / totalAssigned,
    };
  });

  // 6. Filter near-white / near-black / near-gray
  swatches = swatches.filter((s) => {
    if (s.lab.L < o.lightnessRange[0] || s.lab.L > o.lightnessRange[1]) return false;
    const chroma = Math.sqrt(s.lab.a * s.lab.a + s.lab.b * s.lab.b);
    if (chroma < o.minChroma) return false;
    return true;
  });

  // 7. ΔE merge — collapse near-duplicates
  swatches = mergeNearby(swatches, o.mergeWithinDeltaE);

  // 8. Sort by frequency desc
  swatches.sort((a, b) => b.frequency - a.frequency);

  return swatches;
}

// ── Helpers: fetch ───────────────────────────────────────────────────────

async function fetchToBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: {
      // Some CDNs reject blank UA
      "user-agent": "OnBrandColorExtractor/1.0 (+sowork.ai)",
    },
  });
  if (!res.ok) throw new Error(`extractPalette: HTTP ${res.status} for ${url.slice(0, 120)}`);
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

// ── Helpers: color math (sRGB ↔ XYZ ↔ LAB, hex) ─────────────────────────

// sRGB companding (inverse gamma)
function srgbToLinear(c: number): number {
  const cs = c / 255;
  return cs <= 0.04045 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c: number): number {
  const cs = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(cs * 255)));
}

// D65 reference white
const D65 = { X: 0.95047, Y: 1.0, Z: 1.08883 };

export function rgbToLab(r: number, g: number, b: number): { L: number; a: number; b: number } {
  // sRGB → linear RGB
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  // linear RGB → XYZ (D65, sRGB matrix)
  const X = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / D65.X;
  const Y = (lr * 0.2126729 + lg * 0.7151522 + lb * 0.0721750) / D65.Y;
  const Z = (lr * 0.0193339 + lg * 0.1191920 + lb * 0.9503041) / D65.Z;
  // XYZ → LAB
  const fx = labF(X);
  const fy = labF(Y);
  const fz = labF(Z);
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

function labF(t: number): number {
  const delta = 6 / 29;
  return t > delta ** 3
    ? Math.cbrt(t)
    : t / (3 * delta * delta) + 4 / 29;
}

function labFInv(t: number): number {
  const delta = 6 / 29;
  return t > delta
    ? t ** 3
    : 3 * delta * delta * (t - 4 / 29);
}

export function labToRgb(L: number, a: number, b: number): { r: number; g: number; b: number } {
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const X = D65.X * labFInv(fx);
  const Y = D65.Y * labFInv(fy);
  const Z = D65.Z * labFInv(fz);
  // XYZ → linear RGB
  const lr =  3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  const lg = -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z;
  const lb =  0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  return {
    r: linearToSrgb(lr),
    g: linearToSrgb(lg),
    b: linearToSrgb(lb),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// CIE76 ΔE — Euclidean distance in LAB. Fast + good enough for de-dup.
function deltaE76(
  a: { L: number; a: number; b: number },
  c: { L: number; a: number; b: number },
): number {
  const dL = a.L - c.L;
  const da = a.a - c.a;
  const db = a.b - c.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

// ── K-means++ initialization ─────────────────────────────────────────────

function kmeansPlusPlusInit(
  pixels: Array<[number, number, number]>,
  k: number,
  rng: () => number,
): Array<[number, number, number]> {
  const centroids: Array<[number, number, number]> = [];
  // First centroid: random pixel
  const first = pixels[Math.floor(rng() * pixels.length)]!;
  centroids.push([first[0], first[1], first[2]]);
  while (centroids.length < k) {
    // Distance to nearest existing centroid, squared
    const distances = new Float64Array(pixels.length);
    let total = 0;
    for (let i = 0; i < pixels.length; i++) {
      const pi = pixels[i]!;
      let minD = Infinity;
      for (const c of centroids) {
        const d = sqDist(pi, c);
        if (d < minD) minD = d;
      }
      distances[i] = minD;
      total += minD;
    }
    // Weighted random pick
    let target = rng() * total;
    let pick = 0;
    for (let i = 0; i < distances.length; i++) {
      target -= distances[i]!;
      if (target <= 0) { pick = i; break; }
    }
    const px = pixels[pick]!;
    centroids.push([px[0], px[1], px[2]]);
  }
  return centroids;
}

function nearestCentroid(
  px: [number, number, number],
  centroids: Array<[number, number, number]>,
): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < centroids.length; i++) {
    const d = sqDist(px, centroids[i]!);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function sqDist(a: [number, number, number], b: [number, number, number]): number {
  const dL = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return dL * dL + da * da + db * db;
}

// ── ΔE-based de-duplication ──────────────────────────────────────────────

function mergeNearby(
  swatches: ExtractedSwatch[],
  threshold: number,
): ExtractedSwatch[] {
  if (threshold <= 0 || swatches.length <= 1) return swatches;
  // Greedy merge: walk in frequency order, fold subsequent near-duplicates
  // into the more-frequent canonical (frequency added together).
  const sorted = [...swatches].sort((a, b) => b.frequency - a.frequency);
  const out: ExtractedSwatch[] = [];
  for (const s of sorted) {
    const existing = out.find((e) => deltaE76(e.lab, s.lab) < threshold);
    if (existing) {
      existing.frequency += s.frequency;
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

// ── Seeded PRNG (mulberry32) for reproducible centroid init ─────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
