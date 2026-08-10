/**
 * listeningScopes — shared core for the 輿情 (social-listening) 四區塊 feature.
 *
 * Both the live tRPC path (marketIntelRouter.runListeningTask) and the
 * accumulating ingestion job (scripts/ingest-listening-mentions.ts) import
 * from here so query packs, cleaning rules and the mentions table stay in
 * ONE place.
 *
 * Phase 1 (2026-08-06, CJ「仿造 OpView 自己累積數據庫」): adds the
 * `listening_mentions` store + upsert so a daily job can accumulate
 * dedup'd mentions over time — the foundation for historical trend / spike
 * / sentiment views (Phase 2+). This is an open-web accumulation, NOT a
 * licensed social-listening feed; coverage is whatever our searches capture.
 */
import localPool from "../localDb";

export const LISTENING_TASK_KEYS = [
  // Legacy (2026-07-25).
  "listening.topic_buckets",
  "listening.verbatims",
  "listening.crisis_scan",
  // 四區塊 (2026-08-06): 市場熱點 / 產業討論 / 自己 / 競爭者.
  "listening.market_hotspots",
  "listening.industry_talk",
  "listening.own_brand",
  "listening.competitors",
] as const;
export type ListeningTaskKey = typeof LISTENING_TASK_KEYS[number];

/** The 4 scopes the accumulating job ingests (legacy keys excluded). */
export const INGEST_SCOPES: ListeningTaskKey[] = [
  "listening.market_hotspots",
  "listening.industry_talk",
  "listening.own_brand",
  "listening.competitors",
];

/** OpView-style source buckets. `web` = uncategorised fallback. */
export type SourceType = "news" | "fanpage" | "blog" | "forum" | "threads" | "youtube" | "web";

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  news: "新聞", fanpage: "粉絲團", blog: "部落格", forum: "討論區",
  threads: "Threads", youtube: "YouTube", web: "網站",
};

/** The 6 source types we actively try to cover (OpView parity), + web catch-all. */
export const SOURCE_TYPES: SourceType[] = ["news", "fanpage", "blog", "forum", "threads", "youtube"];

const DOMAIN_RULES: Array<[SourceType, RegExp]> = [
  ["youtube", /(?:^|\.)youtube\.com|youtu\.be/i],
  ["threads", /(?:^|\.)threads\.net/i],
  ["fanpage", /(?:^|\.)facebook\.com|(?:^|\.)fb\.com|instagram\.com/i],
  ["forum", /ptt\.cc|dcard\.tw|mobile01\.com|komica|meteor\.today|(?:^|\.)reddit\.com|backpackers|babyhome|mymkc|gamer\.com\.tw|eyny/i],
  ["blog", /pixnet\.net|痞客邦|blogspot\.|wordpress\.|medium\.com|xuite|方格子|vocus\.cc|matters\.town|hpspace|blog\./i],
  ["news", /udn\.com|ettoday\.net|chinatimes\.com|setn\.com|ltn\.com\.tw|tvbs\.com|nownews|storm\.mg|cna\.com\.tw|businessweekly|gvm\.com|technews|inside\.com\.tw|managertoday|bnext|marieclaire|elle\.|vogue|beauty321|edh\.tw|commonhealth|heho\.|ftvnews|ctee\.com|mirrormedia|nextapple|newtalk|thenewslens|自由時報|聯合報|中時|三立|東森/i],
];

/** Classify a result into an OpView source bucket from its URL/source. */
export function classifySource(url?: string, source?: string): SourceType {
  const hay = `${url ?? ""} ${source ?? ""}`.toLowerCase();
  for (const [type, re] of DOMAIN_RULES) if (re.test(hay)) return type;
  return "web";
}

export interface RunResultItem { title: string; source: string; excerpt: string; url?: string; sourceType: SourceType; publishedAt?: string }

export interface BrandCtx {
  id: number;
  name: string;
  industry: string | null;
  competitors: string[];
  /** true when the brand's market is Taiwan → bias search to zh-TW / TW sources. */
  isTaiwan: boolean;
}

/** Load a brand's listening context. Pass `userId` to enforce ownership
 *  (tRPC path); omit it for the trusted system ingestion job. */
export async function loadBrandCtx(brandId: number, userId?: number): Promise<BrandCtx | null> {
  const where = userId ? "id = ? AND userId = ?" : "id = ?";
  const params = userId ? [brandId, userId] : [brandId];
  const [rows]: any = await localPool.execute(
    `SELECT id, name, industry, soworkAnalysis, positioning, targetCountry, outputLanguage FROM brands WHERE ${where} LIMIT 1`,
    params,
  );
  const row = (rows as any[])[0];
  if (!row) return null;

  const parse = (v: any) => { try { return typeof v === "string" ? JSON.parse(v) : v; } catch { return null; } };
  const sa = parse(row.soworkAnalysis) ?? {};
  const pos = parse(row.positioning) ?? {};
  const fromSa = Array.isArray(sa.competitors) ? sa.competitors : [];
  const direct = pos?.competition?.direct;
  const fromPos = Array.isArray(direct)
    ? direct.map((d: any) => (typeof d === "string" ? d : d?.name)).filter(Boolean)
    : [];
  const competitors = Array.from(
    new Set([...fromSa, ...fromPos].map((c) => String(c).trim()).filter(Boolean)),
  ).slice(0, 6);

  const tc = String(row.targetCountry ?? "").toUpperCase();
  const ol = String(row.outputLanguage ?? "").toLowerCase();
  const isTaiwan = tc ? tc === "TW" : (ol ? ol.startsWith("zh") : true);

  return { id: Number(row.id), name: String(row.name ?? ""), industry: row.industry ?? null, competitors, isTaiwan };
}

/** Strip HTML/SVG/URL-encoded markup that leaks into scraped snippets
 *  (e.g. a favicon's `<path d="M16…"/>` showing up as the excerpt). */
