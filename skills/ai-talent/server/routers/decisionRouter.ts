/**
 * decisionRouter — Decision AI core.
 *
 * The pivot: squads stop being "workflow executors" and start producing
 * Decision Records. Each decision has options, evidence refs, a recommendation,
 * confidence, reversibility, lineage, audit score, and stale date.
 *
 * State machine:
 *   draft → recommended → approved → active → stale (auto)
 *                      → dissented
 *                                  → archived
 *
 * See skills/ai-talent/docs/decision-catalog.md for the MVP 6-decision chain.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { assertBrandOwner } from "../_core/brandAuth";

const decisionStatus = z.enum([
  "draft",
  "recommended",
  "approved",
  "active",
  "stale",
  "archived",
  "dissented",
]);
const reversibility = z.enum(["one-way", "two-way"]);
const evidenceSource = z.enum([
  "scout",
  "market_data",
  "archetype",
  "user_input",
  "calc",
  "parent_decision",
]);
const evidenceStance = z.enum(["supports", "contradicts", "neutral"]);
const outcomeVerdict = z.enum(["win", "loss", "push", "inconclusive"]);

async function loadDecisionOwned(userId: number, id: number): Promise<any> {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "DB unavailable",
    });
  const [rows] = (await db.execute(sql`
    SELECT d.* FROM decisions d
    INNER JOIN brands b ON b.id = d.brandId
    WHERE d.id = ${id} AND b.userId = ${userId}
    LIMIT 1
  `)) as any;
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Decision not found",
    });
  return row;
}

export const decisionRouter = router({
  // ─── Read ────────────────────────────────────────────────────────────────

  listByBrand: protectedProcedure
    .input(
      z.object({
        brandId: z.number().int().positive(),
        status: decisionStatus.optional(),
        decisionType: z.string().max(64).optional(),
        limit: z.number().int().min(1).max(200).default(50),
      })
    )
    .query(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertBrandOwner(ctx.user.id, input.brandId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conds = [sql`d.brandId = ${input.brandId}`];
      if (input.status) conds.push(sql`d.status = ${input.status}`);
      if (input.decisionType)
        conds.push(sql`d.decisionType = ${input.decisionType}`);

      const [rows] = (await db.execute(sql`
        SELECT d.id, d.brandId, d.squadId, d.missionId, d.decisionType,
               d.parentDecisionId, d.status, d.title, d.summary,
               d.recommendedOptionId, d.confidence, d.reversibility,
               d.auditScore, d.auditedAt, d.activatedAt, d.staleAt,
               d.publishedAt, d.decidedBy, d.decidedAt,
               d.createdAt, d.updatedAt,
               s.slug AS squadSlug, s.name AS squadName, s.strategy_layer AS layer
        FROM decisions d
        LEFT JOIN squads s ON s.id = d.squadId
        WHERE ${sql.join(conds, sql` AND `)}
        ORDER BY d.updatedAt DESC
        LIMIT ${input.limit}
      `)) as any;
      return Array.isArray(rows) ? rows : [];
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const d = await loadDecisionOwned(ctx.user.id, input.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [optRows] = (await db.execute(sql`
        SELECT * FROM decision_options WHERE decisionId = ${input.id} ORDER BY orderIndex ASC, id ASC
      `)) as any;
      const [evRows] = (await db.execute(sql`
        SELECT * FROM decision_evidence WHERE decisionId = ${input.id} ORDER BY id ASC
      `)) as any;
      const [outRows] = (await db.execute(sql`
        SELECT * FROM decision_outcomes WHERE decisionId = ${input.id} ORDER BY observedAt DESC
      `)) as any;
      return {
        decision: d,
        options: Array.isArray(optRows) ? optRows : [],
        evidence: Array.isArray(evRows) ? evRows : [],
        outcomes: Array.isArray(outRows) ? outRows : [],
      };
    }),

  getLineage: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await loadDecisionOwned(ctx.user.id, input.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const chain: any[] = [];
      let cursor: number | null = input.id;
      const seen = new Set<number>();
      while (cursor && !seen.has(cursor) && chain.length < 20) {
        seen.add(cursor);
        const [rows] = (await db.execute(sql`
          SELECT d.id, d.decisionType, d.title, d.status, d.parentDecisionId,
                 d.confidence, d.auditScore, s.slug AS squadSlug, s.strategy_layer AS layer
          FROM decisions d
          LEFT JOIN squads s ON s.id = d.squadId
          WHERE d.id = ${cursor} LIMIT 1
        `)) as any;
        const row = Array.isArray(rows) ? rows[0] : null;
        if (!row) break;
        chain.push(row);
        cursor = row.parentDecisionId ?? null;
      }
      return chain.reverse();
    }),

  // ─── Write ───────────────────────────────────────────────────────────────

  create: protectedProcedure
    .input(
      z.object({
        brandId: z.number().int().positive(),
        squadId: z.number().int().positive().optional(),
        missionId: z.number().int().positive().optional(),
        decisionType: z.string().min(1).max(64),
        title: z.string().max(255).optional(),
        summary: z.string().optional(),
        payload: z.any().optional(),
        parentDecisionId: z.number().int().positive().optional(),
        reversibility: reversibility.default("two-way"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertBrandOwner(ctx.user.id, input.brandId);
      if (input.parentDecisionId)
        await loadDecisionOwned(ctx.user.id, input.parentDecisionId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = (await db.execute(sql`
        INSERT INTO decisions
          (brandId, squadId, missionId, decisionType, parentDecisionId,
           status, title, summary, reversibility, payload)
        VALUES
          (${input.brandId}, ${input.squadId ?? null}, ${input.missionId ?? null},
           ${input.decisionType}, ${input.parentDecisionId ?? null},
           'draft', ${input.title ?? null}, ${input.summary ?? null},
           ${input.reversibility},
           ${input.payload ? JSON.stringify(input.payload) : null})
      `)) as any;
      const id = result?.insertId ?? 0;
      return { id };
    }),

  addOption: protectedProcedure
    .input(
      z.object({
        decisionId: z.number().int().positive(),
        label: z.string().min(1).max(255),
        rationale: z.string().optional(),
        pros: z.array(z.string()).optional(),
        cons: z.array(z.string()).optional(),
        expectedOutcome: z.string().optional(),
        isRecommended: z.boolean().default(false),
        orderIndex: z.number().int().default(0),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await loadDecisionOwned(ctx.user.id, input.decisionId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = (await db.execute(sql`
        INSERT INTO decision_options
          (decisionId, label, rationale, pros, cons, expectedOutcome,
           isRecommended, orderIndex)
        VALUES
          (${input.decisionId}, ${input.label}, ${input.rationale ?? null},
           ${input.pros ? JSON.stringify(input.pros) : null},
           ${input.cons ? JSON.stringify(input.cons) : null},
           ${input.expectedOutcome ?? null},
           ${input.isRecommended ? 1 : 0}, ${input.orderIndex})
      `)) as any;
      return { id: result?.insertId ?? 0 };
    }),

  addEvidence: protectedProcedure
    .input(
      z.object({
        decisionId: z.number().int().positive(),
        sourceType: evidenceSource,
        sourceRef: z.string().min(1).max(255),
        weight: z.number().min(0).max(1).optional(),
        stance: evidenceStance.default("supports"),
        snippet: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await loadDecisionOwned(ctx.user.id, input.decisionId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = (await db.execute(sql`
        INSERT INTO decision_evidence
          (decisionId, sourceType, sourceRef, weight, stance, snippet)
        VALUES
          (${input.decisionId}, ${input.sourceType}, ${input.sourceRef},
           ${input.weight ?? null}, ${input.stance}, ${input.snippet ?? null})
      `)) as any;
      return { id: result?.insertId ?? 0 };
    }),

  recommend: protectedProcedure
    .input(
      z.object({
        decisionId: z.number().int().positive(),
        recommendedOptionId: z.number().int().positive(),
        confidence: z.number().min(0).max(1),
        summary: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await loadDecisionOwned(ctx.user.id, input.decisionId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.execute(sql`
        UPDATE decisions
        SET status = 'recommended',
            recommendedOptionId = ${input.recommendedOptionId},
            confidence = ${input.confidence},
            summary = COALESCE(${input.summary ?? null}, summary)
        WHERE id = ${input.decisionId}
      `);
      await db.execute(sql`
        UPDATE decision_options SET isRecommended = 0 WHERE decisionId = ${input.decisionId}
      `);
      await db.execute(sql`
        UPDATE decision_options SET isRecommended = 1
        WHERE id = ${input.recommendedOptionId} AND decisionId = ${input.decisionId}
      `);
      return { ok: true };
    }),

  approve: protectedProcedure
    .input(
      z.object({
        decisionId: z.number().int().positive(),
        staleDays: z.number().int().min(1).max(730).default(90),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await loadDecisionOwned(ctx.user.id, input.decisionId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const who = ctx.user.email ?? `user:${ctx.user.id}`;
      await db.execute(sql`
        UPDATE decisions
        SET status = 'active',
            activatedAt = NOW(3),
            staleAt = DATE_ADD(NOW(3), INTERVAL ${input.staleDays} DAY),
            decidedBy = ${who},
            decidedAt = NOW(3)
        WHERE id = ${input.decisionId}
      `);
      return { ok: true };
    }),

  dissent: protectedProcedure
    .input(
      z.object({
        decisionId: z.number().int().positive(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await loadDecisionOwned(ctx.user.id, input.decisionId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const who = ctx.user.email ?? `user:${ctx.user.id}`;
      await db.execute(sql`
        UPDATE decisions
        SET status = 'dissented',
            decidedBy = ${who},
            decidedAt = NOW(3),
            summary = CONCAT(COALESCE(summary,''),
                             '\n\n[dissent ', NOW(), '] ',
                             COALESCE(${input.reason ?? null}, 'no reason given'))
        WHERE id = ${input.decisionId}
      `);
      return { ok: true };
    }),

  archive: protectedProcedure
    .input(z.object({ decisionId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await loadDecisionOwned(ctx.user.id, input.decisionId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.execute(sql`
        UPDATE decisions SET status = 'archived' WHERE id = ${input.decisionId}
      `);
      return { ok: true };
    }),

  recordOutcome: protectedProcedure
    .input(
      z.object({
        decisionId: z.number().int().positive(),
        metrics: z.any().optional(),
        verdict: outcomeVerdict,
        lessonsLearned: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await loadDecisionOwned(ctx.user.id, input.decisionId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const who = ctx.user.email ?? `user:${ctx.user.id}`;
      const [result] = (await db.execute(sql`
        INSERT INTO decision_outcomes
          (decisionId, metrics, verdict, lessonsLearned, reportedBy)
        VALUES
          (${input.decisionId},
           ${input.metrics ? JSON.stringify(input.metrics) : null},
           ${input.verdict}, ${input.lessonsLearned ?? null}, ${who})
      `)) as any;
      return { id: result?.insertId ?? 0 };
    }),

  // Promote approved → stale when the clock runs out. Safe to call anytime;
  // typically triggered by a daily cron.
  markStale: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [result] = (await db.execute(sql`
      UPDATE decisions
      SET status = 'stale'
      WHERE status = 'active' AND staleAt IS NOT NULL AND staleAt < NOW(3)
    `)) as any;
    return { updated: result?.affectedRows ?? 0 };
  }),

  // ─── Step → Decision bridge ───────────────────────────────────────────────
  // Called by the Studio UI each time a step's agent completes and the user
  // accepts the output into draft. Creates a decision + primary option +
  // empty chat thread in one round-trip.
  fromStep: protectedProcedure
    .input(
      z.object({
        brandId: z.number().int().positive(),
        missionId: z.number().int().positive().optional(),
        squadId: z.number().int().positive().optional(),
        decisionType: z.string().min(1).max(64),
        title: z.string().optional(),
        summary: z.string().optional(),
        parentDecisionId: z.number().int().positive().optional(),
        agentId: z.number().int().positive().optional(),
        primaryOption: z
          .object({
            label: z.string(),
            payload: z.any(),
            confidence: z.number().min(0).max(1).optional(),
            reversibility: reversibility.optional(),
            rationale: z.string().optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertBrandOwner(ctx.user.id, input.brandId);
      // Dynamic import to avoid router-level circular deps.
      const { upsertDecisionFromStep } = await import("../_core/decisionBridge");
      const res = await upsertDecisionFromStep({
        brandId: input.brandId,
        missionId: input.missionId ?? null,
        squadId: input.squadId ?? null,
        decisionType: input.decisionType,
        title: input.title,
        summary: input.summary,
        parentDecisionId: input.parentDecisionId ?? null,
        agentId: input.agentId ?? null,
        primaryOption: input.primaryOption,
      });
      return res;
    }),

  // ─── Chat thread (per-decision) ───────────────────────────────────────────
  chatListMessages: protectedProcedure
    .input(
      z.object({
        decisionId: z.number().int().positive(),
        limit: z.number().int().min(1).max(200).default(100),
      })
    )
    .query(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [rows] = (await db.execute(sql`
        SELECT m.id, m.threadId, m.role, m.authorUserId, m.authorAgentId,
               m.mentionUserIds, m.content, m.createdAt
        FROM decision_chat_messages m
        WHERE m.decisionId = ${input.decisionId}
        ORDER BY m.createdAt ASC
        LIMIT ${input.limit}
      `)) as any;
      return Array.isArray(rows) ? rows : [];
    }),

  chatPost: protectedProcedure
    .input(
      z.object({
        decisionId: z.number().int().positive(),
        role: z.enum(["user", "agent", "mention", "system"]).default("user"),
        content: z.string().min(1),
        mentionUserIds: z.array(z.number().int().positive()).optional(),
        authorAgentId: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Ensure thread exists — create if missing (back-fills for decisions
      // predating the chat table).
      const [tRows] = (await db.execute(sql`
        SELECT t.id AS threadId, d.brandId
        FROM decisions d
        LEFT JOIN decision_chat_threads t ON t.decisionId = d.id
        WHERE d.id = ${input.decisionId}
        LIMIT 1
      `)) as any;
      const tr = Array.isArray(tRows) ? tRows[0] : null;
      if (!tr) throw new TRPCError({ code: "NOT_FOUND" });
      await assertBrandOwner(ctx.user.id, tr.brandId);

      let threadId: number = tr.threadId;
      if (!threadId) {
        const [ins] = (await db.execute(sql`
          INSERT INTO decision_chat_threads (decisionId, brandId)
          VALUES (${input.decisionId}, ${tr.brandId})
        `)) as any;
        threadId = Number(ins?.insertId ?? 0);
      }

      const [mRes] = (await db.execute(sql`
        INSERT INTO decision_chat_messages
          (threadId, decisionId, role, authorUserId, authorAgentId,
           mentionUserIds, content)
        VALUES
          (${threadId}, ${input.decisionId}, ${input.role}, ${ctx.user.id},
           ${input.authorAgentId ?? null},
           ${input.mentionUserIds ? JSON.stringify(input.mentionUserIds) : null},
           ${input.content})
      `)) as any;
      return { messageId: Number(mRes?.insertId ?? 0), threadId };
    }),
});

/**
 * Internal helper for other routers/agents to load a decision's full payload
 * (including options + evidence) for use as upstream context. NOT exposed via
 * tRPC directly — callers must have already verified brand ownership.
 */
export async function loadDecisionFull(decisionId: number): Promise<{
  decision: any;
  options: any[];
  evidence: any[];
} | null> {
  const db = await getDb();
  if (!db) return null;
  const [dRows] = (await db.execute(sql`
    SELECT * FROM decisions WHERE id = ${decisionId} LIMIT 1
  `)) as any;
  const d = Array.isArray(dRows) ? dRows[0] : null;
  if (!d) return null;
  const [oRows] = (await db.execute(sql`
    SELECT * FROM decision_options WHERE decisionId = ${decisionId}
    ORDER BY orderIndex ASC, id ASC
  `)) as any;
  const [eRows] = (await db.execute(sql`
    SELECT * FROM decision_evidence WHERE decisionId = ${decisionId}
  `)) as any;
  return {
    decision: d,
    options: Array.isArray(oRows) ? oRows : [],
    evidence: Array.isArray(eRows) ? eRows : [],
  };
}
