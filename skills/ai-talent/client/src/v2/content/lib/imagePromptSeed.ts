/* 2026-08-20 (CJ「右邊的圖片指令，不要顯示英文的，要顯示中文的」).
 *
 * The RunPage「改配圖 → Step 1 → 你的圖片指令」box is an EDITABLE instruction,
 * seeded from whatever the run already knows about its own visual. The IG
 * strategy (企劃) synthesis path leaves image.prompt / image.promptZh null and
 * only fills the display-only image.style, which the model writes as an
 * English keyword slug, e.g.
 *   authentic-lifestyle-photography-warm-natural-light-family-table-scene-…
 * The box then showed that slug directly above its own「請直接用中文描述」hint.
 *
 * The synthesis prompt now asks for a natural sentence in the run's output
 * language (see server/_core/igStrategyPublicSynthesis.ts); this module is the
 * display-side guard so runs generated BEFORE that fix — and any later model
 * slip — never seed the box with a slug.
 */

/** A hyphen/underscore keyword chain with no spaces and no CJK, e.g.
 *  `warm-natural-light-family-table-scene`. Deliberately strict: three or more
 *  segments, so ordinary hyphenated prose ("photo-realistic") is not caught. */
export function isKeywordSlug(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(text)) return false; // already CJK
  if (/\s/.test(text)) return false; // real prose has spaces
  return /^[A-Za-z0-9]+([-_][A-Za-z0-9]+){2,}$/.test(text);
}

/**
 * Pick what the 你的圖片指令 box should be pre-filled with.
 *
 * Priority is unchanged from 2026-08-19: the Chinese counterpart of the real
 * model prompt first, then the real (English) model prompt — that one is
 * seeded ON PURPOSE so the text on screen matches the picture beside it — and
 * only then the display-only style for older runs.
 *
 * The single new rule: a display-only style that is a keyword slug is dropped,
 * so the caller falls through to its caption-derived Chinese brief instead.
 * Returns "" when nothing usable is available.
 */
export function pickImagePromptSeed(slide: {
  imagePromptZh?: string | null;
  imagePrompt?: string | null;
  imageStyle?: string | null;
}): string {
  const promptZh = slide.imagePromptZh?.trim() ?? "";
  if (promptZh) return promptZh;

  const prompt = slide.imagePrompt?.trim() ?? "";
  if (prompt) return prompt;

  const style = slide.imageStyle?.trim() ?? "";
  if (style && !isKeywordSlug(style)) return style;

  return "";
}