export function cleanText(s: string): string {
  let t = String(s ?? "");
  try { if (/%[0-9a-fA-F]{2}/.test(t)) t = decodeURIComponent(t); } catch { /* keep raw */ }
  t = t
    .replace(/<[^>]*>/g, " ")                    // HTML/SVG tags
    .replace(/\b(?:d|fill|viewBox|xmlns|stroke)\s*=\s*['"][^'"]*['"]/gi, " ") // SVG attrs
    .replace(/[Mm][\s\d.,-]{12,}/g, " ")         // bare SVG path coordinate runs
    .replace(/url\(#[^)]*\)/gi, " ")             // svg url(#gradient) refs
    .replace(/\s+/g, " ")
    .trim();
  return t;
}

/** A cleaned string is real content only if it still has CJK or a word. */
export function hasRealText(s: string): boolean {
  return /[一-鿿]/.test(s) || /[A-Za-z]{3,}/.test(s);
}

/** Query-pack per scope. 四區塊: market hotspots → industry talk → own
 *  brand → competitors. Legacy keys keep their original brand-scoped packs. */
export function buildKeywords(taskKey: ListeningTaskKey, brand: BrandCtx): string[] {
  const brandName = brand.name;
  const cat = brand.industry?.trim() || brandName;
  const rgn = brand.isTaiwan ? " 台灣" : "";
  // Source-diverse terms nudge the SINGLE search per scope to surface across
  // 討論區 / 部落格 / YouTube / 新聞 / 粉絲團 — OpView-style coverage without
  // multiplying fetch calls. classifySource() then buckets each result.
  switch (taskKey) {
    case "listening.topic_buckets":
      return [`${brandName} 版型 尺寸 準不準${rgn}`, `${brandName} 材質 質感 評價${rgn}`, `${brandName} 划算 cp值 貴嗎${rgn}`];
    case "listening.verbatims":
      return [`${brandName} 開箱 心得 評價${rgn}`, `${brandName} 穿搭 好穿嗎${rgn}`];
    case "listening.crisis_scan":
      return [`${brandName} 退換貨 客訴${rgn}`, `${brandName} 色差 瑕疵 材質問題${rgn}`];
    case "listening.market_hotspots":
      return [`${cat} 熱門 話題 趨勢${rgn}`, `${cat} 爆紅 dcard ptt 討論`, `${cat} youtube 開箱 評測`, `${cat} 最新 新聞${rgn}`];
    case "listening.industry_talk":
      return [`${cat} 推薦 ptt dcard`, `${cat} 部落格 心得${rgn}`, `${cat} youtube 評測`, `${cat} 怎麼選 比較 新聞${rgn}`];
    case "listening.own_brand":
      return [`${brandName} 評價 心得${rgn}`, `${brandName} dcard ptt 討論`, `${brandName} 開箱 部落格`, `${brandName} youtube 評測`, `${brandName} 新聞${rgn}`];
    case "listening.competitors": {
      const comps = brand.competitors.length ? brand.competitors : [cat];
      return comps.slice(0, 4).map((c) => `${c} 評價 vs ${brandName} dcard ptt${rgn}`);
    }
  }
}

/** Recency window per scope: hotspots are a live trend cycle (short window);
 *  everything else is evergreen discussion. */
export function daysFor(taskKey: ListeningTaskKey): number {
  return taskKey === "listening.market_hotspots" ? 30 : 180;
}

export interface ScopeFetchResult {
  ok: boolean;
  query: string;
  items: RunResultItem[];
  message?: string;
}

const EN_MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Pull every plausible full date out of free text — numeric (2021-12-14),
 *  Chinese (2021年12月14日 / 2021年12月), and English/PTT (Dec 14 2021 /
 *  14 Dec 2021). Publish dates are usually written in the post body/excerpt
 *  even when the search provider gives no structured date. */
function parseDatesFromText(text: string): Date[] {
  const out: Date[] = [];
  const push = (y: number, mo: number, d: number) => {
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      const dt = new Date(Date.UTC(y, mo - 1, d));
      if (!isNaN(+dt)) out.push(dt);
    }
  };
  for (const x of text.matchAll(/(20\d\d)[-/.](\d{1,2})[-/.](\d{1,2})/g)) push(Number(x[1]), Number(x[2]), Number(x[3]));
  for (const x of text.matchAll(/(20\d\d)\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g)) push(Number(x[1]), Number(x[2]), Number(x[3]));
  for (const x of text.matchAll(/(20\d\d)\s*年\s*(\d{1,2})\s*月(?!\s*\d{1,2}\s*日)/g)) push(Number(x[1]), Number(x[2]), 1);
  for (const x of text.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(20\d\d)/gi)) push(Number(x[3]), EN_MONTHS[(x[1] ?? "").toLowerCase()] ?? 0, Number(x[2]));
  for (const x of text.matchAll(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(20\d\d)/gi)) push(Number(x[3]), EN_MONTHS[(x[2] ?? "").toLowerCase()] ?? 0, Number(x[1]));
  // PTT / ctime line: "Tue Dec 14 14:00:36 2021" (time sits between day and year).
  for (const x of text.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})\s+\d{1,2}:\d{2}(?::\d{2})?\s+(20\d\d)/gi)) push(Number(x[3]), EN_MONTHS[(x[1] ?? "").toLowerCase()] ?? 0, Number(x[2]));
  return out;
}

/** Resolve an article's PUBLISH date (not our capture time): provider field →
 *  URL date → full date parsed from the post text → newest year mentioned.
 *  Returns iso (YYYY-MM-DD) when a real date is known, plus a `year` signal
 *  used to catch stale items (e.g. a 2018 news piece) even without a full date. */
/** Parse a RELATIVE date string (SERP/social often gives these) into a Date.
 *  Handles en ("3 days ago", "1 hour ago") + zh ("3 天前", "2 週前", "1 個月前",
 *  "剛剛"). Returns null if not a relative form. */
export function parseRelativeDate(s?: string): Date | null {
  const t = String(s ?? "").trim().toLowerCase();
  if (!t) return null;
  if (/^(just now|yesterday|剛剛|剛才|方才|今天|昨天)$/.test(t)) {
    return new Date(Date.now() - (/(yesterday|昨天)/.test(t) ? 86_400_000 : 0));
  }
  const m = t.match(/(\d+)\s*(minute|min|hour|hr|day|week|month|year)s?\s+ago/) ||
            t.match(/(\d+)\s*(分鐘|分|小時|時|天|日|週|周|個月|月|年)前/);
  if (!m) return null;
  const n = Number(m[1] ?? "0"); const u = m[2] ?? "";
  let ms = 0;
  if (/min|分/.test(u)) ms = n * 60_000;
  else if (/hour|hr|小時|時/.test(u)) ms = n * 3_600_000;
  else if (/day|天|日/.test(u)) ms = n * 86_400_000;
  else if (/week|週|周/.test(u)) ms = n * 7 * 86_400_000;
  else if (/month|個月|月/.test(u)) ms = n * 30 * 86_400_000;
  else if (/year|年/.test(u)) ms = n * 365 * 86_400_000;
  return new Date(Date.now() - ms);
}

