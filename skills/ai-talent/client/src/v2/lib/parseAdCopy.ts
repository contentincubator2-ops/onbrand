export interface ParsedAdCopy {
  headline: string;
  primary: string;
  cta: string;
  hashtags: string[];
}

const AD_COPY_MARKER = /(?:\[|【)\s*(headline|primary|cta)\s*(?:\]|】)/giu;

function splitTrailingHashtags(value: string): { text: string; hashtags: string[] } {
  const match = value.match(
    /(^|[\s\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])((?:#[^\s#]+(?:\s+|$))+)\s*$/u,
  );
  if (!match || match.index === undefined) return { text: value.trim(), hashtags: [] };

  return {
    // Preserve a consumed CJK boundary; whitespace boundaries disappear via trim().
    text: value.slice(0, match.index + match[1].length).trim(),
    hashtags: Array.from(match[2].matchAll(/#([^\s#]+)/gu), (hashtag) => hashtag[1]),
  };
}

/** Parse the labelled FB ad-copy format emitted by the FB60 quick task. */
export function parseAdCopy(caption: string): ParsedAdCopy | null {
  const matches = Array.from(caption.matchAll(AD_COPY_MARKER));
  if (matches.length === 0) return null;

  const parsed: ParsedAdCopy = { headline: "", primary: "", cta: "", hashtags: [] };

  matches.forEach((match, index) => {
    const field = match[1].toLowerCase() as "headline" | "primary" | "cta";
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? caption.length;
    parsed[field] = caption.slice(start, end).trim();
  });

  // The model commonly appends post hashtags after the CTA. They remain post
  // metadata and must not become part of the CTA label/button.
  const cta = splitTrailingHashtags(parsed.cta);
  parsed.cta = cta.text;
  parsed.hashtags = cta.hashtags;

  return parsed;
}

/** Keep CTA buttons compact without inventing a different call to action. */
export function shortenAdCta(cta: string): string {
  const normalized = cta.trim().replace(/[。！!，,；;：:]+$/u, "");
  // Common generated phrase: keep the action pair and drop the channel/detail
  // modifier so the button reads like a real control rather than a headline.
  if (normalized === "預約實景參觀") return "預約參觀";
  if (Array.from(normalized).length <= 8) return normalized;

  const withoutModifiers = normalized.replace(
    /(?:立即|馬上|現在|立刻|即刻|搶先|免費|專屬|限時|實景|線上|更多)/gu,
    "",
  ).trim();
  if (withoutModifiers && Array.from(withoutModifiers).length <= 8) return withoutModifiers;

  return Array.from(withoutModifiers || normalized).slice(0, 8).join("");
}
