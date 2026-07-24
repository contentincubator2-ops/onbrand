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
  finalizeBrandAfterPipeline,
} from "../_core/positioningJobRunner";
import {
  buildBrandPositioningSteps,
  buildProductPositioningSteps,
  buildEventPositioningSteps,
} from "../_core/positioningSteps";
import { generateInterimPulse } from "../_core/interimQuickPulse";
import { loadBrandFullContext } from "../_core/brandFullContext";
import { invokeLLM } from "../_core/llm";
import { buildBrandPrefix } from "../_core/brandContext";
import { getBrandRealContent } from "../_core/brandRealContent";
import { loadBrandKnowledgeForPrompt } from "./brandKnowledgeRouter";
import localPool from "../localDb";

const entityKindSchema = z.enum(["brand", "product", "event"]);

async function loadEntity(kind: "brand"|"product"|"event", id: number, userId: number): Promise<{
  name: string; industry?: string; description?: string; outputLanguage?: string;
} | null> {
  const table = kind === "brand" ? "brands" : kind === "product" ? "products" : "events";
  const [rows]: any = await localPool.execute(
    `SELECT * FROM \`${table}\` WHERE id = ? AND userId = ? LIMIT 1`,
    [id, userId],
  );
  const row = (rows as any[])[0];
  if (!row) return null;
  // 2026-07-17 多市場: brand carries outputLanguage itself; product/event
  // inherit the parent brand's. Drives the positioning report language.
  let outputLanguage: string | undefined = row.outputLanguage ?? undefined;
  if (kind !== "brand" && !outputLanguage && row.brandId) {
    try {
      const [br]: any = await localPool.execute(
        `SELECT outputLanguage FROM brands WHERE id = ? LIMIT 1`, [row.brandId]);
      outputLanguage = (br as any[])[0]?.outputLanguage ?? undefined;
    } catch { /* non-fatal */ }
  }
  // Brand uses brandName / industry / description; product/event use name / category / description
  // 2026-07-24 (CJ「產品按重新定位沒反應」root-cause sweep): products have no
  // description COLUMN — it lives inside positioning JSON ($.description,
  // written by discovery/seeding). Without it the re-run pipeline was
  // grounded on the bare name only. Fall back to the JSON value.
  let description: string | undefined = row.description ?? undefined;
  if (!description && row.positioning != null) {
    try {
      const pos = typeof row.positioning === "string" ? JSON.parse(row.positioning) : row.positioning;
      const d = pos?.description ?? pos?._interim?.description;
      if (typeof d === "string" && d.trim()) description = d.trim();
    } catch { /* non-fatal */ }
  }
  return {
    name: String(row.brandName ?? row.name ?? ""),
    industry: row.industry ?? row.category ?? undefined,
    description,
    outputLanguage,
  };
}

