/**
 * Theater-standard visual brief — THE standard for every image path.
 *
 * 2026-07-16 (CJ「七日發布台的是標準，不應該被更改，是其他任務要對齊七日
 * 發布台的標準」): this is theater's original caption→English-brief logic
 * originally extracted verbatim. Every image path reuses this shared logic
 * instead of inventing its own.
 *
 * 2026-08-19: the shared prompt now also receives a lightweight brand
 * identity and explicit real-world-logo safety rules. Subject-reference
 * requests preserve the attached product's own identifiers.
 *
 * Contract: the image prompt is derived from the FINISHED CAPTION (not from
 * a separately-written style direction), converted into a short ENGLISH
 * brief, and sent to the image model. A semantically equivalent Traditional
 * Chinese copy is returned for human editing; the Chinese 風格方向 remains a
 * separate display-only field and never reaches the model.
 */
import { invokeLLM } from "../../platform/core/llm";
import {
  fallbackBilingualVisualBrief,
  parseBilingualBriefChoice,
  type BilingualVisualBrief,
} from "./bilingualVisualBrief";

export interface BrandIdentityForImage {
  name: string;
  industry: string | null;
}

/**
 * 2026-07-19 (CJ「品牌顏色會被貫穿到圖片生成的指令中嗎」— answer was no):
 * load the brand's extracted palette (brands.brand_colors, written by the
 * 色號 extraction on the 視覺頁) as hex+role pairs for prompt injection.
 * Returns [] when the brand has no palette — callers degrade gracefully.
 */
