/**
 * positioningJobsRouter — fire/poll/notify for the background positioning
 * pipeline. Uses positioningJobRunner under the hood.
 *
 * Endpoints:
 *   start          → fire-and-forget, returns immediately
 *   getStatus      → poll for current step / status
 *   getRecentDone  → for left-bottom NotificationCenter
 *   getCostSummary → user-level cost rollup (positioning + scout)
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  startPositioningJob,
  getPositioningJob,
  getRecentJobCompletions,
} from "../_core/positioningJobRunner";
import {
  buildBrandPositioningSteps,
  buildProductPositioningSteps,
  buildEventPositioningSteps,
} from "../_core/positioningSteps";
import localPool from "../localDb";

const entityKindSchema = z.enum(["brand", "product", "event"]);

async function loadEntity(kind: "brand"|"product"|"event", id: number, userId: number): Promise<{
  name: string; industry?: string; description?: string;
} | null> {
  const table = kind === "brand" ? "brands" : kind === "product" ? "products" : "events";
  const [rows]: any = await localPool.execute(
    `SELECT * FROM \`${table}\` WHERE id = ? AND userId = ? LIMIT 1`,
    [id, userId],
  );
  const row = (rows as any[])[0];
  if (!row) return null;
  // Brand uses brandName / industry / description; product/event use name / category / description
  return {
    name: String(row.brandName ?? row.name ?? ""),
    industry: row.industry ?? row.category ?? undefined,
    description: row.description ?? undefined,
  };
}

export const positioningJobsRouter = router({
  /** Fire the background pipeline. Returns immediately. */
  start: protectedProcedure
    .input(z.object({
      entityKind: entityKindSchema,
      entityId: z.number().int().positive(),
      lang: z.enum(["zh-TW", "en"]).default("zh-TW"),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const ent = await loadEntity(input.entityKind, input.entityId, userId);
      if (!ent) {
        return { ok: false as const, error: `${input.entityKind} not found` };
      }
      const langOpt = { lang: input.lang === "en" ? "en" : "zh-TW" };
      const steps =
        input.entityKind === "brand"   ? buildBrandPositioningSteps(langOpt) :
        input.entityKind === "product" ? buildProductPositioningSteps(langOpt) :
                                         buildEventPositioningSteps(langOpt);
      startPositioningJob({
        userId,
        entityKind: input.entityKind,
        entityId: input.entityId,
        brandName: ent.name,
        industry: ent.industry,
        description: ent.description,
        steps,
      });
      return { ok: true as const, totalSteps: steps.length };
    }),

  /** Poll for live status. */
  getStatus: protectedProcedure
    .input(z.object({
      entityKind: entityKindSchema,
      entityId: z.number().int().positive(),
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      return await getPositioningJob(input.entityKind, input.entityId, userId);
    }),

  /** Recent completions for notification center. */
  getRecentDone: protectedProcedure
    .input(z.object({
      sinceIso: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const since = input.sinceIso
        ? new Date(input.sinceIso).toISOString().slice(0, 19).replace("T", " ")
        : new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");
      return await getRecentJobCompletions(userId, since);
    }),

  /** Total cost spent by user across positioning + scout LLM calls. */
  getCostSummary: protectedProcedure
    .input(z.object({
      sinceIso: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const since = input?.sinceIso
        ? new Date(input.sinceIso).toISOString().slice(0, 19).replace("T", " ")
        : new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");
      try {
        const [rows]: any = await localPool.execute(
          `SELECT kind, COUNT(*) AS calls,
                  SUM(inputTokens) AS inputTokens,
                  SUM(outputTokens) AS outputTokens,
                  SUM(costUsd) AS costUsd
             FROM usage_log
            WHERE userId = ? AND ts > ?
            GROUP BY kind
            ORDER BY costUsd DESC`,
          [userId, since],
        );
        const byKind = (rows as any[]).map(r => ({
          kind: String(r.kind),
          calls: Number(r.calls),
          inputTokens: Number(r.inputTokens || 0),
          outputTokens: Number(r.outputTokens || 0),
          costUsd: Number(r.costUsd || 0),
        }));
        const totalCost = byKind.reduce((s, k) => s + k.costUsd, 0);
        return { byKind, totalCost };
      } catch {
        return { byKind: [], totalCost: 0 };
      }
    }),
});