export const positioningJobsRouter = router({
  /** Fire the background pipeline. Returns immediately. */
  start: protectedProcedure
    .input(z.object({
      entityKind: entityKindSchema,
      // 2026-05-09: accept 0 (placeholder when brandId not yet loaded)
      // and short-circuit in resolver. Was .positive() which threw
      // Zod errors during initial mount before enabled guard kicked in.
      entityId: z.number().int().min(0),
      lang: z.enum(["zh-TW", "en"]).default("zh-TW"),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.entityId === 0) return { ok: false as const, error: "no entity selected" };
      const userId = ctx.user!.id;
      const ent = await loadEntity(input.entityKind, input.entityId, userId);
      if (!ent) {
        return { ok: false as const, error: `${input.entityKind} not found` };
      }
      // 2026-07-17 多市場: 品牌的 outputLanguage 優先於 client 傳的 lang
      // （client 全部硬寫 zh-TW；伺服器從品牌列推導才是正解）。
      const langOpt = { lang: input.lang === "en" ? "en" : "zh-TW", outputLanguage: ent.outputLanguage };
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
      // 2026-05-09: accept 0 (placeholder when brandId not yet loaded)
      // and short-circuit in resolver. Was .positive() which threw
      // Zod errors during initial mount before enabled guard kicked in.
      entityId: z.number().int().min(0),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.entityId === 0) return { ok: false as const, error: "no entity selected" };
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
      // 2026-05-09: accept 0 (placeholder when brandId not yet loaded)
      // and short-circuit in resolver. Was .positive() which threw
      // Zod errors during initial mount before enabled guard kicked in.
      entityId: z.number().int().min(0),
    }))
    .query(async ({ ctx, input }) => {
      if (input.entityId === 0) return null;
      const userId = ctx.user!.id;
      const table = input.entityKind === "brand" ? "brands"
                  : input.entityKind === "product" ? "products" : "events";
      // 2026-05-17: brand now uses the canonical `positioning` column too.
      const col = "positioning";
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
        // Read the canonical positioning.<segment> shape (positioningSchema.ts).
        // Check any pipeline output key — brand uses goldenCircle/differentiation/tagline/voice,
        // product uses marketFit/targetUser/valueProp/productMessaging/gtmSummary,
        // event uses smp/eventBackground/targetAudience. A non-empty segment in any
        // pipeline means the full pass has run.
        // Segment IDs must match positioningSchema.ts exactly.
        // BUG-5 fix (2026-05-28): old PRODUCT_KEYS / EVENT_KEYS used stale
        // pipeline output names that never matched the DB shape, so products
        // and events always returned source:"interim" even when fully positioned.
        const BRAND_KEYS   = ["goldenCircle", "tagline", "taglineScore", "origin", "values", "audience", "competition", "differentiation", "trends", "voice"];
        const PRODUCT_KEYS = ["core", "audience", "value", "competition", "strategy", "marketing"];
        const EVENT_KEYS   = ["brief", "context", "audience", "objectives", "awards", "smp", "messaging", "creative", "guidelines", "channels", "journey"];
        const ALL_SEGMENT_KEYS = [...BRAND_KEYS, ...PRODUCT_KEYS, ...EVENT_KEYS];
        const isFull = ALL_SEGMENT_KEYS.some(k => {
          const v = cur[k];
          if (!v || typeof v !== "object") return false;
          return Object.values(v).some(fv =>
            (typeof fv === "string" && fv.trim().length > 0) ||
            (Array.isArray(fv) && fv.length > 0),
          );
        });
        const diffs = Array.isArray(cur.differentiation)
          ? cur.differentiation
          : [cur.differentiation?.emotional, cur.differentiation?.functional].filter(Boolean);
        return {
          source: isFull ? "full" : (interim ? "interim" : "empty"),
          // tagline:  brand → tagline.zhTagline/enTagline
          //           product → core.zhTagline/enTagline
          //           event → messaging.coreMessage / smp.singleMindedProposition
          tagline: cur.tagline?.zhTagline ?? cur.tagline?.enTagline
                ?? cur.core?.zhTagline ?? cur.core?.enTagline
                ?? cur.messaging?.coreMessage ?? cur.smp?.singleMindedProposition
                ?? interim?.tagline ?? "",
          // positioning: brand → differentiation.summary / goldenCircle.why
          //              product → core.coreStatement / strategy.positioning
          //              event → smp.singleMindedProposition / context.coreProblem
          positioning: cur.differentiation?.summary ?? cur.goldenCircle?.why
                    ?? cur.core?.coreStatement ?? cur.strategy?.positioning
                    ?? cur.smp?.singleMindedProposition ?? cur.context?.coreProblem
                    ?? interim?.positioning ?? "",
          // usp: brand → differentiation.summary / differentiation.functional
          //      product → competition.uniqueUsp / core.oneLineValueProp
          //      event → messaging.coreMessage / smp.singleMindedProposition
          usp: cur.differentiation?.summary ?? cur.differentiation?.functional
             ?? cur.competition?.uniqueUsp ?? cur.core?.oneLineValueProp
             ?? cur.messaging?.coreMessage
             ?? interim?.usp ?? "",
          // targetAudience: brand/product → audience.primary
          //                 event → audience.primaryAudience
          targetAudience: cur.audience?.primary ?? cur.audience?.primaryAudience
                       ?? interim?.targetAudience ?? "",
          differentiators: diffs.length ? diffs : (interim?.differentiators ?? []),
          messagingPillars: interim?.messagingPillars ?? [],
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
      // CJ 2026-05-07: scan EVERYTHING under this brandId — positioning,
      // 文字 assets, 視覺 assets, knowledge, interim, AI 指令 (FB only
      // for this test). Plus real public content (官網/FB) when reachable.
      const [fullCtx, real, knowledgeBlock] = await Promise.all([
        loadBrandFullContext(input.brandId, { platformFilter: "facebook" }).catch(() => ({ block: "", hasFullPositioning: false, hasInterim: false, hasTextAssets: false, hasVisualAssets: false, hasAIPrompts: {} as Record<string, boolean> })),
        getBrandRealContent(input.brandId).catch(() => ({ context: "", hasContent: false, sources: [] as string[] })),
        loadBrandKnowledgeForPrompt(input.brandId).catch(() => ""),
      ]);

      // CJ 2026-05-07: simplified to 3 FB scenarios — covers most of the
      // common copy work without the noise of 6 different formats. User
      // can re-test with new positioning and immediately see whether
      // tone/industry inference is on.
      const SCENARIOS = [
        { id: "fb_intro",    icon: "📱", label: "FB 短貼文（介紹主商品）",    ask: "請寫 80-120 字的 Facebook 短貼文，介紹品牌主力商品/服務。口語、有故事感、不要套話。" },
        { id: "fb_event",    icon: "🎉", label: "FB 活動 / 優惠 貼文",        ask: "情境：品牌正在做一檔限定活動（自行設定一個合理的活動主題）。請寫 100-150 字的 FB 貼文，有具體優惠內容、清楚 CTA、不要寫『歡迎大家來』這種空話。" },
        { id: "fb_story",    icon: "💬", label: "FB 品牌故事 / 心情文",      ask: "請寫 120-180 字的 Facebook 品牌故事貼文，從一個小場景切入（用戶 / 同事 / 創辦人視角），自然帶出品牌主張，不要寫得像新聞稿。" },
      ] as const;

      // 2026-05-07: grounding chain (in priority order):
      //   real public content → full positioning → interim positioning
      //   → text/visual/AI assets → brand description → industry knowledge.
      // Always produce a draft, never refuse with "please provide content".
      const groundingHint =
        real.hasContent
          ? "下方有品牌的官網 / 社群實際內容 — 以該內容為準推斷產業 / 受眾 / 語氣。"
        : fullCtx.hasFullPositioning
          ? "下方有品牌的完整定位 — 以該定位為準（USP / 差異化 / 訊息支柱）撰寫。"
        : fullCtx.hasInterim
          ? "下方有臨時定位（消費者想要 X / 競品給不了 Y / 品牌補上 Z）— **以這份臨時定位撰寫**，把『品牌補上的價值』講成具體的產品 / 服務體驗。"
          : "下方資料有限，請根據品牌名 + 描述 + 產業常識合理推斷直接寫，不要回拒『請提供更多資料』。";

      const sysCommon = `你是資深品牌文案。繁體中文。

【產出原則】
1. ${groundingHint}
2. 必須遵守下方「文字資產」中的禁用詞 / 推薦用詞 / 替換對照（如有）。
3. 必須採用下方「AI 指令庫 · facebook · 文字指令」中的口吻規則（如有）。
4. 直接輸出純文字貼文（不要 markdown、不要前綴「貼文：」、不要解釋為什麼這樣寫）。
5. 不要寫「祝大家 X 快樂」「親愛的客戶」這種僵化套話。
${fullCtx.block}${real.context}${knowledgeBlock}`;

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

  /**
   * 2026-05-15 (CJ「自動定位流程要跑完，資料要填完，自己修正後自己驗收」):
   * Verify a brand's auto-positioning state and self-heal if needed.
   *
   * Returns a checklist of what's filled + auto-runs finalizeBrandAfterPipeline
   * if the pipeline finished (positioning_jobs.status='done') but the brand
   * was never marked completed (the headline gap before this patch).
   *
   * Idempotent — safe to call any time. Frontend can use this as a
   * "verify auto-positioning" button on the brand details page.
   */
  verifyAndFinalize: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      // 1. Snapshot current state
      const [brandRows]: any = await localPool.execute(
        `SELECT id, name, brandName, positioningStatus, onboardingStep, isEstimate,
                tagline, valueProposition, targetMarket, audienceA, audienceB,
                emotionalDiff, functionalDiff,
                positioning
           FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
        [input.brandId, userId],
      );
      const brand = (brandRows as any[])[0];
      if (!brand) return { ok: false as const, error: "brand not found" };

      const [jobRows]: any = await localPool.execute(
        `SELECT status, currentStep, totalSteps, lastError, startedAt, finishedAt
           FROM positioning_jobs
          WHERE userId = ? AND entityKind = 'brand' AND entityId = ?
          ORDER BY id DESC LIMIT 1`,
        [userId, input.brandId],
      );
      const job = (jobRows as any[])[0] ?? null;

      // 2. Decide what to do
      const jobDone = job?.status === "done";
      const brandFinalized = brand.positioningStatus === "completed";

      let action: "none" | "finalized" | "stuck" | "no-job" = "none";
      let finalizeResult: any = null;
      if (jobDone && !brandFinalized) {
        finalizeResult = await finalizeBrandAfterPipeline(userId, input.brandId);
        action = "finalized";
      } else if (!job) {
        action = "no-job";
      } else if (!jobDone && job.status !== "running") {
        action = "stuck";
      }

      // 3. Re-snapshot after any finalize
      const [after]: any = action === "finalized"
        ? await localPool.execute(
            `SELECT positioningStatus, onboardingStep, isEstimate,
                    tagline, valueProposition, targetMarket, audienceA, audienceB,
                    emotionalDiff, functionalDiff
               FROM brands WHERE id = ? LIMIT 1`,
            [input.brandId],
          )
        : [[brand]];
      const cur = (after as any[])[0] ?? brand;

      const fieldStatus = {
        tagline:          !!(cur.tagline?.toString().trim()),
        valueProposition: !!(cur.valueProposition?.toString().trim()),
        targetMarket:     !!(cur.targetMarket?.toString().trim()),
        audienceA:        !!(cur.audienceA?.toString().trim()),
        audienceB:        !!(cur.audienceB?.toString().trim()),
        emotionalDiff:    !!(cur.emotionalDiff?.toString().trim()),
        functionalDiff:   !!(cur.functionalDiff?.toString().trim()),
      };
      const filledCount = Object.values(fieldStatus).filter(Boolean).length;

      return {
        ok: true as const,
        action,
        job: job ? {
          status: job.status,
          currentStep: Number(job.currentStep ?? 0),
          totalSteps: Number(job.totalSteps ?? 10),
          lastError: job.lastError ?? null,
          startedAt: job.startedAt,
          finishedAt: job.finishedAt,
        } : null,
        brand: {
          id: brand.id,
          name: brand.brandName ?? brand.name,
          positioningStatus: cur.positioningStatus,
          onboardingStep: cur.onboardingStep,
          isEstimate: cur.isEstimate,
        },
        fieldStatus,
        filledCount,
        readyToUse: cur.positioningStatus === "completed" && filledCount >= 4,
        finalizeResult,
      };
    }),

  /** Poll for live status. */
  getStatus: protectedProcedure
    .input(z.object({
      entityKind: entityKindSchema,
      // 2026-05-09: accept 0 (placeholder when brandId not yet loaded)
      // and short-circuit in resolver. Was .positive() which threw
      // Zod errors during initial mount before enabled guard kicked in.
      entityId: z.number().int().min(0),
    }))
    .query(async ({ ctx, input }) => {
      if (input.entityId === 0) return null;
      const userId = ctx.user!.id;
      return await getPositioningJob(input.entityKind, input.entityId, userId);
    }),

  /** 2026-07-24 (CJ「產品按重新定位沒反應」): batch job status for the
   *  product/event card grids — one query per grid instead of a hook per
   *  card, so the UI can show 定位中 x/y and refresh on completion. */
  getStatusBatch: protectedProcedure
    .input(z.object({
      entityKind: entityKindSchema,
      // 2026-07-24 (CJ「載入失敗：Array must contain at least 1 element」):
      // react-query can emit one request during the enabled=false boundary
      // when the running set empties — accept the empty array and return []
      // instead of a Zod error the UI surfaces as a scary 載入失敗.
      entityIds: z.array(z.number().int().positive()).max(50),
    }))
    .query(async ({ ctx, input }) => {
      if (input.entityIds.length === 0) return [];
      const userId = ctx.user!.id;
      const ph = input.entityIds.map(() => "?").join(",");
      const [rows]: any = await localPool.execute(
        `SELECT pj.entityId, pj.status, pj.currentStep, pj.totalSteps
           FROM positioning_jobs pj
          WHERE pj.userId = ? AND pj.entityKind = ? AND pj.entityId IN (${ph})
            AND pj.id IN (SELECT MAX(id) FROM positioning_jobs
                           WHERE userId = ? AND entityKind = ? AND entityId IN (${ph})
                           GROUP BY entityId)`,
        [userId, input.entityKind, ...input.entityIds, userId, input.entityKind, ...input.entityIds],
      );
      return (rows as any[]).map((r) => ({
        entityId: Number(r.entityId),
        status: String(r.status),
        currentStep: Number(r.currentStep ?? 0),
        totalSteps: Number(r.totalSteps ?? 0),
      }));
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
