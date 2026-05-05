/**
 * rename-all-agents-to-english.ts
 *
 * Migrate ALL agents in DB so their primary `name` and `title` fields use the
 * English version. Chinese versions are preserved in `name_zh` / `title_zh`
 * (already populated for most agents) so i18n still works.
 *
 * Scope (no MIN_AGENT_ID limit — covers hand-curated legacy agents too):
 *   1. SET name = englishName  WHERE englishName IS NOT NULL AND != ''
 *   2. SET title = englishTitle WHERE englishTitle IS NOT NULL AND != ''
 *   3. Backfill name_zh = old name (if name_zh empty) so Chinese is preserved
 *   4. Backfill title_zh = old title (if title_zh empty) so Chinese is preserved
 *
 * Idempotent: re-running is safe — skips rows where name already == englishName.
 *
 * Usage:
 *   npx tsx scripts/rename-all-agents-to-english.ts --dry-run
 *   npx tsx scripts/rename-all-agents-to-english.ts --apply
 */

import { createPool } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

interface AgentRow {
  id: number;
  name: string | null;
  englishName: string | null;
  title: string | null;
  englishTitle: string | null;
  name_zh: string | null;
  title_zh: string | null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const dryRun = !apply;

  const pool = createPool({
    host: process.env.DB_HOST ?? "localhost",
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "marketing_os",
    waitForConnections: true,
  });

  // Fetch all agents that have an English name available AND differ from current name
  const [rows] = await pool.query(
    `SELECT id, name, englishName, title, englishTitle, name_zh, title_zh
       FROM agents
      WHERE englishName IS NOT NULL
        AND englishName != ''
        AND (englishName != name OR (englishTitle IS NOT NULL AND englishTitle != '' AND englishTitle != title))
      ORDER BY id`,
  );
  const candidates = rows as AgentRow[];

  console.log(`\n════════════════════════════════════════`);
  console.log(`  Mode: ${dryRun ? "DRY-RUN (no writes)" : "APPLY (will UPDATE rows)"}`);
  console.log(`  Candidates: ${candidates.length} agents needing English-name swap`);
  console.log(`════════════════════════════════════════\n`);

  // Preview first 30
  for (const r of candidates.slice(0, 30)) {
    const nameSwap  = r.englishName  && r.englishName  !== r.name  ? `name "${r.name}" → "${r.englishName}"` : "";
    const titleSwap = r.englishTitle && r.englishTitle !== r.title ? `title "${r.title}" → "${r.englishTitle}"` : "";
    const parts = [nameSwap, titleSwap].filter(Boolean).join(" | ");
    console.log(`  id=${r.id}  ${parts}`);
  }
  if (candidates.length > 30) console.log(`  ... (+${candidates.length - 30} more)\n`);

  if (dryRun) {
    console.log("\nDry-run complete. Re-run with --apply to write.\n");
    await pool.end();
    return;
  }

  // 2026-05-05: switched from per-row UPDATE loop to 4 bulk UPDATE statements.
  // Per-row was too slow at 15K rows (timed out in CI at 3 min). Bulk runs
  // in seconds. Each statement is idempotent — re-running is safe.
  console.log("\nApplying 4 bulk UPDATE statements...\n");

  const t0 = Date.now();

  // Step 1: preserve Chinese name into name_zh (only where not already set)
  const [r1]: any = await pool.query(
    `UPDATE agents SET name_zh = name
      WHERE englishName IS NOT NULL AND englishName != ''
        AND englishName != name
        AND (name_zh IS NULL OR name_zh = '')`,
  );
  console.log(`  ✓ backfilled name_zh: ${r1.affectedRows} rows`);

  // Step 2: preserve Chinese title into title_zh
  const [r2]: any = await pool.query(
    `UPDATE agents SET title_zh = title
      WHERE englishTitle IS NOT NULL AND englishTitle != ''
        AND englishTitle != title
        AND (title_zh IS NULL OR title_zh = '')`,
  );
  console.log(`  ✓ backfilled title_zh: ${r2.affectedRows} rows`);

  // Step 3: rename name → englishName
  const [r3]: any = await pool.query(
    `UPDATE agents SET name = englishName
      WHERE englishName IS NOT NULL AND englishName != ''
        AND englishName != name`,
  );
  console.log(`  ✓ renamed name: ${r3.affectedRows} rows`);

  // Step 4: rename title → englishTitle
  const [r4]: any = await pool.query(
    `UPDATE agents SET title = englishTitle
      WHERE englishTitle IS NOT NULL AND englishTitle != ''
        AND englishTitle != title`,
  );
  console.log(`  ✓ renamed title: ${r4.affectedRows} rows`);

  const elapsedMs = Date.now() - t0;

  console.log(`\n════════════════════════════════════════`);
  console.log(`  Total elapsed:   ${elapsedMs} ms`);
  console.log(`  name_zh backfilled:    ${r1.affectedRows}`);
  console.log(`  title_zh backfilled:   ${r2.affectedRows}`);
  console.log(`  name renamed:          ${r3.affectedRows}`);
  console.log(`  title renamed:         ${r4.affectedRows}`);
  console.log(`════════════════════════════════════════\n`);

  // Sanity check — count remaining Chinese-named agents
  const [check] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM agents
      WHERE englishName IS NOT NULL AND englishName != ''
        AND name != englishName`,
  );
  const remaining = (check as any[])[0]?.cnt ?? 0;
  console.log(`Remaining agents still Chinese-named (with available englishName): ${remaining}`);
  console.log(`(0 expected — non-zero means UPDATE failed for those rows)\n`);

  await pool.end();
}

main().catch((err) => {
  console.error("rename-all-agents-to-english failed:", err);
  process.exit(1);
});
