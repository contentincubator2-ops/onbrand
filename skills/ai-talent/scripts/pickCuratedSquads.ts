/**
 * pickCuratedSquads.ts — Phase 3 of curated-30 plan.
 *
 * Selects 30 squads across L1–L6 by market-demand quota, scores them by
 * structural completeness, marks `is_curated = 1`, and creates one
 * methodology row per winner so the front-end can render a methodology
 * detail page tied to each curated squad.
 *
 * Idempotent: re-running clears prior auto-tagged rows first.
 *   - `squads.is_curated` → reset all to 0 then re-tag winners
 *   - `methodology` rows with `source_url LIKE 'local:squad/%'` are deleted
 *     and recreated (so manually-curated methodologies are untouched)
 */

import * as dotenv from "dotenv";
import { getPool, closePool } from "./squad-builder/db.js";

dotenv.config();

// ── Market-demand quota ────────────────────────────────────────────────────
const QUOTA: Record<string, number> = {
  L1: 5,   // 品牌策略 — agency 招牌題目
  L2: 3,   // 產品策略 — 行銷 agency 邊緣
  L3: 4,   // 受眾策略 — STP / Persona
  L4: 10,  // 通路策略 — 最高頻需求
  L5: 6,   // 活動策略 — 新品上市 / Campaign
  L6: 2,   // 驗證校準 — 量少
};

// ── Score weights ──────────────────────────────────────────────────────────
const W_STEP_COUNT = 0.4;  // ideal range 5–10
const W_MEMBERS    = 0.2;  // 2–6 ideal
const W_HAS_AUTHOR = 0.2;
const W_HAS_DESC   = 0.1;
const W_HAS_LEAG   = 0.1;

interface SquadRow {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  strategy_layer: string | null;
  methodology: string | null;
  steps: string | null;
  agents: string | null;
  lead_agent_id: number | null;
}

function safeJson<T>(v: any, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === "object") return v as T;
  try { return JSON.parse(String(v)) as T; } catch { return fallback; }
}

function resolveLayer(raw: string | null): string {
  if (!raw) return "L1";
  const m = String(raw).toUpperCase().match(/L([1-6])/);
  return m ? `L${m[1]}` : "L1";
}

function scoreSquad(r: SquadRow): number {
  const steps   = safeJson<any[]>(r.steps, []);
  const members = safeJson<any[]>(r.agents, []);
  const meth    = (() => {
    if (!r.methodology) return null;
    if (typeof r.methodology === "object") return r.methodology as any;
    try { return JSON.parse(r.methodology); } catch { return { summary: r.methodology }; }
  })();

  // Step count: ramp to 1.0 at 5–10, decay outside
  const sc = steps.length;
  const stepScore = sc < 3 ? 0
    : sc <= 5 ? 0.5 + (sc - 3) * 0.25
    : sc <= 10 ? 1.0
    : Math.max(0, 1.0 - (sc - 10) * 0.1);

  const mc = members.length;
  const memberScore = mc === 0 ? 0
    : mc <= 6 ? Math.min(1, mc / 4)
    : Math.max(0, 1 - (mc - 6) * 0.15);

  const authorScore = (meth?.author && String(meth.author).trim()) ? 1 : 0;
  const descScore   = (r.description && r.description.trim().length > 30) ? 1 : 0;
  const leadScore   = r.lead_agent_id ? 1 : 0;

  return W_STEP_COUNT * stepScore
       + W_MEMBERS    * memberScore
       + W_HAS_AUTHOR * authorScore
       + W_HAS_DESC   * descScore
       + W_HAS_LEAG   * leadScore;
}