export async function loadBrandPaletteHexes(
  brandId?: number | null,
): Promise<Array<{ hex: string; role: string }>> {
  if (!brandId) return [];
  try {
    const { default: localPool } = await import("../../localDb");
    const [rows]: any = await localPool.execute(
      `SELECT brand_colors FROM brands WHERE id = ? LIMIT 1`,
      [brandId],
    );
    let bc: any = (rows as any[])[0]?.brand_colors;
    if (!bc) return [];
    if (typeof bc === "string") bc = JSON.parse(bc);
    const swatches: any[] = Array.isArray(bc?.swatches) ? bc.swatches : [];
    // Lead with the roles that define brand look; cap at 5 so the prompt
    // stays a hint, not a paint-by-numbers constraint.
    const roleOrder = ["primary", "accent", "highlight", "ink", "support", "neutral"];
    return swatches
      .filter((s) => typeof s?.hex === "string" && /^#[0-9a-fA-F]{6}$/.test(s.hex))
      .sort((a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role))
      .slice(0, 5)
      .map((s) => ({ hex: s.hex.toUpperCase(), role: String(s.role ?? "") }));
  } catch {
    return [];
  }
}

/**
 * Load only the identity fields image prompting needs. Keep this separate from
 * the full brand-context pipeline so image fan-out performs one lightweight
 * lookup per run and can still proceed when the local DB is unavailable.
 */
export async function loadBrandIdentityForImage(
  brandId?: number | null,
): Promise<BrandIdentityForImage | null> {
  if (!brandId) return null;
  try {
    const { default: localPool } = await import("../../localDb");
    const [rows]: any = await localPool.execute(
      `SELECT name, industry FROM brands WHERE id = ? LIMIT 1`,
      [brandId],
    );
    const row = (rows as any[])[0];
    if (!row) return null;
    return {
      name: String(row.name ?? "").trim(),
      industry: row.industry == null ? null : String(row.industry).trim(),
    };
  } catch {
    return null;
  }
}

export type { BilingualVisualBrief } from "./bilingualVisualBrief";

export interface VisualBriefArgs {
  caption: string;
  brandTagline?: string | null;
  brandIdentity?: BrandIdentityForImage | null;
  /** True when the image model receives the customer's real product image. */
  subjectMode?: boolean;
  platform?: string;
  /** Brand palette (from loadBrandPaletteHexes) — woven into the brief as
   *  the scene's dominant color scheme so generated images stay on-brand. */
  palette?: Array<{ hex: string; role: string }>;
}

/**
 * Produce the model-ready English brief and its human-friendly Traditional
 * Chinese equivalent in one LLM call. The two fields must describe the same
 * shot; only `prompt` is used by the automatic image pipeline.
 */
export async function captionToBilingualVisualBrief(args: VisualBriefArgs): Promise<BilingualVisualBrief> {
  const identity = args.brandIdentity;
  // 2026-08-19 (#80 客訴「勾選真實產品後再產圖，出現錯誤中文字」):
  // subject mode permits only text already visible on the attached product.
  // Keep text-shaped brand identity out of the model brief so Nano Banana
  // cannot turn a Chinese brand name into invented labels or watermarks.
  const brandLine = args.subjectMode
    ? "(unknown)"
    : identity
      ? [identity.name, identity.industry].filter(Boolean).join(" — ") || "(unknown)"
      : args.brandTagline ?? "(unknown)";
  const paletteLine = args.palette && args.palette.length > 0
    ? `\nBrand colors: ${args.palette.map((p) => `${p.hex}${p.role ? ` (${p.role})` : ""}`).join(", ")}`
    : "";
  const brandSafetyRule = args.subjectMode
    ? "BRAND SAFETY: Preserve the attached real product and all of its own logos, labels, wordmarks, text, colors, and signature design elements exactly as shown. Apart from those attached-product identifiers, never introduce any other real-world brand logo, wordmark, or recognizable signature design element."
    : "BRAND SAFETY: Never include any real-world brand logo, wordmark, or recognizable signature design element, including swooshes, three-stripe motifs, branded checks, or similar identifiers. All clothing, footwear, accessories, and products must be generic, unbranded, and plain. When the caption mentions a product category, never apply the visual characteristics of that category's best-known brands. Your brief MUST NOT name or reference ANY brand, product name, company, or competitor, and MUST NOT transliterate, romanize, or invent an English brand name (never turn a Chinese brand like 小安素 into a made-up wordmark such as \"Nutrion\"). Describe the subject only by its generic product category and physical form, as a clean UNLABELED design.";
  const textRule = args.subjectMode
    ? "Apart from text already printed on the attached real product, the image must contain no text."
    : "The image must contain no text.";
  try {
    const r = await invokeLLM({
      provider: "anthropic",
      // 2026-05-16: removed model:"claude-haiku-4-5" — invalid on the
      // direct Anthropic API (Azure naming) → 404 every theater cell
      // → fallback chain → 企劃台 crawl. Let anthropic use its
      // proven default (claude-sonnet-4-6).
      // 130 English words (~180 tokens) + ~150 CJK characters (~150-300
      // tokens depending on tokenizer) + JSON escaping can exceed 500.
      // 1200 leaves roughly 2x headroom for verbose providers.
      maxTokens: 1200,
      messages: [
        {
          role: "system",
          content:
            "Convert the social post caption into a 1-2 sentence visual brief for a text-to-image model. Return two semantically equivalent versions: model-ready English and natural Traditional Chinese written for a Taiwan user (not translationese). Photorealistic and brand-friendly. " +
            `${textRule}\n\n` +
            `${brandSafetyRule}\n\n` +
            "If brand colors are provided, make them the scene's dominant color palette (props, backdrop, lighting accents) while keeping the scene natural. Output JSON only in exactly this shape: {\"prompt\":\"English brief\",\"promptZh\":\"繁體中文版\"}.",
        },
        {
          role: "user",
          content: `Brand: ${brandLine}${paletteLine}\nPlatform: ${args.platform ?? "social"}\nCaption:\n${args.caption}`,
        },
      ],
    });
    return parseBilingualBriefChoice(r.choices[0], args.caption);
  } catch {
    return fallbackBilingualVisualBrief(args.caption);
  }
}

/** Backward-compatible English-only API used by Theater and older callers. */
export async function captionToVisualBrief(args: VisualBriefArgs): Promise<string> {
  return (await captionToBilingualVisualBrief(args)).prompt;
}
