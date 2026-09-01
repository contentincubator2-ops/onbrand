/**
 * viralSourceGuard（client 鏡像）— 爆款改寫任務的「來源」守門員
 *
 * 2026-08-23 (CJ「tt-60-viral-rewrite：用戶沒提供爆款連結或主題時要出現錯誤提醒」)
 *
 * ⚠️ 這是 server/_core/viralSourceGuard.ts 的鏡像，規則必須一模一樣。
 *    - server 是權威判斷（扣點前擋下）；這份只是讓用戶在按下「開始做」的
 *      當下就看到提示，不用等一趟 round trip。
 *    - 兩份由 server/_core/viralSourceGuard.parity.test.ts 綁在一起，
 *      改了一邊沒改另一邊，測試會紅。
 *    - 不能直接 import server 的那份：CI 的 scripts/check-client-server-boundary.sh
 *      只放行 import type；而且 client 的 vite root 是 client/，跨出去的檔案在
 *      dev server 也會被 fs.allow 擋掉。
 */

export type ViralSourceIssue = "empty" | "filler" | "too_short";

export interface ViralSourceRejection {
  ok: false;
  issue: ViralSourceIssue;
  message: { zh: string; en: string };
}

export type ViralSourceCheck = { ok: true } | ViralSourceRejection;

export interface ViralSourceOptions {
  platformLabel?: string | null;
}

export const VIRAL_SOURCE_KEY = "viral_source";

const URL_RE = /(?:https?:\/\/|www\.)\S+/i;

const BARE_LINK_RE =
  /\b(?:[a-z0-9-]+\.)*(?:tiktok|douyin|instagram|youtube|youtu|facebook|threads|xiaohongshu|xhslink|weibo)\.(?:com|be|cn)\/\S+/i;

/**
 * 中日韓字元偵測（有 CJK 時字數門檻較低，因為單字資訊密度高）。
 * 寫成 code point 比較而不是字元區間 regex：區間端點如 U+F900 的字形和
 * 一般漢字長得一模一樣，貼錯一個字就會默默把整個 surrogate 區間吃進來
 * （emoji 會被當成中文）。逐 code point 走也讓 emoji 不會誤判。
 */
function hasCjk(s: string): boolean {
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (
      (c >= 0x3040 && c <= 0x30ff) || // 日文假名
      (c >= 0x3400 && c <= 0x4dbf) || // CJK 擴充 A
      (c >= 0x4e00 && c <= 0x9fff) || // CJK 基本區
      (c >= 0xf900 && c <= 0xfaff) || // CJK 相容表意文字
      (c >= 0xac00 && c <= 0xd7af)    // 韓文
    ) return true;
  }
  return false;
}

const MIN_CJK_CHARS = 4;
const MIN_LATIN_CHARS = 8;

const FILLER = new Set([
  "無", "沒有", "沒", "不知道", "唔知", "不清楚", "沒想法", "沒有想法", "空", "空白",
  "隨便", "都可以", "都行", "隨意", "任意", "隨機", "你決定", "你選", "你挑", "自己想", "自由發揮",
  "跳過", "略過", "skip", "later", "tbd", "todo",
  "測試", "試試", "test", "testing", "123", "abc", "asdf", "aaa",
  "na", "none", "no", "nil", "null", "undefined", "x",
  "爆款", "爆款影片", "爆款貼文", "爆款連結", "爆款原文", "連結", "網址", "主題", "影片",
  "link", "url", "topic", "video", "tiktok", "ig", "instagram", "youtube", "yt", "fb", "facebook",
]);

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\s　]/g, "")
    .replace(/[.,!?;:'"`、，。！？；：「」『』（）()[\]【】《》…·・~～\-—_+*#/\\|]/g, "");
}

function howToFix(platformLabel?: string | null): { zh: string; en: string } {
  const p = (platformLabel ?? "").trim();
  const pad = p ? `${p} ` : "";
  return {
    zh: `請貼上${pad}爆款的影片／貼文連結，或用一句話描述那支爆款在講什麼（例：「下班後 10 分鐘快煮」那種）。`,
    en: `Paste the ${pad}link to the viral video/post, or describe in one line what it is about (e.g. "the 10-minute weeknight dinner one").`,
  };
}

function preview(raw: string): string {
  const t = raw.trim();
  return t.length > 20 ? `${t.slice(0, 20)}…` : t;
}

export function checkViralSource(
  raw: string | null | undefined,
  opts: ViralSourceOptions = {},
): ViralSourceCheck {
  const fix = howToFix(opts.platformLabel);
  const text = (raw ?? "").trim();

  if (!text) {
    return {
      ok: false,
      issue: "empty",
      message: {
        zh: `這個任務是「改寫一支已經爆的內容」，一定要先有原始爆款。${fix.zh}`,
        en: `This task rewrites an existing viral hit, so it needs the original first. ${fix.en}`,
      },
    };
  }

  if (URL_RE.test(text) || BARE_LINK_RE.test(text)) return { ok: true };

  const core = normalize(text);

  if (!core || FILLER.has(core)) {
    return {
      ok: false,
      issue: "filler",
      message: {
        zh: `「${preview(text)}」看不出是哪一支爆款。${fix.zh}`,
        en: `"${preview(text)}" doesn't identify a viral post. ${fix.en}`,
      },
    };
  }

  const min = hasCjk(core) ? MIN_CJK_CHARS : MIN_LATIN_CHARS;
  if (core.length < min) {
    return {
      ok: false,
      issue: "too_short",
      message: {
        zh: `爆款來源太簡略，AI 無法判斷要借用哪一支的結構。${fix.zh}`,
        en: `The viral reference is too vague to tell which post's structure to borrow. ${fix.en}`,
      },
    };
  }

  return { ok: true };
}

/** 這個任務卡是不是爆款改寫類（有 viral_source 欄位） */
export function taskNeedsViralSource(task: {
  inputs?: Array<{ key?: string }> | null;
  primary_input?: { key?: string } | null;
} | null | undefined): boolean {
  if (!task) return false;
  if (task.primary_input?.key === VIRAL_SOURCE_KEY) return true;
  return (task.inputs ?? []).some((f) => f?.key === VIRAL_SOURCE_KEY);
}

/** 任務卡的 platform → 錯誤訊息裡的平台名 */
export function platformLabelForTask(platform?: string | null): string | null {
  const map: Record<string, string> = {
    tiktok: "TikTok",
    instagram: "IG",
    ig: "IG",
    youtube: "YouTube",
    yt: "YouTube",
    facebook: "FB",
    fb: "FB",
    threads: "Threads",
    linkedin: "LinkedIn",
  };
  return map[(platform ?? "").toLowerCase()] ?? null;
}
