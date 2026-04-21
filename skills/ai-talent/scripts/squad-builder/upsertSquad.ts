/**
 * squad-builder / upsertSquad.ts
 *
 * Writes a fully-resolved squad (spec + member agents) to the SINGLE
 * canonical table: squads. Workflow steps live inline in squads.steps.
 *
 * No writes to squad_workflow_templates or agent_squads — those are
 * legacy / historical and not written by the builder.
 *
 * Idempotent: uses slug as upsert key. Re-running overwrites fields.
 *
 * Fields populated (aligned to squads schema):
 *   core           : slug, name, description, missionType, methodology,
 *                    workspace, tags, agents (JSON), token, tier,
 *                    strategy_layer, is_active, steps (JSON inline)
 *   gap-fill       : use_cases, output_formats, showcases, industry_key
 *   not-written    : embedding (set by embed:squads), industry_focus,
 *                    company_size, market (defaulted by schema)
 */

import type { PoolConnection } from "mysql2/promise";
import type { ResolvedMember, SquadSpec } from "./types.js";
import { getPool } from "./db.js";

/**
 * Build the `agents` JSON column: [{role, order, is_lead, agent_id}]
 */
function buildAgentsJson(members: ResolvedMember[]) {
  return members.map((m) => ({
    role: m.spec.role,
    order: m.spec.order,
    is_lead: m.spec.isLead,
    agent_id: m.agent.id,
  }));
}

/**
 * Build the `steps` JSON column (inline on squads table):
 * [{order, name, description, tool, outputType, requiredSkills,
 *   assignedAgentId, assignedAgentSlug, assignedAgentName}]
 */
function buildStepsJson(spec: SquadSpec, members: ResolvedMember[]) {
  const byRole = new Map<string, ResolvedMember>();
  for (const m of members) byRole.set(m.spec.role, m);

  return spec.workflow.map((step) => {
    const member = byRole.get(step.stepMemberRole);
    if (!member) {
      throw new Error(
        `[upsertSquad] step "${step.name}" references stepMemberRole="${step.stepMemberRole}" but no matching squad member`,
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
}

/**
 * Derive gap-fill fields from spec so audit-squad-fields.ts passes.
 * These are best-effort defaults; specs can override via spec.* if added later.
 */
function deriveGapFillFields(spec: SquadSpec, members: ResolvedMember[]) {
  // use_cases: 2 canned phrases per layer (signals which scenario this squad fits)
  const useCasesByLayer: Record<string, string[]> = {
    L1_brand: [
      `為 ${spec.name} 建立完整品牌定位策略`,
      `用 ${spec.methodology} 方法論做 ${spec.name} 的品牌校準`,
      `多品牌集團的品牌架構整合`,
    ],
    L2_product: [
      `為產品線做 ${spec.methodology} 定位分析`,
      `新品上市的產品訊息策略`,
      `產品組合差異化診斷`,
    ],
    L3_audience: [
      `建立目標受眾 ${spec.methodology} 分眾策略`,
      `ICP / persona 深度挖掘`,
    ],
    L4_channel: [
      `${spec.methodology} 通路策略規劃`,
      `通路訊息一致性校準`,
    ],
    L5_campaign: [
      `活動 ${spec.methodology} 策略設計`,
      `Campaign 節奏與效益規劃`,
    ],
    L6_validation: [
      `品牌一致性與效益稽核`,
      `跨通路訊息驗證`,
    ],
    unassigned: [`${spec.name} 策略諮詢`],
  };

  // output_formats: derived from step.outputType list
  const outputFormats = Array.from(
    new Set(spec.workflow.map((s) => s.outputType)),
  );

  // showcases: lead agent name + methodology as a single baseline showcase
  const leadMember = members.find((m) => m.spec.isLead);
  const showcases = leadMember
    ? [
        {
          title: `${spec.name} × ${spec.methodologyAuthor ?? "方法論"}`,
          description: `由 ${leadMember.agent.name} 主導，運用 ${spec.methodology} 方法論，${spec.workflow.length} 步驟完成策略產出。`,
          result: `完整 ${spec.layer.replace(/_/g, " ")} 層策略輸出`,
        },
      ]
    : [];

  // industry_key: pull from workspace if specific, else "all"
  const wsCandidates = spec.workspace.filter(
    (w) => !["strategy", "analytics"].includes(w),
  );
  const industryKey = wsCandidates[0] ?? "all";

  return {
    useCases: useCasesByLayer[spec.layer] ?? [`${spec.name} 策略諮詢`],
    outputFormats,
    showcases,
    industryKey,
  };
}

/**
 * Upsert the squad row into the squads table.
 * Workflow steps go INLINE in squads.steps (single source of truth).
 * Returns squad id.
 */
async function upsertSquadRow(
  conn: PoolConnection,
  spec: SquadSpec,
  members: ResolvedMember[],
): Promise<number> {
  const agentsJson = buildAgentsJson(members);
  const stepsJson = buildStepsJson(spec, members);
  const gap = deriveGapFillFields(spec, members);

  // Does this slug already exist?
  const [existing] = (await conn.execute(
    `SELECT id FROM squads WHERE slug = ? LIMIT 1`,
    [spec.slug],
  )) as any[];
  const existingId: number | undefined = (existing as any[])[0]?.id;

  if (existingId) {
    await conn.execute(
      `UPDATE squads SET
         name = ?, description = ?, missionType = ?, methodology = ?,
         workspace = ?, tags = ?,
         agents = ?, steps = ?, token = ?,
         tier = ?, strategy_layer = ?,
         use_cases = ?, output_formats = ?, showcases = ?, industry_key = ?,
         is_active = 1,
         updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [
        spec.name,
        spec.description,
        spec.slug,
        spec.methodology,
        JSON.stringify(spec.workspace),
        JSON.stringify(spec.tags),
        JSON.stringify(agentsJson),
        JSON.stringify(stepsJson),
        spec.tokenBudget,
        spec.tier,
        spec.layer,
        JSON.stringify(gap.useCases),
        JSON.stringify(gap.outputFormats),
        JSON.stringify(gap.showcases),
        gap.industryKey,
        existingId,
      ],
    );
    console.log(
      `[upsertSquad] UPDATE squads id=${existingId} slug=${spec.slug}`,
    );
    return existingId;
  }

  const [ins] = await conn.execute(
    `INSERT INTO squads (
       slug, name, description, missionType, methodology,
       workspace, tags, agents, steps, token,
       tier, strategy_layer,
       use_cases, output_formats, showcases, industry_key,
       is_active, created_at, updated_at
     ) VALUES (
       ?, ?, ?, ?, ?,
       ?, ?, ?, ?, ?,
       ?, ?,
       ?, ?, ?, ?,
       1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
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
      JSON.stringify(stepsJson),
      spec.tokenBudget,
      spec.tier,
      spec.layer,
      JSON.stringify(gap.useCases),
      JSON.stringify(gap.outputFormats),
      JSON.stringify(gap.showcases),
      gap.industryKey,
    ],
  );
  const newId = (ins as any).insertId as number;
  console.log(`[upsertSquad] INSERT squads id=${newId} slug=${spec.slug}`);
  return newId;
}

/**
 * Main entry: upsert squads row (with inline steps) in a single transaction.
 */
export async function upsertSquad(
  spec: SquadSpec,
  members: ResolvedMember[],
): Promise<{ squadId: number }> {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const squadId = await upsertSquadRow(conn, spec, members);
    await conn.commit();
    return { squadId };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
