/**
 * squad-builder / upsertSquad.ts
 *
 * Given a fully-resolved squad (spec + member agents), write it to:
 *   - agent_squads             (the squad row)
 *   - squad_workflow_templates (the steps row)
 *
 * Idempotent: uses slug as upsert key. Re-running overwrites fields.
 */

import type { PoolConnection } from "mysql2/promise";
import type { ResolvedMember, SquadSpec } from "./types.js";
import { getPool } from "./db.js";

/**
 * Upsert the squad row. Returns squad id.
 */
async function upsertAgentSquad(
  conn: PoolConnection,
  spec: SquadSpec,
  members: ResolvedMember[],
): Promise<number> {
  const agentsJson = members.map((m) => ({
    role: m.spec.role,
    order: m.spec.order,
    is_lead: m.spec.isLead,
    agent_id: m.agent.id,
  }));

  // Does this slug already exist?
  const [existing] = (await conn.execute(
    `SELECT id FROM agent_squads WHERE slug = ? LIMIT 1`,
    [spec.slug],
  )) as any[];
  const existingId: number | undefined = (existing as any[])[0]?.id;

  if (existingId) {
    await conn.execute(
      `UPDATE agent_squads SET
         name = ?, description = ?, missionType = ?, methodology = ?,
         workspace = ?, tags = ?,
         agents = ?, token = ?,
         tier = ?, strategy_layer = ?, is_active = 1,
         updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [
        spec.name,
        spec.description,
        spec.slug, // missionType == slug for simplicity
        spec.methodology,
        JSON.stringify(spec.workspace),
        JSON.stringify(spec.tags),
        JSON.stringify(agentsJson),
        spec.tokenBudget,
        spec.tier,
        spec.layer,
        existingId,
      ],
    );
    console.log(
      `[upsertSquad] UPDATE agent_squads id=${existingId} slug=${spec.slug}`,
    );
    return existingId;
  }

  const [ins] = await conn.execute(
    `INSERT INTO agent_squads (
       slug, name, description, missionType, methodology,
       workspace, tags, agents, token,
       tier, strategy_layer, is_active,
       created_at, updated_at
     ) VALUES (
       ?, ?, ?, ?, ?,
       ?, ?, ?, ?,
       ?, ?, 1,
       CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
     )`,
    [
      spec.slug,
      spec.name,
      spec.description,
      spec.slug,
      spec.methodology,
      JSON.stringify(spec.workspace),
      JSON.stringify(spec.tags),
      JSON.stringify(agentsJson),
      spec.tokenBudget,
      spec.tier,
      spec.layer,
    ],
  );
  const newId = (ins as any).insertId as number;
  console.log(
    `[upsertSquad] INSERT agent_squads id=${newId} slug=${spec.slug}`,
  );
  return newId;
}

/**
 * Upsert the workflow template row.
 */
async function upsertWorkflow(
  conn: PoolConnection,
  spec: SquadSpec,
  members: ResolvedMember[],
): Promise<void> {
  // Map stepMemberRole -> resolved member
  const byRole = new Map<string, ResolvedMember>();
  for (const m of members) byRole.set(m.spec.role, m);

  const steps = spec.workflow.map((step) => {
    const member = byRole.get(step.stepMemberRole);
    if (!member) {
      throw new Error(
        `[upsertWorkflow] step "${step.name}" references stepMemberRole="${step.stepMemberRole}" but no matching squad member`,
      );
    }
    return {
      order: step.order,
      name: step.name,
      description: step.description,
      tool: step.tool,
      outputType: step.outputType,
      requiredSkills: step.requiredSkills,
      assignedAgentId: member.agent.id,
      assignedAgentSlug: member.agent.slug,
      assignedAgentName: member.agent.name,
    };
  });

  const [existing] = (await conn.execute(
    `SELECT id FROM squad_workflow_templates WHERE taskType = ? LIMIT 1`,
    [spec.slug],
  )) as any[];
  const existingId: number | undefined = (existing as any[])[0]?.id;

  const description =
    spec.name + "工作流：" + spec.workflow.map((s) => s.name).join(" → ");

  if (existingId) {
    await conn.execute(
      `UPDATE squad_workflow_templates SET
         name = ?, description = ?, steps = ?,
         missionType = ?, isActive = 1,
         updatedAt = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [
        spec.name + "工作流",
        description,
        JSON.stringify(steps),
        spec.slug,
        existingId,
      ],
    );
    console.log(
      `[upsertSquad] UPDATE squad_workflow_templates id=${existingId} taskType=${spec.slug}`,
    );
    return;
  }

  await conn.execute(
    `INSERT INTO squad_workflow_templates (
       taskType, name, description, steps, missionType, isActive,
       createdAt, updatedAt
     ) VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
    [
      spec.slug,
      spec.name + "工作流",
      description,
      JSON.stringify(steps),
      spec.slug,
    ],
  );
  console.log(
    `[upsertSquad] INSERT squad_workflow_templates taskType=${spec.slug}`,
  );
}

/**
 * Main entry: upsert both tables in a single connection for atomicity.
 */
export async function upsertSquad(
  spec: SquadSpec,
  members: ResolvedMember[],
): Promise<{ squadId: number }> {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const squadId = await upsertAgentSquad(conn, spec, members);
    await upsertWorkflow(conn, spec, members);
    await conn.commit();
    return { squadId };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
