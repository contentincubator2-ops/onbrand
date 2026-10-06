/**
 * influencerReader — 把一條網紅連結讀成「AI 可以據以判斷個人特色的素材」。
 *
 *   · YouTube 頻道：頻道頁（名稱、簡介、訂閱數）＋公開 RSS 的最近 15 支影片標題與說明。不需金鑰。
 *   · YouTube 影片：沿用 youtubeContext（標題、說明、字幕）。
 *   · 一般網頁（部落格、個人站、媒體報導、Podcast 頁）：沿用 urlContext。
 *   · IG／Threads／TikTok：伺服器自己讀不到（登入牆），有設 Apify 金鑰時交給 apifyProfiles 讀；
 *     沒設、或那邊也讀不到，就由用戶補貼文。
 *   · FB／X／LinkedIn：不讀，由用戶補貼文。
 *
 * 讀不到就是讀不到——不拿帳號名稱去猜這個人是誰（no silent fallback）。
 */
import { fetchUrlSummary, hasMeaningfulUrlContent } from "../../../platform/core/web/urlContext";
import { extractYouTubeId, fetchYouTubeContext } from "../../../platform/core/web/youtubeContext";
import { classifyLink, isPrivateHost, type InfluencerLink } from "./influencerLink";
import { readSocialProfile } from "./apifyProfiles";

/** data_provider＝付費數據商（apifyProfiles）讀到的社群個人頁。 */
export type ReadSource = "youtube_channel" | "youtube_video" | "web" | "data_provider" | "none";

export interface InfluencerRead {
  source: ReadSource;
  /** 讀到的顯示名稱（頻道名、頁面標題）；沒有就 null。 */
  displayName: string | null;
  /** 粉絲／訂閱數的原文（例如「286萬位訂閱者」）；讀不到就 null，不估。 */
  followers: string | null;
  /** 給模型看的素材全文。空字串＝沒讀到。 */
  material: string;
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const TIMEOUT_MS = 12_000;
const CHANNEL_PAGE_CAP = 5_000_000;   // 頻道頁實測 0.8–3MB，資料在內嵌 JSON 裡
const MATERIAL_CAP = 4_000;
const READ_BUDGET_MS = 30_000;

const NONE: InfluencerRead = { source: "none", displayName: null, followers: null, material: "" };

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

async function fetchText(url: string, cap: number): Promise<string | null> {
  try {
    if (isPrivateHost(new URL(url).hostname)) return null;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "follow",
      headers: { "User-Agent": UA, "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8", Cookie: "CONSENT=YES+1; SOCS=CAI" },
    });
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < cap) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); total += value.length;
    }
    reader.cancel().catch(() => {});
    return Buffer.concat(chunks).toString("utf8");
  } catch { return null; }
}

/** 從頻道頁 HTML 拿頻道資料（純函式，測試直接餵 HTML）。 */
export function parseChannelPage(html: string): { channelId: string | null; name: string | null; about: string | null; followers: string | null } {
  const meta = (p: string) => {
    const m = html.match(new RegExp(`<meta (?:property|name)="${p}" content="([^"]*)"`));
    return m ? decodeEntities(m[1] ?? "").trim() || null : null;
  };
  const channelId = html.match(/"(?:externalId|channelId)":"(UC[\w-]{22})"/)?.[1]
    ?? html.match(/youtube\.com\/channel\/(UC[\w-]{22})/)?.[1] ?? null;
  const followers = html.match(/"content":"([^"]{1,24}(?:位訂閱者|subscribers?))"/)?.[1]
    ?? html.match(/"subscriberCountText":\{[^}]*?"simpleText":"([^"]+)"/)?.[1] ?? null;
  return { channelId, name: meta("og:title"), about: meta("og:description"), followers };
}

