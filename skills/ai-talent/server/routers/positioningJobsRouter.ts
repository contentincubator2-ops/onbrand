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
import { getBrandRealContent } from "../_core/brandRealContent";
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

  /**
   * 測試 battery — 6 scenarios in parallel, ~10-15s wall.
   *
   * CJ direction (2026-05-07):
   *   "我覺得你的建議很棒，一次寫六個情境。"
   *
   * Returns six short captions to give the user a quick "is the brand
   * voice on yet?" sanity check before locking. Each scenario uses
   * positioning + knowledge + real FB / website content.
   */
  runTestBattery: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const [brandPrefix, real, knowledgeBlock] = await Promise.all([
        buildBrandPrefix(input.brandId).catch(() => ""),
        getBrandRealContent(input.brandId).catch(() => ({ context: "", hasContent: false, sources: [] as string[] })),
        loadBrandKnowledgeForPrompt(input.brandId).catch(() => ""),
      ]);

      const SCENARIOS = [
        { id: "fb_intro",    icon: "📱", label: "FB 短貼文（介紹主商品）",    ask: "請寫 80-120 字的 Facebook 短貼文，介紹品牌主力商品/服務。口語、有故事感。" },
        { id: "ig_lifestyle",icon: "📷", label: "IG 標題（生活感）",         ask: "請寫一則 30-60 字的 Instagram 標題，生活感、不要硬推銷，可加 1-2 個 emoji。" },
        { id: "service_reply",icon:"💬", label: "客服 / Threads 回覆",       ask: "情境：用戶留言『請問你們地址在哪？平日有開嗎？』。請用 60-100 字回覆，要符合品牌語氣，不要客套到僵化。" },
        { id: "live_open",   icon: "🎬", label: "直播開場 30 秒",            ask: "請寫一段 80-150 字的直播開場稿（30 秒口播），直接開門見山說今天主題 + 為什麼觀眾要留下來看。" },
        { id: "crisis",      icon: "⚠️", label: "危機公關回應",              ask: "情境：有客戶在 FB 公開抱怨服務不好。請寫 80-120 字公開回應，要誠懇、不卸責、說明改善動作。" },
        { id: "edm",         icon: "📧", label: "EDM 主旨 + 第一句",         ask: "請寫 EDM：主旨 1 行（≤ 25 字）+ 開信第一句（≤ 50 字）。要讓人有開信動機，不要寫『親愛的客戶』這種制式套話。" },
      ] as const;

      const sysCommon = `你是品牌文案顧問。繁體中文。
產出規則：
- 必須以下方「品牌真實公開內容」推斷產業 / 受眾，不要用品牌名瞎猜。
- 直接輸出純文字（不要 markdown、不要前綴「貼文：」）。
${brandPrefix}${real.context}${knowledgeBlock}`;

      const results = await Promise.all(SCENARIOS.map(async (s) => {
        try {
          const r = await invokeLLM({
            messages: [
              { role: "system", content: sysCommon },
              { role: "user", content: s.ask },
            ],
            maxTokens: 600,
          });
          const content = r.choices[0]?.message?.content;
          const text = typeof content === "string" ? content.trim() : "";
          const inTok = r.usage?.prompt_tokens ?? 0;
          const outTok = r.usage?.completion_tokens ?? 0;
          try {
            await localPool.execute(
              `INSERT INTO usage_log (userId, entityKind, entityId, kind, model, inputTokens, outputTokens, costUsd)
                    VALUES (?, 'brand', ?, ?, ?, ?, ?, ?)`,
              [userId, input.brandId, `test_battery:${s.id}`, r.model || "anthropic/claude-haiku-4-5", inTok, outTok,
               (inTok * 1.0 + outTok * 5.0) / 1_000_000],
            );
          } catch {/* non-fatal */}
          return { id: s.id, icon: s.icon, label: s.label, caption: text, ok: true as const };
        } catch (e: any) {
          return { id: s.id, icon: s.icon, label: s.label, caption: "", ok: false as const, error: String(e?.message ?? e) };
        }
      }));

      return {
        ok: true as const,
        scenarios: results,
        hasRealContent: real.hasContent,
        sources: real.sources,
      };
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
