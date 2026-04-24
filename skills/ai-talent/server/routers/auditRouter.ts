/**
 * auditRouter — wraps AuditAgent for the publish gate.
 *
 * Flow: generate → preview.score(draft, channel, upstreamDecisionIds[])
 *                → (human confirms) → publish
 *
 * If a downstream decision id is provided, the audit result is persisted
 * onto that row (auditScore + auditedAt) so the Strategy Deck can show the
 * last-known audit verdict on the card.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { runAuditAgent, type UpstreamDecision } from "../_core/auditAgent";
import { loadDecisionFull } from "./decisionRouter";

const channel = z.enum(["fb", "ig", "linkedin", "youtube", "pr", "generic"]);

async function assertBrandOwner(userId: number, brandId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const [rows] = (await db.execute(sql`
    SELECT id FROM brands WHERE id = ${brandId} AND userId = ${userId} LIMIT 1
  `)) as any;
  if (!rows?.length)
    throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found" });
}

async function fetchUpstreamChain(
  decisionIds: number[]
): Promise<UpstreamDecision[]> {
  const out: UpstreamDecision[] = [];
  for (const id of decisionIds) {
    const full = await loadDecisionFull(id);
    if (!full) continue;
    const d = full.decision;
    // Prefer the recommended option's payload if available
    const rec = full.options.find((o: any) => o.id === d.recommendedOptionId);
    out.push({
      decisionType: d.decisionType,
      title: d.title ?? undefined,
      summary: d.summary ?? undefined,
      payload: rec?.payload ?? d.payload ?? null,
    });
  }
  return out;
}

export const auditRouter = router({
  // Score a draft against the upstream decision chain.
  // Does NOT persist anything unless `downstreamDecisionId` is given.
  score: protectedProcedure
    .input(
      z.object({
        brandId: z.number().int().positive(),
        draftContent: z.string().min(1),
        channel,
        upstreamDecisionIds: z.array(z.number().int().positive()).default([]),
        downstreamDecisionId: z.number().int().positive().optional(),
        brandName: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertBrandOwner(ctx.user.id, input.brandId);

      const upstream = await fetchUpstreamChain(input.upstreamDecisionIds);
      const result = await runAuditAgent({
        draftContent: input.draftContent,
        channel: input.channel,
        upstream,
        brandName: input.brandName,
      });

      if (input.downstreamDecisionId) {
        const db = await getDb();
        if (db) {
          await db.execute(sql`
            UPDATE decisions
            SET auditScore = ${result.score},
                auditedAt  = CURRENT_TIMESTAMP(3)
            WHERE id = ${input.downstreamDecisionId}
          `);
        }
      }

      return result;
    }),

  // Read last audit snapshot off a decision row (no re-scoring).
  lastScore: protectedProcedure
    .input(z.object({ decisionId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [rows] = (await db.execute(sql`
        SELECT id, auditScore, auditedAt
        FROM decisions WHERE id = ${input.decisionId} LIMIT 1
      `)) as any;
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return {
        decisionId: row.id,
        score: row.auditScore ?? null,
        auditedAt: row.auditedAt ?? null,
      };
    }),
});
