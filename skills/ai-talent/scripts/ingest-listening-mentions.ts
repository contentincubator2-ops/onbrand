/**
 * ingest-listening-mentions — Phase 1 of the OpView-style accumulating
 * 輿情 database (CJ「仿造 OpView 自己累積數據庫」, 2026-08-06).
 *
 * Runs the 4 listening scopes (市場熱點 / 產業討論 / 自己 / 競爭者) per active
 * brand and appends dedup'd mentions into `listening_mentions` (firstSeenAt
 * timestamps + seenCount), so a daily run accumulates the history that a
 * one-off live search can never give. Sentiment/trend aggregation come in
 * Phase 2/3; this job's only job is to make the data start piling up.
 *
 * Scope (cost control): defaults to brands owned by sowork@sowork.tw — the
 * only account the market-intel workspace is currently open to. Widen later
 * with --all once the feature graduates from private preview.
 *
 * Usage:
 *   npx tsx scripts/ingest-listening-mentions.ts                # sowork@sowork.tw brands
 *   npx tsx scripts/ingest-listening-mentions.ts --brand=2957   # one brand
 *   npx tsx scripts/ingest-listening-mentions.ts --all --limit=20
 */
import * as dotenv from "dotenv";
dotenv.config();
import localPool from "../server/localDb";
import {
  INGEST_SCOPES, loadBrandCtx, fetchScopeMentions,
  ensureMentionsTable, upsertMention,
} from "../server/_core/listeningScopes";

const OWNER_EMAIL = "sowork@sowork.tw";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function argVal(flag: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.split("=")[1] : null;
}

async function selectBrandIds(): Promise<number[]> {
  const one = argVal("--brand");
  if (one) return [Number(one)].filter((n) => Number.isFinite(n) && n > 0);

  const all = process.argv.includes("--all");
  const limit = Math.max(1, Math.min(100, Number(argVal("--limit") ?? "40")));

  if (all) {
    const [rows]: any = await localPool.execute(
      `SELECT id FROM brands WHERE positioningStatus = 'completed' ORDER BY id DESC LIMIT ${limit}`,
    );
    return (rows as any[]).map((r) => Number(r.id));
  }
  // Default: brands owned by sowork@sowork.tw.
  const [rows]: any = await localPool.execute(
    `SELECT b.id FROM brands b
       JOIN users u ON u.id = b.userId
      WHERE u.email = ? ORDER BY b.id DESC LIMIT ${limit}`,
    [OWNER_EMAIL],
  );
  return (rows as any[]).map((r) => Number(r.id));
}

async function main() {
  const t0 = Date.now();
  await ensureMentionsTable();
  const brandIds = await selectBrandIds();
  console.log(`[ingest] scope=${process.argv.includes("--all") ? "all-completed" : argVal("--brand") ? "single" : OWNER_EMAIL} → ${brandIds.length} brand(s): ${brandIds.join(", ") || "(none)"}`);

  let totalNew = 0, totalUpd = 0, totalErr = 0;

  for (const brandId of brandIds) {
    const brand = await loadBrandCtx(brandId);
    if (!brand) { console.warn(`[ingest] brand ${brandId} not found — skip`); continue; }
    console.log(`\n=== brand ${brandId} "${brand.name}" (${brand.isTaiwan ? "TW" : "intl"}, ${brand.competitors.length} competitors) ===`);

    for (const scope of INGEST_SCOPES) {
      try {
        const res = await fetchScopeMentions(brand, scope);
        if (!res.ok) {
          console.log(`  ${scope}: — ${res.message ?? "no results"}`);
          continue;
        }
        let neu = 0, upd = 0;
        for (const item of res.items) {
          const r = await upsertMention(brandId, scope, item);
          if (r === "new") neu++; else upd++;
        }
        totalNew += neu; totalUpd += upd;
        console.log(`  ${scope}: ${res.items.length} fetched → ${neu} new, ${upd} seen-again`);
      } catch (e: any) {
        totalErr++;
        console.warn(`  ${scope}: ERROR ${String(e?.message ?? e).slice(0, 160)}`);
      }
      await sleep(1200); // gentle pacing between scope searches (cost/rate)
    }
  }

  console.log(`\n[ingest] done in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${totalNew} new, ${totalUpd} seen-again, ${totalErr} errors`);
  process.exit(0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
