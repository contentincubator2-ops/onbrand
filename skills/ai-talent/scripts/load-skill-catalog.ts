/**
 * load-skill-catalog.ts
 *
 * Reads data/skill-catalog.json (produced by harvest-skill-catalog.ts) and
 * upserts each skill into the `skill_catalog` MySQL table. Idempotent —
 * safe to re-run after a fresh harvest.
 *
 * Run after `db:migrate` (which creates the table) and `db:harvest-skill-catalog`
 * (which writes the JSON).
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as dotenv from "dotenv";
import { getPool, closePool } from "./squad-builder/db.js";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = resolve(__dirname, "../data/skill-catalog.json");

type SkillRecord = {
  slug: string;
  name: string;
  source: string;
  source_url?: string | null;
  bound_provider: string;
  compatible_models?: string[] | null;
  category?: string | null;
  description?: string | null;
  tools?: any[] | null;
  model_compat?: any | null;
  tags?: string[] | null;
};

async function main() {
  if (!existsSync(CATALOG_PATH)) {
    console.error(`catalog not found at ${CATALOG_PATH} — run db:harvest-skill-catalog first`);
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(CATALOG_PATH, "utf-8"));
  const skills: SkillRecord[] = Array.isArray(raw?.skills) ? raw.skills : Array.isArray(raw) ? raw : [];
  if (!skills.length) {
    console.error("catalog has no skills");
    process.exit(1);
  }
  console.log(`▼ Loading ${skills.length} skills into skill_catalog`);

  const pool = getPool();
  let inserted = 0, updated = 0;
  for (const s of skills) {
    const [r]: any = await pool.execute(
      `INSERT INTO skill_catalog
         (slug, name, source, sourceUrl, boundProvider, compatibleModels,
          category, description, tools, modelCompat, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         source = VALUES(source),
         sourceUrl = VALUES(sourceUrl),
         boundProvider = VALUES(boundProvider),
         compatibleModels = VALUES(compatibleModels),
         category = VALUES(category),
         description = VALUES(description),
         tools = VALUES(tools),
         modelCompat = VALUES(modelCompat),
         tags = VALUES(tags)`,
      [
        s.slug,
        s.name || s.slug,
        s.source || "unknown",
        s.source_url || null,
        s.bound_provider || "unknown",
        s.compatible_models ? JSON.stringify(s.compatible_models) : null,
        s.category || null,
        s.description || null,
        s.tools ? JSON.stringify(s.tools) : null,
        s.model_compat ? JSON.stringify(s.model_compat) : null,
        s.tags ? JSON.stringify(s.tags) : null,
      ]
    );
    // mysql2 affectedRows: 1 for insert, 2 for update on duplicate-key
    if (r?.affectedRows === 1) inserted++;
    else if (r?.affectedRows === 2) updated++;
  }

  // Summary
  const [provRows]: any = await pool.query(
    `SELECT boundProvider, COUNT(*) as n FROM skill_catalog GROUP BY boundProvider ORDER BY n DESC`
  );
  console.log(`✅ skill_catalog: ${inserted} inserted, ${updated} updated`);
  console.log("  by provider:");
  for (const row of provRows) console.log(`    ${String(row.boundProvider).padEnd(20)} ${row.n}`);

  await closePool();
}

main().catch((e) => { console.error(e); process.exit(1); });
