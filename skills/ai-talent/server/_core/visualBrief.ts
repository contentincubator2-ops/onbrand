/**
 * Shared visual-brief contract — the ONE way every image path in the app
 * produces its prompt.
 *
 * 2026-07-16 (CJ「我不希望疊床架屋——送模型的語言、prompt 的內容來源，都可
 * 相同」): previously orchestra wrote a Chinese-only brief (for the UI) and a
 * second LLM call translated it to English at dispatch time, while theater
 * had its own caption→English synthesis. Both are replaced by this single
 * contract: ONE LLM call produces a dual-language brief —
 *   zh → shown in the UI as 風格方向
 *   en → sent verbatim to the image model (Imagen/Flux/GPT-Image follow
 *        English far better than Chinese)
 * Same content source, same output shape, no second translation pass.
 */
import { callModel } from "./multiModelRouter";

export interface VisualBrief {
  /** Traditional-Chinese style direction — what the user reads in the UI. */
  zh: string;
  /** English text-to-image prompt — what the image model receives. */
  en: string;
}

/** Output-format instructions appended to every brief-writing system prompt. */
export const VISUAL_BRIEF_JSON_SPEC =
  `輸出嚴格 JSON 物件：\n` +
  `{"zh":"<30-60 字繁中視覺方向：主體/構圖/光線/色彩/氛圍，不疊文字、不放 logo>",` +
  `"en":"<1-3 sentence English text-to-image prompt describing the SAME scene with the same concrete elements ` +
  `(subject, setting, composition, lighting, color palette, mood). Photorealistic unless stated otherwise. ` +
  `No text in image, no logos.>"}\n` +
  `zh 與 en 必須是同一個畫面的兩種語言版本，元素一致、不可互相矛盾。\n` +
  `第一個字元就是 {。不要 markdown code fence、不要前言。`;

/**
 * Coerce a parsed LLM response into a VisualBrief. Accepts the canonical
 * {zh,en} shape plus legacy aliases ({summary}, {prompt}). Either side falls
 * back to the other so a half-formed answer still renders and generates.
 */
export function normalizeVisualBrief(parsed: any, fallbackText?: string): VisualBrief | null {
  const zh =
    typeof parsed?.zh === "string" ? parsed.zh.trim()
    : typeof parsed?.summary === "string" ? parsed.summary.trim()
    : "";
  const en =
    typeof parsed?.en === "string" ? parsed.en.trim()
    : typeof parsed?.prompt === "string" ? parsed.prompt.trim()
    : "";
  if (!zh && !en) {
    const t = (fallbackText ?? "").trim();
    return t ? { zh: t.slice(0, 280), en: t.slice(0, 900) } : null;
  }
  return { zh: (zh || en).slice(0, 280), en: (en || zh).slice(0, 900) };
}

function briefTimeout<T>(ms: number, label: string): Promise<T> {
  return new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} exceeded ${ms}ms`)), ms));
}

function tryParse(raw: unknown): any {
  if (typeof raw !== "string") return raw ?? null;
  const s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try { return JSON.parse(s); } catch { /* fall through */ }
  const m = s.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* ignore */ } }
  return null;
}

/**
 * Standalone composer — content in, dual-language brief out. Used by callers
 * that don't have their own persona/system-prompt machinery (e.g. theater's
 * per-cell image generation). Orchestra keeps its richer persona prompt but
 * shares VISUAL_BRIEF_JSON_SPEC + normalizeVisualBrief, so the output
 * contract and model-facing language are identical everywhere.
 */
export async function composeVisualBrief(args: {
  /** The post caption / content this image will accompany. */
  content: string;
  /** Brand context block (positioning prefix, tagline …). */
  brandContext?: string;
  platform?: string;
  aspectRatio?: string;
  /** Caller-specific craft rules appended to the system prompt. */
  extraDirectives?: string;
  timeoutMs?: number;
}): Promise<VisualBrief> {
  const system =
    `你是資深視覺指導。任務：為下面這篇貼文設計「一張」主視覺的方向。\n` +
    (args.aspectRatio ? `比例：${args.aspectRatio}\n` : "") +
    `規則：具體可畫（主體/場景/構圖/光線/色彩/氛圍），品牌友善，不疊文字、不放 logo。\n` +
    (args.extraDirectives ? `${args.extraDirectives}\n` : "") +
    `\n${VISUAL_BRIEF_JSON_SPEC}\n` +
    (args.brandContext ? `\n${args.brandContext}` : "");
  const user =
    (args.platform ? `平台：${args.platform}\n` : "") +
    `貼文內容：\n${args.content}`;

  let lastErr: any = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await Promise.race([
        callModel(
          [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          undefined,
          "qwen",
        ),
        briefTimeout<never>(args.timeoutMs ?? 12_000, "visual-brief"),
      ]);
      const brief = normalizeVisualBrief(
        tryParse(r.content),
        typeof r.content === "string" && !r.content.includes("{") ? r.content : undefined,
      );
      if (brief) return brief;
      lastErr = new Error("empty visual brief");
    } catch (e) {
      lastErr = e;
    }
    if (attempt === 0) await new Promise((res) => setTimeout(res, 200));
  }
  // Last-resort fallback: use the content itself so image gen still runs.
  const t = args.content.slice(0, 200);
  void lastErr;
  return { zh: t, en: `Photorealistic editorial scene representing: ${t}` };
}
