/**
 * reportPersistence.ts
 *
 * Writes squad-run outputs to `brand_reports` + `brand_report_sections`
 * so users can later view/edit them in the Report Editor UI,
 * deep-link back to the originating mission_messages row, and regenerate
 * a single section without losing context.
 *
 * Called ALONGSIDE (not instead of) saveStepResultOnly — the existing
 * squad_chat_sessions.stepResults JSON map is preserved for runtime
 * squad-flow logic. brand_report_sections stores the FULL untruncated
 * output, plus version history and user-edit tracking.
 */

import type { Pool } from "mysql2/promise";

/**
 * Resolve or create a brand_reports row for (missionId, squadId).
 * Returns reportId.
 */
export async function ensureBrandReport(
  pool: Pool,
  params: {
    missionId: number;
    squadId: number;
    squadSlug?: string | null;
    brandId?: number | null;
    title?: string | null;
  },
): Promise<number> {
  const { missionId, squadId, squadSlug, brandId, title } = params;

  const [rows] = (await pool.execute(
    `SELECT id FROM brand_reports WHERE missionId = ? LIMIT 1`,
    [missionId],
  )) as any[];
  const existingId = (rows as any[])[0]?.id as number | undefined;
  if (existingId) return existingId;

  const [ins] = (await pool.execute(
    `INSERT INTO brand_reports
       (missionId, squadId, squadSlug, brandId, title, status, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, 'draft', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
    [missionId, squadId, squadSlug ?? null, brandId ?? null, title ?? null],
  )) as any;
  return (ins as any).insertId as number;
}

/**
 * Upsert a section for a given (reportId, stepOrder).
 *
 * Behavior:
 *   - If no section exists for this stepOrder: INSERT as version=1, isCurrent=1.
 *   - If an isCurrent=1 section exists AND userEdited=0: UPDATE in place
 *     (the same agent re-ran, overwrite is safe).
 *   - If an isCurrent=1 section exists AND userEdited=1: demote it to
 *     isCurrent=0, INSERT a new version (user's edits preserved as history).
 *
 * This lets "regenerate step N" simply call this function — version++
 * happens automatically when the user has already edited.
 */
export async function upsertReportSection(
  pool: Pool,
  params: {
    reportId: number;
    stepOrder: number;
    stepName?: string | null;
    agentId?: number | null;
    agentRole?: string | null;
    agentName?: string | null;
    content: string;
    sourceMessageId?: number | null;
  },
): Promise<{ sectionId: number; version: number; created: boolean }> {
  const {
    reportId,
    stepOrder,
    stepName,
    agentId,
    agentRole,
    agentName,
    content,
    sourceMessageId,
  } = params;

  // Find current section at this stepOrder
  const [rows] = (await pool.execute(
    `SELECT id, version, userEdited
     FROM brand_report_sections
     WHERE reportId = ? AND stepOrder = ? AND isCurrent = 1
     LIMIT 1`,
    [reportId, stepOrder],
  )) as any[];
  const current = (rows as any[])[0] as
    | { id: number; version: number; userEdited: number }
    | undefined;

  if (!current) {
    // Fresh insert
    const [ins] = (await pool.execute(
      `INSERT INTO brand_report_sections
         (reportId, stepOrder, stepName, agentId, agentRole, agentName,
          content, userEdited, version, sourceMessageId, isCurrent,
          createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, 1,
               CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
      [
        reportId,
        stepOrder,
        stepName ?? null,
        agentId ?? null,
        agentRole ?? null,
        agentName ?? null,
        content,
        sourceMessageId ?? null,
      ],
    )) as any;
    return {
      sectionId: (ins as any).insertId as number,
      version: 1,
      created: true,
    };
  }

  if (!current.userEdited) {
    // Safe to overwrite — no user edits to preserve
    await pool.execute(
      `UPDATE brand_report_sections
       SET stepName = ?, agentId = ?, agentRole = ?, agentName = ?,
           content = ?, sourceMessageId = ?, updatedAt = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      [
        stepName ?? null,
        agentId ?? null,
        agentRole ?? null,
        agentName ?? null,
        content,
        sourceMessageId ?? null,
        current.id,
      ],
    );
    return { sectionId: current.id, version: current.version, created: false };
  }

  // User has edited the current section — preserve history and start a new version
  await pool.execute(
    `UPDATE brand_report_sections SET isCurrent = 0 WHERE id = ?`,
    [current.id],
  );
  const [ins] = (await pool.execute(
    `INSERT INTO brand_report_sections
       (reportId, stepOrder, stepName, agentId, agentRole, agentName,
        content, userEdited, version, sourceMessageId, isCurrent,
        createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 1,
             CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
    [
      reportId,
      stepOrder,
      stepName ?? null,
      agentId ?? null,
      agentRole ?? null,
      agentName ?? null,
      content,
      current.version + 1,
      sourceMessageId ?? null,
    ],
  )) as any;
  return {
    sectionId: (ins as any).insertId as number,
    version: current.version + 1,
    created: true,
  };
}

/**
 * Given a squad row's agents+steps JSON, resolve the member matching
 * stepOrder → returns {agentId, agentRole, agentName}.
 * Falls back to nulls if squad data is malformed.
 */
export function resolveStepMember(
  squad: { agents?: string | null; steps?: string | null },
  stepOrder: number,
): { agentId: number | null; agentRole: string | null; agentName: string | null; stepName: string | null } {
  const result = {
    agentId: null as number | null,
    agentRole: null as string | null,
    agentName: null as string | null,
    stepName: null as string | null,
  };

  // Steps: find the entry whose order matches stepOrder
  try {
    const steps = typeof squad.steps === "string" ? JSON.parse(squad.steps) : squad.steps;
    if (Array.isArray(steps)) {
      const step = steps.find((s: any) => s?.order === stepOrder);
      if (step) {
        result.stepName = step.name ?? null;
        if (step.assignedAgentId) {
          result.agentId = Number(step.assignedAgentId);
          result.agentName = step.assignedAgentName ?? null;
        }
      }
    }
  } catch { /* ignore parse errors */ }

  // Agents: find the member with matching order (fallback for agent info)
  try {
    const agents = typeof squad.agents === "string" ? JSON.parse(squad.agents) : squad.agents;
    if (Array.isArray(agents)) {
      const member = agents.find((a: any) => a?.order === stepOrder);
      if (member) {
        result.agentRole = member.role ?? result.agentRole;
        if (!result.agentId && member.agent_id) {
          result.agentId = Number(member.agent_id);
        }
      }
    }
  } catch { /* ignore */ }

  return result;
}

/**
 * Convenience: persist a squad step output as a report section in one call.
 * Reads squad row (agents, steps, slug, ...) to derive metadata.
 * Safe to call from missionChatRouter wherever saveStepResultOnly is called.
 */
export async function persistReportSection(
  pool: Pool,
  params: {
    missionId: number;
    squadId: number;
    stepOrder: number;
    content: string;
    sourceMessageId?: number | null;
  },
): Promise<void> {
  const { missionId, squadId, stepOrder, content, sourceMessageId } = params;
  try {
    const [squadRows] = (await pool.execute(
      `SELECT id, slug, name, agents, steps FROM squads WHERE id = ? LIMIT 1`,
      [squadId],
    )) as any[];
    const squad = (squadRows as any[])[0] as
      | { id: number; slug: string; name: string; agents: string; steps: string }
      | undefined;
    if (!squad) return;

    const [missionRows] = (await pool.execute(
      `SELECT brandId FROM missions WHERE id = ? LIMIT 1`,
      [missionId],
    )) as any[];
    const brandId = (missionRows as any[])[0]?.brandId ?? null;

    const reportId = await ensureBrandReport(pool, {
      missionId,
      squadId,
      squadSlug: squad.slug,
      brandId,
      title: squad.name,
    });

    const member = resolveStepMember({ agents: squad.agents, steps: squad.steps }, stepOrder);

    await upsertReportSection(pool, {
      reportId,
      stepOrder,
      stepName: member.stepName,
      agentId: member.agentId,
      agentRole: member.agentRole,
      agentName: member.agentName,
      content,
      sourceMessageId: sourceMessageId ?? null,
    });
  } catch (err) {
    // Never throw — report persistence must not break squad-flow
    console.error(
      `[persistReportSection] missionId=${missionId} step=${stepOrder} error:`,
      err,
    );
  }
}
