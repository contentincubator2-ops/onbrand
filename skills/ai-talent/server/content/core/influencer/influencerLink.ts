/**
 * influencerLink — 判讀一條網紅連結：哪個平台、帳號是什麼、伺服器讀不讀得到。
 *
 * 讀得到：YouTube 頻道與影片、部落格／個人網站／媒體報導／Podcast 頁等一般網頁。
 * 讀不到：Instagram、Threads、TikTok、Facebook、X、LinkedIn 的個人頁——登入牆＋條款禁止爬取。
 *   這幾個平台靠「用戶補貼文」；付費數據商評估中，接上後改 serverReadable 的判斷即可。
 */

export type InfluencerPlatform =
  | "instagram" | "threads" | "tiktok" | "facebook" | "youtube" | "x" | "linkedin" | "podcast" | "web";

export interface InfluencerLink {
  url: string;
  platform: InfluencerPlatform;
  /** 帳號（不含 @）；一般網頁沒有。 */
  handle: string | null;
  /** 伺服器能不能自己讀到內容。 */
  serverReadable: boolean;
}

export const PLATFORM_LABEL: Record<InfluencerPlatform, string> = {
  instagram: "Instagram", threads: "Threads", tiktok: "TikTok", facebook: "Facebook",
  youtube: "YouTube", x: "X", linkedin: "LinkedIn", podcast: "Podcast", web: "網站",
};

const HOSTS: Array<[RegExp, InfluencerPlatform]> = [
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)threads\.(net|com)$/, "threads"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)(facebook|fb)\.com$/, "facebook"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"],
  [/(^|\.)(x|twitter)\.com$/, "x"],
  [/(^|\.)linkedin\.com$/, "linkedin"],
  [/(^|\.)(podcasts\.apple\.com|open\.spotify\.com|player\.soundon\.fm|open\.firstory\.me)$/, "podcast"],
];

/** 不是帳號的第一段路徑（各平台的功能頁）。 */
const NOT_HANDLE = new Set(["p", "reel", "reels", "stories", "explore", "watch", "shorts", "channel", "c", "user",
  "playlist", "embed", "results", "feed", "share", "sharer", "profile.php", "groups", "pages", "hashtag", "tag",
  "video", "photo", "status", "in", "company", "posts", "t", "discover", "search"]);

/** 內網與本機位址不抓（用戶貼的連結會由伺服器去讀）。 */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h.includes(":")) return h === "::1" || h === "::" || /^(fc|fd|fe80)/.test(h);
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return !h.includes(".");
  const a = Number(m[1]), b = Number(m[2]);
  return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 169 && b === 254) || a >= 224;
}

/** 整理成可以抓的網址；不是合法的公開 http(s) 網址就回 null。 */
export function normalizeUrl(raw: string): string | null {
  let s = String(raw ?? "").trim().replace(/[)\]。，、；,;]+$/, "");
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) {
    // 只貼了 @帳號或一個名字：不知道是哪個平台，不猜。
    if (!/^[\w-]+(\.[\w-]+)+(\/|\?|$)/.test(s)) return null;
    s = `https://${s}`;
  }
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (isPrivateHost(u.hostname)) return null;
    u.hash = "";
    return u.toString();
  } catch { return null; }
}

export function classifyLink(raw: string): InfluencerLink | null {
  const url = normalizeUrl(raw);
  if (!url) return null;
  const u = new URL(url);
  const host = u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
  const platform = HOSTS.find(([re]) => re.test(host))?.[1] ?? "web";
  const segs = u.pathname.split("/").filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
  let handle: string | null = null;
  if (platform === "youtube") {
    const at = segs.find((s) => s.startsWith("@"));
    handle = at ? at.slice(1) : (["c", "user", "channel"].includes(segs[0] ?? "") && segs[1]) ? segs[1] : null;
  } else if (platform !== "web" && platform !== "podcast") {
    const first = platform === "linkedin" && segs[0] === "in" ? segs[1] : segs[0];
    if (first && !NOT_HANDLE.has(first.toLowerCase())) handle = first.replace(/^@/, "");
  }
  const serverReadable = platform === "youtube" || platform === "web" || platform === "podcast";
  return { url, platform, handle: handle || null, serverReadable };
}
