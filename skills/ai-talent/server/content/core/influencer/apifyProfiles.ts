/**
 * apifyProfiles — 伺服器自己讀不到的社群個人頁（Instagram／Threads／TikTok），改請 Apify 讀。
 *
 * 2026-10-06（CJ「網紅的功能，很容易失敗，讀不到東西，怎麼辦」→ 開了 Apify 帳號）。
 * 台灣網紅多數在 IG／Threads，只靠「請用戶貼貼文」這個功能等於常常落空。
 *
 * 每個平台各用一支 Apify 上的 actor（輸入／輸出欄位見各 actor 的 input-schema 頁，2026-10-06 查）：
 *   · Instagram：apify/instagram-profile-scraper —— 個人檔＋最近約 12 則貼文
 *   · TikTok：clockworks/tiktok-scraper —— 最近 10 支影片，作者資料在每支影片的 authorMeta
 *   · Threads：themineworks/threads-scraper —— 只拿得到未登入訪客看得到的 4–5 則貼文，沒有自介與粉絲數
 * Facebook／X／LinkedIn 沒接：個人帳號沒有穩定的 actor，仍由用戶補貼文。
 *
 * 沒設 APIFY_API_TOKEN 時整個模組回 null，行為跟接上之前一樣（用戶補貼文）。
 * 這些 actor 是第三方維護的爬蟲，平台改版時會壞——任何失敗都回 null，不丟錯、不猜。
 */
import type { InfluencerPlatform } from "./influencerLink";

export interface ProviderRead {
  displayName: string | null;
  followers: string | null;
  material: string;
}

type Item = Record<string, any>;

interface ActorSpec {
  actor: string;
  input: (handle: string) => Record<string, unknown>;
  toRead: (items: Item[], handle: string) => ProviderRead | null;
}

const POSTS = 10;
const POST_CHARS = 280;
const MATERIAL_CAP = 4_000;
/** actor 自己最多跑多久（秒）；我們的連線再多等一點。 */
const ACTOR_TIMEOUT_S = 75;
const CACHE_MS = 6 * 3_600_000;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const oneLine = (v: unknown, n: number) => str(v).replace(/\s+/g, " ").slice(0, n);