/** 從頻道 RSS 拿最近的影片（純函式）。 */
export function parseChannelFeed(xml: string): Array<{ title: string; description: string }> {
  const out: Array<{ title: string; description: string }> = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const entry = m[1] ?? "";
    const title = decodeEntities(entry.match(/<title>([^<]*)<\/title>/)?.[1] ?? "").trim();
    const description = decodeEntities(entry.match(/<media:description>([\s\S]*?)<\/media:description>/)?.[1] ?? "")
      .replace(/\s+/g, " ").trim();
    if (title) out.push({ title, description });
  }
  return out;
}

async function readYouTubeChannel(link: InfluencerLink): Promise<InfluencerRead> {
  const html = await fetchText(link.url, CHANNEL_PAGE_CAP);
  if (!html) return NONE;
  const ch = parseChannelPage(html);
  if (!ch.channelId) return NONE;
  const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${ch.channelId}`, 600_000);
  const videos = xml ? parseChannelFeed(xml) : [];
  if (!videos.length && !ch.about) return NONE;
  const lines = [
    `YouTube 頻道：${ch.name ?? link.handle ?? ""}${ch.followers ? `（${ch.followers}）` : ""}`,
    ch.about ? `頻道簡介：${ch.about.slice(0, 500)}` : "",
    videos.length ? `最近 ${videos.length} 支影片：` : "",
    ...videos.map((v) => `- ${v.title}${v.description && !v.description.startsWith(v.title.slice(0, 12)) ? `｜${v.description.slice(0, 100)}` : ""}`),
  ].filter(Boolean);
  return { source: "youtube_channel", displayName: ch.name, followers: ch.followers, material: lines.join("\n").slice(0, MATERIAL_CAP) };
}

async function readYouTubeVideo(url: string): Promise<InfluencerRead> {
  const c = await fetchYouTubeContext(url).catch(() => null);
  if (!c || (!c.title && !c.transcript)) return NONE;
  const lines = [
    `YouTube 影片：${c.title ?? ""}`,
    c.channelTitle ? `頻道：${c.channelTitle}` : "",
    c.description ? `影片說明：${c.description.slice(0, 500)}` : "",
    c.transcript ? `字幕摘錄：${c.transcript.slice(0, 2500)}` : "",
  ].filter(Boolean);
  return { source: "youtube_video", displayName: c.channelTitle, followers: null, material: lines.join("\n").slice(0, MATERIAL_CAP) };
}

async function readWeb(url: string): Promise<InfluencerRead> {
  const s = await fetchUrlSummary(url).catch(() => null);
  if (!s || !hasMeaningfulUrlContent(s)) return NONE;
  const lines = [
    s.title ? `頁面標題：${s.title}` : "",
    s.description ? `頁面描述：${s.description}` : "",
    s.body_usable !== false && s.body_excerpt ? `內文摘錄：${s.body_excerpt}` : "",
  ].filter(Boolean);
  // 網頁標題不是人名（維基頁會是「某某 - 維基百科…」），名字交給模型從內文認（detectedName）。
  return { source: "web", displayName: null, followers: null, material: decodeEntities(lines.join("\n")).slice(0, MATERIAL_CAP) };
}

/** 讀一條連結。任何失敗都回 source:"none"，不丟錯。 */
export async function readInfluencer(rawUrl: string): Promise<{ link: InfluencerLink | null; read: InfluencerRead }> {
  const link = classifyLink(rawUrl);
  if (!link) return { link, read: NONE };
  if (!link.serverReadable) {
    if (!link.handle) return { link, read: NONE };
    const r = await readSocialProfile(link.platform, link.handle);
    return { link, read: r ? { source: "data_provider", ...r } : NONE };
  }
  try {
    const work = link.platform === "youtube"
      ? (extractYouTubeId(link.url) ? readYouTubeVideo(link.url) : readYouTubeChannel(link))
      : readWeb(link.url);
    // 一條連結最多等 READ_BUDGET_MS（影片字幕偶爾很慢），超過就當沒讀到，不拖住整批。
    const read = await Promise.race([work, new Promise<InfluencerRead>((r) => setTimeout(() => r(NONE), READ_BUDGET_MS))]);
    return { link, read };
  } catch {
    return { link, read: NONE };
  }
}
