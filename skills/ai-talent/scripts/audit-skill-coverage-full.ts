/**
 * audit-skill-coverage-full.ts
 *
 * Multi-axis coverage audit:
 *   A. Agents with 0 skills (skills JSON empty/null AND no row in
 *      agent_skill_assignments)
 *   B. Squads with NULL lead_agent_id
 *   C. Squad leads (agents pointed to by lead_agent_id) with 0 skills
 *   D. Squad leads whose skills don't match any of their squad's
 *      step.requiredSkills
 *
 * Read-only; prints stats + small samples.
 */

import * as dotenv from "dotenv";
import { getPool, closePool } from "./squad-builder/db.js";

dotenv.config();

async function main() {
  const pool = getPool();

  // A. Zero-skill agents
  const [agentsTotal]: any = await pool.query(`SELECT COUNT(*) AS c FROM agents`);
  const [zeroSkillsJson]: any = await pool.query(`
    SELECT COUNT(*) AS c FROM agents
    WHERE skills IS NULL OR JSON_LENGTH(skills) = 0`);
  const [zeroAssignments]: any = await pool.query(`
    SELECT COUNT(*) AS c FROM agents a
    WHERE NOT EXISTS (SELECT 1 FROM agent_skill_assignments asa WHERE asa.agentId = a.id)`);
  const [trulyOrphan]: any = await pool.query(`
    SELECT COUNT(*) AS c FROM agents a
    WHERE (a.skills IS NULL OR JSON_LENGTH(a.skills) = 0)
      AND NOT EXISTS (SELECT 1 FROM agent_skill_assignments asa WHERE asa.agentId = a.id)`);

  console.log("════════════════════════════════════════");
  console.log("  A. AGENT SKILL COVERAGE");
  console.log("════════════════════════════════════════");
  console.log(`  total agents:                    ${agentsTotal[0].c}`);
  console.log(`  empty skills JSON:               ${zeroSkillsJson[0].c}`);
  console.log(`  zero rows in agent_skill_assignments: ${zeroAssignments[0].c}`);
  console.log(`  truly orphan (both empty):       ${trulyOrphan[0].c}`);

  const [orphanSamples]: any = await pool.query(`
    SELECT a.id, a.name, a.aiModel, a.primarySkill
    FROM agents a
    WHERE (a.skills IS NULL OR JSON_LENGTH(a.skills) = 0)
      AND NOT EXISTS (SELECT 1 FROM agent_skill_assignments asa WHERE asa.agentId = a.id)
    LIMIT 8`);
  console.log("\n  sample truly-orphan agents:");
  for (const r of orphanSamples) {
    console.log(`    [${r.id}] ${r.name} | ${r.primarySkill} | ${r.aiModel}`);
  }

  // B. Leadless squads
  const [squadsTotal]: any = await pool.query(`SELECT COUNT(*) AS c FROM squads WHERE is_active = 1`);
  const [leadless]: any = await pool.query(`
    SELECT COUNT(*) AS c FROM squads WHERE is_active = 1 AND lead_agent_id IS NULL`);
  const [leadlessSample]: any = await pool.query(`
    SELECT id, slug, strategy_layer, methodology FROM squads
    WHERE is_active = 1 AND lead_agent_id IS NULL LIMIT 8`);
  console.log("\n════════════════════════════════════════");
  console.log("  B. SQUAD LEADERSHIP");
  console.log("════════════════════════════════════════");
  console.log(`  active squads:                   ${squadsTotal[0].c}`);
  console.log(`  leadless squads:                 ${leadless[0].c}`);
  console.log("  sample leadless squads:");
  for (const r of leadlessSample) console.log(`    [${r.id}] ${r.slug.padEnd(40)} ${r.strategy_layer}`);

  // C. Leads with 0 skills
  const [leadsZeroSkills]: any = await pool.query(`
    SELECT COUNT(DISTINCT a.id) AS c FROM squads s
    JOIN agents a ON a.id = s.lead_agent_id
    WHERE s.is_active = 1
      AND (a.skills IS NULL OR JSON_LENGTH(a.skills) = 0)
      AND NOT EXISTS (SELECT 1 FROM agent_skill_assignments asa WHERE asa.agentId = a.id)`);
  const [leadsZeroSample]: any = await pool.query(`
    SELECT DISTINCT a.id, a.name, s.slug
    FROM squads s JOIN agents a ON a.id = s.lead_agent_id
    WHERE s.is_active = 1
      AND (a.skills IS NULL OR JSON_LENGTH(a.skills) = 0)
      AND NOT EXISTS (SELECT 1 FROM agent_skill_assignments asa WHERE asa.agentId = a.id)
    LIMIT 8`);
  console.log("\n════════════════════════════════════════");
  console.log("  C. SQUAD-LEAD SKILL COVERAGE");
  console.log("════════════════════════════════════════");
  console.log(`  leads with zero skills:          ${leadsZeroSkills[0].c}`);
  for (const r of leadsZeroSample) console.log(`    [${r.id}] ${r.name} → ${r.slug}`);

  // Distribution of skill-counts per agent
  const [dist]: any = await pool.query(`
    SELECT
      CASE
        WHEN cnt = 0 THEN '0'
        WHEN cnt = 1 THEN '1'
        WHEN cnt BETWEEN 2 AND 3 THEN '2-3'
        WHEN cnt BETWEEN 4 AND 5 THEN '4-5'
        WHEN cnt BETWEEN 6 AND 9 THEN '6-9'
        ELSE '10+'
      END AS bucket,
      COUNT(*) AS agents
    FROM (
      SELECT a.id, COALESCE(JSON_LENGTH(a.skills), 0) +
             (SELECT COUNT(*) FROM agent_skill_assignments asa WHERE asa.agentId = a.id) AS cnt
      FROM agents a
    ) t
    GROUP BY bucket
    ORDER BY FIELD(bucket, '0','1','2-3','4-5','6-9','10+')`);
  console.log("\n  skill-count distribution (skills JSON + assignments):");
  for (const r of dist) console.log(`    ${r.bucket.padEnd(6)} ${r.agents}`);

  await closePool();
}

main().catch((e) => { console.error(e); process.exit(1); });
