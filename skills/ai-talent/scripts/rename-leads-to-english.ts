/**
 * rename-leads-to-english.ts
 *
 * Swap the `name` field of all newly-created Squad Lead agents from Chinese
 * to their `englishName` (which bulk-fix-leads.ts populated alongside).
 *
 * Scope:
 *   - Only touches agents where englishName is non-empty AND differs from name
 *   - Only touches agents whose id >= 238844 (the L1-brand.ts + bulk-fix-leads
 *     generation range — protects hand-curated legacy agents from changes)
 *
 * Usage:
 *   npx tsx scripts/rename-leads-to-english.ts --dry-run
 *   npx tsx scripts/rename-leads-to-english.ts --apply
 */

import { createPool } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const MIN_AGENT_ID = 238844; // L1-brand.ts seed start — all new Leads are above this

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

  const [rows] = await pool.query(
    `SELECT id, name, englishName
       FROM agents
      WHERE id >= ?
        AND englishName IS NOT NULL
        AND englishName != ''
        AND englishName != name
      ORDER BY id`,
    [MIN_AGENT_ID],
  );
  const candidates = rows as Array<{ id: number; name: string; englishName: string }>;

  console.log(`\nMode: ${dryRun ? "DRY-RUN (no writes)" : "APPLY"}`);
  console.log(`Candidates: ${candidates.length} agents (id >= ${MIN_AGENT_ID})\n`);

  // Preview (first 20)
  for (const r of candidates.slice(0, 20)) {
    console.log(`  id=${r.id}  "${r.name}"  →  "${r.englishName}"`);
  }
  if (candidates.length > 20) console.log(`  ... (+${candidates.length - 20} more)`);

  if (dryRun) {
    console.log("\nDry-run complete. Re-run with --apply to write.");
    await pool.end();
    return;
  }

  let updated = 0;
  let failed = 0;
  for (const r of candidates) {
    try {
      await pool.query(
        `UPDATE agents SET name = ? WHERE id = ?`,
        [r.englishName, r.id],
      );
      updated++;
    } catch (err: any) {
      failed++;
      console.error(`  ✗ id=${r.id}: ${err.message}`);
    }
  }
  console.log(`\nUpdated: ${updated}  |  Failed: ${failed}`);

  await pool.end();
}

main().catch((err) => {
  console.error("rename-leads-to-english failed:", err);
  process.exit(1);
});
