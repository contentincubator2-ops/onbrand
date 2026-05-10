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

    // 2026-05-09 (CJ audit): also pull LOCKED brand attributes from brands
    // table (tagline, positioningSummary, positioningReport.archetype) so
    // 30s/60s tasks auto-use the brand's confirmed identity without the
    // user re-typing them every run.
    const { default: localPool } = await import("../localDb");
    const [brandRowsRaw]: any = await localPool.execute(
      `SELECT name, tagline, positioningSummary, positioningReport, positioningStatus
       FROM brands WHERE id = ? LIMIT 1`,
      [brandId],
    );
    const brandRow = Array.isArray(brandRowsRaw) ? brandRowsRaw[0] : null;

    const [rows] = (await db.execute(
      sql`SELECT category, title, content
          FROM brand_brain
          WHERE brand_id = ${brandId}
          ORDER BY updated_at DESC
          LIMIT 8`
    )) as any;

    const brandLocked: string[] = [];
    if (brandRow?.tagline) brandLocked.push(`【已鎖定 Tagline】${brandRow.tagline}`);
    if (brandRow?.positioningSummary) brandLocked.push(`【已鎖定定位摘要】${brandRow.positioningSummary}`);
    // positioningReport is JSON. Try to extract archetype if present.
    if (brandRow?.positioningReport) {
      try {
        const rep = typeof brandRow.positioningReport === "string"
          ? JSON.parse(brandRow.positioningReport)
          : brandRow.positioningReport;
        const arch = rep?.archetype ?? rep?.brandArchetype ?? rep?.archetypePrimary;
        if (arch) brandLocked.push(`【已鎖定 Archetype】${typeof arch === "string" ? arch : JSON.stringify(arch).slice(0, 200)}`);
        const why = rep?.why ?? rep?.WHY;
        if (why) brandLocked.push(`【WHY】${String(why).slice(0, 200)}`);
        const how = rep?.how ?? rep?.HOW;
        if (how) brandLocked.push(`【HOW】${String(how).slice(0, 200)}`);
      } catch { /* non-fatal */ }
    }

    if ((!rows || rows.length === 0) && brandLocked.length === 0) {
      CACHE.set(brandId, { prefix: "", expiresAt: Date.now() + TTL_MS });
      return "";
    }

    const lockedSection = brandLocked.length > 0
      ? "\n[品牌已鎖定屬性 — 最高優先級，所有產出都要符合]\n" + brandLocked.map(l => `- ${l}`).join("\n") + "\n"
      : "";

    const brainSection = rows && rows.length > 0
      ? "[品牌大腦摘要 — 補充定位 / 語氣 / 守則]\n" +
        rows.map((r: any) => `- 【${r.category}】${r.title}：${r.content}`).join("\n")
      : "";

    const prefix = "\n\n" + lockedSection + brainSection;

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
