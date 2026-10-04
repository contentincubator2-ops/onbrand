/**
 * 執行任務：單篇／套組／企劃的編排、快速執行與重生版本。
 */
import { protectedProcedure } from "../../../platform/core/trpc";
import { z } from "zod";
import { normalizeTaskId } from "../../../platform/core/tierCompat";
import { TASKS, fillTemplate, CAMPAIGN_ITEM_INPUT } from "./taskDefs";
import { buildBrandPrefix as buildBrandContext } from "../../../strategy/core/brand/brandContext";
import { roleChannelOfTaskId } from "../../../strategy/core/brand/channelRoles";
import { buildPriorContext, callWithFallback, tryParseJson, gateInfoFor, resolveAudienceTag } from "./helpers";
import { resolveTaskOrThrow, resolveTaskTemplate } from "../../core/catalog/taskRegistry";
import { assertTaskAllowed } from "../../../platform/core/billing/planGate";
import { assertIntakeComplete } from "../../core/catalog/taskIntake";
import { templateNeedsViralSource, checkViralSource, VIRAL_SOURCE_KEY, platformLabelOf } from "../../core/engine/viralSourceGuard";
import { TRPCError } from "@trpc/server";
import { loadCampaignItem } from "../../core/campaign/campaignItemBrief";
import localPool from "../../../localDb";
import { withAgentKnowledge, loadAgentKnowledge } from "../../../platform/core/agents/agentKnowledge";
import { findFirstUrl, fetchUrlSummary, formatUrlSummaryForPrompt } from "../../../platform/core/web/urlContext";
import { quickTaskOutputSpec, parseQuickTaskOutput, type QuickTaskOutput } from "../../core/engine/quickTaskOutput";
import { ContentKindSchema } from "../../core/engine/outputContentEnvelope";
import { selectRegenerationTarget, assertGenericRegenerationAllowed, preserveExistingVariantImage, replaceRegeneratedContent } from "../../core/engine/quickTaskRegenerateContent";
import { get99Template } from "../../core/catalog/quickTask100";
import { getFB60Template } from "../../core/catalog/quickTaskFB60";
import { getIG60Template } from "../../core/catalog/quickTaskIG60";
import { getYT60Template } from "../../core/catalog/quickTaskYT60";
import { getMulti60Template } from "../../core/catalog/quickTaskMulti60";
import { englishFromRow } from "../../../platform/core/agents/agentEnglish";

const RUN_KEY = z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/).optional();

/** Register a cancellable run right after its points were charged. */
async function beginCancellableRun(runKey: string | undefined, userId: number, action: "task_30s" | "task_60s" | "task_99s") {
  if (!runKey) return {};
  const { registerRun } = await import("../../../platform/core/llm/runCancel");
  const { costOf } = await import("../../../platform/core/billing/pointsService");
  const controller = registerRun(runKey, userId, { action, points: costOf(action) });
  return { signal: controller.signal, runKey };
}

function unregisterRunKey(runKey: string | undefined) {
  if (!runKey) return;
  void import("../../../platform/core/llm/runCancel").then((m) => m.unregisterRun(runKey)).catch(() => {});
}

