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
import { generateInterimPulse } from "../_core/interimQuickPulse";
import { invokeLLM } from "../_core/llm";
import { buildBrandPrefix } from "../_core/brandContext";
import { loadBrandKnowledgeForPrompt } from "./brandKnowledgeRouter";
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

  /**
   * Run interim quick-pulse synchronously (≤ 12s wall). Returns
   * "consumer wants X / competitor lacks Y / brand fills Z" + tagline /
   * USP / differentiators. Used as fallback for Theater + 30s/60s/100s
   * before the full background pipeline finishes. Stays as fallback
   * even after full pipeline completes.
   */
  runInterim: protectedProcedure
    .input(z.object({
      entityKind: entityKindSchema,
      entityId: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const ent = await loadEntity(input.entityKind, input.entityId, userId);
      if (!ent) return { ok: false as const, error: `${input.entityKind} not found` };
      const pulse = await generateInterimPulse({
        userId,
        entityKind: input.entityKind,
        entityId: input.entityId,
        brandName: ent.name,
        industry: ent.industry,
        description: ent.description,
      });
      return { ok: true as const, pulse };
    }),

  /** Read whatever's currently persisted (full or interim) for header
   *  display + Theater fallback. Returns shape compatible with
   *  PositioningResult subset. */
  getCurrent: protectedProcedure
    .input(z.object({
      entityKind: entityKindSchema,
      entityId: z.number().int().positive(),
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const table = input.entityKind === "brand" ? "brands"
                  : input.entityKind === "product" ? "products" : "events";
      const col = input.entityKind === "brand" ? "soworkAnalysis" : "positioning";
      try {
        const [rows]: any = await localPool.execute(
          `SELECT \`${col}\` AS payload FROM \`${table}\` WHERE id = ? AND userId = ? LIMIT 1`,
          [input.entityId, userId],
        );
        const row = (rows as any[])[0];
        if (!row) return null;
        let cur: any = row.payload;
        if (typeof cur === "string") { try { cur = JSON.parse(cur); } catch { cur = {}; } }
        if (!cur) return null;
        const interim = cur._interim ?? null;
        const isFull = !!(cur.executiveSummary || cur.brandActivation || cur.messagingStrategy);
        // Prefer full data; fallback to interim shape
        return {
          source: isFull ? "full" : (interim ? "interim" : "empty"),
          tagline: cur.tagline ?? interim?.tagline ?? "",
          positioning: cur.positioning ?? cur.differentiation?.positioningStatement ?? interim?.positioning ?? "",
          usp: cur.usp ?? cur.differentiation?.uniqueSellingProposition ?? interim?.usp ?? "",
          targetAudience: cur.targetAudience ?? interim?.targetAudience ?? "",
          differentiators: cur.differentiators ?? cur.differentiation?.keyDifferentiators ?? interim?.differentiators ?? [],
          messagingPillars: cur.messagingPillars ?? cur.messagingStrategy?.messagingPillars ?? interim?.messagingPillars ?? [],
          consumerWants: interim?.consumerWants ?? "",
          competitorLacks: interim?.competitorLacks ?? "",
          brandFills: interim?.brandFills ?? "",
          interim,
        };
      } catch {
        return null;
      }
    }),

  /**
   * Inline 測試 sandbox — used by BrandMessageBar's 🧪 測試 button.
   * Takes brandId + a short topic prompt, runs ONE Haiku call with the
   * brand's current positioning + uploaded knowledge injected, returns
   * a single caption draft. Wall ≤ 8s. Cost logged as kind=test_sandbox.
   */
  testCaption: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      topic: z.string().min(1).max(280),
      platform: z.enum(["facebook", "instagram", "youtube", "tiktok", "linkedin", "email"]).default("facebook"),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const [brandPrefix, knowledgeBlock] = await Promise.all([
        buildBrandPrefix(input.brandId).catch(() => ""),
        loadBrandKnowledgeForPrompt(input.brandId).catch(() => ""),
      ]);
      const sys = `你是台灣本地市場的社群文案，繁體中文。
為以下品牌寫一則 ${input.platform.toUpperCase()} 貼文（120-180 字），口語自然、不要套話、不要寫「祝大家...」。
直接輸出貼文純文字，不要前綴、不要 markdown。
${brandPrefix || ""}${knowledgeBlock || ""}`;
      const userPrompt = `主題：${input.topic}`;
      try {
        const r = await invokeLLM({
          messages: [{ role: "system", content: sys }, { role: "user", content: userPrompt }],
          maxTokens: 600,
        });
        const content = r.choices[0]?.message?.content;
        const text = typeof content === "string" ? content.trim() : "";
        const inTok  = r.usage?.prompt_tokens ?? 0;
        const outTok = r.usage?.completion_tokens ?? 0;
        try {
          await localPool.execute(
            `INSERT INTO usage_log (userId, entityKind, entityId, kind, model, inputTokens, outputTokens, costUsd)
                  VALUES (?, 'brand', ?, 'test_sandbox', ?, ?, ?, ?)`,
            [userId, input.brandId, r.model || "anthropic/claude-haiku-4-5", inTok, outTok,
             (inTok * 1.0 + outTok * 5.0) / 1_000_000],
          );
        } catch {/* non-fatal */}
        return {
          ok: true as const,
          caption: text,
          hasKnowledge: knowledgeBlock.length > 0,
          hasPositioning: brandPrefix.length > 0,
        };
      } catch (e: any) {
        return { ok: false as const, error: String(e?.message ?? e) };
      }
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