/** 粉絲數照平台慣用說法寫成文字（卡片與提示詞都直接用）。 */
export function followersText(n: unknown): string | null {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1).replace(/\.0$/, "")} 億粉絲`;
  if (v >= 10_000) return `${(v / 10_000).toFixed(v >= 100_000 ? 0 : 1).replace(/\.0$/, "")} 萬粉絲`;
  return `${Math.round(v).toLocaleString("en-US")} 粉絲`;
}

function build(lines: string[], posts: string[], postLabel: string): string {
  const body = posts.filter(Boolean).slice(0, POSTS);
  return [...lines.filter(Boolean), body.length ? `最近 ${body.length} ${postLabel}：` : "", ...body.map((t) => `- ${t}`)]
    .filter(Boolean).join("\n").slice(0, MATERIAL_CAP);
}

export const ACTORS: Partial<Record<InfluencerPlatform, ActorSpec>> = {
  instagram: {
    actor: "apify~instagram-profile-scraper",
    input: (handle) => ({ usernames: [handle] }),
    toRead: (items, handle) => {
      const p = items.find((x) => str(x.username).toLowerCase() === handle.toLowerCase()) ?? items[0];
      if (!p || p.error) return null;
      const followers = followersText(p.followersCount);
      const posts = (Array.isArray(p.latestPosts) ? p.latestPosts : []).map((x: Item) => oneLine(x.caption, POST_CHARS));
      const bio = oneLine(p.biography, 400);
      if (!bio && !posts.some(Boolean)) return null;
      const name = str(p.fullName) || null;
      return {
        displayName: name, followers,
        material: build([
          `Instagram：${name ?? ""}（@${str(p.username) || handle}）${followers ? `｜${followers}` : ""}${p.verified ? "｜已驗證" : ""}`,
          bio ? `自介：${bio}` : "",
          // actor 沒有類別時回字串 "None"。
          str(p.businessCategoryName) && str(p.businessCategoryName) !== "None" ? `類別：${str(p.businessCategoryName)}` : "",
          p.private ? "（私人帳號，看不到貼文）" : "",
        ], posts, "則貼文"),
      };
    },
  },
  tiktok: {
    actor: "clockworks~tiktok-scraper",
    input: (handle) => ({
      profiles: [handle], resultsPerPage: POSTS, profileScrapeSections: ["videos"], profileSorting: "latest",
      shouldDownloadVideos: false, shouldDownloadCovers: false, shouldDownloadSubtitles: false, shouldDownloadSlideshowImages: false,
    }),
    toRead: (items, handle) => {
      const videos = items.filter((x) => x && !x.error && (x.text !== undefined || x.authorMeta));
      const a: Item = videos[0]?.authorMeta ?? {};
      const posts = videos.map((x) => oneLine(x.text, POST_CHARS));
      const bio = oneLine(a.signature, 400);
      if (!bio && !posts.some(Boolean)) return null;
      const followers = followersText(a.fans);
      const name = str(a.nickName) || null;
      return {
        displayName: name, followers,
        material: build([
          `TikTok：${name ?? ""}（@${str(a.name) || handle}）${followers ? `｜${followers}` : ""}`,
          bio ? `自介：${bio}` : "",
        ], posts, "支影片的說明"),
      };
    },
  },
  threads: {
    actor: "themineworks~threads-scraper",
    input: (handle) => ({ mode: "profile", profileUsernames: [handle], maxPosts: POSTS }),
    toRead: (items, handle) => {
      const own = items.filter((x) => x && !x.error && str(x.text) && (!str(x.username) || str(x.username).toLowerCase() === handle.toLowerCase()));
      if (!own.length) return null;
      const name = str(own[0]!.user_full_name) || null;
      return {
        displayName: name, followers: null,
        material: build([`Threads：${name ?? ""}（@${handle}）`], own.map((x) => oneLine(x.text, POST_CHARS)), "則貼文"),
      };
    },
  },
};

export function apifyToken(): string | null {
  return (process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN || "").trim() || null;
}

/** 目前接了數據商、伺服器讀得到的社群平台（沒設金鑰＝空）。前端用它決定要不要先請用戶貼貼文。 */
export function providerPlatforms(): InfluencerPlatform[] {
  return apifyToken() ? (Object.keys(ACTORS) as InfluencerPlatform[]) : [];
}

// 同一個帳號 6 小時內不重抓（重寫、補寫都會再讀一次連結；每次呼叫都要錢）。
const cache = new Map<string, { at: number; read: ProviderRead }>();

/** 讀一個帳號。沒金鑰、平台沒接、actor 失敗、沒內容 → null。 */
export async function readSocialProfile(platform: InfluencerPlatform, handle: string): Promise<ProviderRead | null> {
  const token = apifyToken();
  const spec = ACTORS[platform];
  if (!token || !spec || !/^[\w.]{1,60}$/.test(handle)) return null;
  const key = `${platform}:${handle.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.read;
  try {
    const res = await fetch(`https://api.apify.com/v2/acts/${spec.actor}/run-sync-get-dataset-items?timeout=${ACTOR_TIMEOUT_S}&format=json&clean=true`, {
      method: "POST",
      // 金鑰放標頭，不放網址（網址會進各種紀錄）。
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(spec.input(handle)),
      signal: AbortSignal.timeout((ACTOR_TIMEOUT_S + 15) * 1000),
    });
    if (!res.ok) {
      console.warn(`[influencer] apify ${platform} HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
      return null;
    }
    const items = await res.json().catch(() => null);
    if (!Array.isArray(items) || !items.length) return null;
    const read = spec.toRead(items as Item[], handle);
    if (read) {
      if (cache.size > 500) cache.clear();
      cache.set(key, { at: Date.now(), read });
    }
    return read;
  } catch (e) {
    console.warn(`[influencer] apify ${platform} failed:`, (e as Error)?.message?.slice(0, 160));
    return null;
  }
}
