/**
 * publishedDate — 從原文網頁讀出發布日期。
 *
 * 2026-09-30（CJ「AI Reporting 旁邊要寫的，應該是原文發布時間」）：策略監測的情報卡
 * 原本在標題旁放的是**掃描時間**，而 scout 回來的 publishedAt 在 dev 上全是空的——
 * Gemini／Vertex grounding 是叫模型「自己寫」日期，常常不寫、寫了也可能是編的。
 * 所以日期一律回原文網頁讀，讀的是出版方自己宣告的欄位：
 *   1. <meta property="article:published_time"> 與同類 meta（og／pubdate／date…）
 *   2. JSON-LD 的 "datePublished"
 *   3. <time datetime="…">（第一個）
 *   4. 網址裡的 /2026/09/28/ 或 /20260928
 * 讀不到就回 null——畫面寫「發布日不明」，不猜。
 */

const META_KEYS = [
  "article:published_time", "og:published_time", "og:article:published_time",
  "pubdate", "publishdate", "publish_date", "publish-date", "date", "dc.date", "dc.date.issued",
  "sailthru.date", "parsely-pub-date", "datepublished",
];

/** 任何日期字串 → YYYY-MM-DD；不合理（解析失敗、早於 2000、晚於明天）就 null。 */
export function normalizeDate(raw: string | null | undefined, now: Date = new Date()): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  let d: Date | null = null;
  const ymd = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymd) d = new Date(Date.UTC(+ymd[1]!, +ymd[2]! - 1, +ymd[3]!));
  else if (/^\d{8}$/.test(s)) d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
  else {
    const t = Date.parse(s);
    if (!Number.isNaN(t)) d = new Date(t);
  }
  if (!d || Number.isNaN(d.getTime())) return null;
  if (d.getUTCFullYear() < 2000 || d.getTime() > now.getTime() + 36 * 3_600_000) return null;
  return d.toISOString().slice(0, 10);
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[2] ?? m[3] ?? m[4] ?? null) : null;
}

/** 從 HTML 抽發布日期（純函式，方便測）。 */
export function extractPublishedDate(html: string, url?: string, now: Date = new Date()): string | null {
  if (html) {
    for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
      const key = (attr(tag, "property") ?? attr(tag, "name") ?? attr(tag, "itemprop") ?? "").toLowerCase();
      if (!META_KEYS.includes(key)) continue;
      const v = normalizeDate(attr(tag, "content"), now);
      if (v) return v;
    }
    const ld = html.match(/"datePublished"\s*:\s*"([^"]+)"/i);
    if (ld) { const v = normalizeDate(ld[1], now); if (v) return v; }
    const time = html.match(/<time\b[^>]*\bdatetime\s*=\s*["']([^"']+)["']/i);
    if (time) { const v = normalizeDate(time[1], now); if (v) return v; }
  }
  if (url) {
    const m = url.match(/\/(20\d{2})[/-](\d{1,2})[/-](\d{1,2})(?:\/|$|[-_])/) ?? url.match(/\/(20\d{2})(\d{2})(\d{2})(?:\/|$|[-_.])/);
    if (m) { const v = normalizeDate(`${m[1]}-${m[2]}-${m[3]}`, now); if (v) return v; }
  }
  return null;
}

/** 抓原文、抽日期。任何失敗（逾時、需要登入、非 HTML）都回 null。 */
export async function fetchPublishedDate(url: string | undefined, timeoutMs = 6000): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const fromUrl = extractPublishedDate("", url);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal, redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; OnBrandStudio/1.0; +https://onbrand.sowork.ai)", Accept: "text/html" },
    });
    if (!res.ok || !String(res.headers.get("content-type") ?? "").includes("html")) return fromUrl;
    // 日期都在 <head> 或文章開頭；讀前 400KB 就夠，避免大頁面拖時間。
    const reader = res.body?.getReader();
    let html = "";
    if (reader) {
      const dec = new TextDecoder();
      while (html.length < 400_000) {
        const { done, value } = await reader.read();
        if (done) break;
        html += dec.decode(value, { stream: true });
      }
      try { await reader.cancel(); } catch { /* noop */ }
    } else {
      html = (await res.text()).slice(0, 400_000);
    }
    return extractPublishedDate(html, url) ?? fromUrl;
  } catch {
    return fromUrl;
  } finally {
    clearTimeout(t);
  }
}
