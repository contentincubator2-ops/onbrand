/**
 * Turn whatever a publish provider threw into a sentence a user can act on.
 *
 * Providers answer with raw JSON ("bundle.social 400: {...}"), Graph API codes
 * and fetch exceptions. None of that belongs on a calendar card. Messages that
 * are already written for users (Chinese, from our own code) pass through
 * untouched so this is safe to apply twice.
 */

const RULES: Array<{ test: RegExp; zh: string; en: string }> = [
  {
    test: /\b(401|403)\b|oauth|access token|token (has )?expired|session has expired|reauthori[sz]e|re-?auth|invalid[_ ]token|permission/i,
    zh: "這個平台的授權已失效或權限不足，請到品牌設定重新連接後再試。",
    en: "The platform authorization expired or lacks permission. Reconnect it in brand settings and try again.",
  },
  {
    test: /\b429\b|rate.?limit|too many requests|quota/i,
    zh: "平台暫時限制發文頻率，請稍後再試。",
    en: "The platform is rate-limiting posts. Try again in a little while.",
  },
  {
    test: /aspect.?ratio|9:16|1\.91|resolution|dimension/i,
    zh: "圖片或影片的比例／尺寸不符合平台規定，請換符合規格的素材。",
    en: "The image or video ratio/size does not meet the platform's rules. Use compliant media.",
  },
  {
    test: /duplicate|already (been )?(posted|published)/i,
    zh: "平台判定這是重複內容，請稍微修改文案後再發。",
    en: "The platform flagged this as duplicate content. Edit the caption slightly and retry.",
  },
  {
    test: /too long|character limit|exceeds? .*characters|max(imum)? .*characters/i,
    zh: "文案超過這個平台的字數上限，請縮短後再發。",
    en: "The caption exceeds the platform's character limit. Shorten it and retry.",
  },
  {
    test: /video.*(duration|too (long|large|short)|size|format|codec)|file size|unsupported (media|format)/i,
    zh: "影片或檔案的長度、大小或格式不符合平台規定。",
    en: "The video/file length, size or format is not accepted by the platform.",
  },
  {
    test: /timeout|timed out|aborted|AbortError|ECONN|ENOTFOUND|fetch failed|network/i,
    zh: "連線平台逾時，貼文可能尚未送出，請稍後再試。",
    en: "Connecting to the platform timed out; the post probably did not go out. Try again shortly.",
  },
  {
    test: /\b5\d\d\b|internal server error|bad gateway|service unavailable/i,
    zh: "發布服務暫時異常，請稍後再試。",
    en: "The publishing service is temporarily unavailable. Try again later.",
  },
];

/** Pull a readable sentence out of a JSON body, or null when it is not JSON. */
function messageFromJson(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start < 0) return null;
  try {
    const parsed = JSON.parse(raw.slice(start));
    const m = parsed?.message ?? parsed?.error?.message ?? parsed?.error;
    return typeof m === "string" && m ? m : null;
  } catch {
    return null;
  }
}

const HAS_CJK = /[一-鿿]/;

export function friendlyPublishError(raw: unknown): string {
  const text = String((raw as any)?.message ?? raw ?? "").trim();
  if (!text) return "發布失敗，請稍後再試。 / Publishing failed. Please try again later.";
  // Already written for users by our own code.
  if (HAS_CJK.test(text) && !/\{.*\}/.test(text) && !/bundle\.social \d{3}/.test(text)) return text;

  const inner = messageFromJson(text);
  const haystack = `${text} ${inner ?? ""}`;
  for (const rule of RULES) {
    if (rule.test.test(haystack)) return `${rule.zh} / ${rule.en}`;
  }
  const detail = (inner ?? text.replace(/\{[\s\S]*$/, "")).replace(/\s+/g, " ").trim().slice(0, 160);
  return detail
    ? `發布失敗：${detail} / Publishing failed: ${detail}`
    : "發布失敗，請稍後再試。 / Publishing failed. Please try again later.";
}
