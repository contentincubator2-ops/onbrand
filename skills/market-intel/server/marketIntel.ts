/**
 * Market Intelligence Service
 * Queries sowork_db.market_data for real-time competitor news and trending topics
 *
 * DEPENDENCY NOTE: This module imports getSoworkDb from the ai-talent skill.
 * The relative path `../../ai-talent/server/db` is fragile — if the directory
 * structure changes, this import must be updated. Sprint 3 should migrate to a
 * monorepo workspace reference (e.g. `@sowork/ai-talent/db`).
 * See: skills/ai-talent/server/db.ts
 */

import { sql } from "drizzle-orm";

// ── Circular dependency fix ───────────────────────────────────────────────────
// Previously: import { getSoworkDb } from "../../ai-talent/server/db"  ← caused
// ai-talent → market-intel → ai-talent circular dependency.
//
// Fix: use a factory pattern so the db is injected, with a lazy singleton fallback
// that uses a dynamic import to break the static circular reference.

type SoworkDb = Awaited<ReturnType<typeof lazyGetSoworkDb>>;

async function lazyGetSoworkDb() {
  const { getSoworkDb } = await import("../../ai-talent/server/db");
  return getSoworkDb();
}

// Injectable factory — preferred for testing and DI contexts
export function createMarketIntelService(db: any) {
  return {
    fetchMarketIntel: (opts: Parameters<typeof fetchMarketIntelWithDb>[1]) =>
      fetchMarketIntelWithDb(db, opts),
    formatMarketIntelForPrompt,
  };
}

// Lazy-init singleton for backward-compatible named exports
let _db: any = null;
async function getDb() {
  if (!_db) _db = await lazyGetSoworkDb();
  return _db;
}

export interface MarketIntelResult {
  type: "competitor_news" | "trending_topic" | "social_trend";
  title: string;
  content: string;
  source: string;
  publishedAt: string;
  relevanceScore: number;
}

// ─── Allowlists ───────────────────────────────────────────────────────────────

const VALID_INDUSTRIES = [
  "ecommerce", "saas", "beauty", "finance",
  "food_bev", "health", "creator",
] as const;

/**
 * Sanitize a single keyword: strip SQL special chars, truncate, trim.
 * Extracted as a pure function for testability (QUAL-1).
 */
