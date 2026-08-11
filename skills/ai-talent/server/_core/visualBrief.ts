/**
 * Theater-standard visual brief — THE standard for every image path.
 *
 * 2026-07-16 (CJ「七日發布台的是標準，不應該被更改，是其他任務要對齊七日
 * 發布台的標準」): this is theater's original caption→English-brief logic
 * extracted VERBATIM — same provider (anthropic), same system prompt, same
 * maxTokens, same fallback — so theater's behavior is byte-for-byte
 * unchanged, and every other task reuses the exact same logic instead of
 * inventing its own.
 *
 * Contract: the image prompt is derived from the FINISHED CAPTION (not from
 * a separately-written style direction), converted into a short ENGLISH
 * brief, and sent to the image model. The Chinese 風格方向 shown in task UIs
 * is display-only and never reaches the model.
 */
import { invokeLLM } from "./llm";

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
    const { default: localPool } = await import("../localDb");
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

export async function captionToVisualBrief(args: {
  caption: string;
  brandTagline?: string | null;
  platform?: string;
  /** Brand palette (from loadBrandPaletteHexes) — woven into the brief as
   *  the scene's dominant color scheme so generated images stay on-brand. */
  palette?: Array<{ hex: string; role: string }>;
}): Promise<string> {
  const paletteLine = args.palette && args.palette.length > 0
    ? `\nBrand colors: ${args.palette.map((p) => `${p.hex}${p.role ? ` (${p.role})` : ""}`).join(", ")}`
    : "";
  try {
    const r = await invokeLLM({
      provider: "anthropic",
      // 2026-05-16: removed model:"claude-haiku-4-5" — invalid on the
      // direct Anthropic API (Azure naming) → 404 every theater cell
      // → fallback chain → 企劃台 crawl. Let anthropic use its
      // proven default (claude-sonnet-4-6).
      maxTokens: 180,
      messages: [
        {
          role: "system",
          content:
            "Convert the social post caption into a 1-2 sentence English visual brief for a text-to-image model. Photorealistic, brand-friendly. " +
            // 2026-08-11 (bug checklist C2 — 小安素→「Nutrion」烤字 / Adidas 貼文→NIKE logo):
            // image models cannot render a real wordmark, so when the brief names a
            // brand/competitor they invent a fake romanized label or a rival's logo.
            // Forbid ALL proper-noun brand references so nothing pressures the model to
            // draw a mark — the real title/logo is overlaid later on an editable layer.
            "CRITICAL — the generated image must contain NO text and NO logos: your brief MUST NOT name or reference ANY brand, product name, company, or competitor, and MUST NOT transliterate, romanize, or invent an English brand name (never turn a Chinese brand like 小安素 into a made-up wordmark such as \"Nutrion\"). Describe the subject only by its generic product category and physical form, as a clean UNLABELED design — e.g. \"a nutritional supplement drink in a plain unlabeled bottle\", \"a pair of athletic running shoes with no visible logo\". Never depict any real or invented logo, wordmark, emblem, brand name, or packaging text. " +
            "If brand colors are provided, make them the scene's dominant color palette (props, backdrop, lighting accents) while keeping the scene natural. Output only the brief.",
        },
        {
          role: "user",
          content: `Brand: ${args.brandTagline ?? "(unknown)"}${paletteLine}\nPlatform: ${args.platform ?? "social"}\nCaption:\n${args.caption}`,
        },
      ],
    });
    return r.choices[0]?.message?.content?.toString().trim() ?? "";
  } catch {
    return `Photorealistic editorial scene representing: ${args.caption.slice(0, 120)}`;
  }
}
