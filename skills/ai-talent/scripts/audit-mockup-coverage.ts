/**
 * audit-mockup-coverage — for every squad bound to an active task_catalog
 * row, list any step that's missing a mockupVariant. CJ requires every
 * step to declare which mockup component renders its output.
 *
 * Output: console table + /tmp/mockup-coverage.md
 *
 * Read-only — no writes.
 */
import "dotenv/config";
import { writeFileSync } from "fs";
import mysql from "mysql2/promise";

async function main() {
  const pool = mysql.createPool({
    host: process.env.LOCAL_DB_HOST || process.env.DB_HOST || "127.0.0.1",
    user: process.env.LOCAL_DB_USER || process.env.DB_USER || "root",
    password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD || "",
    database: process.env.LOCAL_DB_NAME || process.env.DB_NAME || "mos_db",
  });

  const [rows]: any = await pool.execute(
    `SELECT s.id, s.slug, s.name, s.steps, s.hero_image_url
       FROM squads s JOIN task_catalog t ON t.squad_id = s.id
      WHERE t.status = 'active'
      ORDER BY s.id`,
  );

  const lines: string[] = [`# Mockup-coverage audit (${new Date().toISOString().split("T")[0]})\n`];
  let total = 0, missing = 0, missingHero = 0;

  for (const sq of (rows as any[])) {
    const steps = typeof sq.steps === "string" ? (() => { try { return JSON.parse(sq.steps); } catch { return []; } })() : sq.steps;
    if (!Array.isArray(steps)) continue;
    const lacking = steps.filter((s: any) => !s.mockupVariant);
    total += steps.length;
    missing += lacking.length;
    if (!sq.hero_image_url) missingHero++;

    const status = lacking.length === 0 ? "✓" : "✗";
    const heroStatus = sq.hero_image_url ? "✓" : "✗ no hero";
    console.log(`${status} squad #${sq.id} ${sq.slug}: ${steps.length - lacking.length}/${steps.length} steps mocked, ${heroStatus}`);
    lines.push(`- ${status} **#${sq.id}** \`${sq.slug}\` — ${steps.length - lacking.length}/${steps.length} steps with mockup, hero=${sq.hero_image_url ?? "—"}`);
    for (const s of lacking) {
      console.log(`    ✗ step ${s.order ?? "?"}: ${s.name} — outputKind=${s.outputKind ?? "?"}`);
      lines.push(`  - ✗ step ${s.order}: \`${s.name}\` (outputKind=${s.outputKind ?? "?"})`);
    }
  }

  lines.push(`\n## Summary\n`);
  lines.push(`- Total active-bound squads: ${(rows as any[]).length}`);
  lines.push(`- Total steps: ${total}`);
  lines.push(`- Steps missing mockup: ${missing}`);
  lines.push(`- Squads missing hero image: ${missingHero}`);

  console.log(`\n=== summary ===`);
  console.log(`  squads:           ${(rows as any[]).length}`);
  console.log(`  total steps:      ${total}`);
  console.log(`  missing mockup:   ${missing}`);
  console.log(`  missing hero:     ${missingHero}`);

  writeFileSync("/tmp/mockup-coverage.md", lines.join("\n"));
  console.log(`\nFull report → /tmp/mockup-coverage.md`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
