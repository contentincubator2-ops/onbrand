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

function safeParse(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}

// Cache key includes optional product/event so different scopes don't collide.
const CACHE = new Map<string, { prefix: string; expiresAt: number }>();
const TTL_MS = 60_000; // 1-minute cache — brand_brain edits become visible quickly
const cacheKey = (brandId: number, productId?: number | null, eventId?: number | null) =>
  `${brandId}:${productId ?? 0}:${eventId ?? 0}`;

export interface BrandSummary {
  id: number;
  name: string | null;
  prefix: string; // formatted system-prompt suffix (starts with "\n\n[品牌大腦摘要]\n…")
  entryCount: number;
}

/**
 * Returns a system-prompt suffix string ready to append to any LLM system message.
 * Pulls up to 8 most recently updated brand_brain entries, PLUS:
 *   - if productId set → product name + positioning JSON keys layered after brand
 *   - if eventId   set → event name + dates + positioning JSON layered last
 *
 * Precedence (bottom = wins in prompt-following): brand → product → event.
 * This lets LLM honor brand identity while letting product/event narrow it.
 *
 * 2026-05-11 (CJ「選了 product / event 也要 narrow LLM context」).
 */
export async function buildBrandPrefix(
  brandId: number | undefined | null,
  productId?: number | null,
  eventId?: number | null,
): Promise<string> {
  if (!brandId) return "";

  const ck = cacheKey(brandId, productId, eventId);
  const cached = CACHE.get(ck);
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

    // ── 2026-05-11 (CJ): product + event positioning overlays ──
    let productSection = "";
    if (productId) {
      try {
        const [prodRows]: any = await localPool.execute(
          `SELECT name, positioning FROM products WHERE id = ? LIMIT 1`,
          [productId],
        );
        const p = Array.isArray(prodRows) ? prodRows[0] : null;
        if (p) {
          const lines: string[] = [`【產品名稱】${p.name ?? "(未命名)"}`];
          if (p.positioning) {
            const pp = typeof p.positioning === "string" ? safeParse(p.positioning) : p.positioning;
            if (pp && typeof pp === "object") {
              if (pp.usp) lines.push(`【產品 USP】${String(pp.usp).slice(0, 300)}`);
              if (pp.target) lines.push(`【產品目標客群】${String(pp.target).slice(0, 200)}`);
              if (pp.tagline) lines.push(`【產品 Slogan】${String(pp.tagline).slice(0, 100)}`);
              if (pp.description) lines.push(`【產品描述】${String(pp.description).slice(0, 400)}`);
              if (pp.keyMessages && Array.isArray(pp.keyMessages)) {
                lines.push(`【產品關鍵訊息】${pp.keyMessages.slice(0, 4).join(" · ")}`);
              }
            }
          }
          productSection = "\n[本次產出聚焦的產品 — 必須圍繞此產品撰寫]\n" + lines.map(l => `- ${l}`).join("\n") + "\n";
        }
      } catch {/* non-fatal */}
    }

    let eventSection = "";
    if (eventId) {
      try {
        const [evRows]: any = await localPool.execute(
          `SELECT name, startAt, endAt, positioning FROM events WHERE id = ? LIMIT 1`,
          [eventId],
        );
        const e = Array.isArray(evRows) ? evRows[0] : null;
        if (e) {
          const lines: string[] = [`【活動名稱】${e.name ?? "(未命名活動)"}`];
          if (e.startAt) {
            const start = new Date(e.startAt);
            lines.push(`【活動開始】${start.toLocaleDateString("zh-TW")}`);
            const now = new Date();
            const daysLeft = Math.ceil((start.getTime() - now.getTime()) / 86400_000);
            if (daysLeft > 0) lines.push(`【倒數】還有 ${daysLeft} 天 — 可以做倒數 hook / 預熱`);
            else if (daysLeft === 0) lines.push(`【倒數】今天就是活動日`);
            else lines.push(`【活動】已開始 ${-daysLeft} 天`);
          }
          if (e.endAt) lines.push(`【活動結束】${new Date(e.endAt).toLocaleDateString("zh-TW")}`);
          if (e.positioning) {
            const ep = typeof e.positioning === "string" ? safeParse(e.positioning) : e.positioning;
            if (ep && typeof ep === "object") {
              if (ep.theme) lines.push(`【活動主軸】${String(ep.theme).slice(0, 200)}`);
              if (ep.cta) lines.push(`【活動 CTA】${String(ep.cta).slice(0, 100)}`);
              if (ep.offer) lines.push(`【活動優惠】${String(ep.offer).slice(0, 200)}`);
              if (ep.audience) lines.push(`【活動受眾】${String(ep.audience).slice(0, 200)}`);
            }
          }
          eventSection = "\n[本次產出對應的活動 — 必須提及活動 / 時程 / 主軸]\n" + lines.map(l => `- ${l}`).join("\n") + "\n";
        }
      } catch {/* non-fatal */}
    }

    if ((!rows || rows.length === 0) && brandLocked.length === 0 && !productSection && !eventSection) {
      CACHE.set(ck, { prefix: "", expiresAt: Date.now() + TTL_MS });
      return "";
    }

    const lockedSection = brandLocked.length > 0
      ? "\n[品牌已鎖定屬性 — 最高優先級，所有產出都要符合]\n" + brandLocked.map(l => `- ${l}`).join("\n") + "\n"
      : "";

    const brainSection = rows && rows.length > 0
      ? "[品牌大腦摘要 — 補充定位 / 語氣 / 守則]\n" +
        rows.map((r: any) => `- 【${r.category}】${r.title}：${r.content}`).join("\n")
      : "";

    // Order: brand identity → brand brain → product narrow → event narrow.
    // Last-mentioned wins in LLM prompt-following heuristics.
    const prefix = "\n\n" + lockedSection + brainSection + productSection + eventSection;

    CACHE.set(ck, { prefix, expiresAt: Date.now() + TTL_MS });
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
