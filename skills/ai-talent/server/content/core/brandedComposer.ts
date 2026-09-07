/**
 * brandedComposer — assemble branded product images from
 *   (product cutout) + (brand palette) + (layout template) + (typography).
 *
 * Riverflow-style composition: instead of asking the AI to invent the whole
 * scene (which fights us on brand consistency), we hand-composite using
 * sharp:
 *   - background: solid brand color OR LLM-generated background tinted to
 *     match the brand palette
 *   - product cutout: positioned per layout template
 *   - typography overlay: brand name + tagline rendered as SVG, colors
 *     pulled from the palette for guaranteed contrast
 *
 * v1 ships 4 layout variants per call:
 *   1. centered-hero    — product centered on neutral/cream bg, accent strip
 *   2. left-bias-bar    — product right, bold colored bar with text on left
 *   3. corner-pop       — product bottom-right, ink bg with primary callout
 *   4. dual-band        — split background (primary top / neutral bottom)
 *
 * 2026-06-21 (CJ「按 riverflow 標準」brand DNA sprint) — created.
 */
import sharp from "sharp";
import { removeProductBackground } from "./productImageCutout";

// ── Public types ────────────────────────────────────────────────────────

export type Layout = "centered-hero" | "left-bias-bar" | "corner-pop" | "dual-band";

export interface PaletteSwatch {
  hex: string;
  role: string; // "primary" | "accent" | "ink" | "neutral" | "highlight" | "support"
}

export interface ComposeProductImageInput {
  productImageUrl: string;
  productName: string;
  tagline?: string;
  palette: PaletteSwatch[];
  /** Output dimensions. Default 1080×1080 (IG / FB friendly). */
  width?: number;
  height?: number;
  /** Which layouts to render. Default all 4. */
  layouts?: Layout[];
  /** Skip cutout (faster, less polished). Default false. */
  skipCutout?: boolean;
}

export interface ComposedVariant {
  layout: Layout;
  /** PNG bytes ready to send / save. */
  pngBuffer: Buffer;
  /** Brand colors that ended up in the composition (for caption/alt text). */
  colorsUsed: string[];
  /** "true" if cutout was a real transparent cutout, false if we composited
   *  the original photo as a tile. */
  hadCutout: boolean;
}

export interface ComposeResult {
  variants: ComposedVariant[];
  /** ms timing — useful for telemetry. */
  totalMs: number;
}

// ── Palette helpers ─────────────────────────────────────────────────────

function findRole(palette: PaletteSwatch[], role: string): string | null {
  return palette.find((p) => p.role === role)?.hex ?? null;
}

/** Always returns a 4-color brand-coherent set. Falls back when a role is
 *  missing (e.g. only 5 swatches and no `highlight`). */
function pickRoles(palette: PaletteSwatch[]): {
  primary: string;
  accent: string;
  ink: string;
  neutral: string;
} {
  const primary  = findRole(palette, "primary")
                ?? palette[0]?.hex ?? "#1F1F1F";
  const accent   = findRole(palette, "accent")
                ?? findRole(palette, "highlight")
                ?? palette[1]?.hex ?? "#E85D2E";
  const ink      = findRole(palette, "ink")
                ?? "#0F0F0E";
  const neutral  = findRole(palette, "neutral")
                ?? "#F5E8D8";
  return { primary, accent, ink, neutral };
}

