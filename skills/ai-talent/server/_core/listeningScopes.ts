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

export interface RunResultItem { title: string; source: string; excerpt: string; url?: string }

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
  switch (taskKey) {
    case "listening.topic_buckets":
      return [`${brandName} 版型 尺寸 準不準${rgn}`, `${brandName} 材質 質感 評價${rgn}`, `${brandName} 划算 cp值 貴嗎${rgn}`];
    case "listening.verbatims":
      return [`${brandName} 開箱 心得 評價${rgn}`, `${brandName} 穿搭 好穿嗎${rgn}`];
    case "listening.crisis_scan":
      return [`${brandName} 退換貨 客訴${rgn}`, `${brandName} 色差 瑕疵 材質問題${rgn}`];
    case "listening.market_hotspots":
      return [`${cat} 熱門 話題 趨勢${rgn}`, `${cat} 爆紅 討論度${rgn}`, `${cat} 最新 流行 2026${rgn}`];
    case "listening.industry_talk":
      return [`${cat} 推薦 ptt dcard`, `${cat} 怎麼選 比較${rgn}`, `${cat} 心得 討論${rgn}`];
    case "listening.own_brand":
      return [`${brandName} 評價 心得${rgn}`, `${brandName} 開箱 推薦${rgn}`, `${brandName} 好用嗎 值得${rgn}`];
    case "listening.competitors": {
      const comps = brand.competitors.length ? brand.competitors : [cat];
      return comps.slice(0, 4).map((c) => `${c} 評價 vs ${brandName}${rgn}`);
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

/** Run ONE scope's live web search and return cleaned, junk-filtered items.
 *  Shared by the live tRPC path and the accumulating ingestion job. */
export async function fetchScopeMentions(brand: BrandCtx, taskKey: ListeningTaskKey): Promise<ScopeFetchResult> {
  const keywords = buildKeywords(taskKey, brand);
  const query = keywords.join(" / ");
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
        days: daysFor(taskKey),
        limit: 6,
        loadCred: async () => null,
      } as any),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), SCOUT_TIMEOUT_MS)),
    ]);

    if (!items || !Array.isArray(items) || items.length === 0) {
      return { ok: false, query, items: [], message: "即時搜尋沒有找到相關的公開討論（可能是聲量太少，或當下 API 無結果）。" };
    }

    const mapped: RunResultItem[] = items
      .map((it: any) => ({
        title: cleanText(it.title),
        source: it.source,
        excerpt: cleanText(it.content ?? "").slice(0, 280),
        url: it.url,
      }))
      .filter((it) => hasRealText(it.title))
      .slice(0, 6);

    if (mapped.length === 0) {
      return { ok: false, query, items: [], message: "即時搜尋有回應，但內容無法解析成可讀結果（來源多為圖檔/JS 片段）。" };
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

/** Idempotent: create the accumulating mentions table if it doesn't exist. */
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
      sentiment VARCHAR(16) NULL,
      publishedAt VARCHAR(40) NULL,
      firstSeenAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      lastSeenAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      seenCount INT NOT NULL DEFAULT 1,
      UNIQUE KEY uniq_brand_scope_url (brandId, scope, urlHash),
      KEY idx_brand_scope (brandId, scope),
      KEY idx_first_seen (firstSeenAt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

/** Upsert one mention. New rows return "new"; already-seen rows bump
 *  lastSeenAt + seenCount and return "updated" — this is what turns
 *  one-off search into an accumulating, trend-able dataset. */
export async function upsertMention(brandId: number, scope: ListeningTaskKey, item: RunResultItem): Promise<"new" | "updated"> {
  const hash = mentionHash(item.url || item.title);
  const [res]: any = await localPool.execute(
    `INSERT INTO listening_mentions (brandId, scope, urlHash, title, source, url, excerpt)
       VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       lastSeenAt = CURRENT_TIMESTAMP,
       seenCount = seenCount + 1,
       title = VALUES(title),
       excerpt = VALUES(excerpt)`,
    [brandId, scope, hash, item.title.slice(0, 512), (item.source ?? "").slice(0, 255), (item.url ?? "").slice(0, 1024), item.excerpt.slice(0, 2000)],
  );
  // mysql2 affectedRows: 1 = inserted, 2 = updated (ON DUPLICATE KEY UPDATE).
  return (res?.affectedRows ?? 1) >= 2 ? "updated" : "new";
}
