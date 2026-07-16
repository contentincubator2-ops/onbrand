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

export async function captionToVisualBrief(args: {
  caption: string;
  brandTagline?: string | null;
  platform?: string;
}): Promise<string> {
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
          content: "Convert the social post caption into a 1-2 sentence English visual brief for a text-to-image model. Photorealistic, brand-friendly, no text in image, no logos. Output only the brief.",
        },
        {
          role: "user",
          content: `Brand: ${args.brandTagline ?? "(unknown)"}\nPlatform: ${args.platform ?? "social"}\nCaption:\n${args.caption}`,
        },
      ],
    });
    return r.choices[0]?.message?.content?.toString().trim() ?? "";
  } catch {
    return `Photorealistic editorial scene representing: ${args.caption.slice(0, 120)}`;
  }
}
