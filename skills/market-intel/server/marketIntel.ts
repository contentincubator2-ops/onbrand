/**
 * Market Intelligence Service
 * Queries sowork_db.market_data for real-time competitor news and trending topics
 */

import { getSoworkDb } from "../../ai-talent/server/db";
import { sql } from "drizzle-orm";

export interface MarketIntelResult {
  type: "competitor_news" | "trending_topic" | "social_trend";
  title: string;
  content: string;
  source: string;
  publishedAt: string;
  relevanceScore: number;
}

/**
 * Fetch relevant market intelligence for a brand/task context
 * Uses sowork_db.market_data (93K+ entries, updated daily)
 */
export async function fetchMarketIntel(opts: {
  keywords: string[];
  types?: ("competitor_news" | "trending_topic" | "social_trend")[];
  days?: number;
  limit?: number;
}): Promise<MarketIntelResult[]> {
  const db = await getSoworkDb();
  const { keywords, types, days = 7, limit = 10 } = opts;

  if (!keywords.length) return [];

  const typeFilter = types?.length
    ? `AND dataType IN (${types.map((t) => `'${t}'`).join(",")})`
    : "AND dataType IN ('competitor_news', 'trending_topic')";

  const keywordConditions = keywords
    .slice(0, 5) // cap at 5 keywords for performance
    .map(
      (k) =>
        `(title LIKE '%${k.replace(/'/g, "''")}%' OR content LIKE '%${k.replace(/'/g, "''")}%')`
    )
    .join(" OR ");

  const rows = (await db.execute(sql.raw(`
    SELECT dataType, title, content, source, sourceUrl, publishedAt, relevanceScore
    FROM market_data
    WHERE (${keywordConditions})
      ${typeFilter}
      AND (publishedAt IS NULL OR publishedAt >= DATE_SUB(NOW(), INTERVAL ${days} DAY))
      AND (expiresAt IS NULL OR expiresAt > NOW())
    ORDER BY relevanceScore DESC, publishedAt DESC
    LIMIT ${limit}
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
 * Get creative cases from sowork_db for inspiration
 */
export async function getCreativeCases(opts: {
  industry?: string;
  limit?: number;
}): Promise<Array<{ title: string; content: string; industry: string }>> {
  const db = await getSoworkDb();
  const { industry, limit = 5 } = opts;

  const industryFilter = industry
    ? `WHERE industry = '${industry.replace(/'/g, "''")}'`
    : "WHERE 1=1";

  const rows = (await db.execute(sql.raw(`
    SELECT title, content, industry
    FROM creative_cases
    ${industryFilter}
    ORDER BY RAND()
    LIMIT ${limit}
  `))) as any[];

  return rows.map((r: any) => ({
    title: r.title ?? "",
    content: String(r.content ?? "").slice(0, 600),
    industry: r.industry ?? "",
  }));
}