export function sanitizeKeyword(k: string): string {
  return k
    .replace(/[%_\\'";\-\/\*]/g, "") // strip SQL-dangerous chars
    .slice(0, 50)
    .trim();
}

/**
 * Fetch relevant market intelligence for a brand/task context.
 * Uses sowork_db.market_data (93K+ entries, updated daily).
 *
 * Security (INJ-4): keywords are sanitized before interpolation.
 */
const VALID_DATA_TYPES = ["competitor_news", "trending_topic", "social_trend", "market_data", "consumer_insight"] as const;
type ValidDataType = typeof VALID_DATA_TYPES[number];

/** Internal implementation that accepts an injected db instance. */
async function fetchMarketIntelWithDb(db: any, opts: {
  keywords: string[];
  types?: ("competitor_news" | "trending_topic" | "social_trend" | "market_data" | "consumer_insight")[];
  days?: number;
  limit?: number;
}): Promise<MarketIntelResult[]> {
  const { keywords, types, days = 7, limit = 10 } = opts;

  // P1-5: Validate types against allowlist to prevent injection via enum bypass
  const sanitizedTypes = (types ?? []).filter(
    (t): t is ValidDataType => VALID_DATA_TYPES.includes(t as ValidDataType)
  );

  // INJ-4: Sanitize keywords — strip SQL special chars, enforce max length/count
  const safeKeywords = keywords
    .slice(0, 5) // cap at 5 keywords for performance
    .map(sanitizeKeyword)
    .filter((k) => k.length >= 2); // ignore very short/empty keywords after sanitization

  if (!safeKeywords.length) return [];

  // Validate days and limit (numeric range clamping)
  const safeDays = Math.min(Math.max(1, Math.floor(days)), 90);
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 50);

  // Use sanitizedTypes (enum-validated) instead of raw types to prevent injection
  const typeFilter =
    sanitizedTypes.length
      ? `AND dataType IN (${sanitizedTypes.map((t) => `'${t}'`).join(",")})`
      : "AND dataType IN ('competitor_news', 'trending_topic')";

  // safeKeywords have been sanitized — interpolation is safe here
  const keywordConditions = safeKeywords
    .map(
      (k) =>
        `(title LIKE '%${k}%' OR content LIKE '%${k}%')`
    )
    .join(" OR ");

  const rows = (await db.execute(sql.raw(`
    SELECT dataType, title, content, source, sourceUrl, publishedAt, relevanceScore
    FROM market_data
    WHERE (${keywordConditions})
      ${typeFilter}
      AND (publishedAt IS NULL OR publishedAt >= DATE_SUB(NOW(), INTERVAL ${safeDays} DAY))
      AND (expiresAt IS NULL OR expiresAt > NOW())
    ORDER BY relevanceScore DESC, publishedAt DESC
    LIMIT ${safeLimit}
  `))) as any[];

  return rows.map((r: any) => ({
    type: r.dataType,
    title: r.title,
    content: String(r.content ?? "").slice(0, 500),
    source: r.source ?? r.sourceUrl ?? "",
    publishedAt: r.publishedAt ? new Date(r.publishedAt).toISOString() : "",
    relevanceScore: Number(r.relevanceScore ?? 0),
  }));
}

/**
 * Backward-compatible named export — uses lazy dynamic import to avoid the
 * ai-talent → market-intel → ai-talent circular dependency.
 */
export async function fetchMarketIntel(opts: {
  keywords: string[];
  types?: ("competitor_news" | "trending_topic" | "social_trend" | "market_data" | "consumer_insight")[];
  days?: number;
  limit?: number;
}): Promise<MarketIntelResult[]> {
  const db = await getDb();
  return fetchMarketIntelWithDb(db, opts);
}

/**
 * Format market intel for LLM prompt injection
 */
export function formatMarketIntelForPrompt(results: MarketIntelResult[]): string {
  if (!results.length) return "";

  const groups: Record<string, MarketIntelResult[]> = {};
  for (const r of results) {
    if (!groups[r.type]) groups[r.type] = [];
    groups[r.type].push(r);
  }

  const typeLabel: Record<string, string> = {
    competitor_news: "競品最新動態",
    trending_topic: "市場熱門話題",
    social_trend: "社群趨勢",
  };

  const sections: string[] = ["\n\n【即時市場情報（過去7天）】"];
  for (const [type, items] of Object.entries(groups)) {
    sections.push(`\n## ${typeLabel[type] ?? type}`);
    for (const item of items.slice(0, 3)) {
      sections.push(`- ${item.title}（${item.source}）\n  ${item.content.slice(0, 200)}`);
    }
  }

  return sections.join("\n");
}

/**
 * Get creative cases from sowork_db for inspiration.
 *
 * Security (INJ-5): industry is validated against an allowlist.
 * Performance (STAB-6): ORDER BY RAND() does a full table scan on large tables.
 *   TODO STAB-6: Replace with keyset-based random sampling for production
 *   (e.g. WHERE id >= FLOOR(RAND() * (SELECT MAX(id) FROM creative_cases)))
 *   Deferred to Sprint 4 — current table size (~93K rows) is acceptable for now.
 */
export async function getCreativeCases(opts: {
  industry?: string;
  limit?: number;
}): Promise<Array<{ title: string; content: string; industry: string }>> {
  const db = await getDb();
  const { industry, limit = 5 } = opts;

  // INJ-5: Validate industry against allowlist
  const safeIndustry =
    industry && (VALID_INDUSTRIES as readonly string[]).includes(industry)
      ? industry
      : null;

  // safeLimit: clamp to prevent excessive queries
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 20);

  const industryFilter = safeIndustry
    ? `WHERE industry = '${safeIndustry}'` // safeIndustry is enum-validated, safe to interpolate
    : "WHERE 1=1";

  const rows = (await db.execute(sql.raw(`
    SELECT title, content, industry
    FROM creative_cases
    ${industryFilter}
    ORDER BY RAND()
    LIMIT ${safeLimit}
  `))) as any[];
  // TODO STAB-6: ORDER BY RAND() is a full-table-scan on large tables.
  // Sprint 4: Replace with keyset random for production performance.

  return rows.map((r: any) => ({
    title: r.title ?? "",
    content: String(r.content ?? "").slice(0, 600),
    industry: r.industry ?? "",
  }));
}
