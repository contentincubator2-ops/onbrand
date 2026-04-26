/**
 * brandContext — single source of truth for "inject brand_brain into LLM prompts".
 *
 * Every router that calls an LLM on behalf of a brand should pull its
 * system-prompt prefix from `buildBrandPrefix(brandId)` so brand voice,
 * positioning, audience, and guardrails are applied uniformly.
 *
 * If brandId is missing or the table query fails, returns "" so the caller
 * can fall back gracefully to a brand-less prompt.
 */
import { sql } from "drizzle-orm";
import { getDb } from "../db";

const CACHE = new Map<number, { prefix: string; expiresAt: number }>();
const TTL_MS = 60_000; // 1-minute cache — brand_brain edits become visible quickly

export interface BrandSummary {
  id: number;
  name: string | null;
  prefix: string; // formatted system-prompt suffix (starts with "\n\n[品牌大腦摘要]\n…")
  entryCount: number;
}

/**
 * Returns a system-prompt suffix string ready to append to any LLM system message.
 * Pulls up to 8 most recently updated brand_brain entries.
 */
export async function buildBrandPrefix(
  brandId: number | undefined | null
): Promise<string> {
  if (!brandId) return "";

  const cached = CACHE.get(brandId);
  if (cached && cached.expiresAt > Date.now()) return cached.prefix;

  try {
    const db = await getDb();
    if (!db) return "";

    const [rows] = (await db.execute(
      sql`SELECT category, title, content
          FROM brand_brain
          WHERE brand_id = ${brandId}
          ORDER BY updated_at DESC
          LIMIT 8`
    )) as any;

    if (!rows || rows.length === 0) {
      CACHE.set(brandId, { prefix: "", expiresAt: Date.now() + TTL_MS });
      return "";
    }

    const prefix =
      "\n\n[品牌大腦摘要 — 所有產出都要符合下面的定位、語氣與守則]\n" +
      rows
        .map(
          (r: any) => `- 【${r.category}】${r.title}：${r.content}`
        )
        .join("\n");

    CACHE.set(brandId, { prefix, expiresAt: Date.now() + TTL_MS });
    return prefix;
  } catch {
    return "";
  }
}

/**
 * Lightweight summary used by procedures that want to log or surface
 * "we did inject brand X" feedback to the client.
 */
export async function getBrandSummary(
  brandId: number | undefined | null
): Promise<BrandSummary | null> {
  if (!brandId) return null;
  try {
    const db = await getDb();
    if (!db) return null;

    const [nameRows] = (await db.execute(
      sql`SELECT name FROM brands WHERE id = ${brandId} LIMIT 1`
    )) as any;
    const [countRows] = (await db.execute(
      sql`SELECT COUNT(*) AS c FROM brand_brain WHERE brand_id = ${brandId}`
    )) as any;

    const prefix = await buildBrandPrefix(brandId);
    return {
      id: brandId,
      name: nameRows?.[0]?.name ?? null,
      prefix,
      entryCount: Number(countRows?.[0]?.c ?? 0),
    };
  } catch {
    return null;
  }
}

/** Test-only: clear the cache. */
export function _clearBrandPrefixCache() {
  CACHE.clear();
}