/** Returns a hex that has good contrast against the given hex (black or white). */
function pickContrast(bgHex: string): string {
  const r = parseInt(bgHex.slice(1, 3), 16);
  const g = parseInt(bgHex.slice(3, 5), 16);
  const b = parseInt(bgHex.slice(5, 7), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#101010" : "#FFFFFF";
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ── Cutout fetch + resize for compositing ───────────────────────────────

async function loadCutout(
  productImageUrl: string,
  skipCutout: boolean,
  maxDim: number,
): Promise<{ buf: Buffer; hadCutout: boolean }> {
  if (skipCutout) {
    const res = await fetch(productImageUrl, {
      headers: { "user-agent": "OnBrandComposer/1.0 (+sowork.ai)" },
    });
    if (!res.ok) throw new Error(`product image fetch ${res.status}`);
    const raw = Buffer.from(await res.arrayBuffer());
    const sized = await sharp(raw)
      .resize(maxDim, maxDim, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    return { buf: sized, hadCutout: false };
  }
  const result = await removeProductBackground(productImageUrl);
  const sized = await sharp(result.pngBuffer)
    .resize(maxDim, maxDim, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  return { buf: sized, hadCutout: result.hadAlpha };
}

// ── SVG typography overlays per layout ──────────────────────────────────

function svgOverlayFor(
  layout: Layout,
  width: number,
  height: number,
  productName: string,
  tagline: string,
  colors: ReturnType<typeof pickRoles>,
): Buffer {
  const safeName = escapeXml(productName);
  const safeTag  = escapeXml(tagline || "");
  // Use system-stack fonts — sharp's text rendering varies by OS but the
  // fallback chain keeps it readable.
  const fontStack = "'PingFang TC','Noto Sans CJK TC','Helvetica Neue',Arial,sans-serif";

  switch (layout) {
    case "centered-hero":
      return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
          // Top eyebrow strip
          `<rect x="0" y="0" width="${width}" height="${Math.round(height * 0.085)}" fill="${colors.accent}"/>` +
          `<text x="${width / 2}" y="${Math.round(height * 0.055)}" font-family="${fontStack}" font-size="${Math.round(height * 0.025)}" font-weight="700" fill="${pickContrast(colors.accent)}" text-anchor="middle" letter-spacing="3">` +
          `${safeName.toUpperCase()}</text>` +
          // Bottom tagline
          (safeTag ? `<text x="${width / 2}" y="${Math.round(height * 0.95)}" font-family="${fontStack}" font-size="${Math.round(height * 0.028)}" font-weight="500" fill="${colors.ink}" text-anchor="middle">${safeTag}</text>` : "") +
        `</svg>`,
      );
    case "left-bias-bar":
      return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
          `<rect x="0" y="0" width="${Math.round(width * 0.42)}" height="${height}" fill="${colors.primary}"/>` +
          `<text x="${Math.round(width * 0.06)}" y="${Math.round(height * 0.4)}" font-family="${fontStack}" font-size="${Math.round(height * 0.085)}" font-weight="900" fill="${pickContrast(colors.primary)}" letter-spacing="-1">${safeName}</text>` +
          (safeTag ? `<text x="${Math.round(width * 0.06)}" y="${Math.round(height * 0.5)}" font-family="${fontStack}" font-size="${Math.round(height * 0.03)}" fill="${pickContrast(colors.primary)}" opacity="0.85">${safeTag}</text>` : "") +
          `<rect x="${Math.round(width * 0.06)}" y="${Math.round(height * 0.6)}" width="${Math.round(width * 0.12)}" height="3" fill="${colors.accent}"/>` +
        `</svg>`,
      );
    case "corner-pop":
      return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
          // Top-left circle accent
          `<circle cx="${Math.round(width * 0.15)}" cy="${Math.round(height * 0.15)}" r="${Math.round(height * 0.06)}" fill="${colors.accent}"/>` +
          `<text x="${Math.round(width * 0.06)}" y="${Math.round(height * 0.27)}" font-family="${fontStack}" font-size="${Math.round(height * 0.06)}" font-weight="900" fill="${colors.neutral}">${safeName}</text>` +
          (safeTag ? `<text x="${Math.round(width * 0.06)}" y="${Math.round(height * 0.33)}" font-family="${fontStack}" font-size="${Math.round(height * 0.025)}" fill="${colors.neutral}" opacity="0.7">${safeTag}</text>` : "") +
        `</svg>`,
      );
    case "dual-band":
      return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
          // Diagonal divider line in accent
          `<line x1="0" y1="${Math.round(height * 0.5)}" x2="${width}" y2="${Math.round(height * 0.5)}" stroke="${colors.accent}" stroke-width="${Math.round(height * 0.006)}"/>` +
          `<text x="${Math.round(width * 0.5)}" y="${Math.round(height * 0.05)}" font-family="${fontStack}" font-size="${Math.round(height * 0.022)}" font-weight="600" fill="${pickContrast(colors.primary)}" text-anchor="middle" letter-spacing="4">${safeName.toUpperCase()}</text>` +
          (safeTag ? `<text x="${Math.round(width * 0.5)}" y="${Math.round(height * 0.96)}" font-family="${fontStack}" font-size="${Math.round(height * 0.028)}" font-style="italic" fill="${colors.ink}" text-anchor="middle">${safeTag}</text>` : "") +
        `</svg>`,
      );
  }
}

