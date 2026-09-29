/**
 * perfStore — 成效層的資料表與存取。
 *
 * 2026-09-29（CJ「成效層要能在平台上落實，要有銷售漏斗，從目標族群出發，看不同族群
 * 溝通哪個 USP 效果好；要能跟用戶後台串接，但也可以單純看粉絲團報告」→「族群 × USP
 * 只是一種選項，用戶可按自己原本報告的視角或 AI 對話串討論過的範本調整」）。
 *
 * 四張表：
 *   perf_dimensions  品牌自己的維度與值（族群、USP、產品……任何用戶想切的角度）
 *   perf_lenses      視角：列維度 × 欄維度 × 漏斗階段 × 判讀指標，掛在某個成效 tray 下
 *   perf_facts       帶標籤的漏斗數字（一篇貼文／一則廣告／一段流量 × 一天）
 *   perf_tag_rules   補標規則（名稱或內文含某字 → 某維度某值），查詢時才套 → 回溯生效
 *   perf_imports     匯入紀錄（誰、哪個檔、對應了哪些欄位），供撤回與記住欄位對應
 *
 * 計算本身在 perfPivot（純函式）。這支只管進出 DB。
 */
import localPool from "../../localDb";
import type { Dimension, DimValue, Fact, LensConfig, TagRule } from "./perfPivot";

