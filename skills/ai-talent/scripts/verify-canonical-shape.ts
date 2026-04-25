/**
 * verify-canonical-shape.ts — End-to-end verification for Phase 0–2.
 *
 * Replicates squadTemplateRouter.listByBrand SQL + transformation against
 * the live DB and reports per-squad canonical fields. Used to spot-check
 * that lead alignment, agents JSON sync, and steps backfill all flow
 * through to the shape the frontend consumes.
 *
 *   npx tsx scripts/verify-canonical-shape.ts <slug-or-id>
 *   npx tsx scripts/verify-canonical-shape.ts brand-archetype-positioning
 *   npx tsx scripts/verify-canonical-shape.ts 11
 *   npx tsx scripts/verify-canonical-shape.ts          # health summary
 */

import { createPool } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

function safeJson<T>(v: unknown, fb: T): T {
  if (v === null || v === undefined) return fb;
  if (typeof v === "object") return v as T;
  if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return fb; } }
  return fb;
}

async function main() {
  const target = process.argv[2];
  const pool = createPool({
    host:     process.env.LOCAL_DB_HOST     || process.env.DB_HOST     || "localhost",
    user:     process.env.LOCAL_DB_USER     || process.env.DB_USER     || "mos_user",
    password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD || "mos_secure_2026",
    database: process.env.LOCAL_DB_NAME     || process.env.DB_NAME     || "mos_db",
  });

  try {
    if (!target) {
      const [h]: any = await pool.execute(`
        SELECT COUNT(*) total,
               SUM(IF(lead_agent_id IS NOT NULL,1,0)) lead,
               SUM(IF(JSON_LENGTH(COALESCE(steps,JSON_ARRAY()))>0,1,0)) steps,
               SUM(IF(lead_agent_id IS NOT NULL AND JSON_LENGTH(COALESCE(steps,JSON_ARRAY()))>0,1,0)) ready
          FROM squads WHERE is_active=1`);
      console.log("Squad health:", h[0]);

      const [orphans]: any = await pool.execute(`
        SELECT s.id, s.slug, s.lead_agent_id
          FROM squads s
          LEFT JOIN agents a ON a.id = s.lead_agent_id
         WHERE s.is_active=1 AND s.lead_agent_id IS NOT NULL AND a.id IS NULL`);
      console.log(`Orphan lead_agent_id (no matching agent): ${orphans.length}`);
      if (orphans.length) console.log(orphans.slice(0, 5));

      const [misalign]: any = await pool.execute(`
        SELECT s.id, s.slug, s.lead_agent_id,
               JSON_EXTRACT(s.agents, '$') agents
          FROM squads s
         WHERE s.is_active=1 AND s.lead_agent_id IS NOT NULL
           AND NOT JSON_CONTAINS(s.agents, JSON_OBJECT('agent_id', s.lead_agent_id, 'is_lead', true))
         LIMIT 3`);
      console.log(`Squads where agents JSON is_lead disagrees with lead_agent_id: ${misalign.length}`);
      return;
    }

    const isId = /^\d+$/.test(target);
    const [rows]: any = await pool.execute(
      isId
        ? `SELECT id, slug, name, description, agents, steps, tier, strategy_layer, methodology, lead_agent_id, token_budget, workspace
             FROM squads WHERE id = ?`
        : `SELECT id, slug, name, description, agents, steps, tier, strategy_layer, methodology, lead_agent_id, token_budget, workspace
             FROM squads WHERE slug = ?`,
      [isId ? Number(target) : target]
    );
    if (!rows.length) { console.log("Not found:", target); return; }
    const r = rows[0];

    const ids = new Set<number>();
    if (r.lead_agent_id) ids.add(Number(r.lead_agent_id));
    const members = safeJson<any[]>(r.agents, []);
    for (const m of members) if (m.agent_id) ids.add(Number(m.agent_id));
    const steps = safeJson<any[]>(r.steps, []);
    for (const s of steps) if (s.assignedAgentId) ids.add(Number(s.assignedAgentId));

    const agentMap: Record<number, any> = {};
    if (ids.size) {
      const list = [...ids].join(",");
      const [arows]: any = await pool.execute(
        `SELECT id, name, title, primarySkill, aiModel FROM agents WHERE id IN (${list})`
      );
      for (const a of arows) agentMap[a.id] = a;
    }

    const lead = r.lead_agent_id && agentMap[Number(r.lead_agent_id)]
      ? { agentId: Number(r.lead_agent_id),
          name: agentMap[Number(r.lead_agent_id)].name,
          primarySkill: agentMap[Number(r.lead_agent_id)].primarySkill }
      : null;

    const memberOut = members.map((m: any) => {
      const a = agentMap[Number(m.agent_id)];
      return {
        agentId: Number(m.agent_id),
        name: a?.name ?? "(orphan)",
        role: m.role ?? null,
        isLead: !!(m.is_lead === true || m.is_lead === 1),
        primarySkill: a?.primarySkill ?? null,
      };
    });

    const stepsOut = steps.map((s: any, i: number) => {
      const a = s.assignedAgentId ? agentMap[Number(s.assignedAgentId)] : null;
      return {
        order: s.order ?? i + 1,
        name: s.name ?? null,
        requiredSkill: s.requiredSkill ?? null,
        assignedAgentId: s.assignedAgentId ?? null,
        assignedAgentName: a?.name ?? null,
        outputType: s.outputType ?? null,
        toolsCount: Array.isArray(s.tools) ? s.tools.length : 0,
      };
    });

    console.log(JSON.stringify({
      id: r.id,
      slug: r.slug,
      name: r.name,
      tier: r.tier,
      strategyLayer: r.strategy_layer,
      tokenBudget: r.token_budget,
      methodology: safeJson(r.methodology, null),
      workspace: safeJson(r.workspace, null),
      lead,
      memberCount: memberOut.length,
      members: memberOut,
      stepCount: stepsOut.length,
      steps: stepsOut,
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
