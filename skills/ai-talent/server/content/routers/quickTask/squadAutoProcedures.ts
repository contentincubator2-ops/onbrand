/**
 * runSquadAuto：依小隊流程自動執行（99s 任務）。
 */
import { protectedProcedure } from "../../../platform/core/trpc";
import { runSquadAutoSingleFlight } from "./runSquadAutoGuard";
import { z } from "zod";
import { getIgStrategyExecutionSlug, getIgStrategyPublicPolicy, getIgStrategyRecordOverrides, redactIgStrategySynthesisContext } from "../../core/engine/igStrategyPublicOutput";
import { legacyTaskId } from "../../../platform/core/tierCompat";
import localPool from "../../../localDb";
import { ALL_99S_SQUADS } from "../../core/catalog/quickTask100Squads";
import { callModel } from "../../../platform/core/llm/multiModelRouter";
import { type IgStrategyPrivateArtifact, buildIgStrategyPublicSlots } from "../../core/engine/igStrategyPublicSynthesis";
import { randomUUID } from "node:crypto";
import { loadAgentKnowledgeMany, withAgentKnowledge } from "../../../platform/core/agents/agentKnowledge";
import { synthesizeIgStrategyPublicSlots } from "../../core/engine/igStrategyPublicGeneration";

export const squadAutoProcedures = {
  // 99s squad auto-run. Legacy squads still expose one variant per step.
  // The five explicitly catalogued IG strategy tasks instead keep every step
  // private and run a final public-content synthesis into publishable IG slots.
  runSquadAuto: protectedProcedure
    // 2026-08-21: allow up to five runSquadAuto pipelines per user at a time.
    // The per-user ceiling still limits repeated clicks from stacking work
    // without bound on the single Node fork. See singleFlightPerUser in
    // _core/trpc.ts for why this returns CONFLICT (409 JSON) rather than
    // anything the client reads as a 502.
    .use(runSquadAutoSingleFlight)
    .input(z.object({
      squadSlug: z.string().min(1).max(80),
      topic:     z.string().max(2000).default(""),
      brandId:   z.number().optional(),
      // 2026-09-29：任務 modal 選的產品／活動，品牌大腦要一起帶。
      productId: z.number().optional(),
      eventId:   z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const routeStartedAt = Date.now();
      const startedAt = routeStartedAt;
      // 1. Load squad + agents + steps.
      // 100s→99s rename compat: the in-code squad index was renamed to the
      // new "fb-99-…" slugs, but the production `squads` table may still
      // hold the legacy "fb-100-…" slug (no DB migration). Match BOTH so
      // the lookup resolves regardless of which form the row has.
      const sqSlugNew = getIgStrategyExecutionSlug(input.squadSlug);
      const sqSlugLegacy = legacyTaskId(sqSlugNew);
      const sqSlugs = sqSlugLegacy ? [sqSlugNew, sqSlugLegacy] : [sqSlugNew];
      // Only five catalogued IG strategy tasks get the private-artifact +
      // final-public-synthesis boundary. Every unlisted squad keeps its variants and
      // persistence fields unchanged.
      const strategyPublicPolicy = getIgStrategyPublicPolicy(sqSlugNew);
      const [sqRows]: any = await localPool.execute(
        `SELECT id, slug, name, agents, steps, methodology, lead_agent_id
           FROM squads WHERE slug IN (${sqSlugs.map(() => "?").join(",")}) AND is_active = 1 LIMIT 1`,
        sqSlugs,
      );
      const squad = (sqRows as any[])?.[0];
      if (!squad) throw new Error(`squad ${input.squadSlug} not found`);
      let stepsRaw: any[] = [];
      try { stepsRaw = typeof squad.steps === "string" ? JSON.parse(squad.steps) : squad.steps; } catch {}
      stepsRaw = Array.isArray(stepsRaw) ? stepsRaw : [];
      if (stepsRaw.length === 0) throw new Error(`squad ${input.squadSlug} has no steps`);

      // 2. Build brand context — runSquadAuto = strategic/long-form
      // squad work → full brand depth (golden circle / story /
      // competition), NOT the lean core digest.
      const { buildBrandPrefix } = await import("../../../strategy/core/brand/brandContext");
      const brandPrefix = await buildBrandPrefix(input.brandId, input.productId ?? null, input.eventId ?? null, "full").catch(() => "");
      // 2026-07-17 多市場: brand's outputLanguage drives step language +
      // whether the zh-TW deterministic sanitizer may run on step output.
      const { getBrandMarket, DEFAULT_BRAND_MARKET } = await import("../../../strategy/core/brand/brandMarket");
      const brandMarket = await getBrandMarket(input.brandId).catch(() => DEFAULT_BRAND_MARKET);
      const strategyRecordOverrides = getIgStrategyRecordOverrides(sqSlugNew, brandMarket.outputLanguage);

      // 3. Inject 100s scout data (real-time festivals/trending/news)
      let scoutBlock = "";
      try {
        const { ALL_99S_SQUADS } = await import("../../core/catalog/quickTask100Squads");
        const matched = ALL_99S_SQUADS.find((s) => s.squad_slug === sqSlugNew);
        if (matched) {
          const { fetchViralPatterns, formatViralPatternsForPrompt } = await import("../../../strategy/core/monitor/socialListeningScout");
          const kind: "festivals" | "trending" | "news" | "viral" =
            matched.squad_slug.includes("monthly-calendar") || matched.squad_slug.includes("countdown") ? "festivals"
            : matched.squad_slug.includes("crisis") || matched.squad_slug.includes("kern-mass-control") ? "trending"
            : matched.squad_slug.includes("quarterly") || matched.squad_slug.includes("analytics") || matched.squad_slug.includes("reposition") ? "news"
            : "viral";
          const viral = await fetchViralPatterns({
            channel: matched.platform,
            topic: `${typeof matched.label === "string" ? matched.label : matched.label.zh} ${input.topic}`.slice(0, 120),
            brandId: input.brandId,
            kind,
          });
          if (viral && viral.patterns.length > 0) {
            scoutBlock = "\n\n" + formatViralPatternsForPrompt(viral, kind) + "\n\n";
          }
        }
      } catch { /* non-fatal */ }

      // 4. Run each step in sequence. For the five targets these are private
      // reasoning artifacts; legacy squads still collect them as variants.
      const { callModel, callModelStrict } = await import("../../../platform/core/llm/multiModelRouter");
      const variants: any[] = [];
      const errors: string[] = [];
      const stages: any[] = [];
      // Keyed by step index, never appended. A merged round finishes in
      // completion order, so a push-ordered list would hand a later step the
      // wrong predecessors: with steps 1 and 2 sharing a round and step 2
      // landing first, step 4's "last two" became step 1 + step 3 instead of
      // step 2 + step 3 — exactly the dependency this plan exists to protect.
      // Selecting by index reproduces the sequential reading whatever order
      // the round settles in.
      const stepOutputs: Array<string | undefined> = [];
      const planningArtifacts: any[] = [];
      const privateArtifacts: IgStrategyPrivateArtifact[] = [];
      const privateRunId = strategyPublicPolicy ? randomUUID() : null;
      const strategyStepRouting = strategyPublicPolicy
        ? await import("../../../strategy/core/positioning/strategyPublicStepRouting")
        : null;
      // The DB owns the number of steps. Four steps stay strictly sequential:
      // 12s scout + (4 * 40s step) + ~4s persistence = ~176s, inside the 205s
      // admission guard (220s socket timeout - 15s finalization reserve).
      // Five steps would need 212s, so the planner merges the two leading
      // steps into one round and leaves 3 -> 4 -> 5 sequential, because those
      // later steps really do read their predecessors.
      const strategyPlanning = strategyStepRouting
        ? strategyStepRouting.planStrategyPlanning({
            stepCount: stepsRaw.length,
            serverTimeoutMs: strategyStepRouting.STRATEGY_SERVER_TIMEOUT_MS,
          })
        : null;
      const strategyRouteBudget = strategyPlanning?.budget ?? null;
      // 2026-08-20: this used to throw PRECONDITION_FAILED here. That was
      // wrong, and production proved it within the hour: ig-99-visual-story
      // carries SEVEN steps in the DB (the seed file's five are stale), so
      // every run was refused outright and the user got nothing at all —
      // strictly worse than before, where the route ran until the per-step
      // admission guard stopped it and at least persisted the planning drafts
      // it had already paid for.
      //
      // An oversized squad is a configuration problem, not a request the user
      // can fix by being told to go away. Record it loudly, then let the
      // per-step guard do what it already does: run what fits, refuse the
      // tail, keep the drafts. Public synthesis still fails closed on the
      // incomplete artifacts, which is the honest outcome.
      if (strategyPlanning && !strategyPlanning.budget.fitsRouteBudget) {
        console.warn("[runSquadAuto] strategy route cannot fit its planning steps", {
          taskId: strategyRecordOverrides?.taskId ?? input.squadSlug,
          stepCount: stepsRaw.length,
          waveCount: strategyPlanning.waves.length,
          planningWorstCaseMs: strategyPlanning.budget.planningWorstCaseMs,
          routeLimitMs: strategyPlanning.budget.routeLimitMs,
        });
      }

      // Resolve all unique step agent IDs in one query
      const agentIds = Array.from(new Set(stepsRaw
        .map((s: any) => Number(s.assignedAgentId))
        .filter((n: number) => Number.isFinite(n) && n > 0)));
      const agentMap: Record<number, { name: string; title: string; specialty?: string; methodology?: string; avatarUrl?: string | null }> = {};
      if (agentIds.length > 0) {
        const ph = agentIds.map(() => "?").join(",");
        const [aRows]: any = await localPool.execute(
          `SELECT id, name, title, specialty, methodology, avatarUrl FROM agents WHERE id IN (${ph})`,
          agentIds,
        );
        for (const a of aRows as any[]) {
          agentMap[a.id] = { name: a.name, title: a.title, specialty: a.specialty, methodology: a.methodology, avatarUrl: a.avatarUrl ?? null };
        }
      }
      const agentKnowledge = await loadAgentKnowledgeMany(agentIds, { source: "quickTask.runSquadAuto" });

      const runPlanningStep = async (i: number) => {
        const step = stepsRaw[i];
        const stepStartedAt = Date.now();
        const stageStart = Date.now() - startedAt;
        const stageKey = `step${i + 1}`;
        const internalStageLabel = step.name ?? step.title ?? `Step ${i + 1}`;
        const publicStageLabel = strategyPublicPolicy
          ? (brandMarket.isZhTW ? `內容分析 ${i + 1}` : `Content analysis ${i + 1}`)
          : internalStageLabel;
        const aid = Number(step.assignedAgentId);
        const a = agentMap[aid];
        const agentName = a?.name ?? step.assignedAgentName ?? "Squad Agent";

        const persona = withAgentKnowledge(a
          ? `你是 ${a.name}，${a.title}。${a.specialty ? `\n專長：${a.specialty}。` : ""}${a.methodology ? `\n方法論：${a.methodology}。` : ""}`
          : `你是 ${agentName}。`, agentKnowledge.get(aid) ?? "");

        // 2026-05-19 (CJ 驗收 IG7「+217% 無來源捏造」、IG2「弱引用無連結/日期」
        // 根因): 此處是所有 squad-pipeline 任務（IG/FB squad 等）共用的 step
        // system prompt——原句「扣回…真實市場數據」反而誘導模型塞入未授權
        // 數字，且全無反捏造守門。植入與 yt-99/li-99 同源的【數字零容忍】
        // 規則，一次根治所有 squad 任務的捏造數字 / 弱引用問題。
        const ZERO_TOLERANCE = `\n══════════════════════════════════════════\n【數字與來源零容忍 — 最高優先，違反直接不合格】\n══════════════════════════════════════════\n▸ 全文任何「百分比 / 倍數 / 次數 / 金額 / 名次 / 比率」數字，必須逐字出現在「任務主題」或下方注入的品牌資訊 / scout 即時資料原文中。找不到 → 刪掉、改成質化描述、或留「[請補充：數據來源]」。\n▸ 媒體 / 機構名稱（Entrepreneur / Adweek / Social Media Today / eMarketer / HubSpot…）**不能**作為數字的授權依據。寫「(Adweek, 2024)」「(Social Media Today)」這種有名稱無連結無日期的弱引用＝視同捏造，一律禁止。\n  ✗ 違反例：「Carousel 互動率 +42%（Entrepreneur, 2024）」「分享率高出 3.8x」「信任指標上升 27%」（輸入無此數字）\n  ✓ 正確：「輪播形式通常比單圖更容易被收藏與分享」（質化、不掛假數字）\n▸ 不得虛構案例 / 客戶：沒在輸入中點名的公司、客戶、導入數，一律不得寫（✗「12 家中小品牌導入後…」）→ 用「[請補充：實際案例]」。\n▸ 自我驗證：寫完後掃全文每個「%／倍／x／+數字」與每個括號引用 → 對照輸入原文 → 找不到就刪改。\n══════════════════════════════════════════`;
        // 2026-05-19 (CJ 驗收 kl-60-pitch-pack v#3 3/14「跨 step 品牌聲音
        // 斷裂 + 場景錯亂」根因): squad-pipeline 每個 step 共用此 prompt，
        // 全無文字衛生與「交付物要對得上 step 名稱」的約束 → 後段 step
        // 退回陌生業配信，且每個 step 都寫成同款邀約信。補兩塊守門。
        // 2026-07-17 多市場: zh-TW 的文字衛生規則（禁驚嘆號/emoji/台灣用語）
        // 是台灣市場語感政策，非中文市場改為「目標市場語言 + 語氣一致」通則。
        const voiceLangRules = brandMarket.isZhTW
          ? `▸ 全文禁句尾與句中驚嘆號（! 與 ！都禁）；禁 emoji；繁體台灣用語（用「管道」非「渠道」，不得簡體字）。\n▸ 禁業配 / 空洞套語：「強大功能」「突破性的功能」「期待你的回音」「期待聽到你的想法」「非常期待與你合作」「讓我們一起創造」「一起創造美好的合作」「管理品牌形象」「在這個數位時代」「更加精彩」「非常契合」等一律不准出現。沉穩、真誠、務實的守護者語氣，5 個 step 語氣必須一致。`
          : `▸ 全文一律使用 ${brandMarket.outputLanguage}（品牌目標市場語言）撰寫，不得混入中文。\n▸ 語氣沉穩、真誠、務實，5 個 step 語氣必須一致；避免浮誇銷售腔、空洞套語與 PR 腔。`;
        const VOICE_GUARD = `\n══════════════════════════════════════════\n【文字衛生與交付物保真 — 違反直接不合格，輸出前逐句自查】\n══════════════════════════════════════════\n${voiceLangRules}\n▸ 收尾用一個對方會想回的具體問句，不要 PR 套語。\n▸ **交付物必須對得上本 step 的名稱與功能，不是每個 step 都寫一封邀約信**：\n  ・名稱含「Brief / 資料包」＝給 KOL 看的品牌資料文件（條列：品牌背景、目標受眾、合作規格、報酬與時程方向、使用方式），**不是邀請信**。\n  ・名稱含「報價回應 / 議價」＝在「KOL 已回覆報價」情境下你方的回信（含可接受 / 需調整兩種談法），**不是群發邀約**。\n  ・名稱含「追蹤 / follow-up」＝未回覆時的短追蹤（不催促，給新切入點）。\n  ・名稱含「感謝 / 結案」＝內容上線後的感謝＋成效回饋詢問＋長期關係。\n  ・名稱含「邀請 / 開場 / 主信」＝完整可寄出的邀約信。\n══════════════════════════════════════════`;
        const promptHeader = strategyPublicPolicy
          ? `【伺服器內部分析，不是公開成品】\nSquad「${squad.name}」步驟「${internalStageLabel}」。\n內部方法：${typeof squad.methodology === "string" ? squad.methodology : (squad.methodology?.author ?? "")}。完整保留分析細節，供最後的公開內容編輯階段使用。`
          : `Squad「${squad.name}」步驟「${internalStageLabel}」負責人。\n方法論：${typeof squad.methodology === "string" ? squad.methodology : (squad.methodology?.author ?? "")}`;
        const expectedOutput = strategyPublicPolicy
          ? step.outputType ?? step.outputKind ?? internalStageLabel
          : step.outputType ?? step.outputKind ?? "(未指定)";
        const strategyLengthLimit = strategyPublicPolicy
          ? (brandMarket.isZhTW
              ? `【整份回覆硬上限 — 最高優先】整份回覆的所有交付物合計不得超過 ${strategyStepRouting?.STRATEGY_STEP_ZH_TW_CHAR_LIMIT ?? 800} 個繁體中文字，不是每個平台或區塊各自計算。若 step 要求多平台、多格式或多版本，必須精簡每份交付物，仍要共用這個總上限。在上限內保留核心洞察、具體建議與可執行細節，刪除重複鋪陳。`
              : `【Whole-response hard limit — highest priority】The complete response, with every deliverable combined, must not exceed 600 words in ${brandMarket.outputLanguage}; this is not a separate allowance for each platform or section. If the step requests multiple platforms, formats, or variants, shorten each deliverable to keep their combined response within this single limit. Retain core insights, concrete recommendations, and actionable details; remove repetition.`)
          : "";
        const system = `${persona}\n${promptHeader}\n步驟說明：${step.description ?? ""}\n預期產出：${expectedOutput}${ZERO_TOLERANCE}${VOICE_GUARD}\n\n${brandMarket.isZhTW ? "用繁體中文（台灣用語，不得簡體字）輸出" : `一律用 ${brandMarket.outputLanguage} 輸出（品牌目標市場語言）`}，扣回品牌語氣；本 step 的交付物形態必須符合「${internalStageLabel}」的定義，不要寫成跟其他 step 一樣的邀約信。只能使用「下方注入的真實資料」中逐字存在的數字，沒有就用質化描述，不要自行補數據。${strategyLengthLimit ? `\n${strategyLengthLimit}` : ""}\n直接給結果，不要前言、不要 markdown 圍籬。`;

        // Steps sharing a round cannot see each other; that is the point of
        // capping the round size. Everything already finished before this
        // step's index is visible, nearest two first, as in the sequential run.
        const upstreamOutputs = stepOutputs
          .slice(0, i)
          .filter((value): value is string => typeof value === "string" && value.length > 0)
          .slice(-2);

        const userMsg = [
          `【任務主題】${input.topic || "(未指定)"}`,
          brandPrefix ? `\n${brandPrefix}` : "",
          scoutBlock,
          upstreamOutputs.length > 0 ? `\n【上游 step 已產出】\n${upstreamOutputs.join("\n\n").slice(0, 2000)}` : "",
          `\n請執行此步驟。`,
        ].filter(Boolean).join("\n");

        let stepProvider: "anthropic" | "qwen" = "qwen";
        let stepAttempt: 1 = 1;
        let stepStatus: "done" | "failed" = "failed";
        let stepErrorCode: string | null = null;
        try {
          const messages = [{ role: "system" as const, content: system }, { role: "user" as const, content: userMsg }];
          let r: Awaited<ReturnType<typeof callModel>>;
          if (strategyPublicPolicy && strategyStepRouting && strategyRouteBudget) {
            // Production shows OpenAI cannot complete this strategy workload,
            // while the shared deadline gave a fallback no useful runtime.
            // Let the proven Anthropic path own the complete 40-second budget.
            stepProvider = strategyStepRouting.STRATEGY_STEP_PROVIDER;
            // Background synthesis does not consume the HTTP budget. Before
            // each DB-owned step, require its full 40s to fit before the 205s
            // route guard, preserving 15s of the 220s socket limit for
            // persistence, response work and scheduling jitter.
            if (!strategyStepRouting.hasStrategyStepBudget({
              routeStartedAt,
              now: Date.now(),
              routeLimitMs: strategyRouteBudget.routeLimitMs,
              stepDeadlineMs: strategyRouteBudget.stepDeadlineMs,
            })) {
              throw Object.assign(new Error("strategy route has insufficient budget for another planning step"), {
                strategyErrorCode: "step_route_budget",
                strategyProvider: strategyStepRouting.STRATEGY_STEP_PROVIDER,
                strategyAttempt: 1,
              });
            }
            // TODO: callModel/callModelStrict cannot reliably cancel this route-local
            // deadline. In particular llm.ts's Anthropic branch does not pass a signal
            // (unlike OpenAI), so a timed-out Anthropic call can remain a ghost request.
            // Fixing that requires shared LLM changes and is intentionally outside PR 1.
            const routed = await strategyStepRouting.runAnthropicStrategyStep({
              deadlineAt: stepStartedAt + strategyRouteBudget.stepDeadlineMs,
              execute: () => callModelStrict(
                messages,
                strategyStepRouting.STRATEGY_STEP_PROVIDER,
                undefined,
                {
                  // Derived from the three production truncations and their
                  // 19,667-25,749ms latency; see the routing constant comment.
                  maxTokens: strategyStepRouting.STRATEGY_STEP_MAX_TOKENS,
                  includeFinishReason: true,
                },
              ),
            });
            stepProvider = routed.provider;
            stepAttempt = routed.attempt;
            stepErrorCode = routed.errorCode;
            if (!routed.ok) {
              throw Object.assign(routed.error, {
                strategyErrorCode: routed.errorCode,
                strategyProvider: routed.provider,
                strategyAttempt: routed.attempt,
              });
            }
            const finishErrorCode = strategyStepRouting.getStrategyStepFinishErrorCode(
              routed.value.finishReason,
            );
            if (finishErrorCode) {
              stepErrorCode = finishErrorCode;
            }
            r = routed.value;
          } else {
            r = await Promise.race([
              callModel(messages, undefined, "qwen"),
              new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`step ${i+1} timeout`)), 25_000)),
            ]);
          }
          const rawText = (r.content ?? "").trim();
          if (
            strategyPublicPolicy
            && stepErrorCode === "step_truncated"
            && !strategyStepRouting?.isUsableTruncatedStrategyStepContent(rawText)
          ) {
            throw Object.assign(new Error("strategy step output was truncated before producing usable material"), {
              strategyErrorCode: stepErrorCode,
              strategyProvider: stepProvider,
              strategyAttempt: stepAttempt,
            });
          }
          let text = rawText;
          // 2026-05-19 (CJ 驗收 v#3): deterministic 文字衛生 backstop on
          // squad-step output — guaranteed, independent of model adherence.
          try {
            // 2026-07-17 多市場: zh-TW only — the sanitizer would corrupt
            // non-Chinese output (emoji strip / ！→。 / 簡→繁 rewrites).
            if (text && brandMarket.isZhTW) {
              const { voiceSanitizeZhTW } = await import("../../core/engine/quickTaskOrchestra");
              text = voiceSanitizeZhTW(text);
            } else if (text) {
              // 2026-07-18: Latin-punct markets — clean stray CJK punctuation
              // the model slips in because the step prompt is Chinese.
              const { latinPunctLang, normalizeLatinPunct } = await import("../../core/engine/quickTaskOrchestra");
              if (latinPunctLang(brandMarket.outputLanguage)) text = normalizeLatinPunct(text);
            }
          } catch { /* fail-safe: keep raw text */ }
          // 2026-09-29：squad 每一步的產出也過禁用詞／替換對照（以前只有 orchestra 有）。
          if (text && input.brandId) {
            const { enforceBrandRulesOnText } = await import("../../../strategy/core/brand/brandContext");
            text = await enforceBrandRulesOnText(input.brandId, text).catch(() => text);
          }
          if (strategyPublicPolicy) {
            const privateTerms = [
              { value: squad.name, replacement: { zh: "策略團隊", en: "strategy team" } },
              { value: a?.name ?? step.assignedAgentName, replacement: { zh: "策略團隊", en: "strategy team" } },
              { value: a?.title, replacement: { zh: "策略團隊", en: "strategy team" } },
              { value: a?.specialty, replacement: { zh: "內容方法", en: "content approach" } },
              { value: a?.methodology, replacement: { zh: "內容方法", en: "content approach" } },
            ];
            privateArtifacts.push({
              stepOrder: i + 1,
              status: "done",
              internalLabel: String(internalStageLabel),
              outputType: typeof step.outputType === "string" ? step.outputType : null,
              outputKind: typeof step.outputKind === "string" ? step.outputKind : null,
              agentId: Number.isFinite(aid) && aid > 0 ? aid : null,
              agentName: a?.name ?? step.assignedAgentName ?? null,
              rawContent: rawText,
              // A substantial partial response follows the exact same
              // sanitizer/privacy path and remains observable as truncated.
              errorCode: stepErrorCode,
              latencyMs: Date.now() - startedAt - stageStart,
            });
            const planningCaption = redactIgStrategySynthesisContext(
              sqSlugNew,
              text,
              { steps: stepsRaw, outputLanguage: brandMarket.outputLanguage, privateTerms },
            );
            planningArtifacts.push({
              id: `planning-${i + 1}`,
              label: String(internalStageLabel),
              caption: planningCaption || (brandMarket.isZhTW ? "此策略內容已完成。" : "This planning artifact is complete."),
              hashtags: [],
              image: { style: null, url: null, status: "skipped" },
            });
            // Downstream private analysis consumes the full private result,
            // never the sanitized public DTO.
            stepOutputs[i] = `【${internalStageLabel}】${text.slice(0, 8_000)}`;
          } else {
            const variant = {
              label: internalStageLabel,
              caption: text,
              hashtags: [],
              image: { style: null, url: null, status: "skipped" },
              agent: a ? { id: aid, name: a.name, title: a.title, avatarUrl: a.avatarUrl } : null,
            };
            stepOutputs[i] = `【${variant.label}】${variant.caption.slice(0, 800)}`;
            variants.push(variant);
          }
          stages.push({ key: stageKey, label: publicStageLabel, startedAt: stageStart, completedAt: Date.now() - startedAt, status: "done" });
          stepStatus = "done";
        } catch (e: any) {
          stepProvider = e?.strategyProvider ?? stepProvider;
          stepAttempt = e?.strategyAttempt ?? stepAttempt;
          stepErrorCode = e?.strategyErrorCode
            ?? (/timeout|deadline/i.test(String(e?.message ?? e)) ? "step_timeout" : "step_failed");
          errors.push(`step ${i+1} (${publicStageLabel}): ${e?.message ?? e}`);
          if (strategyPublicPolicy) {
            privateArtifacts.push({
              stepOrder: i + 1,
              status: "failed",
              internalLabel: String(internalStageLabel),
              outputType: typeof step.outputType === "string" ? step.outputType : null,
              outputKind: typeof step.outputKind === "string" ? step.outputKind : null,
              agentId: Number.isFinite(aid) && aid > 0 ? aid : null,
              agentName: a?.name ?? step.assignedAgentName ?? null,
              rawContent: "",
              errorCode: stepErrorCode,
              latencyMs: Date.now() - startedAt - stageStart,
            });
            planningArtifacts.push({
              id: `planning-${i + 1}`,
              label: String(internalStageLabel),
              caption: "",
              hashtags: [],
              image: { style: null, url: null, status: "failed" },
            });
          } else {
            variants.push({
              label: internalStageLabel,
              caption: "",
              hashtags: [],
              image: { style: null, url: null, status: "failed" },
              agent: a ? { id: aid, name: a.name, title: a.title, avatarUrl: a.avatarUrl } : null,
            });
          }
          stages.push({ key: stageKey, label: publicStageLabel, startedAt: stageStart, completedAt: Date.now() - startedAt, status: "failed" });
        } finally {
          if (strategyPublicPolicy) {
            console.info("[runSquadAuto] step", {
              taskId: strategyRecordOverrides?.taskId ?? input.squadSlug,
              stepOrder: i + 1,
              provider: stepProvider,
              attempt: stepAttempt,
              latencyMs: Date.now() - stepStartedAt,
              status: stepStatus,
              errorCode: stepErrorCode,
            });
          }
        }
      };

      // Walk the planned rounds. Today every squad but one is a list of
      // single-step rounds, i.e. exactly the sequential loop this replaced;
      // only a squad the budget cannot fit gets a merged leading round.
      const planningWaves = strategyPlanning?.waves
        ?? stepsRaw.map((_: any, i: number) => [i]);
      let ranAnyWaveInParallel = false;
      for (const wave of planningWaves) {
        if (wave.length === 1) {
          await runPlanningStep(wave[0]!);
        } else {
          ranAnyWaveInParallel = true;
          await Promise.all(wave.map((i) => runPlanningStep(i)));
        }
      }
      if (ranAnyWaveInParallel) {
        // A merged round settles in completion order, so anything the UI or
        // the ledger reads positionally has to be put back into step order.
        const stepIndexOf = (value: string) => {
          const matched = /(\d+)/.exec(value);
          return matched ? Number(matched[1]) : Number.MAX_SAFE_INTEGER;
        };
        privateArtifacts.sort((a, b) => a.stepOrder - b.stepOrder);
        planningArtifacts.sort((a: any, b: any) => stepIndexOf(String(a.id)) - stepIndexOf(String(b.id)));
        stages.sort((a: any, b: any) => stepIndexOf(String(a.key)) - stepIndexOf(String(b.key)));
        errors.sort((a, b) => stepIndexOf(a) - stepIndexOf(b));
      }

      // 4b. 品牌一致性檢查（2026-09-30 CJ「需要你處理活動」）——非 IG 策略卡的 squad，
      // 每一步的產出就是交付內容，全部平行過 brandConsistency.ts。這條路線逼近 205 秒
      // 路由上限（220s socket − 15s 收尾），所以只用剩下的時間（再留 5 秒），最多 25 秒；
      // 不夠 3 秒就整批記 skipped，絕不為了檢查讓任務逾時。
      const squadBrandConsistency: any[] = [];
      if (!strategyPublicPolicy && input.brandId && brandPrefix && variants.some((v) => v.caption)) {
        const { checkBrandConsistency } = await import("../../core/engine/brandConsistency");
        const remainingMs = 205_000 - (Date.now() - routeStartedAt) - 5_000;
        const timeoutMs = Math.min(25_000, remainingMs);
        const checkStartedAt = Date.now() - startedAt;
        const { enforceBrandRulesOnText } = await import("../../../strategy/core/brand/brandContext");
        const results = await Promise.all(variants.map(async (v, vi) => {
          if (!v?.caption || v.caption.length > 6000) return null;
          const res = await checkBrandConsistency({
            caption: v.caption,
            brandPrefix,
            userMsg: input.topic || "(無)",
            taskLabel: `${squad.name ?? input.squadSlug} · ${v.label}`,
            isZhTW: brandMarket.isZhTW,
            timeoutMs,
          });
          if (res.status === "fixed") {
            v.caption = await enforceBrandRulesOnText(input.brandId, res.caption).catch(() => res.caption);
          }
          return { variantIndex: vi, status: res.status, issues: res.issues,
            ...(res.reason ? { reason: res.reason } : {}), ...(res.before ? { before: res.before } : {}) };
        }));
        for (const r of results) if (r) squadBrandConsistency.push(r);
        const allSkipped = squadBrandConsistency.length > 0 && squadBrandConsistency.every((r) => r.status === "skipped");
        stages.push({ key: "brandcheck", label: brandMarket.isZhTW ? "品牌一致性檢查" : "Brand consistency check",
          startedAt: checkStartedAt, completedAt: Date.now() - startedAt, status: allSkipped ? "failed" : "done" });
        if (allSkipped) console.warn(`[runSquadAuto] brandcheck skipped for ${input.squadSlug}: ${squadBrandConsistency[0]?.reason ?? "unknown"}`);
      }

      // 4c. 法規合規檢查（2026-09-30 CJ「要多加一道寫完後的合規檢查」）——品牌有啟用中的
      // 法規卡才跑；同樣只用剩下的時間，不夠就記 skipped。
      let squadRegulationCompliance: any[] = [];
      if (!strategyPublicPolicy && input.brandId && variants.some((v) => v.caption)) {
        const { checkVariantsCompliance } = await import("../../core/engine/regulationCompliance");
        const { enforceBrandRulesOnText } = await import("../../../strategy/core/brand/brandContext");
        const regStartedAt = Date.now() - startedAt;
        const remainingMs = 205_000 - (Date.now() - routeStartedAt) - 5_000;
        const recs = await checkVariantsCompliance({
          brandId: input.brandId,
          captions: variants,
          isZhTW: brandMarket.isZhTW,
          timeoutMs: Math.min(25_000, remainingMs),
          onFixed: async (vi, text) => {
            variants[vi]!.caption = await enforceBrandRulesOnText(input.brandId, text).catch(() => text);
          },
        });
        if (recs) {
          squadRegulationCompliance = recs;
          const allSkipped = recs.length > 0 && recs.every((r) => r.status === "skipped");
          stages.push({ key: "regcheck", label: brandMarket.isZhTW ? "法規合規檢查" : "Regulation compliance check",
            startedAt: regStartedAt, completedAt: Date.now() - startedAt, status: allSkipped ? "failed" : "done" });
        }
      }

      // 5. Build the background synthesis now, but do not start it until
      // the planning checkpoint has been committed and the HTTP response is
      // ready to return. Per user authorization, Anthropic receives only
      // de-identified planning conclusions, brand context and task input.
      let strategyBrandConsistency: any[] = [];
      const synthesizeStrategyPublicVariants = strategyPublicPolicy ? async () => {
          const slots = buildIgStrategyPublicSlots(sqSlugNew, input.topic, brandMarket.outputLanguage);
          if (!slots?.length) throw new Error("no public deliverable slots configured");
          return synthesizeIgStrategyPublicSlots({
            idOrSlug: sqSlugNew,
            topic: input.topic,
            brandContext: brandPrefix,
            brandId: input.brandId,
            outputLanguage: brandMarket.outputLanguage,
            slots,
            privateArtifacts,
            steps: stepsRaw,
            squadName: squad.name,
            methodology: typeof squad.methodology === "string"
              ? squad.methodology
              : squad.methodology?.author,
            agents: Object.values(agentMap),
            onBrandConsistency: (r) => { strategyBrandConsistency = r; },
          });
      } : null;
      const strategyPublicSlotCount = strategyPublicPolicy
        ? (buildIgStrategyPublicSlots(sqSlugNew, input.topic, brandMarket.outputLanguage)?.length ?? 0)
        : 0;

      // 6. Look up squad lead for the legacy captionAgent slot. Target tasks
      // never return an internal agent identity.
      let captionAgent: any = null;
      if (!strategyPublicPolicy && squad.lead_agent_id) {
        const lead = agentMap[squad.lead_agent_id];
        if (lead) captionAgent = { id: squad.lead_agent_id, name: lead.name, title: lead.title, avatarUrl: lead.avatarUrl };
        else {
          try {
            const [r]: any = await localPool.execute(
              `SELECT id, name, title, avatarUrl FROM agents WHERE id = ? LIMIT 1`,
              [squad.lead_agent_id],
            );
            const a = (r as any[])?.[0];
            if (a) captionAgent = { id: a.id, name: a.name, title: a.title, avatarUrl: a.avatarUrl ?? null };
          } catch {}
        }
      }

      let ok = strategyPublicPolicy
        ? planningArtifacts.some((artifact) => artifact.caption.length > 0)
        : variants.some((v) => v.caption.length > 0);

      // 2026-05-09 (CJ Phase 2): persist squad runs too so client can
      // navigate to /run/:outputId (consistent with orchestra path).
      let outputId: number | null = null;
      let missionId: number | null = null;
      const shouldPersist = strategyPublicPolicy
        ? true
        : ok;
      if (shouldPersist) {
        try {
          const { recordTaskRun, finaliseTaskRun } = await import("../../../platform/core/ops/recordTaskRun");
          const content = strategyPublicPolicy
            ? JSON.stringify({
                schemaVersion: 2,
                contentModel: "ig-strategy-bundle",
                planningArtifacts,
                publicVariants: variants,
              }, null, 2)
            : JSON.stringify(variants, null, 2);
          const metadata = (await import("../../../platform/core/ops/genMetrics")).stampGenMetrics(strategyPublicPolicy
            ? {
                latencyMs: Date.now() - startedAt,
                contentModel: "ig-strategy-bundle",
                planningCount: planningArtifacts.length,
                publicVariantCount: variants.length,
                publicSlotCount: strategyPublicSlotCount,
                publicFormats: [...new Set(variants.map((variant) => variant.format))],
                inputs: { topic: input.topic ?? "" },
              }
            : {
                latencyMs: Date.now() - startedAt,
                squadSlug: input.squadSlug,
                variantCount: variants.length,
                inputs: { topic: input.topic ?? "" },
                brandConsistency: squadBrandConsistency,
                regulationCompliance: squadRegulationCompliance,
              }, { durationMs: Date.now() - startedAt, ok, taskId: strategyRecordOverrides?.taskId ?? input.squadSlug });
          const persisted = await recordTaskRun({
            userId,
            brandId: input.brandId ?? null,
            workspace: strategyRecordOverrides?.workspace ?? "facebook",
            platform: strategyRecordOverrides?.platform,
            outputType: strategyRecordOverrides?.outputType,
            taskId: strategyRecordOverrides?.taskId ?? input.squadSlug,
            taskLabel: strategyRecordOverrides?.taskLabel ?? squad.name ?? input.squadSlug,
            tier: "99s",
            title: strategyRecordOverrides?.taskLabel
              ?? (await import("../../core/engine/titleFromCaption")).titleFromCaption(variants[0]?.caption, squad.name ?? input.squadSlug),
            content,
            metadata,
            ...(strategyPublicPolicy ? { progress: "caption_ready" as const } : {}),
            privateStrategyArtifacts: strategyPublicPolicy && privateRunId
              ? { runId: privateRunId, squadSlug: sqSlugNew, rows: privateArtifacts }
              : undefined,
          });
          outputId = persisted.outputId;
          missionId = persisted.missionId;
          if (strategyPublicPolicy && !outputId) {
            ok = false;
            errors.unshift(brandMarket.isZhTW
              ? "內容儲存失敗，請重試。"
              : "Content storage failed. Please retry.");
          } else if (strategyPublicPolicy && outputId && synthesizeStrategyPublicVariants) {
            const checkpointOutputId = outputId;
            // setImmediate keeps the mutation response independent of even the
            // first async brand-rule read. The output row already exists, so a
            // refresh can poll caption_ready while this continuation runs.
            setImmediate(() => {
              void (async () => {
                try {
                  const publicResults = await synthesizeStrategyPublicVariants();
                  const finalContent = JSON.stringify({
                    schemaVersion: 2,
                    contentModel: "ig-strategy-bundle",
                    planningArtifacts,
                    publicVariants: publicResults,
                  }, null, 2);
                  const finalMetadata = {
                    ...metadata,
                    taskId: strategyRecordOverrides?.taskId ?? input.squadSlug,
                    tier: "99s",
                    latencyMs: Date.now() - startedAt,
                    publicVariantCount: publicResults.length,
                    publicFormats: [...new Set(publicResults.map((variant) => variant.format))],
                    brandConsistency: strategyBrandConsistency,
                  };
                  const finalised = await finaliseTaskRun({
                    outputId: checkpointOutputId,
                    content: finalContent,
                    metadata: finalMetadata,
                    progress: "done",
                  });
                  if (!finalised.ok) {
                    console.warn("[runSquadAuto] target public synthesis finalise failed", {
                      taskId: strategyRecordOverrides?.taskId,
                      outputId: checkpointOutputId,
                    });
                  }
                } catch (e) {
                  console.warn("[runSquadAuto] target public synthesis failed", {
                    taskId: strategyRecordOverrides?.taskId,
                    outputId: checkpointOutputId,
                    message: (e as Error).message,
                  });
                  const finalised = await finaliseTaskRun({
                    outputId: checkpointOutputId,
                    progress: "failed",
                    progressDetail: brandMarket.isZhTW
                      ? "對外貼文產生失敗，內容規劃仍可使用，請重跑一次。"
                      : "Public post generation failed. The planning remains available; please run the task again.",
                  });
                  if (!finalised.ok) {
                    console.warn("[runSquadAuto] target public synthesis failure state could not be saved", {
                      taskId: strategyRecordOverrides?.taskId,
                      outputId: checkpointOutputId,
                    });
                  }
                }
              })();
            });
          }
        } catch (e) {
          console.warn("[runSquadAuto] recordTaskRun failed:", (e as Error).message);
          if (strategyPublicPolicy) {
            ok = false;
            errors.unshift(brandMarket.isZhTW
              ? "內容儲存失敗，請重試。"
              : "Content storage failed. Please retry.");
          }
        }
      }

      return {
        taskId: strategyRecordOverrides?.taskId ?? input.squadSlug,
        totalLatencyMs: Date.now() - startedAt,
        fetchedUrl: null,
        captionAgent,
        imageAgent: null,
        variants,
        planningArtifacts: strategyPublicPolicy ? planningArtifacts : undefined,
        stages,
        ok,
        errors,
        outputId,
        missionId,
        ...(strategyPublicPolicy && outputId ? { progress: "caption_ready" as const } : {}),
      };
    }),
};