// ── Background builders per layout ──────────────────────────────────────

async function backgroundFor(
  layout: Layout,
  width: number,
  height: number,
  colors: ReturnType<typeof pickRoles>,
): Promise<Buffer> {
  switch (layout) {
    case "centered-hero":
      // Solid neutral (cream / paper) — product floats centered
      return sharp({
        create: { width, height, channels: 4, background: hexToRgba(colors.neutral) },
      }).png().toBuffer();
    case "left-bias-bar":
      // Right-half neutral; left-half primary (drawn by SVG overlay)
      return sharp({
        create: { width, height, channels: 4, background: hexToRgba(colors.neutral) },
      }).png().toBuffer();
    case "corner-pop":
      // Deep ink background — high-contrast hero
      return sharp({
        create: { width, height, channels: 4, background: hexToRgba(colors.ink) },
      }).png().toBuffer();
    case "dual-band":
      // Split: top primary / bottom neutral via composite of two rects
      const top = await sharp({
        create: { width, height: Math.round(height / 2), channels: 4, background: hexToRgba(colors.primary) },
      }).png().toBuffer();
      return sharp({
        create: { width, height, channels: 4, background: hexToRgba(colors.neutral) },
      })
        .composite([{ input: top, top: 0, left: 0 }])
        .png().toBuffer();
  }
}

function hexToRgba(hex: string): { r: number; g: number; b: number; alpha: number } {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b, alpha: 1 };
}

// ── Cutout placement per layout ─────────────────────────────────────────

function placementFor(layout: Layout, W: number, H: number, cw: number, ch: number) {
  switch (layout) {
    case "centered-hero":
      return { left: Math.round((W - cw) / 2), top: Math.round((H - ch) / 2) };
    case "left-bias-bar":
      // Cutout on right ~58% of canvas
      return {
        left: Math.round(W * 0.42 + (W * 0.58 - cw) / 2),
        top:  Math.round((H - ch) / 2),
      };
    case "corner-pop":
      // Bottom-right anchored, slightly bleeding
      return {
        left: Math.round(W - cw * 0.92),
        top:  Math.round(H - ch * 0.92),
      };
    case "dual-band":
      // Centered, sitting across the divider
      return { left: Math.round((W - cw) / 2), top: Math.round((H - ch) / 2) };
  }
}

// ── Public: compose ─────────────────────────────────────────────────────

const DEFAULT_LAYOUTS: Layout[] = ["centered-hero", "left-bias-bar", "corner-pop", "dual-band"];

export async function composeBrandedProductImage(
  input: ComposeProductImageInput,
): Promise<ComposeResult> {
  const t0 = Date.now();
  const width  = input.width  ?? 1080;
  const height = input.height ?? 1080;
  const layouts = input.layouts ?? DEFAULT_LAYOUTS;
  const colors = pickRoles(input.palette);

  // Cutout once, reuse for every layout
  const maxCutDim = Math.round(Math.min(width, height) * 0.7);
  const { buf: cutoutBuf, hadCutout } = await loadCutout(
    input.productImageUrl, !!input.skipCutout, maxCutDim,
  );
  const cutoutMeta = await sharp(cutoutBuf).metadata();
  const cw = cutoutMeta.width  ?? maxCutDim;
  const ch = cutoutMeta.height ?? maxCutDim;

  const variants: ComposedVariant[] = [];
  for (const layout of layouts) {
    try {
      const bg = await backgroundFor(layout, width, height, colors);
      const place = placementFor(layout, width, height, cw, ch);
      const svgOverlay = svgOverlayFor(
        layout, width, height,
        input.productName, input.tagline ?? "", colors,
      );

      const png = await sharp(bg)
        .composite([
          { input: cutoutBuf, top: place.top, left: place.left },
          { input: svgOverlay, top: 0, left: 0 },
        ])
        .png()
        .toBuffer();

      variants.push({
        layout,
        pngBuffer: png,
        colorsUsed: [colors.primary, colors.accent, colors.ink, colors.neutral],
        hadCutout,
      });
    } catch (e) {
      // Skip a broken layout, keep going — caller still gets others
      // eslint-disable-next-line no-console
      console.warn(`[composer] layout ${layout} failed:`, (e as Error).message);
    }
  }

  return { variants, totalMs: Date.now() - t0 };
}
