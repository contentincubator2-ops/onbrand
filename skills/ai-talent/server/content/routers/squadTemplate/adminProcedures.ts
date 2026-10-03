/**
 * 小隊管理：審核、後台清單、用量與分析。
 */
import { protectedProcedure, adminProcedure } from "../../../platform/core/trpc";
import { z } from "zod";
import localPool from "../../../localDb";
import { TRPCError } from "@trpc/server";
import { safeJsonParse } from "./helpers";
import { getDb } from "../../../db";
import { sql } from "drizzle-orm";

export const adminProcedures = {
  // ── listByBrand ──────────────────────────────────────────────────────────────
  // Returns ALL active squad templates as a CANONICAL shape. The frontend
  // reads ONLY these fields:
  //
  //   { id, slug, name, description, tier, strategyLayer,
  //     methodology: { author, year, source, summary } | null,
  //     lead:    { agentId, name, primarySkill } | null,
  //     members: [{ agentId, name, role, isLead, primarySkill, aiModel }],
  //     steps:   [{ order, name, description, requiredSkill,
  //                 assignedAgentId, assignedAgentName, outputType,
  //                 tools, prompts? }],
  //     tokenBudget, workflowComplete }
  //
  // Phase 1 (2026-04-25) consolidated workflow steps into `squads.steps`
  // (canonical shape). The legacy `squad_workflow_templates` table was
  // backfilled into squads.steps and dropped — no more LEFT JOIN needed.
  // ── listForFront ─────────────────────────────────────────────────────────
  // CJ direction 2026-04-30: every squad must pass approval before
  // appearing in user-facing pickers. ALL front-stage squad loaders
  // (BrandsPage / PickerWorkspace / MissionsHome / BoardroomPage / etc.)
  // should call THIS procedure. is_approved=0 squads stay invisible
  // until CJ flips them.
  //
  // Internal admin views that need to see drafts can call listAll
  // (separate procedure, gated by admin role — TODO).
  //
  // This is the canonical filter; existing listByBrand is kept for
  // back-compat but new callers should use listForFront.
  // ── Admin procedures (CJ direction 2026-04-30) ──────────────────────────
  // /admin/squads SquadLabPage uses these. No role gate yet — any logged-in
  // user can see drafts; tighten when role system lands.
  listForAdmin: adminProcedure
    .input(z.object({
      status: z.enum(["draft", "approved", "all"]).default("all"),
      tier: z.enum(["core", "defer", "kill", "all"]).default("all"),
      search: z.string().max(80).optional(),
    }).optional())
    .query(async ({ input }) => {
      const where: string[] = ["s.is_active = 1"];
      const params: any[] = [];
      if (input?.status === "draft") where.push("s.is_approved = 0");
      else if (input?.status === "approved") where.push("s.is_approved = 1");
      if (input?.tier && input.tier !== "all") {
        where.push("s.tier = ?");
        params.push(input.tier);
      }
      if (input?.search) {
        where.push("(s.name LIKE ? OR s.slug LIKE ? OR s.methodology LIKE ?)");
        const term = `%${input.search}%`;
        params.push(term, term, term);
      }
      const [rows] = await localPool.execute(
        `SELECT s.id, s.slug, s.name, s.description, s.methodology,
                s.tier, s.strategy_layer, s.workspace, s.tags,
                s.lead_agent_id, s.is_approved, s.approved_at, s.approved_by,
                s.created_at, s.updated_at,
                JSON_LENGTH(s.steps)  AS step_count,
                JSON_LENGTH(s.agents) AS agent_count
           FROM squads s
          WHERE ${where.join(" AND ")}
          ORDER BY s.is_approved ASC, s.updated_at DESC
          LIMIT 500`,
        params,
      ) as any[];
      return (rows as any[]) ?? [];
    }),

  // Get single squad with full step + agent detail for the lab detail pane.
  getForAdmin: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [rows] = await localPool.execute(
        `SELECT * FROM squads WHERE id = ? LIMIT 1`,
        [input.id],
      ) as any[];
      const row = (rows as any[])?.[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: `squad ${input.id} not found` });
      // Hydrate referenced agents
      const agentsRaw = safeJsonParse<any[]>(row.agents, []);
      const stepsRaw  = safeJsonParse<any[]>(row.steps, []);
      const ids = new Set<number>();
      for (const a of agentsRaw) if (a?.id) ids.add(Number(a.id));
      for (const s of stepsRaw)  if (s?.assignedAgentId) ids.add(Number(s.assignedAgentId));
      if (row.lead_agent_id) ids.add(Number(row.lead_agent_id));
      const agentMap: Record<number, any> = {};
      if (ids.size > 0) {
        const placeholders = [...ids].map(() => "?").join(",");
        const [aRows] = await localPool.execute(
          `SELECT id, slug, name, englishName, title, layer, aiModel, avatarUrl
             FROM agents WHERE id IN (${placeholders})`,
          [...ids],
        ) as any[];
        for (const a of (aRows as any[])) agentMap[Number(a.id)] = a;
      }
      return { ...row, agents: agentsRaw, steps: stepsRaw, agentMap };
    }),

  approve: adminProcedure
    .input(z.object({ id: z.number(), note: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      await localPool.execute(
        `UPDATE squads SET is_approved = 1, approved_at = NOW(), approved_by = ? WHERE id = ?`,
        [ctx.user!.id, input.id],
      );
      return { ok: true, approvedBy: ctx.user!.id, note: input.note };
    }),

  /** Soft reject — flips is_approved=0, leaves squad active so admin can edit. */
  reject: adminProcedure
    .input(z.object({ id: z.number(), reason: z.string().max(500).optional() }))
    .mutation(async ({ input }) => {
      await localPool.execute(
        `UPDATE squads SET is_approved = 0, approved_at = NULL, approved_by = NULL WHERE id = ?`,
        [input.id],
      );
      return { ok: true, reason: input.reason };
    }),

  // ── getStepsAdmin ─────────────────────────────────────────────────────────
  // Returns the full steps array for a squad so the admin can view/edit
  // outputType per step. Uses localPool (mos_db).
  getStepsAdmin: adminProcedure
    .input(z.object({ squadId: z.number() }))
    .query(async ({ input }) => {
      const [[row]] = await localPool.execute(
        `SELECT id, slug, name, steps FROM squads WHERE id = ?`,
        [input.squadId],
      ) as any;
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Squad not found" });
      let steps: any[] = [];
      try {
        steps = typeof row.steps === "string"
          ? JSON.parse(row.steps)
          : (Array.isArray(row.steps) ? row.steps : []);
      } catch {}
      return {
        id: row.id as number,
        slug: row.slug as string,
        name: row.name as string,
        steps,
      };
    }),

  // ── setStepOutputType ─────────────────────────────────────────────────────
  // Patches a single step's outputType inside the steps JSON.
  // Matches by step index (0-based) or step.order / step.step field.
  setStepOutputType: adminProcedure
    .input(z.object({
      squadId:    z.number(),
      stepIndex:  z.number(),       // 0-based index in the steps array
      outputType: z.string(),       // key from OUTPUT_TYPE_REGISTRY, or "" to clear
    }))
    .mutation(async ({ input }) => {
      const [[row]] = await localPool.execute(
        `SELECT steps FROM squads WHERE id = ?`,
        [input.squadId],
      ) as any;
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Squad not found" });

      let steps: any[] = [];
      try {
        steps = typeof row.steps === "string"
          ? JSON.parse(row.steps)
          : (Array.isArray(row.steps) ? row.steps : []);
      } catch {}

      if (input.stepIndex < 0 || input.stepIndex >= steps.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Step index ${input.stepIndex} out of range` });
      }

      steps[input.stepIndex] = {
        ...steps[input.stepIndex],
        outputType: input.outputType || undefined,
      };

      await localPool.execute(
        `UPDATE squads SET steps = ? WHERE id = ?`,
        [JSON.stringify(steps), input.squadId],
      );

      return { ok: true, steps };
    }),

  // ── missionAnalytics ─────────────────────────────────────────────────────────
  // Per-mission analytics for the Canva-style 分析 dropdown. Reports
  // step-level timings, agent assignments, status counts. Token tracking
  // would slot in here later (we don't yet record token usage per call).
  missionAnalytics: protectedProcedure
    .input(z.object({ missionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      try {
        const [rows] = await db.execute(sql`
          SELECT step_order, status, agent_name, LENGTH(agent_output) AS output_len, updated_at
            FROM mission_step_progress
           WHERE mission_id = ${input.missionId}
           ORDER BY step_order ASC
        `) as any[];
        const arr = (rows as any[]) ?? [];
        const counts = arr.reduce((acc: any, r: any) => {
          acc[r.status] = (acc[r.status] ?? 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        return {
          totalSteps: arr.length,
          counts,
          steps: arr.map((r: any) => ({
            stepOrder: Number(r.step_order),
            status:    String(r.status),
            agentName: r.agent_name ?? "",
            outputLen: Number(r.output_len ?? 0),
            updatedAt: r.updated_at,
          })),
        };
      } catch {
        return { totalSteps: 0, counts: {}, steps: [] };
      }
    }),

  // ── logUsage ─────────────────────────────────────────────────────────────────
  // Write a squad_usage_log row when the user starts a squad session.
  logUsage: protectedProcedure
    .input(z.object({
      squadId:     z.number(),
      squadSlug:   z.string(),
      missionId:   z.number().optional(),
      brandId:     z.number().optional(),
      workspace:   z.string().optional(),
      missionType: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false };
      await db.execute(sql`
        INSERT INTO squad_usage_log
          (user_id, brand_id, workspace, mission_id, mission_type, squad_id, squad_slug, started_at)
        VALUES (
          ${ctx.user.id},
          ${input.brandId ?? null},
          ${input.workspace ?? null},
          ${input.missionId ?? null},
          ${input.missionType ?? null},
          ${input.squadId},
          ${input.squadSlug},
          NOW(3)
        )
      `);
      return { ok: true };
    }),

  // ── getUsageStats ─────────────────────────────────────────────────────────────
  // PM analytics: aggregate squad usage counts for the current user (or all if admin).
  getUsageStats: protectedProcedure
    .input(z.object({
      days:    z.number().default(30),
      brandId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const [rows] = await db.execute(sql`
        SELECT squad_slug, mission_type, workspace,
               COUNT(*) AS uses,
               MAX(started_at) AS last_used
        FROM squad_usage_log
        WHERE user_id = ${ctx.user.id}
          AND started_at >= DATE_SUB(NOW(), INTERVAL ${input.days} DAY)
          ${input.brandId ? sql`AND brand_id = ${input.brandId}` : sql``}
        GROUP BY squad_slug, mission_type, workspace
        ORDER BY uses DESC
        LIMIT 50
      `) as any[];
      return (rows as any[]).map(r => ({
        squadSlug:   r.squad_slug as string,
        missionType: (r.mission_type ?? null) as string | null,
        workspace:   (r.workspace ?? null) as string | null,
        uses:        Number(r.uses),
        lastUsed:    r.last_used as Date,
      }));
    }),
};
