/**
 * migrate-to-lead-solo.ts — 2026-04-22
 *
 * One-shot migration: A2A era → Lead-solo era.
 *
 * What this does:
 *   1. ALTER squads ADD lead_agent_id, architecture
 *   2. Backfill lead_agent_id from squad_members.is_lead=1
 *   3. Backfill architecture='a2a' for existing rows (new seeds default to 'lead_solo')
 *   4. Dump legacy tables (squad_members, squad_template, workflow_templates) to archive
 *   5. Set is_active=0 on all existing squads (new Lead-solo seeds will be is_active=1)
 *
 * Idempotent: safe to re-run; skips columns that already exist.
 *
 * Run:  npx tsx scripts/migrate-to-lead-solo.ts
 */

import localPool from "../server/localDb";
import * as fs from "node:fs";
import * as path from "node:path";

const ARCHIVE_DIR = path.resolve(
  process.cwd(),
  "..", "..", "..",
  "A2A-Marketing-Claw-archive",
  "2026-04-22-a2a-version",
  "db-dumps",
);

async function columnExists(table: string, column: string): Promise<boolean> {
  const [rows] = await localPool.execute(
    `SELECT COUNT(*) as c FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column],
  ) as any[];
  return (rows as any[])[0].c > 0;
}

async function addColumn(table: string, column: string, ddl: string) {
  if (await columnExists(table, column)) {
    console.log(`  ↷ ${table}.${column} already exists, skip`);
    return;
  }
  await localPool.execute(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  console.log(`  ✓ ${table}.${column} added`);
}

async function dumpTable(table: string) {
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  const dumpPath = path.join(ARCHIVE_DIR, `${table}.json`);
  try {
    const [rows] = await localPool.execute(`SELECT * FROM ${table}`) as any[];
    fs.writeFileSync(dumpPath, JSON.stringify(rows, null, 2));
    console.log(`  ✓ dumped ${table} (${(rows as any[]).length} rows) → ${dumpPath}`);
  } catch (err: any) {
    console.log(`  ↷ ${table} dump failed (table may not exist): ${err.message}`);
  }
}

async function run() {
  console.log("[migrate] 1/5 add columns to squads");
  await addColumn("squads", "lead_agent_id", "lead_agent_id INT NULL AFTER methodology");
  await addColumn("squads", "architecture",  "architecture VARCHAR(16) NOT NULL DEFAULT 'a2a' AFTER lead_agent_id");

  console.log("[migrate] 2/5 backfill lead_agent_id from squad_members");
  try {
    const [result] = await localPool.execute(`
      UPDATE squads s
      LEFT JOIN (
        SELECT squad_id, MIN(agent_id) AS lead_id
        FROM squad_members
        WHERE is_lead = 1
        GROUP BY squad_id
      ) sm ON sm.squad_id = s.id
      SET s.lead_agent_id = sm.lead_id
      WHERE s.lead_agent_id IS NULL AND sm.lead_id IS NOT NULL
    `) as any[];
    console.log(`  ✓ backfilled ${(result as any).affectedRows} rows`);
  } catch (err: any) {
    console.log(`  ! backfill failed: ${err.message}`);
  }

  console.log("[migrate] 3/5 dump legacy tables to archive");
  await dumpTable("squad_members");
  await dumpTable("squad_template");
  await dumpTable("workflow_templates");
  await dumpTable("squads");                 // full snapshot pre-mutation
  await dumpTable("squad_chat_sessions");

  console.log("[migrate] 4/5 mark all existing squads is_active=0 (new Lead-solo seeds will override)");
  const [r2] = await localPool.execute(
    `UPDATE squads SET is_active = 0 WHERE architecture = 'a2a'`
  ) as any[];
  console.log(`  ✓ hid ${(r2 as any).affectedRows} A2A squads`);

  console.log("[migrate] 5/5 done.");
  console.log("\nNext: run scripts/squad-builder/build-lead-solo.ts to seed 36 new Lead-solo squads.");
  console.log("\nLegacy tables (squad_members, squad_template, workflow_templates) are NOT dropped here.");
  console.log("Drop manually after confirming Lead-solo stack works in production:");
  console.log("  DROP TABLE squad_members, squad_template, workflow_templates;");

  process.exit(0);
}

run().catch(err => {
  console.error("[migrate] fatal:", err);
  process.exit(1);
});
