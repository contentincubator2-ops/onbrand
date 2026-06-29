/**
 * brandPaletteAggregator — fuses palettes from N product images into one
 * canonical brand palette (~5-7 colors with role tags).
 *
 * Pipeline:
 *   1. Run extractPaletteFromImage on each input URL in parallel chunks
 *      (so an 18-image brand finishes in ~5s instead of 90s).
 *   2. Pool every per-image swatch with weight = (perImage frequency / N)
 *      so a brand with 50 images doesn't outweigh one with 10.
 *   3. Second-pass K-means in LAB on the pool, k = targetSize (default 7).
 *   4. Filter near-gray / out-of-lightness centroids (reuse extractor rules).
 *   5. Assign brand roles (primary / ink / neutral / accent / highlight /
 *      support) using a weight + perceptual heuristic.
 *   6. Sort by role priority then weight.
 *
 * This is the riverflow.ai "brand DNA" step: instead of giving the user
 * 100 colors from 20 product photos, surface the 5-7 that actually define
 * the brand's identity.
 *
 * 2026-06-21 — created.
 */
import {
  extractPaletteFromImage,
  rgbToHex,
  labToRgb,
  type ExtractedSwatch,
} from "./brandColorExtractor";

// ── Types ────────────────────────────────────────────────────────────────

export type BrandColorRole =
  | "primary"   // most prominent across products
  | "accent"    // high-chroma counterpoint to primary
  | "ink"       // darkest color (text / borders)
  | "neutral"   // lightest low-chroma color (paper / cream)
  | "highlight" // second-most-saturated, distinct hue
  | "support";  // remaining colors

export interface BrandColorSwatch {
  hex: string;
  rgb: { r: number; g: number; b: number };
  lab: { L: number; a: number; b: number };
  /** Pooled weight (sum of frequency contributions), normalised 0-1. */
  weight: number;
  /** Auto-assigned brand role. */
  role: BrandColorRole;
}

export interface BrandPalette {
  swatches: BrandColorSwatch[];
  /** How many images actually contributed swatches (excluding failures). */
  sourceImageCount: number;
  /** How many images were attempted. */
  attemptedImageCount: number;
  extractedAt: string;
}

export interface AggregateOptions {
  /** Target palette size after second-pass clustering. Default 7. */
  targetSize?: number;
  /** k per single-image extraction. Default 5. */
  extractPerImageK?: number;
  /** Hard cap on images (productDiscovery may return 50+). Default 30. */
  maxImages?: number;
  /** Parallel fetch chunk size. Default 4 — friendly to CDNs, fast enough. */
  parallelism?: number;
  /** Random seed for reproducibility. */
  seed?: number;
}

const DEFAULTS: Required<AggregateOptions> = {
  targetSize: 7,
  extractPerImageK: 5,
  maxImages: 30,
  parallelism: 4,
  seed: 42,
};

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Aggregate a brand palette from N product image URLs. Failures don't
 * block — we extract from whatever succeeds and report the count.
 * Returns null if zero images succeed (caller decides UI fallback).
 */