export function resolvePublish(item: { publishedAt?: string; url?: string; title?: string; excerpt?: string }): { iso: string | null; year: number | null } {
  const nowY = new Date().getUTCFullYear();
  const plausible = (dt: Date) => { const y = dt.getUTCFullYear(); return y >= 2000 && y <= nowY + 1; };
  const isoOf = (dt: Date) => dt.toISOString().slice(0, 10);

  // 1) provider-supplied date — relative form first ("3 天前"), then absolute
  if (item.publishedAt) {
    const rel = parseRelativeDate(item.publishedAt);
    if (rel && plausible(rel)) return { iso: isoOf(rel), year: rel.getUTCFullYear() };
    const dt = new Date(item.publishedAt);
    if (!isNaN(+dt) && plausible(dt)) return { iso: isoOf(dt), year: dt.getUTCFullYear() };
  }
  // 2) date embedded in the URL (/2024/03/15/, -20240315-, 2024-03-15)
  const url = item.url ?? "";
  const m = url.match(/(20\d\d)[-/_](\d{1,2})[-/_](\d{1,2})/) || url.match(/(20\d\d)(\d{2})(\d{2})/);
  if (m) {
    const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    if (!isNaN(+dt) && plausible(dt)) return { iso: isoOf(dt), year: dt.getUTCFullYear() };
  }
  // 3) full date written in the post text (PTT 時間行 / 部落格日期 / 新聞日期).
  //    Take the NEWEST plausible date — that's the publish date, not older
  //    dates the article happens to reference.
  const text = `${item.title ?? ""} ${item.excerpt ?? ""}`;
  const dates = parseDatesFromText(text).filter(plausible);
  if (dates.length) {
    const newest = new Date(Math.max(...dates.map((d) => +d)));
    return { iso: isoOf(newest), year: newest.getUTCFullYear() };
  }
  // 4) year-only signal (staleness catch when no full date is written)
  const hay = `${text} ${url}`;
  const years = Array.from(hay.matchAll(/(20\d\d)\s*年?/g)).map((x) => Number(x[1])).filter((y) => y >= 2000 && y <= nowY + 1);
  return { iso: null, year: years.length ? Math.max(...years) : null };
}

// ── High-precision collectors (Phase 1: RSS + YouTube Data API) ────────────
// Unlike SERP grounding, these return a RELIABLE publish date (RSS pubDate /
// YT publishedAt) — the accuracy upgrade CJ asked for. Best-effort: any
// failure returns [] so the broad SERP path still ships.

function decodeXml(s: string): string {
  return String(s ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(Number(d)); } catch { return ""; } })
    .replace(/&amp;/g, "&")
    .trim();
}
function pickTag(seg: string, tag: string): string {
  const m = seg.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodeXml(m[1] ?? "") : "";
}

/** Google News RSS keyword search — free, no auth, structured pubDate. The
 *  best-precision path for 新聞 (also surfaces many 部落格). */
