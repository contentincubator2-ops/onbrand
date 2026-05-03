/**
 * upgrade-content-type.ts
 *
 * Adds `content_type` column to squads + sowork_agents tables,
 * then batch-fills values based on slug patterns and existing fields.
 *
 * content_type vocabulary (aligned with frontend CONTENT_TYPE_TABS):
 *   calendar    行事曆規劃
 *   post        單篇貼文 / 文案
 *   ad          廣告文案
 *   script      影片腳本
 *   visual      視覺圖文方向
 *   campaign    活動企劃
 *   report      分析報告
 *   research    用戶 / 市場研究
 *   positioning 品牌定位
 *   newsletter  電子報
 *
 * Usage:
 *   npx tsx scripts/upgrade-content-type.ts          # dry-run (default)
 *   npx tsx scripts/upgrade-content-type.ts --apply  # actually ALTER + UPDATE
 *
 * Idempotent: safe to re-run. ALTER uses IF NOT EXISTS.
 */

import { createPool } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const apply = process.argv.includes("--apply");

async function main() {
  const pool = createPool({
    host:     process.env.DB_HOST     ?? "localhost",
    user:     process.env.DB_USER     ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME     ?? "marketing_os",
    multipleStatements: true,
  });

  // ─── Step 1: ALTER tables ─────────────────────────────────────────────────
  const alterStatements = [
    `ALTER TABLE squads ADD COLUMN IF NOT EXISTS content_type VARCHAR(50) DEFAULT NULL`,
    `ALTER TABLE sowork_agents ADD COLUMN IF NOT EXISTS content_type VARCHAR(50) DEFAULT NULL`,
  ];

  // ─── Step 2: Squad UPDATE rules ──────────────────────────────────────────
  // Ordered from most-specific to least-specific (last match wins for overlaps).
  const squadRules: Array<{ content_type: string; condition: string; label: string }> = [
    // positioning
    {
      content_type: "positioning",
      condition: `workspace LIKE '%brand-positioning%' OR workspace LIKE '%positioning%' OR slug LIKE '%-positioning%'`,
      label: "品牌定位",
    },
    // research
    {
      content_type: "research",
      condition: `slug LIKE '%-research%' OR slug LIKE '%-audience%' OR slug LIKE '%-insight%' OR missionType = 'quarterly-strategy'`,
      label: "研究分析",
    },
    // report / analytics
    {
      content_type: "report",
      condition: `slug LIKE '%-analytics%' OR slug LIKE '%-report%' OR missionType = 'monthly-analytics'`,
      label: "分析報告",
    },
    // campaign / event
    {
      content_type: "campaign",
      condition: `slug LIKE '%-campaign%' OR slug LIKE '%-launch%' OR slug LIKE '%-scarcity%' OR slug LIKE '%-countdown%' OR missionType LIKE '%campaign%'`,
      label: "活動企劃",
    },
    // ad copy
    {
      content_type: "ad",
      condition: `slug LIKE '%-ad%' OR slug LIKE '%-cvo%' OR slug LIKE '%-schwartz%' OR slug LIKE '%-hormozi%' OR slug LIKE '%-brief%'`,
      label: "廣告文案",
    },
    // video script
    {
      content_type: "script",
      condition: `slug LIKE '%-script%' OR slug LIKE '%-video%' OR slug LIKE '%-storytelling%' OR slug LIKE '%-hook%'`,
      label: "影片腳本",
    },
    // visual / image direction
    {
      content_type: "visual",
      condition: `slug LIKE '%-visual%' OR slug LIKE '%-thumbnail%' OR slug LIKE '%-image%' OR slug LIKE '%-creative%'`,
      label: "視覺圖文",
    },
    // newsletter / email
    {
      content_type: "newsletter",
      condition: `workspace LIKE '%email%' OR slug LIKE '%-newsletter%' OR slug LIKE '%-edm%' OR slug LIKE '%-email%'`,
      label: "電子報",
    },
    // calendar — last so it doesn't clobber more specific matches
    {
      content_type: "calendar",
      condition: `slug LIKE '%-calendar%' OR missionType LIKE '%-calendar%' OR missionType = 'ig-monthly-calendar'`,
      label: "行事曆",
    },
    // post / general content (catch-all for fb/ig/li/tt that didn't match above)
    {
      content_type: "post",
      condition: `content_type IS NULL AND (workspace LIKE '%facebook%' OR workspace LIKE '%instagram%' OR workspace LIKE '%linkedin%' OR workspace LIKE '%tiktok%' OR workspace LIKE '%youtube%')`,
      label: "貼文 / 內容",
    },
  ];

  // ─── Step 3: Agent UPDATE rules ───────────────────────────────────────────
  const agentRules: Array<{ content_type: string; condition: string; label: string }> = [
    { content_type: "positioning", condition: `slug LIKE '%-positioning%' OR specialty LIKE '%定位%'`, label: "品牌定位" },
    { content_type: "research",    condition: `slug LIKE '%-research%' OR slug LIKE '%-audience%'`,     label: "研究分析" },
    { content_type: "report",      condition: `slug LIKE '%-analytics%' OR slug LIKE '%-report%'`,      label: "分析報告" },
    { content_type: "campaign",    condition: `slug LIKE '%-campaign%' OR slug LIKE '%-launch%'`,        label: "活動企劃" },
    { content_type: "ad",          condition: `slug LIKE '%-ad%' OR slug LIKE '%-brief%' OR slug LIKE '%-cvo%'`, label: "廣告文案" },
    { content_type: "script",      condition: `slug LIKE '%-script%' OR slug LIKE '%-video%'`,           label: "影片腳本" },
    { content_type: "visual",      condition: `slug LIKE '%-visual%' OR slug LIKE '%-director%' OR slug LIKE '%-thumbnail%'`, label: "視覺圖文" },
    { content_type: "newsletter",  condition: `workspace = 'email' OR slug LIKE '%-newsletter%'`,        label: "電子報" },
    { content_type: "calendar",    condition: `slug LIKE '%-calendar%' OR slug LIKE '%-planner%'`,       label: "行事曆" },
    { content_type: "post",        condition: `content_type IS NULL AND workspace IN ('facebook','instagram','linkedin','tiktok','youtube')`, label: "貼文 / 內容" },
  ];

  // ─── Preview / Apply ──────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(60)}`);
  console.log(apply ? "🚀  APPLY MODE" : "🔍  DRY-RUN MODE (pass --apply to write)");
  console.log("─".repeat(60));

  // Count squads that would be affected
  const [squadTotal] = await pool.query<any[]>(`SELECT COUNT(*) AS n FROM squads`);
  console.log(`\nSquads total: ${squadTotal[0].n}`);

  for (const rule of squadRules) {
    const [res] = await pool.query<any[]>(
      `SELECT COUNT(*) AS n FROM squads WHERE ${rule.condition}`
    );
    console.log(`  [squad] ${rule.content_type.padEnd(12)} ← ${String(res[0].n).padStart(4)} rows  (${rule.label})`);
  }

  const [agentTotal] = await pool.query<any[]>(`SELECT COUNT(*) AS n FROM sowork_agents`);
  console.log(`\nAgents total: ${agentTotal[0].n}`);

  for (const rule of agentRules) {
    const [res] = await pool.query<any[]>(
      `SELECT COUNT(*) AS n FROM sowork_agents WHERE ${rule.condition}`
    );
    console.log(`  [agent] ${rule.content_type.padEnd(12)} ← ${String(res[0].n).padStart(4)} rows  (${rule.label})`);
  }

  if (!apply) {
    console.log("\n⚠  Dry-run complete. Run with --apply to execute.\n");
    await pool.end();
    return;
  }

  // ── ALTER ──
  console.log("\n── ALTER tables ──");
  for (const sql of alterStatements) {
    console.log(`  ${sql}`);
    await pool.query(sql);
  }

  // ── UPDATE squads ──
  console.log("\n── UPDATE squads ──");
  for (const rule of squadRules) {
    const sql = `UPDATE squads SET content_type = '${rule.content_type}' WHERE ${rule.condition}`;
    const [res] = await pool.query<any>(sql);
    console.log(`  ${rule.content_type.padEnd(12)} → ${res.affectedRows} rows updated`);
  }

  // ── UPDATE agents ──
  console.log("\n── UPDATE sowork_agents ──");
  for (const rule of agentRules) {
    const sql = `UPDATE sowork_agents SET content_type = '${rule.content_type}' WHERE ${rule.condition}`;
    const [res] = await pool.query<any>(sql);
    console.log(`  ${rule.content_type.padEnd(12)} → ${res.affectedRows} rows updated`);
  }

  // ── Coverage summary ──
  const [squadNull] = await pool.query<any[]>(`SELECT COUNT(*) AS n FROM squads WHERE content_type IS NULL`);
  const [agentNull] = await pool.query<any[]>(`SELECT COUNT(*) AS n FROM sowork_agents WHERE content_type IS NULL`);
  console.log(`\n✅  Done.`);
  console.log(`   Squads still NULL: ${squadNull[0].n}`);
  console.log(`   Agents still NULL: ${agentNull[0].n}\n`);

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