export async function aggregateBrandPalette(
  imageUrls: string[],
  opts: AggregateOptions = {},
): Promise<BrandPalette | null> {
  const o = { ...DEFAULTS, ...opts };
  const urls = imageUrls.slice(0, o.maxImages);
  if (urls.length === 0) return null;

  // 1. Parallel extract with chunked concurrency
  const allSwatches: Array<ExtractedSwatch & { sourceIdx: number }> = [];
  let successCount = 0;
  for (let i = 0; i < urls.length; i += o.parallelism) {
    const chunk = urls.slice(i, i + o.parallelism);
    const results = await Promise.allSettled(
      chunk.map((u) => extractPaletteFromImage(u, { k: o.extractPerImageK })),
    );
    results.forEach((r, j) => {
      if (r.status === "fulfilled") {
        successCount++;
        const sourceIdx = i + j;
        for (const s of r.value) {
          allSwatches.push({ ...s, sourceIdx });
        }
      }
    });
  }
  if (allSwatches.length === 0) return null;

  // 2. Normalise weights — divide each swatch frequency by N (success count)
  //    so a brand with more images doesn't push aggregate weight higher.
  const N = successCount || 1;
  const pool = allSwatches.map((s) => ({
    lab: [s.lab.L, s.lab.a, s.lab.b] as [number, number, number],
    weight: s.frequency / N,
  }));

  // 3. Weighted K-means in LAB on the pool, with K-means++ init.
  const rng = mulberry32(o.seed);
  const k = Math.min(o.targetSize, pool.length);
  let centroids = weightedKmeansPlusPlus(pool, k, rng);
  let assignments = new Int32Array(pool.length);
  const maxIter = 30;
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = 0;
    for (let i = 0; i < pool.length; i++) {
      const best = nearestCentroid(pool[i].lab, centroids);
      if (assignments[i] !== best) {
        assignments[i] = best;
        changed++;
      }
    }
    const sums: Array<[number, number, number]> = Array.from(
      { length: k },
      () => [0, 0, 0],
    );
    const wsums = new Float64Array(k);
    for (let i = 0; i < pool.length; i++) {
      const c = assignments[i];
      sums[c][0] += pool[i].lab[0] * pool[i].weight;
      sums[c][1] += pool[i].lab[1] * pool[i].weight;
      sums[c][2] += pool[i].lab[2] * pool[i].weight;
      wsums[c] += pool[i].weight;
    }
    for (let c = 0; c < k; c++) {
      if (wsums[c] === 0) continue;
      centroids[c] = [
        sums[c][0] / wsums[c],
        sums[c][1] / wsums[c],
        sums[c][2] / wsums[c],
      ];
    }
    if (changed === 0) break;
  }

  // 4. Build candidate swatches with pooled weight
  const clusterWeight = new Float64Array(k);
  for (let i = 0; i < pool.length; i++) clusterWeight[assignments[i]] += pool[i].weight;
  const totalWeight = clusterWeight.reduce((a, b) => a + b, 0) || 1;

  let candidates = centroids.map((c, idx) => {
    const [L, a, b] = c;
    const rgb = labToRgb(L, a, b);
    const w = clusterWeight[idx] / totalWeight;
    return {
      hex: rgbToHex(rgb.r, rgb.g, rgb.b),
      rgb,
      lab: { L, a, b },
      weight: w,
      // role assigned after filter
      role: "support" as BrandColorRole,
    };
  });

  // 5. Drop white / black / true gray AFTER pooling
  //    (different threshold from per-image; brand-level neutrals are valuable
  //    as long as they're slightly warm/cool, not bare grey)
  candidates = candidates.filter((s) => {
    if (s.lab.L < 4 || s.lab.L > 96) return false;
    const chroma = Math.sqrt(s.lab.a * s.lab.a + s.lab.b * s.lab.b);
    // Allow low-chroma if very light or very dark (cream, espresso)
    if (chroma < 3) return false;
    return true;
  });

  // 6. Assign brand roles
  const roleAssigned = assignRoles(candidates);

  // 7. Sort: primary first, then by role priority, then weight
  const rolePriority: Record<BrandColorRole, number> = {
    primary: 0, accent: 1, ink: 2, neutral: 3, highlight: 4, support: 5,
  };
  roleAssigned.sort((x, y) => {
    const dr = rolePriority[x.role] - rolePriority[y.role];
    if (dr !== 0) return dr;
    return y.weight - x.weight;
  });

  return {
    swatches: roleAssigned,
    sourceImageCount: successCount,
    attemptedImageCount: urls.length,
    extractedAt: new Date().toISOString(),
  };
}

// ── Role assignment heuristic ────────────────────────────────────────────

