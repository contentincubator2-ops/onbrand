/**
 * migrateSquadCaseStudy.ts — idempotent column add for squads.case_study.
 *
 * Pure DDL — no LLM, no auto-population. Squads with manually
 * populated case_study JSON will show on /playbooks; the rest will
 * not. Run once per environment.
 *
 * Shape expected when populated (via SQL or admin UI):
 *   {
 *     "brand": "HubSpot",
 *     "industry": "B2B SaaS",
 *     "scope": "organic search",
 *     "before": "blog 月流量 1.5M，SEO 排名停滯",
 *     "after":  "12 個月內 organic search +400%、月流量 6M",
 *     "key_moves": ["Topic Cluster 模型", "Pillar page", "Internal linking"],
 *     "outcome": "HubSpot 用 Topic Clusters 在 12 個月內 organic search +400%",
 *     "source_note": "公開資料 / HubSpot blog"
 *   }
 */

import * as dotenv from "dotenv";
import { getPool, closePool } from "./squad-builder/db.js";
dotenv.config();

async function main() {
  const pool = getPool();
  for (const col of ["case_study", "case_study_at"]) {
    const [rows]: any = await pool.execute(
      `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'squads' AND COLUMN_NAME = ?`,
      [col]
    );
    if (Number(rows?.[0]?.c ?? 0) > 0) {
      console.log(`  • ${col} already exists`);
      continue;
    }
    const ddl = col === "case_study"
      ? "ALTER TABLE squads ADD COLUMN case_study JSON NULL"
      : "ALTER TABLE squads ADD COLUMN case_study_at DATETIME(3) NULL";
    await pool.execute(ddl);
    console.log(`  ✓ added column squads.${col}`);
  }

  const [count]: any = await pool.execute(
    `SELECT COUNT(*) AS n FROM squads WHERE case_study IS NOT NULL`
  );
  console.log(`\nSquads with case_study populated: ${count[0].n}`);
  console.log("(Populate manually via SQL / admin UI to surface them on /playbooks.)");

  await closePool();
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
