/**
 * probe-orphan-skills.ts
 *
 * Reports the top-N skill slugs that exist in agent.skills JSON or
 * agent_skill_assignments but are NOT in skill_catalog. Helps decide
 * which to (a) add to catalog (b) normalize/alias to existing catalog
 * (c) drop.
 *
 * Read-only.
 */

import * as dotenv from "dotenv";
import { getPool, closePool } from "./squad-builder/db.js";

dotenv.config();

function parseJson(v: any): any {
  if (v == null) return null;
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return null; }
}

async function main() {
  const pool = getPool();

  const [catalogRows]: any = await pool.query(`SELECT slug FROM skill_catalog`);
  const catalog = new Set(catalogRows.map((r: any) => r.slug));

  const [agents]: any = await pool.query(
    `SELECT id, COALESCE(skills, JSON_ARRAY()) AS skillsJson FROM agents`,
  );

  const orphan = new Map<string, number>();
  for (const a of agents) {
    const arr = parseJson(a.skillsJson);
    if (!Array.isArray(arr)) continue;
    for (const s of arr) {
      const slug = typeof s === "string" ? s : (s && typeof s.slug === "string" ? s.slug : null);
      if (!slug) continue;
      if (!catalog.has(slug)) orphan.set(slug, (orphan.get(slug) || 0) + 1);
    }
  }

  // also from assignments
  const [asgn]: any = await pool.query(
    `SELECT skillSlug, COUNT(*) AS c FROM agent_skill_assignments GROUP BY skillSlug`,
  );
  for (const r of asgn) {
    if (!catalog.has(r.skillSlug)) orphan.set(r.skillSlug, (orphan.get(r.skillSlug) || 0) + Number(r.c));
  }

  const sorted = [...orphan.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`▼ ${sorted.length} unique orphan slugs (not in catalog)`);
  console.log(`▼ catalog size: ${catalog.size}`);
  console.log("\n  TOP 80:");
  for (const [slug, n] of sorted.slice(0, 80)) {
    console.log(`    ${String(n).padStart(4)}  ${slug}`);
  }

  await closePool();
}

main().catch((e) => { console.error(e); process.exit(1); });