function assignRoles(
  candidates: BrandColorSwatch[],
): BrandColorSwatch[] {
  if (candidates.length === 0) return [];
  const remaining = [...candidates].sort((a, b) => b.weight - a.weight);
  const out: BrandColorSwatch[] = [];

  // primary = heaviest cluster overall
  const primary = remaining.shift()!;
  primary.role = "primary";
  out.push(primary);

  // ink = darkest below L=35
  const inkIdx = remaining.findIndex((s) => s.lab.L < 35);
  if (inkIdx !== -1) {
    const ink = remaining.splice(inkIdx, 1)[0];
    ink.role = "ink";
    out.push(ink);
  }

  // neutral = lightest above L=78 with chroma < 18
  const neutralIdx = remaining.findIndex((s) => {
    const chroma = Math.sqrt(s.lab.a * s.lab.a + s.lab.b * s.lab.b);
    return s.lab.L > 78 && chroma < 18;
  });
  if (neutralIdx !== -1) {
    const neutral = remaining.splice(neutralIdx, 1)[0];
    neutral.role = "neutral";
    out.push(neutral);
  }

  // accent = highest chroma remaining
  if (remaining.length > 0) {
    let accentIdx = 0;
    let bestChroma = chromaOf(remaining[0]);
    for (let i = 1; i < remaining.length; i++) {
      const c = chromaOf(remaining[i]);
      if (c > bestChroma) { bestChroma = c; accentIdx = i; }
    }
    const accent = remaining.splice(accentIdx, 1)[0];
    accent.role = "accent";
    out.push(accent);
  }

  // highlight = next highest chroma with hue distinct from accent (>30 deg)
  if (remaining.length > 0) {
    const accent = out.find((s) => s.role === "accent");
    let pickIdx = -1;
    let bestChroma = -1;
    for (let i = 0; i < remaining.length; i++) {
      const r = remaining[i];
      const c = chromaOf(r);
      const hueDiff = accent ? hueDistance(r, accent) : 0;
      // Score = chroma, gated by hue distinct from accent
      if (c > bestChroma && (!accent || hueDiff > 30)) {
        bestChroma = c;
        pickIdx = i;
      }
    }
    if (pickIdx !== -1) {
      const highlight = remaining.splice(pickIdx, 1)[0];
      highlight.role = "highlight";
      out.push(highlight);
    }
  }

  // remaining = support
  for (const r of remaining) {
    r.role = "support";
    out.push(r);
  }

  return out;
}

function chromaOf(s: BrandColorSwatch): number {
  return Math.sqrt(s.lab.a * s.lab.a + s.lab.b * s.lab.b);
}

function hueDistance(a: BrandColorSwatch, b: BrandColorSwatch): number {
  const ha = Math.atan2(a.lab.b, a.lab.a) * 180 / Math.PI;
  const hb = Math.atan2(b.lab.b, b.lab.a) * 180 / Math.PI;
  let d = Math.abs(ha - hb);
  if (d > 180) d = 360 - d;
  return d;
}

// ── K-means helpers (weighted variant for the pool) ──────────────────────

function weightedKmeansPlusPlus(
  pool: Array<{ lab: [number, number, number]; weight: number }>,
  k: number,
  rng: () => number,
): Array<[number, number, number]> {
  const centroids: Array<[number, number, number]> = [];
  // First centroid: weighted random pick
  let totalWeight = 0;
  for (const p of pool) totalWeight += p.weight;
  let target = rng() * totalWeight;
  for (const p of pool) {
    target -= p.weight;
    if (target <= 0) { centroids.push([...p.lab]); break; }
  }
  if (centroids.length === 0) centroids.push([...pool[0].lab]);

  while (centroids.length < k) {
    const distances = new Float64Array(pool.length);
    let total = 0;
    for (let i = 0; i < pool.length; i++) {
      let minD = Infinity;
      for (const c of centroids) {
        const d = sqDist(pool[i].lab, c);
        if (d < minD) minD = d;
      }
      // Weight by frequency (avoid picking 1-off background noise as a centroid)
      const w = minD * pool[i].weight;
      distances[i] = w;
      total += w;
    }
    let t = rng() * total;
    let pick = 0;
    for (let i = 0; i < distances.length; i++) {
      t -= distances[i];
      if (t <= 0) { pick = i; break; }
    }
    centroids.push([...pool[pick].lab]);
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
    const d = sqDist(px, centroids[i]);
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
