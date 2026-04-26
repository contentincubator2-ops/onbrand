/**
 * backfill-lead-skills.ts
 *
 * Ensures every squad lead has ≥3 skills, with at least 1 skill that
 * tokens-overlaps the squad's methodology and 1 that overlaps the
 * squad's strategy_layer.
 *
 * Sources: skill_catalog (preferred). Falls back to backstop trio.
 *
 * Idempotent.
 */

import * as dotenv from "dotenv";
import { getPool, closePool } from "./squad-builder/db.js";

dotenv.config();

const DRY_RUN = process.argv.includes("--dry-run");
const MIN_LEAD_SKILLS = 3;
const BACKSTOP = ["marketing-generalist", "brand-strategy", "content-strategy"];

function tokenize(s: string): string[] {
  return (s || "").toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
}

function provFamily(aiModel: string): string {
  const m = (aiModel || "").toLowerCase();
  if (m.includes("claude") || m.includes("anthropic")) return "anthropic";
  if (m.includes("gpt") || m.startsWith("o3") || m.startsWith("o4") || m.includes("openai")) return "openai";
  if (m.includes("glm") || m.includes("zai") || m.includes("zhipu")) return "zai";
  return "other";
}

function isCompatible(bp: string, fam: string): boolean {
  const b = (bp || "any").toLowerCase();
  if (b === "any" || b === "tool" || b === "fal.ai") return true;
  if (b === "anthropic") return fam === "anthropic";
  if (b === "openai") return fam === "openai";
  if (b === "zai" || b === "zhipu") return fam === "zai";
  return true;
}

async function main() {
  const pool = getPool();

  const [catalog]: any = await pool.query(
    `SELECT slug, name, boundProvider, category, COALESCE(tags, JSON_ARRAY()) AS tags FROM skill_catalog`,
  );
  const cat = catalog.map((c: any) => {
    let tags: string[] = [];
    try { tags = typeof c.tags === "string" ? JSON.parse(c.tags) : (c.tags || []); } catch {}
    return {
      slug: c.slug, bp: c.boundProvider, category: c.category,
      tokens: new Set([
        ...tokenize(c.slug), ...tokenize(c.name), ...tokenize(c.category || ""),
        ...tags.flatMap((t: string) => tokenize(t)),
      ]),
    };
  });

  // Pull every active squad with its lead
  const [squads]: any = await pool.query(`
    SELECT s.id AS sid, s.slug, s.strategy_layer, s.methodology,
           a.id AS aid, a.aiModel, a.primarySkill,
           COALESCE(JSON_LENGTH(a.skills), 0) AS jsonCount,
           (SELECT COUNT(*) FROM agent_skill_assignments asa WHERE asa.agentId = a.id) AS asgnCount
    FROM squads s
    JOIN agents a ON a.id = s.lead_agent_id
    WHERE s.is_active = 1`);
  console.log(`▼ ${squads.length} active squads with leads`);

  let topped = 0, totalAdded = 0;
  const insertSql = `INSERT IGNORE INTO agent_skill_assignments
    (agentId, skillSlug, boundProvider, matchReason, confidence) VALUES (?, ?, ?, ?, ?)`;

  for (const s of squads) {
    const have = s.jsonCount + s.asgnCount;
    if (have >= MIN_LEAD_SKILLS) continue;
    const need = MIN_LEAD_SKILLS - have;

    const fam = provFamily(s.aiModel);
    const ctxTokens = new Set([
      ...tokenize(s.methodology || ""),
      ...tokenize(s.strategy_layer || ""),
      ...tokenize(s.primarySkill || ""),
      ...tokenize(s.slug || ""),
    ]);

    const scored = cat
      .filter((c: any) => isCompatible(c.bp, fam))
      .map((c: any) => {
        let overlap = 0;
        for (const t of ctxTokens) if (c.tokens.has(t)) overlap++;
        return { ...c, overlap };
      })
      .filter((x: any) => x.overlap > 0)
      .sort((x: any, y: any) => y.overlap - x.overlap);

    let added = 0;
    for (const m of scored.slice(0, need * 2)) {
      if (added >= need) break;
      if (!DRY_RUN) {
        const [r]: any = await pool.execute(insertSql, [s.aid, m.slug, m.bp, `lead-fit:${s.slug}:overlap=${m.overlap}`, Math.min(0.95, 0.6 + m.overlap * 0.1)]);
        if (r.affectedRows === 1) { added++; totalAdded++; }
      } else { added++; }
    }
    if (added < need) {
      for (const slug of BACKSTOP) {
        if (added >= need) break;
        if (!DRY_RUN) {
          const [r]: any = await pool.execute(insertSql, [s.aid, slug, "any", `lead-backstop:${s.slug}`, 0.5]);
          if (r.affectedRows === 1) { added++; totalAdded++; }
        } else { added++; }
      }
    }
    if (added > 0) topped++;
  }

  console.log(`\n✅ topped ${topped} leads, added ${totalAdded} assignments`);

  if (!DRY_RUN) {
    const [stillShort]: any = await pool.query(`
      SELECT COUNT(*) AS c FROM squads s
      JOIN agents a ON a.id = s.lead_agent_id
      WHERE s.is_active = 1
        AND (COALESCE(JSON_LENGTH(a.skills),0) +
             (SELECT COUNT(*) FROM agent_skill_assignments asa WHERE asa.agentId = a.id)) < ${MIN_LEAD_SKILLS}`);
    console.log(`  leads still below ${MIN_LEAD_SKILLS} skills: ${stillShort[0].c}`);
  }

  await closePool();
}

main().catch((e) => { console.error(e); process.exit(1); });
