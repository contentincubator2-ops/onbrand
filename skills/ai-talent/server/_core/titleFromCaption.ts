/**
 * titleFromCaption — derive a short, readable title from a long social-post
 * caption.
 *
 * 2026-05-14 (CJ「標題很長 又一次」): the old approach was `caption.slice(0, 80)`
 * which (1) often hit mid-sentence ugly cut-offs, (2) 80 CJK chars is way too
 * long for any title UI to show without wrapping or breaking layouts.
 *
 * Strategy:
 *   1. Strip leading emojis, hashtags, whitespace
 *   2. Take the first SENTENCE — split at the first sentence-terminator
 *      (. ! ? 。 ！ ？ \n) or paragraph break
 *   3. Cap at 32 chars (a typical CJK header in HeroUI shows ~28 chars
 *      comfortably on a 800px wide breadcrumb)
 *   4. If we cut, append "…"
 *   5. Fall back to caller-supplied label if caption is empty/garbage
 */

const SENTENCE_TERMINATORS = /[\n。！？!?]/;
// 2026-07-20 (CJ「摘要標題首字被截斷：5歲小朋友挑食 → 歲小朋友挑食」):
// \p{Emoji} and \p{Emoji_Component} BOTH match ASCII digits 0-9 (and #, *)
// because Unicode marks them as keycap-emoji components (5️⃣ = "5"+FE0F+20E3)
// — so a caption starting with a number lost its first character(s). Match
// only real pictographs + the emoji glue codepoints (variation selector,
// ZWJ, keycap, skin-tone modifiers) + hashtag marks + whitespace.
const LEADING_NOISE = /^(?:[\p{Extended_Pictographic}\p{Emoji_Modifier}#＃\s]|️|‍|⃣)+/u;
const TITLE_MAX_LEN = 32;

export function titleFromCaption(
  caption: string | null | undefined,
  fallback: string,
): string {
  if (!caption || typeof caption !== "string") return fallback;
  let s = caption.trim();
  if (!s) return fallback;

  // Strip leading emoji / hashtag noise (a single line full of #tags
  // before the actual text is also stripped).
  s = s.replace(LEADING_NOISE, "");

  // First sentence only.
  const [firstSentence] = s.split(SENTENCE_TERMINATORS);
  s = (firstSentence ?? s).trim();
  if (!s) return fallback;

  // Cap length. We measure by code-point count rather than UTF-16 units
  // so emojis count as 1 char (more intuitive for human-facing limit).
  const codepoints = Array.from(s);
  if (codepoints.length > TITLE_MAX_LEN) {
    s = codepoints.slice(0, TITLE_MAX_LEN - 1).join("") + "…";
  }
  return s || fallback;
}