export async function collectGoogleNewsRss(query: string, isTaiwan: boolean, limit = 12): Promise<RunResultItem[]> {
  if (!query.trim()) return [];
  const hl = isTaiwan ? "zh-TW" : "en-US";
  const gl = isTaiwan ? "TW" : "US";
  const ceid = isTaiwan ? "TW:zh-Hant" : "US:en";
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${hl}&gl=${gl}&ceid=${ceid}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { "user-agent": "Mozilla/5.0 (compatible; OnBrandListening/1.0)" } });
    if (!res.ok) return [];
    const xml = await res.text();
    const out: RunResultItem[] = [];
    for (const block of xml.split(/<item>/i).slice(1)) {
      const seg = block.split(/<\/item>/i)[0] ?? "";
      const rawTitle = pickTag(seg, "title");
      if (!rawTitle) continue;
      const source = pickTag(seg, "source");
      const link = pickTag(seg, "link");
      const pub = pickTag(seg, "pubDate");
      // Google News titles read "Headline - Source" — strip the source tail.
      const title = source && rawTitle.endsWith(` - ${source}`) ? rawTitle.slice(0, -(source.length + 3)) : rawTitle;
      out.push({
        title, source: source || "Google News", excerpt: "", url: link || undefined,
        sourceType: "news",
        publishedAt: pub && !isNaN(+new Date(pub)) ? new Date(pub).toISOString() : undefined,
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch { return []; }
}

/** GDELT DOC 2.0 API — free, NO key, full-text search across the global news
 *  web in 65 machine-translated languages (incl. 繁中), rolling ~3-month
 *  window, refreshed every 15 min. This is the biggest free lever toward
 *  OpView-scale 新聞 volume: it reaches thousands of outlets our hand-picked
 *  TW_FEEDS + Google News RSS miss. Best-effort: any failure returns []. */
export async function collectGdelt(query: string, isTaiwan: boolean, days: number, limit = 25): Promise<RunResultItem[]> {
  if (!query.trim()) return [];
  // Quote multi-word terms so GDELT reads them as phrases; preserve OR groups.
  const q = query
    .split(/\s+OR\s+/i)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (/\s/.test(t) && !/^".*"$/.test(t) ? `"${t}"` : t))
    .join(" OR ");
  // Locale bias: TW brands → Taiwan sources; else → English coverage.
  // (GDELT wants the full language NAME — `sourcelang:english`, not `eng`.)
  const locale = isTaiwan ? " sourcecountry:TW" : " sourcelang:english";
  // DOC API only covers a rolling ~3-month window — cap the range at 90 days.
  const spanMs = Math.min(Math.max(days, 1), 90) * 86_400_000;
  const stamp = (d: Date) => d.toISOString().replace(/[-:T]/g, "").replace(/\.\d{3}Z$/, "");
  const params = new URLSearchParams({
    query: `${q}${locale}`,
    mode: "ArtList", format: "json", sort: "datedesc",
    maxrecords: String(Math.min(Math.max(limit, 1), 250)),
    startdatetime: stamp(new Date(Date.now() - spanMs)),
    enddatetime: stamp(new Date()),
  });
  try {
    const res = await fetch(`https://api.gdeltproject.org/api/v2/doc/doc?${params.toString()}`, {
      signal: AbortSignal.timeout(12_000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; OnBrandListening/1.0)" },
    });
    if (!res.ok) return [];
    const text = await res.text();
    if (!text.trim().startsWith("{")) return [];   // GDELT returns plain text on a malformed query
    const json: any = JSON.parse(text);
    const articles: any[] = json?.articles ?? [];
    return articles.map((a) => {
      const sd = String(a?.seendate ?? "");
      const m = sd.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
      const iso = m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : undefined;
      const url = typeof a?.url === "string" ? a.url : undefined;
      const domain = String(a?.domain ?? "");
      // GDELT is a NEWS index — default unknown domains to 新聞 (not the web
      // catch-all), but keep a more specific bucket when the domain matches.
      const st = classifySource(url, domain);
      return {
        title: String(a?.title ?? ""),
        source: domain || "GDELT",
        excerpt: "",
        url,
        sourceType: (st === "web" ? "news" : st) as SourceType,
        publishedAt: iso,
      } as RunResultItem;
    }).filter((x) => x.title);
  } catch { return []; }
}

const IG_ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
/** Publish date straight from a social post URL — free, deterministic, no fetch.
 *  TikTok video id: high 32 bits = unix seconds. Instagram / Threads shortcode:
 *  Meta media-id (base64), high bits >>23 + epoch = unix ms. Facebook post URLs
 *  carry NO timestamp (pfbid/opaque) → null (FB stays undatable for free).
 *  Verified 2026-08-09: TikTok 6718…173→2019-07-27, IG Bl-fX8gA1nf→2018-08-02,
 *  Threads DEJveCChMLO→2024-12-29. */
export function resolveSocialDate(url?: string): string | null {
  const u = String(url ?? "");
  const okYear = (ms: number) => { const y = new Date(ms).getUTCFullYear(); return y >= 2011 && y <= new Date().getUTCFullYear() + 1; };
  let m = u.match(/\/video\/(\d{6,25})/) || u.match(/[?&]item_id=(\d{6,25})/);   // TikTok
  if (m) { try { const s = Number(BigInt(m[1]!) >> 32n); if (s > 1_400_000_000 && s < 2_000_000_000) return new Date(s * 1000).toISOString().slice(0, 10); } catch { /* not decodable */ } }
  m = u.match(/(?:instagram\.com\/(?:p|reel|reels|tv)|threads\.net\/[^/]+\/post)\/([A-Za-z0-9_-]+)/);   // IG / Threads
  if (m) {
    try {
      let id = 0n;
      for (const ch of m[1]!) { const v = IG_ALPHA.indexOf(ch); if (v < 0) return null; id = id * 64n + BigInt(v); }
      const ms = Number((id >> 23n) + 1314220021721n);
      if (okYear(ms)) return new Date(ms).toISOString().slice(0, 10);
    } catch { /* not decodable */ }
  }
  return null;
}

/** Social-mention collector via Google SERP (Tier B, CJ-approved 2026-08).
 *  Google indexes public FB/IG/TikTok/Threads posts, so a domain-scoped SERP
 *  query surfaces cross-platform social mentions WITHOUT each platform's API.
 *
 *  SERP itself returns social results WITHOUT a date, so we recover the publish
 *  date from the URL via resolveSocialDate() — works for TikTok/IG/Threads.
 *  ⚠️ Facebook URLs carry no timestamp → those items stay undated and get
 *  dropped by the recency-strict feed (FB needs Graph API / paid unlocker to date).
 *
 *  Dual-provider: SerpApi (SERPAPI_API_KEY, GET) or Serper.dev (SERPER_API_KEY,
 *  POST). Returns [] without a key. */
export const SOCIAL_SITES = ["instagram.com", "facebook.com", "tiktok.com", "threads.net"];

/** Low-level Google SERP (dual-provider): SerpApi (SERPAPI_API_KEY, GET) or
 *  Serper.dev (SERPER_API_KEY, POST). Returns raw organic {title,link,snippet}. */
async function serpSearch(q: string, isTaiwan: boolean, opts: { num?: number; tbs?: string } = {}): Promise<Array<{ title?: string; link?: string; snippet?: string }>> {
  const serpapiKey = (process.env.SERPAPI_API_KEY ?? "").trim();
  const serperKey = (process.env.SERPER_API_KEY ?? "").trim();
  if (!q.trim() || (!serpapiKey && !serperKey)) return [];
  const num = Math.min(Math.max(opts.num ?? 20, 10), 20);
  try {
    if (serpapiKey) {
      const qs = new URLSearchParams({ engine: "google", api_key: serpapiKey, q, num: String(num), gl: isTaiwan ? "tw" : "us", hl: isTaiwan ? "zh-tw" : "en" });
      if (opts.tbs) qs.set("tbs", opts.tbs);
      const res = await fetch(`https://serpapi.com/search.json?${qs.toString()}`, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) return [];
      const j: any = await res.json();
      return (j?.organic_results ?? []).map((o: any) => ({ title: o?.title, link: o?.link, snippet: o?.snippet }));
    }
    const body: any = { q, num, gl: isTaiwan ? "tw" : "us", hl: isTaiwan ? "zh-tw" : "en" };
    if (opts.tbs) body.tbs = opts.tbs;
    const res = await fetch("https://google.serper.dev/search", { method: "POST", signal: AbortSignal.timeout(12_000), headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) return [];
    const j: any = await res.json();
    return (j?.organic ?? []).map((o: any) => ({ title: o?.title, link: o?.link, snippet: o?.snippet }));
  } catch { return []; }
}

export async function collectSocialSerp(query: string, isTaiwan: boolean, days: number, limit = 20): Promise<RunResultItem[]> {
  if (!query.trim()) return [];
  const q = `${query} (${SOCIAL_SITES.map((s) => `site:${s}`).join(" OR ")})`;
  const tbs = days <= 7 ? "qdr:w" : days <= 31 ? "qdr:m" : "qdr:y";
  const organic = await serpSearch(q, isTaiwan, { num: Math.min(Math.max(limit, 10), 20), tbs });
  return organic.map((o) => {
    const url = typeof o.link === "string" ? o.link : undefined;
    let host = "social";
    try { if (url) host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* keep default */ }
    return {
      title: String(o.title ?? ""),
      source: host,
      excerpt: String(o.snippet ?? "").slice(0, 280),
      url,
      sourceType: classifySource(url, String(o.title ?? "")),
      // ONLY the URL-decoded date is trustworthy for social — FB post text has
      // promo dates the parser would misread. FB (null) → dropped here; it gets
      // real dates via collectFacebookApify (paid) in the ingest path instead.
      publishedAt: resolveSocialDate(url) ?? undefined,
    } as RunResultItem;
  }).filter((x) => x.title && x.url && x.publishedAt);   // keep only URL-datable (TikTok/IG/Threads)
}

/** Normalise a FB post/group URL to its scrapeable PAGE root (the Apify actor
 *  takes page URLs, not post URLs). */
function fbPageRoot(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/(?:^|\.)facebook\.com$/i.test(u.hostname)) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    const first = parts[0];
    if (!first) return null;
    if (first === "groups" && parts[1]) return `https://www.facebook.com/groups/${parts[1]}`;
    if (first.toLowerCase() === "profile.php") { const id = u.searchParams.get("id"); return id ? `https://www.facebook.com/profile.php?id=${id}` : null; }
    return `https://www.facebook.com/${first}`;
  } catch { return null; }
}

