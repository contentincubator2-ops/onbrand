/**
 * backfill-universal-skills.ts
 *
 * Multi-pass backfill so EVERY agent ends with ≥1 skill assignment:
 *
 *   Pass 1: Token-overlap match between primarySkill+title+name vs each
 *           catalog skill's slug+name+tags. Any score ≥ 1 token is kept.
 *           Awards top 3 matches per agent.
 *   Pass 2: For agents still empty, assign from a guaranteed UNIVERSAL
 *           backstop set (marketing-generalist + content-strategy +
 *           audience-research). Every agent ends with ≥3 skills minimum.
 *
 * Provider compatibility:
 *   - boundProvider="any" / "tool" → universal (any aiModel)
 *   - boundProvider="anthropic"    → only Anthropic agents
 *   - boundProvider="openai"       → only OpenAI/Foundry GPT agents
 *   - boundProvider="zai"|"zhipu"  → only Zhipu agents
 *
 * Backstop skills are all "any" so they never fail compatibility.
 * Idempotent: writes via INSERT IGNORE on agent_skill_assignments
 * (UNIQUE (agentId, skillSlug)).
 */

import * as dotenv from "dotenv";
import { getPool, closePool } from "./squad-builder/db.js";

dotenv.config();

const DRY_RUN = process.argv.includes("--dry-run");
const MIN_SKILLS = 3;
const BACKSTOP_SLUGS = ["marketing-generalist", "content-strategy", "audience-research"];

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

function isCompatible(boundProvider: string, fam: string): boolean {
  const bp = (boundProvider || "any").toLowerCase();
  if (bp === "any" || bp === "tool" || bp === "fal.ai") return true;
  if (bp === "anthropic") return fam === "anthropic";
  if (bp === "openai") return fam === "openai";
  if (bp === "zai" || bp === "zhipu" || bp === "glm") return fam === "zai";
  return true; // unknown bp → permissive
}

async function main() {
  const pool = getPool();

  // Pull catalog
  const [catalog]: any = await pool.query(
    `SELECT slug, name, boundProvider, category, COALESCE(tags, JSON_ARRAY()) AS tags FROM skill_catalog`,
  );
  const catalogParsed = catalog.map((c: any) => {
    let tags: string[] = [];
    try { tags = typeof c.tags === "string" ? JSON.parse(c.tags) : (c.tags || []); } catch {}
    return {
      slug: c.slug, name: c.name, bp: c.boundProvider, category: c.category,
      tokens: new Set([
        ...tokenize(c.slug), ...tokenize(c.name), ...tokenize(c.category || ""),
        ...tags.flatMap((t: string) => tokenize(t)),
      ]),
    };
  });
  console.log(`▼ catalog: ${catalogParsed.length} skills`);

  // Verify backstop slugs exist
  const haveBackstops = BACKSTOP_SLUGS.filter((s) => catalogParsed.some((c: any) => c.slug === s));
  if (haveBackstops.length !== BACKSTOP_SLUGS.length) {
    const missing = BACKSTOP_SLUGS.filter((s) => !haveBackstops.includes(s));
    console.error(`✘ missing backstop skills in catalog: ${missing.join(", ")}`);
    console.error(`  run db:expand-marketing-skills first`);
    process.exit(1);
  }

  // Pull agents needing top-up: those with < MIN_SKILLS combined skills
  const [agents]: any = await pool.query(`
    SELECT a.id, a.name, a.title, a.primarySkill, a.aiModel,
           COALESCE(JSON_LENGTH(a.skills), 0) AS jsonSkillCount,
           (SELECT COUNT(*) FROM agent_skill_assignments asa WHERE asa.agentId = a.id) AS assignmentCount
    FROM agents a
    HAVING (jsonSkillCount + assignmentCount) < ${MIN_SKILLS}`);
  console.log(`▼ ${agents.length} agents below ${MIN_SKILLS} skills — to top-up`);

  let pass1Hits = 0, pass2Hits = 0, totalAssignmentsAdded = 0;
  const insertSql = `INSERT IGNORE INTO agent_skill_assignments
    (agentId, skillSlug, boundProvider, matchReason, confidence)
    VALUES (?, ?, ?, ?, ?)`;

  for (const a of agents) {
    const fam = provFamily(a.aiModel);
    const need = MIN_SKILLS - (a.jsonSkillCount + a.assignmentCount);
    const agentTokens = new Set([
      ...tokenize(a.primarySkill || ""),
      ...tokenize(a.title || ""),
      ...tokenize(a.name || ""),
    ]);

    // Pass 1: token-overlap scoring across compatible catalog
    const scored = catalogParsed
      .filter((c: any) => isCompatible(c.bp, fam))
      .map((c: any) => {
        let overlap = 0;
        for (const t of agentTokens) if (c.tokens.has(t)) overlap++;
        return { ...c, overlap };
      })
      .filter((x: any) => x.overlap > 0)
      .sort((a: any, b: any) => b.overlap - a.overlap);

    let added = 0;
    for (const m of scored.slice(0, need * 2)) {
      if (added >= need) break;
      if (!DRY_RUN) {
        const [r]: any = await pool.execute(insertSql, [a.id, m.slug, m.bp, `token-overlap:${m.overlap}`, Math.min(0.95, 0.5 + m.overlap * 0.1)]);
        if (r.affectedRows === 1) { added++; pass1Hits++; totalAssignmentsAdded++; }
      } else { added++; pass1Hits++; }
    }

    // Pass 2: backstop fill
    if (added < need) {
      for (const slug of BACKSTOP_SLUGS) {
        if (added >= need) break;
        if (!DRY_RUN) {
          const [r]: any = await pool.execute(insertSql, [a.id, slug, "any", "universal-backstop", 0.4]);
          if (r.affectedRows === 1) { added++; pass2Hits++; totalAssignmentsAdded++; }
        } else { added++; pass2Hits++; }
      }
    }
  }

  console.log("\n════════════════════════════════════════");
  console.log(`  pass-1 (token overlap):    ${pass1Hits}`);
  console.log(`  pass-2 (universal backstop): ${pass2Hits}`);
  console.log(`  total assignments added:   ${totalAssignmentsAdded}`);
  console.log("════════════════════════════════════════");

  if (!DRY_RUN) {
    const [zeroLeft]: any = await pool.query(`
      SELECT COUNT(*) AS c FROM agents a
      WHERE (a.skills IS NULL OR JSON_LENGTH(a.skills) = 0)
        AND NOT EXISTS (SELECT 1 FROM agent_skill_assignments asa WHERE asa.agentId = a.id)`);
    console.log(`  remaining truly-orphan: ${zeroLeft[0].c}`);
  }

  await closePool();
}

main().catch((e) => { console.error(e); process.exit(1); });