export const PERF_DIMENSIONS_DDL = `
  CREATE TABLE IF NOT EXISTS perf_dimensions (
    id        INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    brandId   INT          NOT NULL,
    dimKey    VARCHAR(40)  NOT NULL,
    label     VARCHAR(60)  NOT NULL,
    vals      JSON         NOT NULL,
    origin    VARCHAR(20)  NOT NULL DEFAULT 'user',
    updatedAt DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_perf_dim (brandId, dimKey)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export const PERF_LENSES_DDL = `
  CREATE TABLE IF NOT EXISTS perf_lenses (
    id        INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    brandId   INT          NOT NULL,
    userId    INT          NOT NULL,
    tray      VARCHAR(30)  NOT NULL,
    name      VARCHAR(80)  NOT NULL,
    origin    VARCHAR(20)  NOT NULL DEFAULT 'template',
    config    JSON         NOT NULL,
    note      VARCHAR(500) NULL,
    createdAt DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updatedAt DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    KEY idx_perf_lens_brand (brandId, tray)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export const PERF_FACTS_DDL = `
  CREATE TABLE IF NOT EXISTS perf_facts (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    brandId     INT          NOT NULL,
    source      VARCHAR(20)  NOT NULL,
    entityType  VARCHAR(20)  NOT NULL,
    entityId    VARCHAR(191) NOT NULL,
    entityLabel VARCHAR(300) NULL,
    text        TEXT         NULL,
    factDate    DATE         NOT NULL,
    tags        JSON         NULL,
    metrics     JSON         NOT NULL,
    importId    INT          NULL,
    permalink   VARCHAR(500) NULL,
    updatedAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_perf_fact (brandId, source, entityId, factDate),
    KEY idx_perf_fact_date (brandId, factDate)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export const PERF_TAG_RULES_DDL = `
  CREATE TABLE IF NOT EXISTS perf_tag_rules (
    id        INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    brandId   INT          NOT NULL,
    dimKey    VARCHAR(40)  NOT NULL,
    valueCode VARCHAR(40)  NOT NULL,
    pattern   VARCHAR(300) NOT NULL,
    origin    VARCHAR(20)  NOT NULL DEFAULT 'user',
    createdAt DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_perf_rules (brandId, dimKey)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export const PERF_IMPORTS_DDL = `
  CREATE TABLE IF NOT EXISTS perf_imports (
    id        INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    brandId   INT          NOT NULL,
    userId    INT          NOT NULL,
    source    VARCHAR(20)  NOT NULL,
    fileName  VARCHAR(200) NOT NULL,
    rowCount  INT          NOT NULL DEFAULT 0,
    mapping   JSON         NULL,
    createdAt DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_perf_imports (brandId, source)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export const PERF_DDLS = [PERF_DIMENSIONS_DDL, PERF_LENSES_DDL, PERF_FACTS_DDL, PERF_TAG_RULES_DDL, PERF_IMPORTS_DDL];

// ─── tray ↔ 資料來源 ──────────────────────────────────────────────────

/** 每個成效 tray 只看哪些來源；空陣列＝全部。前端 DataWorkspacePage 的 tray id 對齊這裡。 */
export const TRAY_SOURCES: Record<string, string[]> = {
  overview: [],
  meta: ["meta_ads"],
  google: ["google_ads"],
  shopline: ["shopline"],
  "91app": ["91app"],
  ga: ["ga4"],
  attribution: [],
  fanpage_monthly: ["fb_page"],
};
export const TRAYS = Object.keys(TRAY_SOURCES);

// ─── 範本 ─────────────────────────────────────────────────────────────

export interface LensTemplate {
  key: string;
  name: string;
  nameEn: string;
  config: LensConfig;
  /** 這個範本適合哪些 tray（列在「範本」選單最前面）。 */
  trays: string[];
}

export const LENS_TEMPLATES: LensTemplate[] = [
  {
    key: "ta_usp", name: "族群 × USP", nameEn: "Audience × USP", trays: ["overview", "meta", "attribution", "shopline", "91app", "ga"],
    config: { rowDim: "ta", colDim: "usp", judge: "roas", stages: [{ metric: "impressions" }, { metric: "clicks" }, { metric: "atc" }, { metric: "orders" }] },
  },
  {
    key: "ta_funnel", name: "族群銷售漏斗", nameEn: "Funnel by audience", trays: ["overview", "attribution", "ga", "shopline", "91app"],
    config: { rowDim: "ta", colDim: null, judge: "cvr", stages: [{ metric: "impressions" }, { metric: "clicks" }, { metric: "sessions" }, { metric: "atc" }, { metric: "checkout" }, { metric: "orders" }] },
  },
  {
    key: "fanpage", name: "粉絲團報告", nameEn: "Page report", trays: ["fanpage_monthly", "overview"],
    config: { rowDim: "format", colDim: "month", judge: "engagementRate", stages: [{ metric: "reach" }, { metric: "engagement" }, { metric: "clicks" }] },
  },
  {
    key: "ta_usp_organic", name: "族群 × USP（自然觸及）", nameEn: "Audience × USP (organic)", trays: ["fanpage_monthly"],
    config: { rowDim: "ta", colDim: "usp", judge: "engagementRate", stages: [{ metric: "reach" }, { metric: "engagement" }, { metric: "clicks" }] },
  },
  {
    key: "product_source", name: "產品 × 通路", nameEn: "Product × channel", trays: ["overview", "attribution", "shopline", "91app"],
    config: { rowDim: "product", colDim: "source", judge: "roas", stages: [{ metric: "clicks" }, { metric: "atc" }, { metric: "orders" }, { metric: "revenue" }] },
  },
];

// ─── helpers ──────────────────────────────────────────────────────────

function j<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return fallback; } }
  return v as T;
}

function ymd(d: unknown): string {
  if (d instanceof Date) {
    // mysql2 回 DATE 會是本地午夜的 Date；用本地欄位組字串，免得時區把日期推前一天。
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  return String(d ?? "").slice(0, 10);
}

// ─── 維度 ─────────────────────────────────────────────────────────────

export interface StoredDimension extends Dimension { origin: string }

export async function listDimensions(brandId: number): Promise<StoredDimension[]> {
  const [rows]: any = await localPool.execute(
    `SELECT dimKey, label, vals, origin FROM perf_dimensions WHERE brandId = ? ORDER BY id`, [brandId],
  );
  return (rows as any[]).map((r) => ({
    key: r.dimKey, label: r.label, origin: r.origin, values: j<DimValue[]>(r.vals, []),
  }));
}

export async function upsertDimension(brandId: number, d: { key: string; label: string; values: DimValue[] }, origin: string) {
  await localPool.execute(
    `INSERT INTO perf_dimensions (brandId, dimKey, label, vals, origin) VALUES (?, ?, ?, CAST(? AS JSON), ?)
     ON DUPLICATE KEY UPDATE label = VALUES(label), vals = VALUES(vals), origin = VALUES(origin)`,
    [brandId, d.key, d.label.slice(0, 60), JSON.stringify(d.values.slice(0, 40)), origin],
  );
}

export async function deleteDimension(brandId: number, key: string) {
  await localPool.execute(`DELETE FROM perf_dimensions WHERE brandId = ? AND dimKey = ?`, [brandId, key]);
  await localPool.execute(`DELETE FROM perf_tag_rules WHERE brandId = ? AND dimKey = ?`, [brandId, key]);
}

// ─── 視角 ─────────────────────────────────────────────────────────────

export interface StoredLens { id: number; tray: string; name: string; origin: string; config: LensConfig; note: string | null; updatedAt: string }

export async function listLenses(brandId: number, tray: string): Promise<StoredLens[]> {
  const [rows]: any = await localPool.execute(
    `SELECT id, tray, name, origin, config, note, updatedAt FROM perf_lenses WHERE brandId = ? AND tray = ? ORDER BY id`,
    [brandId, tray],
  );
  return (rows as any[]).map((r) => ({
    id: r.id, tray: r.tray, name: r.name, origin: r.origin, note: r.note ?? null,
    config: j<LensConfig>(r.config, { rowDim: "month", stages: [], judge: "reach" }),
    updatedAt: new Date(r.updatedAt).toISOString(),
  }));
}

export async function createLens(brandId: number, userId: number, tray: string, name: string, origin: string, config: LensConfig, note?: string | null): Promise<number> {
  const [res]: any = await localPool.execute(
    `INSERT INTO perf_lenses (brandId, userId, tray, name, origin, config, note) VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), ?)`,
    [brandId, userId, tray, name.slice(0, 80), origin, JSON.stringify(config), note?.slice(0, 500) ?? null],
  );
  return Number(res.insertId);
}

export async function updateLens(brandId: number, id: number, name: string, config: LensConfig) {
  await localPool.execute(
    `UPDATE perf_lenses SET name = ?, config = CAST(? AS JSON) WHERE id = ? AND brandId = ?`,
    [name.slice(0, 80), JSON.stringify(config), id, brandId],
  );
}

export async function deleteLens(brandId: number, id: number) {
  await localPool.execute(`DELETE FROM perf_lenses WHERE id = ? AND brandId = ?`, [id, brandId]);
}

// ─── 規則 ─────────────────────────────────────────────────────────────

export async function listRules(brandId: number): Promise<(TagRule & { id: number; origin: string })[]> {
  const [rows]: any = await localPool.execute(
    `SELECT id, dimKey, valueCode, pattern, origin FROM perf_tag_rules WHERE brandId = ? ORDER BY id`, [brandId],
  );
  return rows as any[];
}

export async function addRule(brandId: number, r: TagRule, origin: string) {
  await localPool.execute(
    `INSERT INTO perf_tag_rules (brandId, dimKey, valueCode, pattern, origin) VALUES (?, ?, ?, ?, ?)`,
    [brandId, r.dimKey, r.valueCode, r.pattern.slice(0, 300), origin],
  );
}

export async function deleteRule(brandId: number, id: number) {
  await localPool.execute(`DELETE FROM perf_tag_rules WHERE id = ? AND brandId = ?`, [id, brandId]);
}

// ─── 事實 ─────────────────────────────────────────────────────────────

export interface FactInput {
  source: string;
  entityType: string;
  entityId: string;
  entityLabel?: string | null;
  text?: string | null;
  date: string;
  tags?: Record<string, string>;
  metrics: Record<string, number>;
  permalink?: string | null;
  importId?: number | null;
}

/**
 * Upsert：同一個 (來源, 實體, 日期) 再進來就覆蓋數字 —— 粉專貼文每天回填時
 * lifetime 數字會長大，匯入檔重傳同一段期間也不會重複計算。
 * 標籤用 JSON_MERGE_PATCH：已經手動或 AI 打好的標籤不會被新進來的空標籤洗掉。
 */
export async function upsertFacts(brandId: number, facts: FactInput[]): Promise<number> {
  let n = 0;
  for (let i = 0; i < facts.length; i += 200) {
    const chunk = facts.slice(i, i + 200);
    const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?, ?)").join(",");
    const params: any[] = [];
    for (const f of chunk) {
      params.push(
        brandId, f.source, f.entityType, f.entityId.slice(0, 191), f.entityLabel?.slice(0, 300) ?? null,
        f.text?.slice(0, 5000) ?? null, f.date, JSON.stringify(f.tags ?? {}), JSON.stringify(f.metrics),
        f.importId ?? null, f.permalink?.slice(0, 500) ?? null,
      );
    }
    await localPool.execute(
      `INSERT INTO perf_facts (brandId, source, entityType, entityId, entityLabel, text, factDate, tags, metrics, importId, permalink)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE
         entityLabel = VALUES(entityLabel), text = COALESCE(VALUES(text), text),
         metrics = VALUES(metrics), importId = COALESCE(VALUES(importId), importId),
         permalink = COALESCE(VALUES(permalink), permalink),
         tags = JSON_MERGE_PATCH(VALUES(tags), COALESCE(tags, JSON_OBJECT()))`,
      params,
    );
    n += chunk.length;
  }
  return n;
}

export async function loadFacts(brandId: number, from: string, to: string, sources?: string[]): Promise<Fact[]> {
  const srcClause = sources?.length ? ` AND source IN (${sources.map(() => "?").join(",")})` : "";
  const [rows]: any = await localPool.execute(
    `SELECT id, source, entityType, entityId, entityLabel, text, factDate, tags, metrics, permalink
       FROM perf_facts
      WHERE brandId = ? AND factDate BETWEEN ? AND ?${srcClause}
      ORDER BY factDate DESC
      LIMIT 50000`,
    [brandId, from, to, ...(sources ?? [])],
  );
  return (rows as any[]).map((r) => ({
    id: r.id, source: r.source, entityType: r.entityType, entityId: r.entityId,
    entityLabel: r.entityLabel, text: r.text, date: ymd(r.factDate),
    tags: j<Record<string, string>>(r.tags, {}), metrics: j<Record<string, number>>(r.metrics, {}),
    permalink: r.permalink ?? null,
  } as Fact & { permalink: string | null }));
}

/** 手動或 AI 改某一筆的某個標籤。value 為 null → 拿掉這個標籤。 */
export async function setFactTag(brandId: number, factId: number, dimKey: string, value: string | null) {
  const path = `$."${dimKey.replace(/"/g, "")}"`;
  if (value) {
    await localPool.execute(
      `UPDATE perf_facts SET tags = JSON_SET(COALESCE(tags, JSON_OBJECT()), ?, ?) WHERE id = ? AND brandId = ?`,
      [path, value, factId, brandId],
    );
  } else {
    await localPool.execute(
      `UPDATE perf_facts SET tags = JSON_REMOVE(COALESCE(tags, JSON_OBJECT()), ?) WHERE id = ? AND brandId = ?`,
      [path, factId, brandId],
    );
  }
}