const APIFY_FB_ACTOR = "apify~facebook-posts-scraper";
/** Facebook dating via Apify FB Posts Scraper (Tier B PAID, CJ-approved 2026-08).
 *  FB is the one social platform with no free date (no URL timestamp). SERP finds
 *  FB pages mentioning the term; the Apify actor returns those pages' recent posts
 *  WITH real ISO dates (`time`), filtered to `onlyPostsNewerThan` = window, then
 *  to posts whose text matches the term. SLOW (tens of seconds) + costs ~US$2 /
 *  1,000 posts → INGEST-ONLY, never the live path. Needs APIFY_TOKEN + a SERP key;
 *  returns [] without either. ⚠️ Built to Apify's documented API; verify live with
 *  scripts/poc-fb-apify.ts before enabling in the daily ingest. */
export async function collectFacebookApify(query: string, isTaiwan: boolean, days: number, limit = 15): Promise<RunResultItem[]> {
  const token = (process.env.APIFY_TOKEN ?? "").trim();
  if (!token || !query.trim()) return [];
  // 1) discover FB pages/groups that mention the term (reuse SERP)
  const hits = await serpSearch(`${query} site:facebook.com`, isTaiwan, { num: 20 });
  const pages = Array.from(new Set(hits.map((h) => fbPageRoot(String(h.link ?? ""))).filter((x): x is string => !!x))).slice(0, 5);
  if (!pages.length) return [];
  // 2) scrape those pages' recent posts (dated) via the Apify actor (sync run)
  const cutoffISO = new Date(Date.now() - Math.min(Math.max(days, 1), 365) * 86_400_000).toISOString().slice(0, 10);
  try {
    const res = await fetch(`https://api.apify.com/v2/acts/${APIFY_FB_ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`, {
      method: "POST", signal: AbortSignal.timeout(180_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startUrls: pages.map((url) => ({ url })), resultsLimit: Math.min(Math.max(limit, 10), 50), onlyPostsNewerThan: cutoffISO }),
    });
    if (!res.ok) return [];
    const items: any[] = await res.json();
    const terms = query.split(/\s+OR\s+/i).map((t) => t.replace(/"/g, "").trim().toLowerCase()).filter(Boolean);
    const out: RunResultItem[] = [];
    for (const it of items) {
      const text = String(it?.text ?? "").trim();
      if (!text) continue;
      if (terms.length && !terms.some((t) => text.toLowerCase().includes(t))) continue;   // relevance
      const iso = typeof it?.time === "string" ? it.time.slice(0, 10)
        : typeof it?.timestamp === "number" ? new Date(it.timestamp * 1000).toISOString().slice(0, 10)
        : undefined;
      out.push({
        title: text.slice(0, 120),
        source: String(it?.pageName ?? "Facebook"),
        excerpt: text.slice(0, 280),
        url: typeof it?.url === "string" ? it.url : undefined,
        sourceType: "fanpage",
        publishedAt: iso,
      });
    }
    return out;
  } catch { return []; }
}

/** YouTube Data API v3 search — official, structured publishedAt. Needs a key
 *  (YOUTUBE_API_KEY, else the shared Google key). Returns [] when no key / API
 *  disabled, so the pipeline degrades gracefully. */
export async function collectYouTube(query: string, days: number, isTaiwan: boolean, limit = 8): Promise<RunResultItem[]> {
  const key = (process.env.YOUTUBE_API_KEY ?? process.env.GOOGLE_AI_API_KEY ?? process.env.GEMINI_API_KEY ?? "").trim();
  if (!key || !query.trim()) return [];
  const params = new URLSearchParams({
    part: "snippet", type: "video", order: "date", maxResults: String(limit),
    q: query, publishedAfter: new Date(Date.now() - days * 86_400_000).toISOString(), key,
  });
  if (isTaiwan) { params.set("relevanceLanguage", "zh-Hant"); params.set("regionCode", "TW"); }
  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return [];
    const json: any = await res.json();
    const items: any[] = json?.items ?? [];
    return items.map((it) => ({
      title: String(it?.snippet?.title ?? ""),
      source: String(it?.snippet?.channelTitle ?? "YouTube"),
      excerpt: String(it?.snippet?.description ?? "").slice(0, 280),
      url: it?.id?.videoId ? `https://www.youtube.com/watch?v=${it.id.videoId}` : undefined,
      sourceType: "youtube" as SourceType,
      publishedAt: typeof it?.snippet?.publishedAt === "string" ? it.snippet.publishedAt : undefined,
    })).filter((x) => x.title);
  } catch { return []; }
}

/** Primary keyword for the query-based collectors (Google News / YouTube). */
function collectorQueryFor(taskKey: ListeningTaskKey, brand: BrandCtx): string {
  const cat = brand.industry?.trim() || brand.name;
  switch (taskKey) {
    case "listening.competitors":
      return brand.competitors.slice(0, 3).join(" OR ") || brand.name;
    case "listening.market_hotspots":
    case "listening.industry_talk":
      return cat;
    default:
      return brand.name;
  }
}

/** Terms to match against per-site RSS items (the site feeds aren't
 *  keyword-searchable, so we pull each feed and filter locally). */
function collectorTermsFor(taskKey: ListeningTaskKey, brand: BrandCtx): string[] {
  switch (taskKey) {
    case "listening.competitors":
      return brand.competitors.length ? brand.competitors : [brand.name];
    case "listening.market_hotspots":
    case "listening.industry_talk":
      return [brand.industry?.trim() || brand.name];
    default:
      return [brand.name];
  }
}

// ── Per-site RSS (CJ「獨立蒐集每一個來源網站的RSS，再嘗試 Google RSS」) ─────
// A controlled registry of major TW news / tech-media RSS feeds we pull
// DIRECTLY (not via the Google aggregator), then filter by the scope's terms.
// Direct feeds give us source control + reliable pubDate; Google News RSS
// (above) complements by keyword-searching sites this list misses.
// Verified live 2026-08-09 (probed per-feed; 404/403 ones like 中時/風傳媒/
// 數位時代/TVBS have dropped or gated public RSS — Google News RSS below
// keyword-searches those instead).
const TW_FEEDS: Array<{ name: string; url: string; type: SourceType }> = [
  { name: "自由時報",   url: "https://news.ltn.com.tw/rss/all.xml",              type: "news" },
  { name: "ETtoday",    url: "https://feeds.feedburner.com/ettoday/realtime",    type: "news" },
  { name: "Yahoo新聞",  url: "https://tw.news.yahoo.com/rss/",                   type: "news" },
  { name: "新頭殼",     url: "https://newtalk.tw/rss/all",                       type: "news" },
  { name: "中央社",     url: "https://feeds.feedburner.com/rsscna/finance",      type: "news" },
  { name: "聯合新聞網", url: "https://udn.com/rssfeed/news/2/6638",              type: "news" },
  { name: "科技新報",   url: "https://technews.tw/feed/",                        type: "blog" },
  { name: "INSIDE",     url: "https://www.inside.com.tw/feed/rss",               type: "blog" },
];

