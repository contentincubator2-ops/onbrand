/**
 * localizeText.ts — display-layer i18n for DB-stored user content.
 *
 * Architecture:
 *   DB stores English source-of-truth strings (and optionally a JSON
 *   blob with localized variants). Frontend picks the right variant
 *   based on the user's UI locale via this helper.
 *
 * Accepted shapes:
 *   - plain string                                  → return as-is
 *   - { "zh-TW": "...", en: "..." } object          → pick by lang, fallback chain
 *   - JSON-stringified version of either of the above
 *
 * Locale fallback chain:
 *   zh-TW → zh-TW > zh > en > first non-empty
 *   en    → en > first non-empty > zh-TW
 */
import type { Lang } from "./i18n";

type Localized = string | Record<string, string> | null | undefined;

const LANG_KEYS: Record<Lang, string[]> = {
  "zh-TW": ["zh-TW", "zh_tw", "zhTW", "zh", "zh-CN", "en"],
  "en":    ["en", "zh-TW", "zh"],
};

/** Try to coerce a JSON-stringified locale map into an object. */
function tryParse(value: string): Localized {
  if (!value || value[0] !== "{" && value[0] !== "[") return value;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {/* not JSON, treat as plain */}
  return value;
}

export function pickLocaleText(value: Localized, lang: Lang): string {
  if (value == null) return "";
  if (typeof value === "string") {
    const coerced = tryParse(value);
    if (typeof coerced === "string") return coerced;
    value = coerced;
  }
  if (!value) return "";
  const map = value as Record<string, string>;
  for (const k of LANG_KEYS[lang]) {
    const v = map[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  // last resort: any non-empty string in the map
  for (const v of Object.values(map)) {
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

/**
 * Heuristic: is this text "mostly English"?
 *   Compare ASCII letter count vs CJK character count. If ASCII letters
 *   dominate (>= 60%) and CJK is rare (< 10%), treat as English. Used to
 *   decide whether to show DB-source English text in a zh-TW UI, or fall
 *   back to a derived zh-TW summary.
 */
export function isLikelyEnglish(text: string): boolean {
  if (!text) return false;
  const len = text.length;
  let latin = 0;
  let cjk = 0;
  for (let i = 0; i < len; i++) {
    const code = text.charCodeAt(i);
    if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) latin++;
    else if (code >= 0x4e00 && code <= 0x9fff) cjk++;
  }
  if (len < 4) return false;
  return latin / len >= 0.6 && cjk / len < 0.1;
}

/**
 * Convenience: localize + drop-if-English-in-zh-TW heuristic.
 * Returns null if the text exists but is unsuitable for the current locale.
 */
export function safeLocalizedText(value: Localized, lang: Lang): string | null {
  const t = pickLocaleText(value, lang);
  if (!t) return null;
  if (lang === "zh-TW" && isLikelyEnglish(t)) return null;
  return t;
}
