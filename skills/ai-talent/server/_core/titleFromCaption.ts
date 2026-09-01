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

  // 2026-08-21 (FB ad pack): labelled ad copy starts with "[Headline] …" —
  // the marker is structure, not title text.
  s = s.replace(/^(?:\[|【)\s*headline\s*(?:\]|】)\s*/iu, "");
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
    const cut = codepoints.slice(0, TITLE_MAX_LEN - 1).join("");
    // 2026-07-23 (CJ IRIS QA「好像已經很...這句話沒寫完」): a hard cut lands
    // mid-phrase and reads unfinished. Trim back to the last punctuation /
    // space boundary when one exists past the halfway mark so the title
    // ends on a complete phrase; only fall back to "…" when no boundary.
    let best = -1;
    for (const ch of ["，", "、", "；", "：", "—", "–", ",", ";", ":", " "]) {
      const i = cut.lastIndexOf(ch);
      if (i > best) best = i;
    }
    s = best >= Math.floor(TITLE_MAX_LEN / 2)
      ? cut.slice(0, best).replace(/[，、；：,;:\s—–-]+$/u, "")
      : cut + "…";
  }
  return s || fallback;
}