// 10-min in-process cache so an ingestion run (4 scopes × N brands) fetches
// each feed once, not once per scope.
const _feedCache = new Map<string, { at: number; xml: string }>();
async function fetchFeedXml(url: string): Promise<string> {
  const c = _feedCache.get(url);
  if (c && Date.now() - c.at < 10 * 60_000) return c.xml;
  const res = await fetch(url, { signal: AbortSignal.timeout(8_000), headers: { "user-agent": "Mozilla/5.0 (compatible; OnBrandListening/1.0)" } });
  if (!res.ok) throw new Error(`feed ${res.status}`);
  const xml = await res.text();
  _feedCache.set(url, { at: Date.now(), xml });
  return xml;
}

/** Generic RSS 2.0 <item> / Atom <entry> parser. */
function parseFeedItems(xml: string, sourceType: SourceType, sourceName: string, limit: number): RunResultItem[] {
  const out: RunResultItem[] = [];
  const isAtom = /<entry[\s>]/i.test(xml) && !/<item[\s>]/i.test(xml);
  const tag = isAtom ? "entry" : "item";
  for (const block of xml.split(new RegExp(`<${tag}[\\s>]`, "i")).slice(1)) {
    const seg = block.split(new RegExp(`</${tag}>`, "i"))[0] ?? "";
    const title = pickTag(seg, "title");
    if (!title) continue;
    let link = pickTag(seg, "link");
    if (!link) { const m = seg.match(/<link[^>]*href=["']([^"']+)["']/i); if (m) link = m[1] ?? ""; }
    const pub = pickTag(seg, "pubDate") || pickTag(seg, "published") || pickTag(seg, "updated") || pickTag(seg, "dc:date");
    const desc = pickTag(seg, "description") || pickTag(seg, "summary") || pickTag(seg, "content");
    out.push({
      title, source: sourceName, excerpt: cleanText(desc).slice(0, 280), url: link || undefined,
      sourceType,
      publishedAt: pub && !isNaN(+new Date(pub)) ? new Date(pub).toISOString() : undefined,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Pull each TW source feed directly and keep items mentioning a term. */
export async function collectSiteRss(terms: string[], perFeedLimit = 40): Promise<RunResultItem[]> {
  const t = terms.map((x) => x.toLowerCase().trim()).filter(Boolean);
  if (!t.length) return [];
  const per = await Promise.all(TW_FEEDS.map(async (f) => {
    try {
      const xml = await fetchFeedXml(f.url);
      return parseFeedItems(xml, f.type, f.name, perFeedLimit)
        .filter((it) => { const hay = `${it.title} ${it.excerpt}`.toLowerCase(); return t.some((term) => hay.includes(term)); });
    } catch { return []; }
  }));
  return per.flat();
}

// ── PTT collector (Step 2) ─────────────────────────────────────────────────
// PTT has no global search (search is per-board), so we search a small set of
// high-traffic + industry-matched boards. Public, no login; over18 cookie
// bypasses the age gate. Date comes from the search list's M/DD (year inferred
// — search is newest-first); the full ctime lives on the article page but we
// avoid a fetch-per-article. sourceType = forum.
const PTT_BASE = "https://www.ptt.cc";
const PTT_INDUSTRY_BOARDS: Array<{ match: RegExp; boards: string[] }> = [
  { match: /食|餐|飲|食品|snack|food|nutrition|營養|奶|保健|飲料/i, boards: ["Food", "cookclub"] },
  { match: /美妝|保養|化妝|beauty|skincare|cosmetic|服飾|時尚|fashion|女裝|穿搭|clothes/i, boards: ["BeautySalon", "MakeUp"] },
  { match: /手機|3c|電子|科技|tech|gadget|watch|穿戴|smart|wearable/i, boards: ["MobileComm", "PC_Shopping"] },
  { match: /母嬰|嬰|兒童|寶寶|baby|kids|parent|親子|婦幼/i, boards: ["BabyMother"] },
  { match: /遊戲|game|gaming|寶可夢|pokemon|手遊/i, boards: ["C_Chat", "MobileComm"] },
];
function pttBoardsFor(brand: BrandCtx): string[] {
  const boards = new Set<string>(["Lifeismoney", "e-shopping"]); // general consumer/shopping
  const hay = `${brand.industry ?? ""} ${brand.name}`.toLowerCase();
  for (const r of PTT_INDUSTRY_BOARDS) if (r.match.test(hay)) r.boards.forEach((b) => boards.add(b));
  return Array.from(boards).slice(0, 4);
}

function parsePttSearch(html: string, board: string, limit: number): RunResultItem[] {
  const items: RunResultItem[] = [];
  const now = Date.now();
  for (const block of html.split(/<div class="r-ent">/i).slice(1)) {
    const seg = block.split(/<div class="r-list-sep">/i)[0] ?? block;
    const a = seg.match(/<div class="title">[\s\S]*?<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!a) continue; // deleted post / no link
    const href = a[1] ?? "";
    const title = decodeXml((a[2] ?? "").replace(/<[^>]*>/g, "")).trim();
    if (!title) continue;
    const push = (seg.match(/<div class="nrec">[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? "").replace(/<[^>]*>/g, "").trim();
    const author = (seg.match(/<div class="author">([\s\S]*?)<\/div>/i)?.[1] ?? "").trim();
    const dateRaw = (seg.match(/<div class="date">([\s\S]*?)<\/div>/i)?.[1] ?? "").trim();
    let publishedAt: string | undefined;
    const dm = dateRaw.match(/(\d{1,2})\/(\d{1,2})/);
    if (dm) {
      const mo = Number(dm[1]), d = Number(dm[2]);
      let y = new Date().getUTCFullYear();
      // Newest-first list: an M/DD dated in the future must be last year.
      if (Date.UTC(y, mo - 1, d) > now + 2 * 86_400_000) y -= 1;
      const dt = new Date(Date.UTC(y, mo - 1, d));
      if (!isNaN(+dt)) publishedAt = dt.toISOString();
    }
    items.push({
      title,
      source: `PTT ${board}${push ? ` · 推${push}` : ""}`,
      excerpt: author ? `作者 ${author}` : "",
      url: href.startsWith("http") ? href : `${PTT_BASE}${href}`,
      sourceType: "forum",
      publishedAt,
    });
    if (items.length >= limit) break;
  }
  return items;
}

/** Search a small set of PTT boards for a term (TW only). */
export async function collectPtt(term: string, brand: BrandCtx, perBoardLimit = 10): Promise<RunResultItem[]> {
  if (!brand.isTaiwan || !term.trim()) return [];
  const boards = pttBoardsFor(brand);
  const per = await Promise.all(boards.map(async (board) => {
    try {
      const res = await fetch(`${PTT_BASE}/bbs/${board}/search?q=${encodeURIComponent(term)}`, {
        signal: AbortSignal.timeout(9_000),
        headers: { "user-agent": "Mozilla/5.0 (compatible; OnBrandListening/1.0)", cookie: "over18=1" },
      });
      if (!res.ok) return [];
      return parsePttSearch(await res.text(), board, perBoardLimit);
    } catch { return []; }
  }));
  return per.flat();
}

/** Run ONE scope's collection: broad SERP grounding + high-precision
 *  structured collectors (RSS + YouTube), merged, publish-date-filtered and
 *  deduped. Shared by the live tRPC path and the accumulating ingestion job.
 *  `daysOverride` lets the user pick a recency window (freshness filter). */
export async function fetchScopeMentions(
  brand: BrandCtx,
  taskKey: ListeningTaskKey,
  daysOverride?: number,
  limit = 12,
): Promise<ScopeFetchResult> {
  const keywords = buildKeywords(taskKey, brand);
  const query = keywords.join(" / ");
  const days = daysOverride && daysOverride > 0 ? daysOverride : daysFor(taskKey);
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const collectorQ = collectorQueryFor(taskKey, brand);
  const SCOUT_TIMEOUT_MS = 15_000;

  try {
    const { perplexityScout } = await import("./scouts/perplexityScout");
    const terms = collectorTermsFor(taskKey, brand);
    // SERP social costs a key credit (250/mo) — only run it on the 聲量 scopes
    // (own_brand / competitors) where social mentions matter, not news scopes.
    const socialScope = taskKey === "listening.own_brand" || taskKey === "listening.competitors";
    const [pplxItems, siteItems, newsItems, gdeltItems, ytItems, pttItems, serpItems] = await Promise.all([
      Promise.race([
        perplexityScout.fetch({
          brandId: brand.id, brandName: brand.name, industry: brand.industry ?? undefined,
          keywords, competitors: taskKey === "listening.competitors" ? brand.competitors : [],
          industryTags: brand.industry ? [brand.industry] : [],
          days, limit: 8, loadCred: async () => null,
        } as any),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), SCOUT_TIMEOUT_MS)),
      ]).catch(() => null),
      collectSiteRss(terms).catch(() => []),                                 // per-site RSS (direct)
      collectGoogleNewsRss(collectorQ, brand.isTaiwan).catch(() => []),      // Google News RSS (complement)
      collectGdelt(collectorQ, brand.isTaiwan, days, Math.max(limit * 3, 40)).catch(() => []), // GDELT global news (free, high-volume)
      collectYouTube(collectorQ, days, brand.isTaiwan).catch(() => []),      // YouTube Data API
      collectPtt(terms[0] ?? brand.name, brand).catch(() => []),             // PTT 討論區
      socialScope ? collectSocialSerp(collectorQ, brand.isTaiwan, days, 20).catch(() => []) : Promise.resolve([] as RunResultItem[]), // SERP social (key-gated, URL-dated)
    ]);

    const raw: RunResultItem[] = [];
    if (Array.isArray(pplxItems)) {
      for (const it of pplxItems as any[]) {
        raw.push({
          title: cleanText(it.title), source: it.source,
          excerpt: cleanText(it.content ?? "").slice(0, 280), url: it.url,
          sourceType: classifySource(it.url, it.source),
          publishedAt: typeof it.publishedAt === "string" ? it.publishedAt : undefined,
        });
      }
    }
    raw.push(...(siteItems as RunResultItem[]), ...(newsItems as RunResultItem[]), ...(gdeltItems as RunResultItem[]), ...(ytItems as RunResultItem[]), ...(pttItems as RunResultItem[]), ...(serpItems as RunResultItem[]));

    // Unified pass: drop junk titles, resolve the PUBLISH date, filter by
    // publish-date recency (CJ「2018年的根本不應該出現」), dedup by url/title.
    // The structured collectors carry reliable dates so they pass precisely.
    const seen = new Set<string>();
    const out: RunResultItem[] = [];
    for (const it of raw) {
      if (!hasRealText(it.title)) continue;
      // Recency TRUST (CJ「時效性問題始終沒解決」): every shown item must have a
      // resolvable publish date INSIDE the window. Undated items are dropped —
      // that's where old evergreen pages leaked in (e.g. a 2022 article on top).
      const { iso } = resolvePublish(it);
      if (!iso) continue;                      // no confident date → drop
      if (new Date(iso) < cutoff) continue;    // dated but older than window → drop
      it.publishedAt = iso;
      const key = mentionHash(it.url || it.title);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(it);
    }
    // Dated items first (newest → oldest); undated fall to the end.
    out.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
    const final = out.slice(0, limit);

    if (final.length === 0) {
      return { ok: false, query, items: [], message: "此時間範圍內沒有找到有效的公開討論（較舊或無法判定發布日的結果已濾除）。可試著把時間範圍放寬。" };
    }
    return { ok: true, query, items: final };
  } catch (e: any) {
    return { ok: false, query, items: [], message: `即時搜尋失敗：${String(e?.message ?? e).slice(0, 150)}` };
  }
}

// ── Phase 2: sentiment + word cloud (OpView 內容分析) ──────────────────────
// Zero-cost, deterministic lexicon sentiment — enough for a 正/負/中 breakdown
// bar. Kept off any LLM to stay free during private preview; an LLM pass can
// upgrade accuracy later. Chinese terms are 2+ chars (single chars like 差/貴/
// 好/推 are too ambiguous as substrings); English matches whole tokens only.
export type Sentiment = "positive" | "negative" | "neutral";

const POS_ZH = ["讚","推薦","大推","激推","喜歡","優惠","划算","好吃","美味","值得","滿意","驚豔","優質","超值","必買","回購","好用","開心","期待","熱賣","暢銷","首選","高品質","好評","心動","cp值","cp 值","超讚","超推","很棒","不錯","實用","貼心"];
const NEG_ZH = ["難吃","地雷","踩雷","很雷","失望","退貨","客訴","抱怨","瑕疵","過期","下架","回收","危害","危機","醜聞","爭議","抵制","拒買","難用","不推","後悔","詐騙","黑心","缺貨","漲價","投訴","糾紛","負評","翻車","太貴","踩坑","很爛","超雷","很差","超貴","難用"];
const ZH_NEG_PREFIX = ["不","沒","別","毫無","無法","不太","不會"];
const POS_EN = new Set(["love","loved","great","best","excellent","amazing","recommend","recommended","perfect","awesome","favorite","favourite","delicious","worth","quality","popular","praise","fantastic","wonderful","superb"]);
const NEG_EN = new Set(["hate","hated","bad","worst","terrible","awful","disappointing","disappointed","avoid","scam","recall","recalled","lawsuit","controversy","boycott","complaint","defect","defective","refund","crisis","fail","failed","poor","overpriced"]);

/** Rough 正/負/中 label from title+excerpt. Best-effort, never throws. */
export function scoreSentiment(text?: string): Sentiment {
  const low = String(text ?? "").toLowerCase();
  if (!low.trim()) return "neutral";
  let pos = 0, neg = 0;
  for (const w of POS_ZH) {
    let i = low.indexOf(w);
    while (i !== -1) {
      const pre = low.slice(Math.max(0, i - 2), i);
      if (ZH_NEG_PREFIX.some((n) => pre.includes(n))) neg++; else pos++;   // 不+推薦 → 負
      i = low.indexOf(w, i + w.length);
    }
  }
  for (const w of NEG_ZH) { let i = low.indexOf(w); while (i !== -1) { neg++; i = low.indexOf(w, i + w.length); } }
  for (const tok of low.split(/[^a-z0-9']+/)) { if (POS_EN.has(tok)) pos++; else if (NEG_EN.has(tok)) neg++; }
  if (pos === 0 && neg === 0) return "neutral";
  return pos > neg ? "positive" : neg > pos ? "negative" : "neutral";
}

const CLOUD_STOP_ZH = new Set(["的","了","是","在","我","有","和","就","不","人","都","也","很","到","說","要","去","你","會","著","沒","看","好","自己","這","那","什麼","可以","但是","如果","因為","所以","還有","一個","我們","他們","現在","已經","不是","這個","那個","可能","知道","一直","出來","時候","為了","以及","還是","真的","覺得","然後","不過","以後","一樣","開始"]);
const CLOUD_STOP_EN = new Set(["the","and","for","are","was","with","that","this","its","from","has","have","will","not","but","you","your","our","their","they","she","him","her","who","what","when","which","been","were","would","could","should","about","into","than","then","them","also","more","most","some","such","only","just","how","why","new"]);

/** Frequency word-cloud terms from a text corpus. English whole-words + Chinese
 *  2/3-grams (no segmentation dependency). Returns [{term, weight}] desc. */
export function buildWordCloud(texts: string[], limit = 40): Array<{ term: string; weight: number }> {
  const freq = new Map<string, number>();
  const bump = (k: string) => freq.set(k, (freq.get(k) ?? 0) + 1);
  for (const raw of texts) {
    const t = String(raw ?? "");
    for (const w of t.toLowerCase().split(/[^a-z0-9]+/)) {
      if (w.length < 3 || CLOUD_STOP_EN.has(w) || /^\d+$/.test(w)) continue;
      bump(w);
    }
    for (const run of t.match(/[一-鿿]{2,}/g) ?? []) {
      for (let n = 2; n <= 3; n++) {
        for (let i = 0; i + n <= run.length; i++) {
          const g = run.slice(i, i + n);
          if (CLOUD_STOP_ZH.has(g)) continue;
          bump(g);
        }
      }
    }
  }
  return [...freq.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term, weight]) => ({ term, weight }));
}

// ── Accumulating store (Phase 1) ──────────────────────────────────────────

/** Stable 16-char hash for dedup (url when present, else title). */
export function mentionHash(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0x1000193;
  const str = String(s ?? "").trim().toLowerCase();
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x01000193) >>> 0;
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).slice(0, 16);
}

/** Idempotent: create the accumulating mentions table if it doesn't exist,
 *  and add later columns to a pre-existing table (guarded — MySQL lacks
 *  ADD COLUMN IF NOT EXISTS on older versions). */
export async function ensureMentionsTable(): Promise<void> {
  await localPool.execute(`
    CREATE TABLE IF NOT EXISTS listening_mentions (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      brandId INT NOT NULL,
      scope VARCHAR(48) NOT NULL,
      urlHash CHAR(16) NOT NULL,
      title VARCHAR(512) NOT NULL,
      source VARCHAR(255) NULL,
      url VARCHAR(1024) NULL,
      excerpt TEXT NULL,
      sourceType VARCHAR(24) NULL,
      sentiment VARCHAR(16) NULL,
      publishedAt VARCHAR(40) NULL,
      firstSeenAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      lastSeenAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      seenCount INT NOT NULL DEFAULT 1,
      UNIQUE KEY uniq_brand_scope_url (brandId, scope, urlHash),
      KEY idx_brand_scope (brandId, scope),
      KEY idx_first_seen (firstSeenAt),
      KEY idx_source_type (sourceType)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // Backfill column on a table created before sourceType existed (Phase-1 rows).
  try {
    const [cols]: any = await localPool.execute(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'listening_mentions' AND COLUMN_NAME = 'sourceType'`,
    );
    if (!(cols as any[]).length) {
      await localPool.execute(`ALTER TABLE listening_mentions ADD COLUMN sourceType VARCHAR(24) NULL, ADD KEY idx_source_type (sourceType)`);
    }
  } catch { /* non-fatal: table already current, or concurrent ALTER */ }
}

/** Upsert one mention. New rows return "new"; already-seen rows bump
 *  lastSeenAt + seenCount and return "updated" — this is what turns
 *  one-off search into an accumulating, trend-able dataset. */
export async function upsertMention(brandId: number, scope: ListeningTaskKey, item: RunResultItem, sentimentOverride?: Sentiment): Promise<"new" | "updated"> {
  const hash = mentionHash(item.url || item.title);
  // Prefer a source-provided label (e.g. OpView 情緒 on an imported export);
  // fall back to our zero-cost lexicon (Phase 2 正/負/中).
  const sentiment = sentimentOverride ?? scoreSentiment(`${item.title} ${item.excerpt}`);
  const [res]: any = await localPool.execute(
    `INSERT INTO listening_mentions (brandId, scope, urlHash, title, source, url, excerpt, sourceType, sentiment, publishedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       lastSeenAt = CURRENT_TIMESTAMP,
       seenCount = seenCount + 1,
       title = VALUES(title),
       excerpt = VALUES(excerpt),
       sourceType = VALUES(sourceType),
       sentiment = VALUES(sentiment)`,
    [
      brandId, scope, hash, item.title.slice(0, 512), (item.source ?? "").slice(0, 255),
      (item.url ?? "").slice(0, 1024), item.excerpt.slice(0, 2000),
      item.sourceType ?? "web", sentiment, item.publishedAt ?? null,
    ],
  );
  // mysql2 affectedRows: 1 = inserted, 2 = updated (ON DUPLICATE KEY UPDATE).
  return (res?.affectedRows ?? 1) >= 2 ? "updated" : "new";
}
