/**
 * viralSourceGuard — 爆款改寫任務的「來源」守門員
 *
 * 2026-08-23 (CJ「tt-60-viral-rewrite：用戶沒提供爆款連結或主題時要出現錯誤提醒」)
 *
 * 爆款改寫任務的整份交付物 = 「借用某一支既有爆款的 hook 機制與節奏結構」。
 * 沒有那支爆款，orchestra 還是會照跑：模型自己憑空編一支不存在的爆款出來拆解，
 * 用戶拿到一份看起來很完整、但沒有任何真實依據的腳本 —— 比報錯更糟。
 * 所以在扣點與呼叫模型之前就擋下來，並告訴用戶要補什麼。
 *
 * 判準（兩種輸入都算「有提供」）：
 *   ① 連結：任何 http(s) / www 開頭的網址，或平台網域 + 路徑（vt.tiktok.com/xxx）
 *   ② 主題：一段夠具體、足以指認那支爆款的描述
 *
 * 擋下來的三種情況：
 *   empty      整格空白
 *   filler     只有敷衍／推託字（無、沒有、隨便、不知道、test…），或只是把欄位
 *              標籤原字抄回來（爆款、連結、主題…）
 *   too_short  短到不足以指認一支影片（中日韓 < 4 字 / 拉丁 < 8 字）
 *
 * client 端有一份鏡像（client/src/v2/lib/viralSourceGuard.ts）負責即時提示，
 * 但這裡才是權威判斷 —— 鏡像漂移時 server 仍會擋下。兩份用
 * viralSourceGuard.parity.test.ts 綁在一起。
 */

export type ViralSourceIssue = "empty" | "filler" | "too_short";

export interface ViralSourceRejection {
  ok: false;
  issue: ViralSourceIssue;
  /** zh-TW（產品主要語系）+ en，呼叫端依 UI 語系挑一個 */
  message: { zh: string; en: string };
}

export type ViralSourceCheck = { ok: true } | ViralSourceRejection;

export interface ViralSourceOptions {
  /** 出現在錯誤訊息裡的平台名，例：「TikTok」。給了會寫成「爆款 TikTok 連結」。 */
  platformLabel?: string | null;
}

/** 有 protocol 或 www 的完整網址 */
const URL_RE = /(?:https?:\/\/|www\.)\S+/i;

/** 裸網域 + 路徑（分享短連結貼過來常常沒有 https） */
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

/**
 * 敷衍／推託字。比對的是「整格輸入正規化後剛好等於其中一項」，
 * 所以「不知道要選哪支，先用這支：…」不會被誤擋。
 */
const FILLER = new Set([
  // 沒有 / 不知道
  "無", "沒有", "沒", "不知道", "唔知", "不清楚", "沒想法", "沒有想法", "空", "空白",
  // 丟回來給 AI 決定
  "隨便", "都可以", "都行", "隨意", "任意", "隨機", "你決定", "你選", "你挑", "自己想", "自由發揮",
  // 跳過
  "跳過", "略過", "skip", "later", "tbd", "todo",
  // 測試 / 佔位
  "測試", "試試", "test", "testing", "123", "abc", "asdf", "aaa",
  "na", "none", "no", "nil", "null", "undefined", "x",
  // 只是把欄位標籤／placeholder 抄回來
  "爆款", "爆款影片", "爆款貼文", "爆款連結", "爆款原文", "連結", "網址", "主題", "影片",
  "link", "url", "topic", "video", "tiktok", "ig", "instagram", "youtube", "yt", "fb", "facebook",
]);

/** 去掉空白與標點，留下真正帶資訊的字元 */
function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\s　]/g, "")
    .replace(/[.,!?;:'"`、，。！？；：「」『』（）()[\]【】《》…·・~～\-—_+*#/\\|]/g, "");
}

function withPlatform(platformLabel?: string | null): { zh: string; en: string } {
  const p = (platformLabel ?? "").trim();
  return {
    zh: p ? `${p} ` : "",
    en: p ? `${p} ` : "",
  };
}

function howToFix(platformLabel?: string | null): { zh: string; en: string } {
  const p = withPlatform(platformLabel);
  return {
    zh: `請貼上${p.zh}爆款的影片／貼文連結，或用一句話描述那支爆款在講什麼（例：「下班後 10 分鐘快煮」那種）。`,
    en: `Paste the ${p.en}link to the viral video/post, or describe in one line what it is about (e.g. "the 10-minute weeknight dinner one").`,
  };
}

function preview(raw: string): string {
  const t = raw.trim();
  return t.length > 20 ? `${t.slice(0, 20)}…` : t;
}

/**
 * 檢查爆款改寫任務的 viral_source 欄位。
 * ok:true = 有連結或有夠具體的主題；ok:false 帶可直接顯示給用戶的中英訊息。
 */
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

  // 有連結 = 一定有來源，直接放行（連結本身就短，不套字數門檻）
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

/** 這個 template 是不是爆款改寫類（有 viral_source 欄位）任務 */
export function templateNeedsViralSource(template: {
  inputs?: Array<{ key?: string }> | null;
  primary_input?: { key?: string } | null;
}): boolean {
  if (template?.primary_input?.key === VIRAL_SOURCE_KEY) return true;
  return (template?.inputs ?? []).some((f) => f?.key === VIRAL_SOURCE_KEY);
}

export const VIRAL_SOURCE_KEY = "viral_source";

/** template.outputDefaults.platform → 錯誤訊息裡的平台名 */
export function platformLabelOf(template: { outputDefaults?: { platform?: string } | null }): string | null {
  const p = (template?.outputDefaults?.platform ?? "").toLowerCase();
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
  return map[p] ?? null;
}
