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

  let updated = 0;
  let failed = 0;
  let preserved = 0;
  for (const r of candidates) {
    try {
      // Build UPDATE SET clauses
      const sets: string[] = [];
      const params: any[] = [];

      if (r.englishName && r.englishName !== r.name) {
        sets.push("name = ?");
        params.push(r.englishName);
        // Preserve old Chinese name in name_zh if not already populated
        if (!r.name_zh && r.name) {
          sets.push("name_zh = ?");
          params.push(r.name);
          preserved++;
        }
      }
      if (r.englishTitle && r.englishTitle !== r.title) {
        sets.push("title = ?");
        params.push(r.englishTitle);
        if (!r.title_zh && r.title) {
          sets.push("title_zh = ?");
          params.push(r.title);
        }
      }

      if (sets.length === 0) continue;
      params.push(r.id);
      await pool.query(
        `UPDATE agents SET ${sets.join(", ")} WHERE id = ?`,
        params,
      );
      updated++;
    } catch (err: any) {
      failed++;
      console.error(`  ✗ id=${r.id}: ${err.message}`);
    }
  }

  // Summary
  console.log(`\n════════════════════════════════════════`);
  console.log(`  Updated:   ${updated}`);
  console.log(`  Preserved: ${preserved} (Chinese name → name_zh)`);
  console.log(`  Failed:    ${failed}`);
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
