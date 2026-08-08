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

/** Resolve an article's PUBLISH date (not our capture time) from the
 *  provider field → URL date pattern → newest year mentioned in text.
 *  Returns iso (YYYY-MM-DD) when a real date is known, plus a `year` signal
 *  used to catch stale items (e.g. a 2018 news piece) even without a full date. */
export function resolvePublish(item: { publishedAt?: string; url?: string; title?: string; excerpt?: string }): { iso: string | null; year: number | null } {
  const nowY = new Date().getUTCFullYear();
  const plausible = (dt: Date) => { const y = dt.getUTCFullYear(); return y >= 2000 && y <= nowY + 1; };
  const isoOf = (dt: Date) => dt.toISOString().slice(0, 10);

  // 1) provider-supplied date
  if (item.publishedAt) {
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
  // 3) newest year mentioned in title/excerpt/url — staleness signal only
  const hay = `${item.title ?? ""} ${item.excerpt ?? ""} ${url}`;
  const years = Array.from(hay.matchAll(/(20\d\d)\s*年?/g)).map((x) => Number(x[1])).filter((y) => y >= 2000 && y <= nowY + 1);
  return { iso: null, year: years.length ? Math.max(...years) : null };
}

/** Run ONE scope's live web search and return cleaned, junk-filtered items
 *  (each tagged with its OpView source type). Shared by the live tRPC path
 *  and the accumulating ingestion job. `daysOverride` lets the user pick a
 *  recency window (freshness filter). */
export async function fetchScopeMentions(
  brand: BrandCtx,
  taskKey: ListeningTaskKey,
  daysOverride?: number,
): Promise<ScopeFetchResult> {
  const keywords = buildKeywords(taskKey, brand);
  const query = keywords.join(" / ");
  const days = daysOverride && daysOverride > 0 ? daysOverride : daysFor(taskKey);
  const { perplexityScout } = await import("./scouts/perplexityScout");
  const SCOUT_TIMEOUT_MS = 15_000;

  try {
    const items = await Promise.race([
      perplexityScout.fetch({
        brandId: brand.id,
        brandName: brand.name,
        industry: brand.industry ?? undefined,
        keywords,
        competitors: taskKey === "listening.competitors" ? brand.competitors : [],
        industryTags: brand.industry ? [brand.industry] : [],
        days,
        limit: 8,
        loadCred: async () => null,
      } as any),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), SCOUT_TIMEOUT_MS)),
    ]);

    if (!items || !Array.isArray(items) || items.length === 0) {
      return { ok: false, query, items: [], message: "即時搜尋沒有找到相關的公開討論（可能是聲量太少，或當下 API 無結果）。" };
    }

    const cutoff = new Date(Date.now() - days * 86_400_000);
    const cutoffYear = cutoff.getUTCFullYear();
    const mapped: RunResultItem[] = items
      .map((it: any) => ({
        title: cleanText(it.title),
        source: it.source,
        excerpt: cleanText(it.content ?? "").slice(0, 280),
        url: it.url,
        sourceType: classifySource(it.url, it.source),
        publishedAt: typeof it.publishedAt === "string" ? it.publishedAt : undefined,
      }))
      .filter((it) => hasRealText(it.title))
      // Recency by PUBLISH date (CJ「2018年的根本不應該出現」): the time window
      // filters on the ARTICLE's publish date, not our capture time. Resolve
      // the real publish date; drop anything older than the window. Undated
      // items with a stale year signal (e.g. "2018年…出包") are also dropped;
      // truly undated items are kept (can't prove old) and show 發布日不明.
      .filter((it) => {
        const { iso, year } = resolvePublish(it);
        it.publishedAt = iso ?? undefined;
        if (iso) return new Date(iso) >= cutoff;
        if (year && year < cutoffYear) return false;
        return true;
      })
      .slice(0, 8);

    if (mapped.length === 0) {
      return { ok: false, query, items: [], message: "此時間範圍內沒有找到有效的公開討論（較舊或無法判定發布日的結果已濾除）。可試著把時間範圍放寬。" };
    }
    return { ok: true, query, items: mapped };
  } catch (e: any) {
    return { ok: false, query, items: [], message: `即時搜尋失敗：${String(e?.message ?? e).slice(0, 150)}` };
  }
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
export async function upsertMention(brandId: number, scope: ListeningTaskKey, item: RunResultItem): Promise<"new" | "updated"> {
  const hash = mentionHash(item.url || item.title);
  const [res]: any = await localPool.execute(
    `INSERT INTO listening_mentions (brandId, scope, urlHash, title, source, url, excerpt, sourceType, publishedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       lastSeenAt = CURRENT_TIMESTAMP,
       seenCount = seenCount + 1,
       title = VALUES(title),
       excerpt = VALUES(excerpt),
       sourceType = VALUES(sourceType)`,
    [
      brandId, scope, hash, item.title.slice(0, 512), (item.source ?? "").slice(0, 255),
      (item.url ?? "").slice(0, 1024), item.excerpt.slice(0, 2000),
      item.sourceType ?? "web", item.publishedAt ?? null,
    ],
  );
  // mysql2 affectedRows: 1 = inserted, 2 = updated (ON DUPLICATE KEY UPDATE).
  return (res?.affectedRows ?? 1) >= 2 ? "updated" : "new";
}