async function main() {
  const pool = getPool();

  console.log("===== Phase 3 — pick curated 30 =====\n");

  // 1) Reset is_curated on all squads
  console.log("1) Reset is_curated flags …");
  const [reset]: any = await pool.execute("UPDATE squads SET is_curated = 0, methodology_id = NULL");
  console.log(`   reset rows: ${reset.affectedRows}`);

  // 2) Delete prior auto-generated methodology rows
  console.log("2) Delete prior auto-methodology rows (source_url LIKE 'local:squad/%') …");
  const [del]: any = await pool.execute("DELETE FROM methodology WHERE source_url LIKE 'local:squad/%'");
  console.log(`   deleted: ${del.affectedRows}\n`);

  // 3) Pull all candidates
  const [rows]: any = await pool.execute(
    `SELECT id, slug, name, description, strategy_layer, methodology, steps, agents, lead_agent_id
       FROM squads
      WHERE is_active = 1`
  );
  console.log(`3) Candidates fetched: ${rows.length}`);

  // 4) Score and bucket by layer
  const buckets: Record<string, Array<{ row: SquadRow; score: number }>> = {
    L1: [], L2: [], L3: [], L4: [], L5: [], L6: [],
  };
  for (const r of rows as SquadRow[]) {
    const layer = resolveLayer(r.strategy_layer);
    const sc    = scoreSquad(r);
    if (sc > 0) buckets[layer]!.push({ row: r, score: sc });
  }

  // Sort each bucket desc
  for (const k of Object.keys(buckets)) {
    buckets[k]!.sort((a, b) => b.score - a.score);
  }

  // 5) Pick winners and tag
  const winners: SquadRow[] = [];
  console.log("\n4) Quota fill:");
  for (const layer of ["L1", "L2", "L3", "L4", "L5", "L6"]) {
    const want = QUOTA[layer]!;
    const top  = buckets[layer]!.slice(0, want);
    console.log(`   ${layer}: pool=${buckets[layer]!.length}, taking top ${top.length}/${want}`);
    for (const t of top) winners.push(t.row);
  }

  console.log(`\n5) Tagging ${winners.length} winners + creating methodology rows …`);

  for (const w of winners) {
    const layer = resolveLayer(w.strategy_layer);
    const meth  = (() => {
      if (!w.methodology) return null;
      if (typeof w.methodology === "object") return w.methodology as any;
      try { return JSON.parse(w.methodology); } catch { return { summary: w.methodology }; }
    })();

    const author      = meth?.author      ?? null;
    const year        = meth?.year        ? String(meth.year) : null;
    const philosophy  = meth?.summary     ?? null;
    const sourceUrl   = `local:squad/${w.slug}`;

    // INSERT methodology
    const [ins]: any = await pool.execute(
      `INSERT INTO methodology
         (slug, name, author, year, source_url, description, philosophy,
          strategy_layer, default_squad_id, is_curated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        `m-${w.slug}`.slice(0, 188),
        w.name,
        author,
        year,
        sourceUrl,
        w.description,
        philosophy,
        layer,
        w.id,
      ]
    );
    const methId = ins.insertId;

    // Tag squad
    await pool.execute(
      "UPDATE squads SET is_curated = 1, methodology_id = ? WHERE id = ?",
      [methId, w.id]
    );
  }

  // 6) Verify
  const [c1]: any = await pool.execute("SELECT COUNT(*) AS n FROM squads WHERE is_curated = 1");
  const [c2]: any = await pool.execute("SELECT COUNT(*) AS n FROM methodology WHERE is_curated = 1");
  const [byLayer]: any = await pool.execute(
    "SELECT strategy_layer, COUNT(*) AS n FROM squads WHERE is_curated = 1 GROUP BY strategy_layer ORDER BY strategy_layer"
  );

  console.log("\n===== Verify =====");
  console.log(`squads.is_curated=1:     ${c1[0].n}`);
  console.log(`methodology.is_curated=1: ${c2[0].n}`);
  console.log("By layer:");
  for (const r of byLayer as any[]) console.log(`  ${r.strategy_layer}: ${r.n}`);

  await closePool();
  console.log("\n✓ Done");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