export const runProcedures = {
  /**
   * Stop a running task. The run stops issuing LLM / image calls at the next
   * call boundary and writes no output; points are refunded if no output had
   * been delivered yet (see cancelRefund.ts).
   */
  cancelRun: protectedProcedure
    .input(z.object({ runKey: z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/) }))
    .mutation(async ({ ctx, input }) => {
      const { cancelRunAndRefund } = await import("../../../platform/core/billing/cancelRefund");
      return cancelRunAndRefund(input.runKey, ctx.user!.id);
    }),

  runAgent: protectedProcedure
    .input(
      z.object({
        taskId: z.string(),
        stageId: z.string(),
        agentId: z.string(),
        inputs: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
        brandId: z.number().optional(),
        prior: z.array(z.object({
          stageLabel: z.string(),
          agentName: z.string(),
          agentRole: z.string(),
          output: z.string(),
        })).optional(),
      })
    )
    .mutation(async ({ input }) => {
      input = { ...input, taskId: normalizeTaskId(input.taskId) }; // 100s→99s compat
      const def = TASKS[input.taskId];
      if (!def) throw new Error(`Unknown taskId: ${input.taskId}`);
      const stage = def.stages.find((s) => s.id === input.stageId);
      if (!stage) throw new Error(`Unknown stageId: ${input.stageId}`);
      const agent = stage.agents.find((a) => a.id === input.agentId);
      if (!agent) throw new Error(`Unknown agentId: ${input.agentId}`);

      // 2026-10-03：讀該任務所在平台的「通路角色」。
      const brandPrefix = await buildBrandContext(input.brandId, null, null, "full", roleChannelOfTaskId(input.taskId));
      const priorContext = buildPriorContext(input.prior ?? []);
      const filledUser = fillTemplate(agent.userTemplate, input.inputs ?? {});
      const userMsg = priorContext + (priorContext ? "\n\n[原始企劃摘要]\n" : "") + filledUser;

      const messages = [
        { role: "system" as const, content: agent.system + brandPrefix },
        { role: "user" as const, content: userMsg },
      ];

      const startedAt = Date.now();
      const result = await callWithFallback(messages, agent.preferredProvider);
      const tookMs = Date.now() - startedAt;

      const isFinalStructured =
        !!stage.isOrchestrator &&
        (def.finalKind === "swot" ||
         def.finalKind === "persona-card" ||
         def.finalKind === "swatches" ||
         def.finalKind === "name-cards");

      return {
        taskId: def.id,
        stageId: stage.id,
        stageLabel: stage.label,
        agentId: agent.id,
        agentName: agent.name,
        agentRole: agent.role,
        agentSkill: agent.skill,
        agentAvatar: agent.avatar,
        agentTone: agent.tone,
        output: result.content,
        structured: isFinalStructured ? tryParseJson(result.content) : null,
        provider: result.provider,
        model: result.model,
        fellBack: result.fellBack,
        tookMs,
        brandInjected: brandPrefix.length > 0,
      };
    }),

  // runQuick: execute a 30s or 60s FB task with a single LLM call.
  // Returns canonical QuickTaskOutput (see quickTaskOutput.ts). For 90s
  // tasks, frontend should call squad.stepExecute (existing pipeline).
  // ── Plan B 20s orchestra (2026-05-05) ──────────────────────────────
  // Parallel fanout: caption_writer + image_director + N×Flux Schnell.
  // Returns OrchestraResult — variants[] each with {caption, image:{url,status}}.
  // 20s hard budget; per-image 7s; degrades gracefully (timeout chips).
  // 60s tier — same task pool as 30s, but orchestra scales: 5 variants +
  // QA reviewer (Jordan Hayes) + 50s budget. User sees richer output.
  runOrchestra60: protectedProcedure
    .input(z.object({
      taskId: z.string().min(1).max(64),
      inputs: z.record(z.string(), z.string()).default({}),
      brandId: z.number().optional(),
      productId: z.number().optional().nullable(),
      eventId: z.number().optional().nullable(),
      // 2026-05-14 (CJ Bug#2「60s 任務 3/4 持續 502」): 60s tier orchestra
      // sometimes runs past nginx's 60s upstream timeout → 502 even when
      // the backend is still working. Same async-checkpoint pattern as
      // runOrchestra99 fixes this: return after captions+briefs (~30s),
      // run image gen + extras + QA in background, UI polls until done.
      // 2026-08-11: workbench sweet-spot reference for audience attribution.
      spotRef: z.object({
        scenarioId: z.string().min(1).max(40),
        spotIndex: z.number().int().min(0).max(7),
      }).optional().nullable(),
      // 2026-09-30：從活動企劃寫某一篇（見 strategy/core/campaignItemBrief.ts）。
      campaignItem: CAMPAIGN_ITEM_INPUT,
      /** Client-generated id so cancelRun can stop this run. */
      runKey: RUN_KEY,
      asyncMode: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      input = { ...input, taskId: normalizeTaskId(input.taskId) }; // 100s→99s compat
      const userId = ctx.user!.id;
      const scope = { productId: input.productId ?? null, eventId: input.eventId ?? null };

      const resolved = await resolveTaskOrThrow(input.taskId);
      // 2026-09-07 執行層方案閘門：列表看不到不等於不能用。
      await assertTaskAllowed({
        userId: ctx.user!.id,
        brandId: (input as any).brandId ?? null,
        info: gateInfoFor(input.taskId),
      });
      const template: any = resolved.template;
      // let：下面那條 60s 的中央規則會就地換掉 config（holdForImages / 版本數）。
      let config: any = resolved.config;

      // ── Input validation — BEFORE the cost guard / points deduction ──────
      // 2026-08-23 (CJ「tt-60-viral-rewrite 沒給爆款連結或主題時要出現錯誤提醒」):
      // 爆款改寫任務的交付物就是「借用某一支既有爆款的結構」。沒有來源時
      // orchestra 照跑，模型會自己編一支不存在的爆款去拆解 —— 用戶拿到的
      // 東西看起來完整但毫無依據。空白、敷衍字、太簡略的答案都擋在這裡。
      // 擺在扣點之前：被擋下來的請求一點都不扣。
      //
      // 2026-09-02：通用 required 檢查開回來了。它原本關著是因為 intake 只送
      // primary_input 一格，而 fb-60-launch-kit / fb-60-countdown-5day /
      // fb-60-link-full / fb-60-live-suite / ig-60-countdown-5day 宣告了
      // primary 以外的 required 欄位 —— 開了會把它們全部擋死。現在 modal 會
      // 照 taskIntake.intakeExtraFields 把那些欄位渲染出來，驗證範圍等於 UI
      // 範圍，不可能再出現「必填但沒地方填」。
      assertIntakeComplete(template, input.inputs);
      if (templateNeedsViralSource(template)) {
        const viral = checkViralSource(input.inputs[VIRAL_SOURCE_KEY], {
          platformLabel: platformLabelOf(template),
        });
        if (!viral.ok) throw new TRPCError({ code: "BAD_REQUEST", message: viral.message.zh });
      }

      // P0-D pre-flight cost guard
      const { preflightCostCheck } = await import("../../../platform/core/llm/llmWithBilling");
      const guard60 = await preflightCostCheck(userId);
      if (!guard60.ok) throw new TRPCError({ code: "FORBIDDEN", message: guard60.reason });
      // 2026-05-14: points-based gating (1 pt = 1 second of task compute)
      const { assertPoints, deductPoints } = await import("../../../platform/core/billing/pointsService");
      await assertPoints(userId, "task_60s");
      await deductPoints(userId, "task_60s", { kind: "task", id: null });
      const cancelCtx = await beginCancellableRun(input.runKey, userId, "task_60s");
      const { runOrchestra } = await import("../../core/engine/quickTaskOrchestra");

      // 2026-05-18 (CJ「所有 60s 任務都要：圖完成才展示，非套組降到 2 版」):
      // every 60s task generates images and promised a "complete post".
      // Apply one central rule instead of hand-editing ~47 configs:
      //  - holdForImages=true (UI stays in countdown modal until images done)
      //  - alternative-version tasks (NOT multi-post packs) → clamp to 2
      //    versions so copy+image both finish in the 60s budget.
      //  - multi-post packs (postsCount / postLabels define the deliverable,
      //    e.g. 5-day countdown, launch kit, suites) keep their piece count.
      // Shallow-copy so we never mutate the shared *_60S_ORCHESTRA object.
      if (config && config.runImageGen && (config.images ?? 0) > 0) {
        const isPack = !!(config.extras?.postsCount || (config.postLabels && config.postLabels.length > 0));
        config = {
          ...config,
          holdForImages: true,
          ...(isPack ? {} : {
            variants: Math.min(config.variants ?? 2, 2),
            images: Math.min(config.images ?? 2, 2),
          }),
        };
      }

      const baseArgs = { template, config, inputs: input.inputs, brandId: input.brandId, ...scope, userId, tier: "60s" as const,
        audienceTag: await resolveAudienceTag(userId, input.brandId, input.spotRef),
        campaignItem: input.campaignItem ? await loadCampaignItem(input.campaignItem, userId) : null, ...cancelCtx };

      if (!input.asyncMode) {
        return runOrchestra(baseArgs).finally(() => unregisterRunKey(input.runKey));
      }

      // ── Async path (same as runOrchestra99) ──────────────────────
      let resolvePartial!: (p: any) => void;
      let rejectPartial!: (e: any) => void;
      const partialPromise = new Promise<any>((resolve, reject) => {
        resolvePartial = resolve;
        rejectPartial = reject;
      });
      let checkpointFired = false;
      let capturedOutputId: number | null = null;

      runOrchestra({
        ...baseArgs,
        onCheckpoint: (partial) => {
          checkpointFired = true;
          capturedOutputId = (partial as any).outputId ?? null;
          resolvePartial(partial);
        },
      })
        .then((full) => {
          if (!checkpointFired) resolvePartial(full);
        })
        .catch(async (err) => {
          console.error("[runOrchestra60 async tail] failed:", (err as Error)?.message);
          if (checkpointFired && capturedOutputId) {
            try {
              const { finaliseTaskRun } = await import("../../../platform/core/ops/recordTaskRun");
              await finaliseTaskRun({
                outputId: capturedOutputId,
                progress: "failed",
                progressDetail: String((err as Error)?.message ?? err).slice(0, 1000),
              });
            } catch (e2) {
              console.error("[runOrchestra60 async tail] mark failed also failed:", e2);
            }
          } else if (!checkpointFired) {
            rejectPartial(err);
          }
        })
        .finally(() => unregisterRunKey(input.runKey));

      return await partialPromise;
    }),

  // 100s tier — research-validated (scout) + video-where-applicable.
  // Uses same 60s production-package task pool; orchestra adds scout stage
  // automatically when tier="99s". Falls through to 30s pool for legacy.
  runOrchestra99: protectedProcedure
    .input(z.object({
      taskId: z.string().min(1).max(64),
      inputs: z.record(z.string(), z.string()).default({}),
      brandId: z.number().optional(),
      productId: z.number().optional().nullable(),
      eventId: z.number().optional().nullable(),
      // 2026-05-14 (CJ「先回 caption + brief、image 跟 QA 變 async polling」):
      // When true, return after captions+briefs (~30-45s) with progress=
      // 'caption_ready'. The full orchestra continues in background and
      // UPDATEs the same mission_outputs row. Frontend polls
      // output.getById until progress='done' or 'failed'.
      // 2026-08-11: workbench sweet-spot reference for audience attribution.
      spotRef: z.object({
        scenarioId: z.string().min(1).max(40),
        spotIndex: z.number().int().min(0).max(7),
      }).optional().nullable(),
      // 2026-09-30：從活動企劃寫某一篇（見 strategy/core/campaignItemBrief.ts）。
      campaignItem: CAMPAIGN_ITEM_INPUT,
      /** Client-generated id so cancelRun can stop this run. */
      runKey: RUN_KEY,
      asyncMode: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      // 100s→99s compat: a stale client may still POST a legacy "fb-100-…"
      // taskId. Normalize once here so every lookup below resolves to the
      // renamed definition. Idempotent for new "fb-99-…" ids.
      input = { ...input, taskId: normalizeTaskId(input.taskId) };
      const userId = ctx.user!.id;
      const scope = { productId: input.productId ?? null, eventId: input.eventId ?? null };

      const resolved = await resolveTaskOrThrow(input.taskId);
      // 2026-09-07 執行層方案閘門：列表看不到不等於不能用。
      await assertTaskAllowed({
        userId: ctx.user!.id,
        brandId: (input as any).brandId ?? null,
        info: gateInfoFor(input.taskId),
      });
      const template: any = resolved.template;
      const config: any = resolved.config;

      // ── Input validation — BEFORE the cost guard / points deduction ──────
      // 2026-08-23: same guard as runOrchestra60, for fb-99-viral-rewrite.
      // 沒有原始爆款就沒有東西可以改寫，模型會自己編一支去拆解。
      // 擺在扣點之前：被擋下來的請求一點都不扣。
      //
      // 2026-09-02: fb-99-launch-toolkit(event_when/event_why) 與
      // fb-99-livestream-9seg(key_points) 也宣告了 primary 以外的必填欄位，
      // 在 intake 只送一格的年代同樣問不到。
      assertIntakeComplete(template, input.inputs);
      if (templateNeedsViralSource(template)) {
        const viral = checkViralSource(input.inputs[VIRAL_SOURCE_KEY], {
          platformLabel: platformLabelOf(template),
        });
        if (!viral.ok) throw new TRPCError({ code: "BAD_REQUEST", message: viral.message.zh });
      }

      // P0-D pre-flight cost guard (99s tier is the most expensive)
      const { preflightCostCheck } = await import("../../../platform/core/llm/llmWithBilling");
      const guard100 = await preflightCostCheck(userId);
      if (!guard100.ok) throw new TRPCError({ code: "FORBIDDEN", message: guard100.reason });
      // 2026-05-12: paywall quota check (plan task_99s cap)
      // 2026-05-14: points-based gating
      const { assertPoints, deductPoints } = await import("../../../platform/core/billing/pointsService");
      await assertPoints(userId, "task_99s");
      await deductPoints(userId, "task_99s", { kind: "task", id: null });
      const cancelCtx = await beginCancellableRun(input.runKey, userId, "task_99s");
      const { runOrchestra } = await import("../../core/engine/quickTaskOrchestra");

      const baseArgs = { template, config, inputs: input.inputs, brandId: input.brandId, ...scope, userId, tier: "99s" as const,
        audienceTag: await resolveAudienceTag(userId, input.brandId, input.spotRef),
        campaignItem: input.campaignItem ? await loadCampaignItem(input.campaignItem, userId) : null, ...cancelCtx };

      if (!input.asyncMode) {
        // Legacy sync path — fully await, return final result.
        return runOrchestra(baseArgs).finally(() => unregisterRunKey(input.runKey));
      }

      // ── Async path ─────────────────────────────────────────────────
      // Return after captions+briefs; let image gen + extras + QA run
      // in the background and UPDATE the same mission_outputs row.
      let resolvePartial!: (p: any) => void;
      let rejectPartial!: (e: any) => void;
      const partialPromise = new Promise<any>((resolve, reject) => {
        resolvePartial = resolve;
        rejectPartial = reject;
      });
      let checkpointFired = false;
      let capturedOutputId: number | null = null;

      // Fire-and-forget the full orchestra.
      // If checkpoint fires, partial resolves and we return to the user.
      // If the FULL Promise rejects AFTER checkpoint, we mark the row failed.
      // If it rejects BEFORE checkpoint, we reject the partial (caller gets error).
      runOrchestra({
        ...baseArgs,
        onCheckpoint: (partial) => {
          checkpointFired = true;
          capturedOutputId = (partial as any).outputId ?? null;
          resolvePartial(partial);
        },
      })
        .then((full) => {
          // If checkpoint never fired (e.g., task too short or didn't reach
          // captions stage), the orchestra fell through synchronously and
          // we still owe the partial-resolve so the mutation can return.
          if (!checkpointFired) resolvePartial(full);
        })
        .catch(async (err) => {
          console.error("[runOrchestra99 async tail] failed:", (err as Error)?.message);
          // If checkpoint fired and we captured an outputId, mark THAT row
          // as failed so the frontend stops polling. If no outputId yet,
          // reject the partial so the caller sees the error.
          if (checkpointFired && capturedOutputId) {
            try {
              const { finaliseTaskRun } = await import("../../../platform/core/ops/recordTaskRun");
              await finaliseTaskRun({
                outputId: capturedOutputId,
                // Don't pass content → keep partial caption from checkpoint
                progress: "failed",
                progressDetail: String((err as Error)?.message ?? err).slice(0, 1000),
              });
            } catch (e2) {
              console.error("[runOrchestra99 async tail] mark failed also failed:", e2);
            }
          } else if (!checkpointFired) {
            rejectPartial(err);
          }
        })
        .finally(() => unregisterRunKey(input.runKey));

      // Block on partial result only.
      return await partialPromise;
    }),

  runOrchestra: protectedProcedure
    .input(
      z.object({
        taskId: z.string().min(1).max(64),
        inputs: z.record(z.string(), z.string()).default({}),
        brandId: z.number().optional(),
        // 2026-05-11 (CJ「product / event 也要 narrow LLM context」): scope.
        productId: z.number().optional().nullable(),
        eventId: z.number().optional().nullable(),
        // 2026-08-11: where in the strategy workbench this piece came from.
        // Only the reference travels — the labels are resolved server-side
        // from the stored scenario so they can't drift, and the URL that
        // carries this stays short.
        spotRef: z.object({
          scenarioId: z.string().min(1).max(40),
          spotIndex: z.number().int().min(0).max(7),
        }).optional().nullable(),
        // 2026-09-30：從活動企劃寫某一篇（見 strategy/core/campaignItemBrief.ts）。
        campaignItem: CAMPAIGN_ITEM_INPUT,
        runKey: RUN_KEY,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      input = { ...input, taskId: normalizeTaskId(input.taskId) }; // 100s→99s compat
      const userId = ctx.user!.id;
      // 2026-05-08 (P0-D): pre-flight cost guard. Trial users hitting
      // wallet floor or daily $5 cap are stopped before LLM fan-out.
      const { preflightCostCheck } = await import("../../../platform/core/llm/llmWithBilling");
      const guard = await preflightCostCheck(userId);
      if (!guard.ok) {
        throw new TRPCError({ code: "FORBIDDEN", message: guard.reason });
      }
      // 2026-05-12: paywall quota check (plan task_30s cap)
      // 2026-05-14: points-based gating
      const { assertPoints, deductPoints } = await import("../../../platform/core/billing/pointsService");
      await assertPoints(userId, "task_30s");
      await deductPoints(userId, "task_30s", { kind: "task", id: null });
      const cancelCtx = await beginCancellableRun(input.runKey, userId, "task_30s");
      const { runOrchestra } = await import("../../core/engine/quickTaskOrchestra");
      // 這支只收 30s（60s/99s 各有自己的 mutation），所以解析完再擋 tier，
      // 而不是靠「只查 30s 目錄」來擋 —— 後者查不到時的錯誤訊息會說謊，
      // 把一個存在的 60s 任務講成 "Unknown"。
      const resolved = await resolveTaskOrThrow(input.taskId);
      // 2026-09-07 執行層方案閘門：列表看不到不等於不能用。
      await assertTaskAllowed({
        userId: ctx.user!.id,
        brandId: (input as any).brandId ?? null,
        info: gateInfoFor(input.taskId),
      });
      if (resolved.tier !== "30s") {
        throw new Error(`任務「${input.taskId}」是 ${resolved.tier}，這個入口只收 30s（請走 runOrchestra60 / runOrchestra99）`);
      }
      const template = resolved.template;
      const config = resolved.config;
      // Required-field check
      // 只驗 modal 真的渲染得出來的欄位（taskIntake 是 client/server 共用的
      // 那一份判斷），所以不會擋一格使用者根本看不到的必填。
      assertIntakeComplete(template, input.inputs);
      const orchestraArgs = {
        template,
        config,
        inputs: input.inputs,
        brandId: input.brandId,
        productId: input.productId ?? null,
        eventId: input.eventId ?? null,
        userId,
        audienceTag: await resolveAudienceTag(userId, input.brandId, input.spotRef),
        campaignItem: input.campaignItem ? await loadCampaignItem(input.campaignItem, userId) : null,
        ...cancelCtx,
      };

      return runOrchestra(orchestraArgs).finally(() => unregisterRunKey(input.runKey));
    }),

  runQuick: protectedProcedure
    .input(
      z.object({
        taskId: z.string().min(1).max(64),
        inputs: z.record(z.string(), z.string()).default({}),
        brandId: z.number().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      input = { ...input, taskId: normalizeTaskId(input.taskId) }; // 100s→99s compat
      // 2026-09-02: 第六個查表點（記錄裡一直說五個）。這支只要 template，
      // 不需要 config，所以走 resolveTaskTemplate 而不是 resolveTaskOrThrow。
      const template = await resolveTaskTemplate(input.taskId);
      if (!template) {
        throw new Error(`未知的任務 id：${input.taskId}（60s 走 runOrchestra60；90s 走 squad.stepExecute）`);
      }

      // Required-field check
      // 只驗 modal 真的渲染得出來的欄位（taskIntake 是 client/server 共用的
      // 那一份判斷），所以不會擋一格使用者根本看不到的必填。
      assertIntakeComplete(template, input.inputs);

      // 2026-05-05: load the bound agent persona (if set) and prepend to
      // the system prompt so the output really sounds like that agent.
      let agentPersona = "";
      let agentMeta: { id: number; name: string; title: string; nameEn: string; titleEn: string; avatarUrl: string | null } | null = null;
      if (template.agent_id) {
        try {
          const [agentRows]: any = await localPool.execute(
            `SELECT id, name, title, englishName, englishTitle, bio, specialty, methodology, avatarUrl FROM agents WHERE id = ? LIMIT 1`,
            [template.agent_id],
          );
          const a = (agentRows as any[])?.[0];
          if (a) {
            agentMeta = { id: a.id, name: a.name, title: a.title, ...englishFromRow(a), avatarUrl: a.avatarUrl ?? null };
            agentPersona =
              `你是 ${a.name}，${a.title}。\n` +
              (a.bio ? `背景：${a.bio}\n` : "") +
              (a.specialty ? `專長：${a.specialty}\n` : "") +
              (a.methodology ? `方法論：${a.methodology}\n` : "") +
              withAgentKnowledge("", await loadAgentKnowledge(a.id, { source: "quickTask.runQuick" })) +
              `\n用你的口氣寫，不要寫得像通用 AI。\n\n`;
          }
        } catch { /* persona load failure is non-fatal */ }
      }

      // 2026-05-05 fix: if any input contains a URL, fetch the page and
      // inject a summary so the agent actually READS what the user shared
      // (vs writing a generic post that ignores the link content).
      let urlContext = "";
      let fetchedUrl: {
        url: string;
        title: string | null;
        chars: number;
        og: {
          image: string | null;
          title: string | null;
          description: string | null;
          site_name: string | null;
          domain: string;
        };
      } | null = null;
      let urlFetchFailure: { url: string; reason: "content_unavailable" } | null = null;
      for (const v of Object.values(input.inputs)) {
        if (typeof v === "string") {
          const url = findFirstUrl(v);
          if (url) {
            const summary = await fetchUrlSummary(url);
            if (summary) {
              urlContext = "\n\n" + formatUrlSummaryForPrompt(summary) + "\n\n";
              fetchedUrl = {
                url: summary.url,
                title: summary.title,
                chars: summary.fetched_chars,
                og: summary.og,
              };
              urlFetchFailure = null;
              break; // first URL only — keep prompt budget reasonable
            }
            urlFetchFailure ??= { url, reason: "content_unavailable" };
          }
        }
      }

      // Build prompt
      // 2026-10-03：讀該任務所在平台的「通路角色」。
      const brandPrefix = await buildBrandContext(input.brandId, null, null, "full", roleChannelOfTaskId(input.taskId));
      const userMsg =
        Object.entries(input.inputs)
          .map(([k, v]) => `[${k}] ${v}`)
          .join("\n") || "(no extra inputs)";
      const systemFull =
        agentPersona +
        template.systemPrompt +
        "\n" +
        quickTaskOutputSpec(template.tier) +
        brandPrefix +
        urlContext;

      const messages = [
        { role: "system" as const, content: systemFull },
        { role: "user" as const, content: userMsg },
      ];

      // Call LLM with the template's preferred fast model
      const startedAt = Date.now();
      const result = await callWithFallback(
        messages,
        template.preferredModel === "any" ? "qwen" : (template.preferredModel as any),
      );
      const latencyMs = Date.now() - startedAt;

      // Parse + soft-validate output
      const parsedJson = tryParseJson(result.content);
      // 2026-09-29：禁用詞／替換對照硬檢查——以前只有 orchestra 與改寫路徑有做。
      // 只檢查會被發出去的文字欄位，不動 JSON 結構。
      if (parsedJson && typeof parsedJson === "object" && input.brandId) {
        // 2026-09-30：加上法規合規檢查（品牌沒有法規就只跑硬規則）。各欄位平行。
        const { enforceBrandAndRegulations } = await import("../../core/engine/regulationCompliance");
        await Promise.all((["caption", "title", "description", "cta"] as const).map(async (k) => {
          const v = (parsedJson as any)[k];
          if (typeof v === "string" && v.trim()) {
            (parsedJson as any)[k] = (await enforceBrandAndRegulations(input.brandId, v).catch(() => ({ text: v }))).text;
          }
        }));
      }
      // 2026-05-05 fix: spread LLM output FIRST, then OVERRIDE the routing
      // fields with template defaults. Otherwise LLMs that emit Chinese
      // post_type (e.g. "图文貼文") break the mockup variant routing because
      // PlatformMockup's switch is keyed on English format slugs (feed /
      // carousel / reel / story / etc).
      const parsed = parseQuickTaskOutput({
        ...(parsedJson ?? {}),
        // System overrides — LLM doesn't get to mutate routing keys
        tier: template.tier,
        platform: template.outputDefaults.platform,
        post_type: template.outputDefaults.post_type,
      });

      return {
        taskId: template.id,
        tier: template.tier,
        postType: template.postType,
        latencyMs,
        provider: result.provider,
        model: result.model,
        fellBack: result.fellBack,
        ok: parsed.ok,
        output: parsed.ok ? parsed.data : (parsed.partial as Partial<QuickTaskOutput>),
        validationErrors: parsed.ok ? undefined : parsed.errors,
        rawText: result.content, // for debugging / regenerate
        agent: agentMeta,        // {id, name, title, avatarUrl} or null
        skill_slug: template.skill_slug ?? null,
        fetchedUrl,              // {url, title, chars} or null — was a URL read?
        urlFetchFailure,         // URL was present but yielded no promptable content
      };
    }),

  /**
   * 2026-05-09 (P3): regenerate a single variant of an existing output.
   * Fetches the original output's metadata.taskId + inputs, re-runs ONE
   * variant through the same orchestra path, replaces that variant in the
   * stored content. Original variant goes into metadata.archivedVariants
   * for history.
   */
  regenerateVariant: protectedProcedure
    .input(z.object({
      outputId: z.number().int().positive(),
      // Keep the legacy contract strict: variantIndex was required before
      // strategy bundles existed, so omitting it must not silently target 0.
      variantIndex: z.number().int().min(0),
      contentKind: ContentKindSchema.optional(),
      contentIndex: z.number().int().min(0).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const { default: localPool } = await import("../../../localDb");
      const [rows]: any = await localPool.execute(
        `SELECT o.id, o.content, o.metadata, o.missionId,
                m.userId AS mission_user_id, m.brandId AS mission_brand_id,
                JSON_UNQUOTE(JSON_EXTRACT(o.metadata, '$.taskId')) AS taskId,
                JSON_UNQUOTE(JSON_EXTRACT(o.metadata, '$.tier'))   AS tier
         FROM mission_outputs o
         LEFT JOIN missions m ON m.id = o.missionId
         WHERE o.id = ? AND m.userId = ? LIMIT 1`,
        [input.outputId, userId],
      );
      const row = (rows as any[])[0];
      if (!row) throw new Error("output not found or no permission");

      // The generic orchestra regenerator cannot preserve the server-owned
      // public slot contract (format/id) or re-run the IG strategy redaction
      // boundary. Fail closed instead of allowing a regenerated item to leak
      // planning internals or corrupt an IG strategy bundle. Those bundles
      // remain editable through the selector-aware caption rewrite flows.
      const target = selectRegenerationTarget(row.content, input);
      assertGenericRegenerationAllowed(target, input);

      const md = typeof row.metadata === "string" ? JSON.parse(row.metadata) : (row.metadata ?? {});
      let taskId: string = row.taskId ?? "";
      const inputs = md.inputs ?? {};

      // Fallback: if taskId missing from metadata, recover from mission description tag [task:<id>]
      if (!taskId && row.missionId) {
        const [mRows]: any = await localPool.execute(
          `SELECT description FROM missions WHERE id = ? LIMIT 1`,
          [row.missionId],
        );
        const desc: string = (mRows as any[])[0]?.description ?? "";
        const m = desc.match(/\[task:([^\]]+)\]/);
        if (m?.[1]) taskId = m[1];
      }
      if (!taskId) throw new Error("此 output 沒有 taskId metadata，無法重生");

      // 2026-09-02: 這條鏈原本漏了 getKOLOrchestraConfig —— KOL 任務按
      // 「換人重寫」會丟 `no orchestra config`，其他四個呼叫點都有、只有這裡沒有。
      // 走 registry 之後不可能再漏。
      const resolvedRegen = await resolveTaskOrThrow(taskId);
      const template = resolvedRegen.template;
      const fullConfig = resolvedRegen.config;

      // Override config to produce ONE variant only — use the same label
      // as the slot we're replacing, so the regenerated voice matches.
      const targetLabel = target.item?.label ?? fullConfig.variantLabels[target.index] ?? `版本 ${target.index + 1}`;
      const singleConfig = { ...fullConfig, variants: 1, images: 0, runImageGen: false, variantLabels: [targetLabel] };

      const taskTier: "30s" | "60s" | "99s" =
        get99Template(taskId)  ? "99s" :
        (getFB60Template(taskId) ?? getIG60Template(taskId) ?? getYT60Template(taskId) ?? getMulti60Template(taskId)) ? "60s" :
        "30s";
      const { runOrchestra } = await import("../../core/engine/quickTaskOrchestra");
      const r = await runOrchestra({
        template, config: singleConfig, inputs, brandId: row.mission_brand_id ?? undefined, userId, tier: taskTier,
        // 2026-09-29：重生時沿用原本那篇的產品／活動範圍（metadata 有存），不然重生的版本讀不到產品定位。
        productId: md.productId ?? undefined, eventId: md.eventId ?? undefined,
      });
      const newVariant = r.variants?.[0];
      if (!newVariant?.caption) throw new Error("重生失敗，agent 沒回傳內容");

      // This path deliberately runs with images:0, so replacing the whole
      // variant would discard the still-current image and its persisted
      // model prompt. Regenerating copy must not mutate the visual asset.
      const replacementVariant = preserveExistingVariantImage(newVariant, target.item);

      // Replace the variant + archive the old one
      const archived = Array.isArray(md.archivedVariants) ? md.archivedVariants : [];
      archived.push({
        archivedAt: new Date().toISOString(),
        index: target.index,
        variant: target.item,
        ...(input.contentKind !== undefined
          ? { contentKind: target.kind, contentIndex: target.index }
          : {}),
      });
      const newContent = replaceRegeneratedContent(row.content, input, replacementVariant, target);
      // 2026-09-30：重生跑的是同一個 orchestra（含法規合規檢查），結果記到這個版本上。
      const { mergeComplianceRecord } = await import("../../core/engine/regulationCompliance");
      const regRec = (r as any).regulationCompliance?.[0] ?? null;
      const newMetadata = JSON.stringify({
        ...md, archivedVariants: archived, lastRegenAt: new Date().toISOString(),
        ...(input.contentKind === undefined && (regRec || md.regulationCompliance)
          ? { regulationCompliance: mergeComplianceRecord(md.regulationCompliance, input.variantIndex, regRec) }
          : {}),
      });

      await localPool.execute(
        `UPDATE mission_outputs SET content = ?, metadata = ?, version = version + 1, updatedAt = NOW() WHERE id = ?`,
        [newContent, newMetadata, input.outputId],
      );

      return {
        ok: true,
        variantIndex: input.variantIndex,
        newCaption: newVariant.caption,
        ...(input.contentKind !== undefined
          ? { contentKind: target.kind, contentIndex: target.index }
          : {}),
      };
    }),
};