/** 各來源現有資料的筆數與最新日期 —— 決定每個 tray 顯示真資料還是示意。 */
export async function sourceSummary(brandId: number): Promise<Record<string, { facts: number; latest: string | null }>> {
  const [rows]: any = await localPool.execute(
    `SELECT source, COUNT(*) AS n, MAX(factDate) AS latest FROM perf_facts WHERE brandId = ? GROUP BY source`, [brandId],
  );
  const out: Record<string, { facts: number; latest: string | null }> = {};
  for (const r of rows as any[]) out[r.source] = { facts: Number(r.n), latest: r.latest ? ymd(r.latest) : null };
  return out;
}

export async function listImports(brandId: number) {
  const [rows]: any = await localPool.execute(
    `SELECT id, source, fileName, rowCount, createdAt FROM perf_imports WHERE brandId = ? ORDER BY id DESC LIMIT 30`, [brandId],
  );
  return (rows as any[]).map((r) => ({ ...r, createdAt: new Date(r.createdAt).toISOString() }));
}

export async function createImport(brandId: number, userId: number, source: string, fileName: string, rowCount: number, mapping: unknown): Promise<number> {
  const [res]: any = await localPool.execute(
    `INSERT INTO perf_imports (brandId, userId, source, fileName, rowCount, mapping) VALUES (?, ?, ?, ?, ?, CAST(? AS JSON))`,
    [brandId, userId, source, fileName.slice(0, 200), rowCount, JSON.stringify(mapping ?? null)],
  );
  return Number(res.insertId);
}

/** 撤回一次匯入：連同它帶進來的事實一起刪。 */
export async function deleteImport(brandId: number, importId: number) {
  await localPool.execute(`DELETE FROM perf_facts WHERE brandId = ? AND importId = ?`, [brandId, importId]);
  await localPool.execute(`DELETE FROM perf_imports WHERE brandId = ? AND id = ?`, [brandId, importId]);
}

/** 同一個來源上次用的欄位對應 —— 下個月再傳同一種匯出檔，不用重對一次。 */
export async function lastMapping(brandId: number, source: string): Promise<Record<string, string> | null> {
  const [rows]: any = await localPool.execute(
    `SELECT mapping FROM perf_imports WHERE brandId = ? AND source = ? ORDER BY id DESC LIMIT 1`, [brandId, source],
  );
  const r = (rows as any[])[0];
  return r ? j<Record<string, string> | null>(r.mapping, null) : null;
}
