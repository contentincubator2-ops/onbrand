/**
 * quickTaskOrchestra — Plan B 20-second parallel fanout (2026-05-05).
 *
 * For each FB 30s task we run, in parallel:
 *   1. caption_writer (existing template agent) → 1 LLM call → N caption variants
 *   2. image_director (Mandy Cheng / 239184)   → 1 LLM call → N image briefs
 *   3. gpt-image-2 × N                           → parallel image gen
 *      (one same-model retry; a failed image carries canSwitchTo so the UI can
 *      offer Nano Banana — see stillImageModels.ts)
 *
 * URL fetch + persona loads + brand context all kick off at t=0 alongside.
 *
 * (The original 20-second / 7s-per-image ceiling and Flux cost figures no
 * longer apply — the tier budgets below are the live numbers.)
 */
import { loadBrandIdentityForImage, loadBrandPaletteHexes } from "../image/visualBrief";
import { resolveProductSubjectReference } from "./productSubjectPolicy";
import { findFirstUrl, fetchUrlSummary, formatUrlSummaryForPrompt } from "../../../platform/core/web/urlContext";
import { detectNonDeliverable } from "./captionSanity";
import { isAdCopyTemplate, extractRequestedUrl, validateAdCopy, repairAdCopy } from "./adCopyContract";
import { adSlotOf, repairAdSlot } from "./adSlotContract";
import { isShotListTemplate, normalizeShotList, validateShotList, repairShotList } from "./shotListContract";
import { isListingTemplate, normalizeListing, repairListing } from "./listingContract";
// 2026-08-31 五感十築：正向直述句型合約（skill 01 Hard Rule 1）。
import { extractYouTubeId, fetchYouTubeContext, formatYouTubeContextForPrompt } from "../../../platform/core/web/youtubeContext";
import { fetchViralPatterns, formatViralPatternsForPrompt } from "../../../strategy/core/monitor/socialListeningScout";
import { buildBrandPrefix as buildBrandContext, enforceBrandRulesOnText, enforceBrandRulesOnTextWithReport } from "../../../strategy/core/brand/brandContext";
import { roleChannelOfTemplate } from "../../../strategy/core/brand/channelRoles";
import { isEmailBodyTask } from "../catalog/edmCraft";
import { isInstagramBodyTask } from "../catalog/igCraft";
import { resolveTierVariantShape } from "./tierVariantShape";
import { resolveSingleVersion } from "./singleVersion";
import { isTikTokBodyTask } from "../catalog/ttCraft";
import { isYouTubeBodyTask } from "../catalog/ytCraft";
import { isKOLBodyTask } from "../catalog/klCraft";
import { getBrandRealContent } from "../../../strategy/core/brand/brandRealContent";
import { resolveAgentId } from "../squad/agentAssignments";
import { getBrandMarket, DEFAULT_BRAND_MARKET } from "../../../strategy/core/brand/brandMarket";
import type { FBTaskTemplate, OrchestraConfig } from "../catalog/quickTaskFB";
import { HARD_BUDGET_MS, HARD_BUDGET_60S, HARD_BUDGET_99S, QA_BUDGET_MS, OrchestraTier, AgentMeta, OrchestraStage, OrchestraVariant, OrchestraResult } from "./orchestra/orchestraTypes";
import { loadAgent } from "./orchestra/agentLoader";
import { stripPlaceholderBrackets, voiceSanitizeZhTW, looksNonChineseForZhTWBrand, reaskInZhTW, latinPunctLang, normalizeLatinPunct, mergeHookAndBody, deduplicateInternalCaption } from "./orchestra/captionSanitizers";
import { timeoutPromise, callCaptionWriter, callImageDirector, callCarouselCards, callReplyTemplates, callPostingTime, callFollowupPost, callStrategist, callCompareTable, callTimingAdvisor, callLegalAssistant } from "./orchestra/stageCalls";
import { safeOutputTypeForPostType, loadProductImageUrl, genOneImage } from "./orchestra/imageStep";
import { mergeCalendarPosts, expandCalendarVariants } from "./orchestra/calendarVariants";
import { runWithCancel, isRunCancelled, markRunDelivered } from "../../../platform/core/llm/runCancel";
import { stampGenMetrics, logGenCompleted } from "../../../platform/core/ops/genMetrics";
export { aiModelToProvider } from "./orchestra/orchestraTypes";
export type { OrchestraTier, AgentMeta, OrchestraStage, OrchestraVariant, OrchestraStrategist, OrchestraResult } from "./orchestra/orchestraTypes";
export { loadAgent } from "./orchestra/agentLoader";
export { stripPlaceholderBrackets, voiceSanitizeZhTW, looksNonChineseForZhTWBrand, reaskInZhTW, latinPunctLang, normalizeLatinPunct, sanitizeCaption, deduplicateInternalCaption } from "./orchestra/captionSanitizers";

 // 30s tier
 // 60s tier
 // 100s tier
// ── Helpers ──────────────────────────────────────────────────────────────

// ── Caption writer — N parallel LLM calls, one per variant ──────────────
//
// Design (CJ direction 2026-05-05): instead of 1 LLM call producing N JSON
// variants (which truncates / drops a variant when tokens get tight), we
// fan out N small calls. Each writes EXACTLY one variant. Failures are
// isolated; one missing variant gets retried once, rather than poisoning
// the whole batch. Wall time stays the same because they run in parallel.
//
// Each single-variant call is tiny (~150-300 tokens) so it never truncates.

// ── Image director LLM call ─────────────────────────────────────────────

// ── 60s tier extras: reply templates / posting time / followup post ─────
//
// Each extra is its own tiny LLM call (qwen, ~10s budget). Failures are
// non-fatal — the variant ships without that extra and UI shows "—".

// ── Strategist stage (FB 60s narrativeArc tasks) ────────────────────────
//
// Runs BEFORE caption_writer fanout. Outputs a 4-8 line "structure anchor"
// that gets piped into each per-variant call. This makes multi-post tasks
// (5-day countdown, 3-serial, launch-kit, live-suite) cohere across slots
// without each writer reinventing the arc.
//
// Cost: 1 LLM call ~6-8s. Adds to wall but reduces caption inconsistency.

// ── Specialty role outputs (FB 60s tasks #10/11/12) ─────────────────────

// ── Single image gen with per-image timeout ─────────────────────────────

// ── Main entry ───────────────────────────────────────────────────────────

async function runOrchestraInner(args: {
  template: FBTaskTemplate;
  config: OrchestraConfig;
  inputs: Record<string, string>;
  brandId?: number;
  /** 2026-05-11 (CJ): scope narrowing — when set, product/event positioning
   *  overlays brand baseline in the LLM system prompt. */
  productId?: number | null;
  eventId?: number | null;
  /** Caller's userId — used by recordTaskRun to write the output into
   *  mission_outputs so /projects can find it. Optional for back-compat. */
  userId?: number;
  /** Tier override — 60s/100s scale variants + add QA stage. Default 30s. */
  tier?: OrchestraTier;
  /**
   * 2026-08-11: which audience segment / sweet spot this piece was written
   * for. Resolved by the caller from the brand's stored strategy scenario, so
   * the labels can't drift from the scenario they came from.
   *
   * This is the anchor the whole performance story hangs on: without it a
   * published post can be measured, but not attributed to an audience — and
   * "which 族群 is worth more content" is the question the 成效 workspace
   * exists to answer. Absent for tasks started outside the workbench.
   */
  audienceTag?: {
    audience: string;
    spotTitle?: string | null;
    scenarioId?: string | null;
    spotIndex?: number | null;
  } | null;
  /**
   * 2026-09-30（CJ「廣告文案要標註」）：從活動企劃寫某一篇時，那一篇在企劃裡的位置與
   * 要不要下廣告。由 caller 讀好（strategy/core/campaignItemBrief.ts），這裡接在品牌大腦
   * 後面，並寫進產出的 metadata（產出頁、本週企劃靠它標「廣告文案」）。
   */
  campaignItem?: import("../campaign/campaignItemBrief").CampaignItemInfo | null;
  /**
   * 2026-05-14 (CJ「先回 caption + brief、image 跟 QA 變 async polling」):
   * Optional checkpoint — fires AFTER captions + briefs are assembled but
   * BEFORE image gen / extras / QA. Caller can persist this partial result,
   * return a fast response to the user (~30-40s), and let the rest of the
   * orchestra continue running in the background. Caller is responsible
   * for awaiting the full `runOrchestra` Promise to capture the final
   * variants (with image URLs + QA + extras) and writing them to the same
   * mission_output row.
   *
   * The checkpoint result has:
   *   - variants[i].caption  — fully assembled
   *   - variants[i].hashtags — fully assembled
   *   - variants[i].image    — { style: brief, url: null, status: "pending" }
   *   - qa: undefined        — runs after checkpoint
   *   - extras: undefined    — runs after checkpoint
   */
  onCheckpoint?: (partial: OrchestraResult) => void;
  /** Caller-owned cancel signal (see platform/core/llm/runCancel.ts). */
  signal?: AbortSignal;
  /** Registry key of this run, so checkpoint can mark output as delivered. */
  runKey?: string;
}): Promise<OrchestraResult> {
  // Tier-based config scaling (additive, doesn't mutate original config).
  // 60s/100s bumps variants 3 → 5 but task config typically only has 3
  // variantLabels. Pad with extra labels so each new variant has a usable
  //口吻 instead of "版本 4" fallback.
  //
  // 2026-08-11 (bug checklist C2「應產出4張，實際1張」): this bump used to
  // apply UNCONDITIONALLY — it silently overwrote a `cardsPerVariant`
  // config's deliberate variants:1 back to 5, forcing the task to write 5
  // FULL alternate variants (caption + Stage-3 image each) before ever
  // reaching the cards stage that Stage 3.6 needs `variants[0].caption` for.
  // For fb-60-album-4 that turned "1 post + 4 cards" into "5 posts + maybe
  // cards if there's still budget left" — and was the direct cause of a
  // "hard 130s budget exceeded" failure in an on-dev verification run (5x
  // the LLM/image work before Stage 3.6 even starts). A cardsPerVariant
  // config already fully specifies its own shape (ONE variant + N cards)
  // and its own variantLabels/extras — same exemption philosophy as the
  // router's "isPack" clamp skip in quickTaskRouter's central 60s rule.
  const tier: OrchestraTier = args.tier ?? "30s";
  if (tier === "60s" || tier === "99s") {
    // 2026-08-22 (CJ 驗收 ig-60-live-suite「6 段流程表只回 5 段」): this used to
    // hardcode variants:5, which TRUNCATED every pack declaring more (6 段直播
    // 流程少了收尾預告；fb-99-livestream-9seg 的 9 段只出 5 段) and PADDED every
    // pack declaring fewer (3 篇連載多出「進階版／替代版」兩個沒人要的 tab).
    // See tierVariantShape.ts — a pack ships what it declares, everything
    // else keeps the 5-version floor.
    const shape = resolveTierVariantShape({
      variants: args.config.variants,
      images: args.config.images,
      variantLabels: args.config.variantLabels,
      postLabels: args.config.postLabels,
      postsCount: args.config.extras?.postsCount,
    });

    // 60s tier KEY differentiators vs 30s:
    //   1. runImageGen=true (Flux really runs — real images, not just briefs)
    //   2. extras enabled — production-package add-ons (replies, time, followup)
    // 100s tier: same as 60s + scout already added at stage 1 + future video gen.
    const defaultExtras = {
      replyTemplates: 5,
      postingTime: true,
      followupPost: true,
    };
    args = {
      ...args,
      config: {
        ...args.config,
        variants: shape.variants,
        images: shape.images,
        variantLabels: shape.variantLabels,
        runImageGen: args.config.images > 0,  // 60s: yes if task has visual
        extras: { ...defaultExtras, ...(args.config.extras ?? {}) },
      },
    };
  }
  // 2026-09-29（CJ「任務產出直接就只有一個版本」）：單篇的替代版本收斂成一篇，
  // 換風格改在產出頁換 agent 重寫。套組／多卡／候選池／多選即交付物的卡不動 —— 見 singleVersion.ts。
  if (tier === "30s") {
    const single = resolveSingleVersion({
      taskId: args.template?.id,
      variants: args.config.variants,
      images: args.config.images,
      variantLabels: args.config.variantLabels,
      postLabels: args.config.postLabels,
      postsCount: args.config.extras?.postsCount,
      cardsPerVariant: args.config.cardsPerVariant,
    });
    if (single) args = { ...args, config: { ...args.config, ...single } };
  }
  const baseBudget = tier === "60s" ? HARD_BUDGET_60S : tier === "99s" ? HARD_BUDGET_99S : HARD_BUDGET_MS;
  // 長文件卡（案例提報 / 行事曆整月大綱）本質上不是 30s 的工作量，但仍走
  // 30s 引擎。給它們自己的總預算，否則 caption 還沒生完 job 就被判超時。
  const tierBudget = args.config.hardBudgetMs ?? baseBudget;

  const startedAt = Date.now();
  const stages: OrchestraStage[] = [];
  const errors: string[] = [];

  function stage(key: string, label: string): OrchestraStage {
    const s: OrchestraStage = { key, label, startedAt: Date.now() - startedAt, status: "running" };
    stages.push(s);
    return s;
  }

  const inputLabels = new Map(
    (args.template.inputs ?? []).map((input) => [input.key, input.label.trim()]),
  );
  const inputKeys = Object.keys(args.inputs);
  const userMsg =
    Object.entries(args.inputs)
      .map(([k, v]) => `[${inputLabels.get(k) || k}] ${v}`)
      .join("\n") || "(no extra inputs)";

  // 2026-05-14 (CJ「async polling」): when onCheckpoint persists a partial
  // row, these track the row id so the end-of-orchestra block UPDATEs
  // instead of inserting a duplicate row.
  let persistedOutputId: number | null = null;
  let persistedMissionId: number | null = null;

  // Wrap in 20s hard budget
  const orchestra = (async (): Promise<OrchestraResult> => {
    // ── Stage 1: parallel pre-work (URL fetch, persona loads, brand) ──
    const stPre = stage("pre", "URL / persona / brand");

    // YT-first URL detection: if any input has a YouTube URL, fetch
    // metadata + transcript (richer context than generic urlContext).
    // Otherwise fall back to generic urlContext for non-YT links.
    const inputValues = Object.values(args.inputs).filter((v): v is string => typeof v === "string");
    // Ad-copy tasks: a non-YouTube URL in the brief is the *landing page*
    // (carried separately as requestedUrl), not the topic source — do not
    // fetch it and never let it override the brand as「主題」. YouTube links
    // stay reference material and keep the existing fetch path.
    const adCopyTask = isAdCopyTemplate(args.template);
    // 2026-09-25：禁用詞改寫同樣會打壞單欄位廣告卡的形狀（按鈕文字被改長）——
    // 跟 adCopy / shotList 一樣，改寫後要再修補一次。
    const adSlotTask = adSlotOf((args.template as any)?.id);
    const shotListTask = isShotListTemplate(args.template);
    // 2026-10-04：商品頁（電商／開店平台 tray）交付的是欄位；每個會改寫文字的後處理都要再修補一次，
    // 而且段落去重、佔位符清理這類「把貼文弄乾淨」的步驟會把欄位結構吃掉，要跳過。
    const listingSpec = isListingTemplate(args.template) ? args.template.listingSpec! : null;
    const requestedUrl = adCopyTask ? extractRequestedUrl(args.inputs) : null;
    const ytUrlInput = inputValues.find((v) => !!extractYouTubeId(v));
    const firstUrl = ytUrlInput
      ? findFirstUrl(ytUrlInput)
      : inputValues.map((v) => findFirstUrl(v)).find((url): url is string => !!url) ?? null;
    const isLandingUrl = (u: string | null) =>
      !!u && !!requestedUrl && u.replace(/^https?:\/\//i, "") === requestedUrl.replace(/^https?:\/\//i, "");
    const detectedUrl = isLandingUrl(firstUrl) ? null : firstUrl;

    // 100s tier: also kick off scout (viral patterns research) in parallel
    const isResearchTier = tier === "99s";
    const taskTopic = inputValues[0]?.slice(0, 200) ?? "";
    const taskChannel =
      args.template.outputDefaults?.platform ??
      (args.template.id?.startsWith("ig-") ? "instagram"
        : args.template.id?.startsWith("yt-") ? "youtube"
        : args.template.id?.startsWith("tt-") ? "tiktok"
        : args.template.id?.startsWith("li-") ? "linkedin"
        : args.template.id?.startsWith("em-") ? "email"
        : args.template.id?.startsWith("pr-") ? "press"
        : "facebook");

    // 2026-05-08: resolve agent IDs from JSON assignments (B+ pool, 498
    // unique agents). Falls back to hardcoded template values if JSON
    // missing the assignment. Single map lookup, no DB query, no timeout.
    const taskId = args.template.id;
    const resolvedLeadId      = resolveAgentId(taskId, "lead",          args.template.agent_id);
    const resolvedImageDirId  = resolveAgentId(taskId, "imageDirector", args.config.imageDirectorId);
    const resolvedStrategistId = resolveAgentId(taskId, "strategist",   args.config.strategistAgentId);
    const resolvedSpecialtyId  = resolveAgentId(taskId, "specialty",    args.config.specialtyAgentId);

    const [captionLoad, imageLoad, ytContext, urlSummary, brandPrefix, viralPatterns, brandMarket, topicResearch] = await Promise.all([
      loadAgent(resolvedLeadId),
      loadAgent(resolvedImageDirId),
      ytUrlInput
        ? (async () => { try { return await fetchYouTubeContext(ytUrlInput); } catch { return null; } })()
        : Promise.resolve(null),
      // Generic URL fetch only when there's a non-YT URL
      (async () => {
        if (ytUrlInput || !detectedUrl) return null; // skip — YT path handles it
        try { return await fetchUrlSummary(detectedUrl); } catch { return null; }
      })(),
      // Brand brain + REAL public content merged.
      // brandRealContent (website + social via Perplexity) is the strongest
      // grounding signal — without it AI hallucinates industry from brand
      // name (e.g. 桂冠營養研究室 → 美妝). 2026-05-08 (CJ direction).
      //
      // 2026-09-29（CJ「一律讀完整版」＋「知識庫是隱藏內容，不需要讀取」）：
      // 拿掉 2026-05-17 的 core／full 分層——每個 tier 都讀同一份品牌大腦，
      // 也就是「檢查大腦」畫面上列出來的那一份。知識庫不再注入。
      Promise.all([
        // 2026-10-03：帶上任務所在平台 → 該平台在策略層存過「通路角色」就只注入那一張。
        buildBrandContext(args.brandId, args.productId, args.eventId, "full", roleChannelOfTemplate(args.template)).catch(() => ""),
        args.brandId
          ? getBrandRealContent(args.brandId).then(r => r.context).catch(() => "")
          : Promise.resolve(""),
        args.campaignItem
          ? import("../campaign/campaignItemBrief").then((m) => m.campaignItemBriefText(args.campaignItem!))
          : Promise.resolve(""),
      ]).then(([prefix, real, item]) => prefix + (real || "") + (item || "")),
      // Scout stage — only fires for 100s tier. scoutKind drives WHAT we fetch:
      // viral (default) / festivals (calendar tasks) / trending (時事改寫) / news.
      // 2026-05-18 (CJ 驗收: em-99 序列只產 5 封 + 502): scout fires for
      // ALL 99s by default (gated on isResearchTier only), so removing
      // scoutKind never disabled it. config.disableScout fully skips it
      // for sequence-style tasks whose logic lives in the prompt.
      (isResearchTier && !args.config.disableScout)
        ? (async () => {
            try {
              // 2026-05-18 (CJ「FB 30天行事曆又 502」): scout is a LIVE web
              // fetch (festivals/trending/news) with no timeout — if it
              // hangs it blocks Stage 1 → strategist/captions/checkpoint
              // never reached within nginx's 60s → 502. Cap it; null is
              // non-fatal (task just ships without real-data validation).
              return await Promise.race([
                fetchViralPatterns({
                  channel: taskChannel,
                  topic: taskTopic,
                  brandId: args.brandId,
                  kind: args.config.scoutKind ?? "viral",
                }),
                timeoutPromise<null>(18_000, "scout"),
              ]);
            } catch { return null; }
          })()
        : Promise.resolve(null),
      // 2026-07-17 多市場: brand's targetCountry/outputLanguage → master
      // persona market + zh-TW sanitizer gate. Fail-safe zh-TW default.
      getBrandMarket(args.brandId).catch(() => DEFAULT_BRAND_MARKET),
      // 2026-10-04（CJ）：researchTopic 任務寫作前先針對當次主題上網找案例與說法。
      // 有時間上限、失敗不擋寫作 —— 沒查到就誠實回 note，文案照常依輸入與品牌資料寫。
      args.config.researchTopic && (inputValues[0] ?? "").trim().length >= 2
        ? (async () => {
            try {
              const { researchTopic } = await import("../catalog/cardResearch");
              const market = await getBrandMarket(args.brandId).catch(() => DEFAULT_BRAND_MARKET);
              return await Promise.race([
                researchTopic({
                  topic: Object.values(args.inputs).filter((v) => typeof v === "string" && v.trim()).join("；").slice(0, 300),
                  cardName: typeof args.template.label === "string" ? args.template.label : (args.template.label?.zh ?? args.template.id),
                  channel: taskChannel,
                  market: market.outputLanguage,
                }),
                timeoutPromise<null>(22_000, "topic-research"),
              ]);
            } catch (e) {
              console.warn("[orchestra] topic research failed:", String((e as any)?.message ?? e).slice(0, 200));
              return null;
            }
          })()
        : Promise.resolve(null),
    ]);

    if (args.config.researchTopic) {
      const stRes = stage("research", "上網查當次主題的案例與說法");
      stRes.status = topicResearch && topicResearch.references.length > 0 ? "done" : "failed";
      stRes.completedAt = Date.now() - startedAt;
    }
    const researchContext = topicResearch ? (await import("../catalog/cardResearch")).formatResearchForPrompt(topicResearch.references) : "";
    const researchRefs = topicResearch?.references ?? [];
    const researchNote = topicResearch
      ? topicResearch.note
      : (args.config.researchTopic ? "這次查資料逾時或失敗，文案只依你的輸入與品牌資料寫成。" : null);

    // Record scout stage for 100s
    if (isResearchTier) {
      const stScout = stage("scout", `爬取 ${taskChannel} 爆款 / 趨勢`);
      if (viralPatterns && viralPatterns.patterns.length > 0) {
        stScout.status = "done";
      } else {
        stScout.status = "failed";
        errors.push("scout: 無 API key 或無結果（100s tier 將不含 real-data validation）");
      }
      stScout.completedAt = Date.now() - startedAt;
    }
    stPre.status = "done";
    stPre.completedAt = Date.now() - startedAt;

    // YT path takes priority — it surfaces transcript + metadata, much
    // richer than urlContext. fetchedUrl carries either YT or generic.
    const fetchedUrl = ytContext
      ? {
          url: ytContext.url,
          title: ytContext.title,
          chars: ytContext.transcript?.length ?? 0,
          og: {
            image: ytContext.thumbnail,
            title: ytContext.title,
            description: ytContext.description,
            site_name: ytContext.channelTitle,
            domain: "youtube.com",
          },
        }
      : urlSummary
        ? { url: urlSummary.url, title: urlSummary.title, chars: urlSummary.fetched_chars, og: urlSummary.og }
        : null;
    const urlFetchFailure = detectedUrl && !fetchedUrl
      ? { url: detectedUrl, reason: "content_unavailable" as const }
      : null;
    let urlContext = ytContext
      ? "\n\n" + formatYouTubeContextForPrompt(ytContext) + "\n\n"
      : urlSummary
        ? "\n\n" + formatUrlSummaryForPrompt(urlSummary) + "\n\n"
        : "";
    // Append viral patterns research to urlContext (so it gets injected
    // alongside URL content, downstream of brand)
    if (viralPatterns && viralPatterns.patterns.length > 0) {
      urlContext += "\n\n" + formatViralPatternsForPrompt(viralPatterns, args.config.scoutKind ?? "viral") + "\n\n";
    }

    // ── Stage 1.5: Strategist (FB 60s narrativeArc tasks) ─────────────
    // Runs synchronously BEFORE caption_writer fanout; output piped as
    // anchor into each per-variant call. Skip for non-narrativeArc.
    let strategistAnchor = "";
    let strategistMeta: AgentMeta | null = null;
    const useStrategist =
      (tier === "60s" || tier === "99s") &&
      !!resolvedStrategistId &&
      !!args.config.extras?.narrativeArc;
    if (useStrategist) {
      const stStrat = stage("strategist", "Strategist 規劃系列敘事弧");
      try {
        const stratLoad = await loadAgent(resolvedStrategistId);
        strategistMeta = stratLoad.meta;
        const labels = (args.config.postLabels && args.config.postLabels.length > 0)
          ? args.config.postLabels
          : args.config.variantLabels.slice(0, args.config.variants);
        strategistAnchor = await callStrategist({
          template: args.template,
          strategistPersona: stratLoad.persona,
          brandPrefix,
          urlContext,
          userMsg,
          postLabels: labels,
          deliverable: args.config.strategistDeliverable,
          unit: args.config.strategistUnit,
        });
        stStrat.status = strategistAnchor ? "done" : "failed";
        stStrat.completedAt = Date.now() - startedAt;
      } catch (e: any) {
        stStrat.status = "failed";
        stStrat.completedAt = Date.now() - startedAt;
        errors.push(`strategist: ${String(e?.message ?? e)}`);
      }
    }

    // ── Stage 2: caption + image briefs in parallel ───────────────────
    const stCap = stage("caption", `${captionLoad.meta?.name ?? "Caption agent"} 寫 ${args.config.variants} 個變體`);
    const stImg = args.config.imageDirectorId
      ? stage("brief", `${imageLoad.meta?.name ?? "Mandy Cheng"} 寫 ${args.config.images} 條視覺 brief`)
      : null;

    const [captions, briefs] = await Promise.all([
      callCaptionWriter({
        template: args.template,
        config: args.config,
        captionPersona: captionLoad.persona,
        agentAiModel: captionLoad.aiModel, // ← drives provider selection (qwen/Kimi/glm)
        brandPrefix,
        urlContext,
        researchContext,
        userMsg,
        inputKeys,
        strategistAnchor: strategistAnchor || undefined,
        market: brandMarket.marketCode, // 2026-07-17 多市場
        isZhTW: brandMarket.isZhTW,
        requestedUrl,
      }).then((c) => { stCap.status = "done"; stCap.completedAt = Date.now() - startedAt; return c; }).catch((e) => {
        stCap.status = "failed";
        stCap.completedAt = Date.now() - startedAt;
        errors.push(`caption: ${String(e?.message ?? e)}`);
        return [];
      }),
      args.config.imageDirectorId
        ? callImageDirector({
            template: args.template,
            config: args.config,
            imagePersona: imageLoad.persona,
            brandPrefix,
            urlContext,
            userMsg,
          }).then((b) => { if (stImg) { stImg.status = "done"; stImg.completedAt = Date.now() - startedAt; } return b; }).catch((e) => {
            if (stImg) { stImg.status = "failed"; stImg.completedAt = Date.now() - startedAt; }
            errors.push(`brief: ${String(e?.message ?? e)}`);
            return [];
          })
        : Promise.resolve<string[]>([]),
    ]);

    // ── Caption post-validation ─────────────────────────────────────────
    // CJ QA:「FB 廣告 Headline 5 種：輸入籠統時 AI 回傳一大段要求澄清的
    // 文字（遠超 25 字），直接塞進廣告標題視覺區塊，破壞版型」。The
    // length rule lives in the prompt, but nothing enforced it after
    // generation. Non-deliverable content is rejected for every task. The
    // first-line and hard-length clamps remain exclusive to micro tasks.
    if (Array.isArray(captions)) {
      for (let vi = 0; vi < captions.length; vi++) {
        const v = captions[vi];
        if (!v?.caption) continue;
        const sanity = detectNonDeliverable(v.caption, {
          isZhTW: brandMarket.isZhTW,
          structured: !!args.config.calendarMerge,
          inputKeys,
        });
        if (sanity) {
          errors.push(`caption(${v.label ?? vi + 1}): model returned non-deliverable content (${sanity.reason}) — 重生這段 to retry`);
          v.caption = "";
        }
      }
    }
    if (args.config.captionMaxChars > 0 && args.config.captionMaxChars <= 60 && Array.isArray(captions)) {
      const cap = args.config.captionMaxChars;
      for (const v of captions) {
        if (!v?.caption) continue;
        let c = v.caption.trim();
        // First non-empty line only (micro tasks are single-line by spec)
        const firstLine = c.split(/\n+/).map((l) => l.trim()).find((l) => l.length > 0) ?? "";
        if (firstLine && firstLine.length < c.length) c = firstLine;
        // Hard cap at 2× the spec (small tolerance), ellipsis-truncated
        const cps = Array.from(c);
        if (cps.length > cap * 2) c = cps.slice(0, cap).join("") + "…";
        v.caption = c;
      }
    }

    // ── Brand-rule enforcement: 硬檢查 + 自動修正 (2026-05-17) ──
    // Soft prompt injection never guaranteed adherence. Deterministically
    // apply term_substitutions (X→Y) and detect banned_words on every
    // produced caption; if a banned word survives, regenerate that
    // caption ONCE with a hard "must not contain" instruction, then
    // re-apply subs. Guarantees the checkable brand-brain rules.
    // 2026-06-05 (CJ「不阻擋，事後解釋」): use report variant so the UI can
    // show a Mia nudge ("發現你寫了 X，已自動改成 Y，想調整定位嗎？")
    // instead of silently rewriting. Accumulated into `brandFixes` for metadata.
    const brandFixes: Array<{ variantIndex: number; bannedHits: string[]; subsApplied: Array<{ from: string; to: string }>; rewrittenByLLM: boolean }> = [];
    if (Array.isArray(captions) && captions.length && args.brandId) {
      try {
        for (let vi = 0; vi < captions.length; vi++) {
          const v = captions[vi];
          if (!v?.caption) continue;
          const report = await enforceBrandRulesOnTextWithReport(args.brandId, v.caption);
          if (report.text && report.text !== v.caption) {
            // A banned-word LLM rewrite can drop the markers / landing URL;
            // re-apply the deterministic repair and re-validate.
            // 2026-08-23: 分格腳本同理 —— VM probe（brand_id=2924）實測，改寫
            // 後下一格的時間戳會被黏回上一格「字卡：」那行。本機沒帶 brandId
            // 跑不到這一關，所以只有正式環境現形。
            v.caption = adCopyTask ? repairAdCopy(report.text, requestedUrl)
              : shotListTask ? repairShotList(report.text)
              : listingSpec ? repairListing(report.text, listingSpec)
              : adSlotTask ? repairAdSlot(report.text, adSlotTask)
              : report.text;
            if (adCopyTask) {
              const issue = validateAdCopy(v.caption, requestedUrl);
              if (issue) console.warn(`[orchestra] ad-copy contract unmet after brand rewrite (${v.label}): ${issue.detail}`);
            }
            if (shotListTask) {
              const issue = validateShotList(v.caption);
              if (issue) console.warn(`[orchestra] shot-list contract unmet after brand rewrite (${v.label}): ${issue.detail}`);
            }
          }
          if (report.bannedHits.length > 0 || report.subsApplied.length > 0) {
            brandFixes.push({
              variantIndex: vi,
              bannedHits: report.bannedHits,
              subsApplied: report.subsApplied,
              rewrittenByLLM: report.rewrittenByLLM,
            });
          }
        }
      } catch (e) {
        console.warn("[orchestra] brand-rule enforcement skipped:", (e as Error)?.message);
      }
    }
    // expose brandFixes to caller via the return shape (attached lower)
    (captions as any).__brandFixes = brandFixes;

    // ── EDM craft self-check: 7 維度產出後守門 (2026-05-17) ──
    // Email body tasks only. Cheap deterministic gate (spam-trigger
    // words / CTA proliferation); only when it fails do ONE LLM tighten
    // pass against the rubric — ~zero cost when output is already good
    // (same proven pattern as brand-rule enforcement).
    if (Array.isArray(captions) && captions.length && isEmailBodyTask(args.template)) {
      const SPAM = ["免費", "中獎", "保證", "瘋搶", "限時搶購", "100%", "點這裡", "立即購買！！",
        "free!!!", "guarantee", "act now", "click here", "winner", "$$$"];
      const ctaCount = (t: string) =>
        (t.match(/立即|馬上|點此|點擊|了解更多|現在就|搶先|報名|購買|訂閱|前往|查看|按此|here|now|shop|buy|join|register/gi) || []).length;
      for (const v of captions) {
        if (!v?.caption) continue;
        const t = v.caption;
        const spamHit = SPAM.some((w) => t.toLowerCase().includes(w.toLowerCase()));
        const ctaBloat = ctaCount(t) > 4;
        if (!spamHit && !ctaBloat) continue; // already clean → no LLM cost
        try {
          const { invokeLLM } = await import("../../../platform/core/llm/llm");
          const r: any = await invokeLLM({
            provider: "anthropic",
            messages: [{ role: "user", content:
              `依 EDM 工藝準則收緊這封 email：移除垃圾觸發詞（${SPAM.slice(0, 8).join("、")} 等濫用語）、` +
              `收斂成「單一主要 CTA」（最多重複 2 次）、行動裝置可掃讀、利益導向。` +
              `保持原意、品牌語氣、長度與換行，只輸出收緊後文字本身，不要前言：\n\n${t}` }],
            maxTokens: 1200,
          });
          const tightened = String(r?.content ?? r?.text ?? "").trim();
          if (tightened) {
            // re-apply brand hard rules (rewrite must not reintroduce)
            v.caption = args.brandId
              ? await enforceBrandRulesOnText(args.brandId, tightened).catch(() => tightened)
              : tightened;
          }
        } catch { /* fail-safe: keep caption */ }
      }
    }

    // ── IG craft self-check: 視覺優先媒介產出後守門 (2026-05-17) ──
    // IG-family body tasks only. Cheap deterministic gate (missing
    // first-line hook / hashtag spam / CTA proliferation); only when
    // it fails do ONE LLM tighten pass against the IG rubric —
    // ~zero cost when output is already good (same proven pattern
    // as EDM self-check / brand-rule enforcement). Fail-safe.
    // 2026-08-22 (CJ「IG 直播配套應該是完整直播範本」): cleanPrompt tasks are
    // strict structured deliverables (直播流程表 / newsjack 四欄), not posts.
    // The gate below fires on exactly what such a script legitimately
    // contains — a spoken opener（「大家好…」＝genericOpener）and several
    // 互動指令（愛心 / 留言 / 私訊 / 截圖 ＝ ctaBloat）— and the tighten pass
    // would rewrite the run-of-show back into an IG caption. Skip them.
    if (Array.isArray(captions) && captions.length && isInstagramBodyTask(args.template) &&
        !args.config.cleanPrompt) {
      const ctaCount = (t: string) =>
        (t.match(/立即|馬上|點此|點擊|了解更多|現在就|搶先|報名|購買|訂閱|前往|查看|按此|留言|分享|儲存|收藏|追蹤|here|now|shop|buy|join|register|save|share|follow|link in bio/gi) || []).length;
      for (const v of captions) {
        if (!v?.caption) continue;
        const t = v.caption;
        const firstLine = (t.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "").trim();
        // weak first-line hook heuristic: empty, generic opener, or
        // long bland sentence with no curiosity/benefit/contrast cue.
        const genericOpener = /^(大家好|哈囉|嗨|你好|各位|今天(要|想)?(分享|跟大家|來)|歡迎)/.test(firstLine);
        const noHook = firstLine.length === 0 || genericOpener;
        const hashtagCount = (t.match(/#[^\s#]+/g) || []).length;
        const hashtagSpam = hashtagCount > 12;
        const ctaBloat = ctaCount(t) > 4;
        if (!noHook && !hashtagSpam && !ctaBloat) continue; // already good → no LLM cost
        try {
          const { invokeLLM } = await import("../../../platform/core/llm/llm");
          const r: any = await invokeLLM({
            provider: "anthropic",
            messages: [{ role: "user", content:
              `依 IG 工藝準則收緊：第一行強 hook、單一 CTA、hashtag 3-8 個放文末、可掃讀，` +
              `保持原意/品牌語氣/長度，只輸出收緊後文字：\n\n${t}` }],
            maxTokens: 1200,
          });
          const tightened = String(r?.content ?? r?.text ?? "").trim();
          if (tightened) {
            // re-apply brand hard rules (rewrite must not reintroduce)
            v.caption = args.brandId
              ? await enforceBrandRulesOnText(args.brandId, tightened).catch(() => tightened)
              : tightened;
          }
        } catch { /* fail-safe: keep caption */ }
      }
    }

    // ── TikTok / YouTube 品牌聲音守門 (2026-05-19, CJ 驗收) ──
    // 追熱點框架天生帶高能量 FYP 預設；prompt-only guardrail 在 per-variant
    // fanout + 模型隨機（anthropic/openai）下無法保證每個變體都守住——
    // 實測 TikTok Day 1-3 反覆崩、Day 4-5 才好；YT Premiere 的 Community
    // 倒數 ×5 子分支同樣漏驚嘆號 + 業配腔（「響亮無比！」）。改用「確定性
    // regex 一律清洗 + 必要時 LLM 收緊」的雙層守門（同 EDM/IG self-check
    // 證實有效的模式），對每一個變體都生效，不依賴模型自律。
    // 2026-07-17 多市場: zh-TW-only gate — voiceSanitizeZhTW converts to
    // Traditional Chinese / Taiwan wording, strips emoji, ！→。 — it would
    // corrupt English / Japanese output. Non-zh-TW brands skip this block.
    if (brandMarket.isZhTW && !args.template.keepOwnVoice && Array.isArray(captions) && captions.length &&
        (isTikTokBodyTask(args.template) || isYouTubeBodyTask(args.template) ||
         isKOLBodyTask(args.template))) {
      // L1 deterministic: 高信心、零成本、一律套用（hoisted 共用函式）。
      const ttDet = voiceSanitizeZhTW;
      for (const v of captions) {
        if (!v?.caption) continue;
        v.caption = ttDet(v.caption);
        const t = v.caption;
        const firstLine = (t.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "").trim();
        // 仍需 LLM 收緊的觸發：開場是呼籲句 / 偵測到簡體 / 殘留帶貨詞
        const imperativeOpen = /^(注意|快|趕快|別再|馬上|立刻|全台|各位|嗨|哈囉|大家好)/.test(firstLine);
        const simplifiedHit = /[这个们时应该说话语]/.test(t) && /[这们应]/.test(t);
        const salesyHit = /(亮起來|大放異彩|宇宙無敵|響亮無比|快來|佼佼者|趕快|別再猶豫|一起來討論|數位世界裡)/.test(t);
        if (!imperativeOpen && !simplifiedHit && !salesyHit) continue; // 已乾淨 → 零成本
        try {
          const { invokeLLM } = await import("../../../platform/core/llm/llm");
          const r: any = await invokeLLM({
            provider: "anthropic",
            messages: [{ role: "user", content:
              `這是一段品牌文案（可能是短影音腳本、首播預熱貼文、或 KOL 邀約話術）。請用「沉穩觀察者／守護者」語氣收緊，嚴格遵守：\n` +
              `1. 全文不得有句尾或句中驚嘆號、不得有 emoji；不得出現「快來」「注意」「亮起來」「大放異彩」「宇宙無敵」「響亮無比」「佼佼者」「在這個/快速進化的數位世界裡」「更加精彩」「期待你的回音」「引人注目」「非常契合」等帶貨/浮誇/PR 腔詞。\n` +
              `2. 開場第一行必須是「觀察句或反問句」，不得以呼籲句、寒暄或 PR 腔起頭。\n` +
              `   正向範例語感：「你的 AI 生出來的文案，真的是你嗎？」「大家都在說 AI 工具很強，但很少有人問它有沒有在用你的品牌邏輯說話。」\n` +
              `3. 受眾是品牌行銷主管 / 經營者 / 合作創作者（專業對象），措辭對齊專業決策者，不要寫成對一般消費者喊話。\n` +
              `4. 全文繁體中文（台灣用語，用「管道」不用「渠道」），不得有簡體字。收尾用一個對方會想回的具體問句，不要 PR 套語。\n` +
              `保持原本的主題、結構分段與長度，只輸出收緊後的文案本身，不要前言：\n\n${t}` }],
            maxTokens: 1200,
          });
          let tightened = String(r?.content ?? r?.text ?? "").trim();
          if (tightened) {
            tightened = ttDet(tightened); // 收緊後再過一次確定性清洗
            v.caption = args.brandId
              ? await enforceBrandRulesOnText(args.brandId, tightened).catch(() => tightened)
              : tightened;
          }
        } catch { /* fail-safe: keep deterministically-cleaned caption */ }
      }
    }

    // ── IG 簡→繁 確定性守門 (2026-05-19, CJ 驗收 IG2「怎么 簡體漏出」) ──
    // IG body 任務的品牌聲音已穩（驗收多為 2 分），不需 LLM 改寫——只需
    // 把零星漏出的簡體字確定性轉繁。逐字 1:1 對應的簡體字形在 zh-TW
    // 產出中本就不該出現，無語境誤傷風險，零成本一律套用。
    if (Array.isArray(captions) && captions.length && isInstagramBodyTask(args.template)) {
      const S2T: Record<string, string> = {
        "么": "麼", "这": "這", "个": "個", "们": "們", "时": "時",
        "应": "應", "说": "說", "让": "讓", "优": "優", "体": "體",
        "关": "關", "实": "實", "现": "現", "发": "發", "内": "內",
        "数": "數", "据": "據", "网": "網", "资": "資", "讯": "訊",
        "构": "構", "习": "習", "众": "眾", "签": "籤", "动": "動",
        "钩": "鉤", "击": "擊", "门": "門", "问": "問", "题": "題",
        // 2026-08-23 VM probe：分格腳本寫「每次放盒子都對齐同一點」漏網。
        // 補的是拍攝指示常用字（對齊 / 冷凍 / 標記 / 對線 / 旋轉）。
        "齐": "齊", "冻": "凍", "标": "標", "记": "記", "线": "線", "转": "轉",
      };
      for (const v of captions) {
        if (!v?.caption) continue;
        // 字元類要跟 S2T 的 key 同步 —— 沒列進來的字不會被查表。
        v.caption = v.caption.replace(/[么这个们时应说让优体关实现发内数据网资讯构习众签动钩击门问题齐冻标记线转]/g,
          (c: string) => S2T[c] ?? c);
      }
    }

    // ── zh-TW 語言守門 (2026-08-11, C3 殘留「fb-60-link-full 用英文回覆」) ──
    // Unlike the style gates above (scoped to TikTok/YT/KOL/IG body tasks),
    // this applies to EVERY task for a zh-TW brand — it's a site-wide
    // language invariant, not a task-family style rule. Deterministic check
    // runs on every caption (cheap); the LLM re-ask only fires on an actual
    // violation, which should be rare.
    if (brandMarket.isZhTW && Array.isArray(captions) && captions.length) {
      for (const v of captions) {
        if (!v?.caption || !looksNonChineseForZhTWBrand(v.caption)) continue;
        v.caption = await reaskInZhTW(v.caption);
      }
    }

    // 分格腳本的正規化刻意 **不** 放在這裡 —— 下面的變體組裝會把整條
    // transform chain 重跑一次（見 `const variants` 迴圈），在這裡修會被
    // 蓋掉。正確的位置是那條 chain 的最後一步。

    // ── 品牌一致性檢查 (2026-09-30 CJ「我希望要做一致性檢查，多幾秒沒關係」) ──
    // 禁用詞／替換對照只查用字；這一關對照品牌大腦全文查語氣、原型、受眾、禁用說法、
    // 價值與編造事實，不一致就最小幅度修正（見 brandConsistency.ts）。放在 checkpoint
    // 之前，用戶第一眼看到的就是檢查過的版本。行事曆合併／策略文件不查（不是貼文）。
    // 上限 25 秒、且只用剩餘預算；失敗一律記 skipped，不假裝檢查過。
    const brandConsistency: Array<{ variantIndex: number; status: string; issues: Array<{ aspect: string; detail: string }>; reason?: string; before?: string }> = [];
    const isStrategyDocTask = (args.template.id ?? "").includes("-99-") &&
      /calendar|toolkit|playbook|策略|月曆|工具包/.test(args.template.id ?? "");
    if (Array.isArray(captions) && captions.length && args.brandId && brandPrefix
        && !args.config.calendarMerge && !isStrategyDocTask) {
      const stCheck = stage("brandcheck", "品牌一致性檢查");
      const remaining = tierBudget - (Date.now() - startedAt) - 15_000;
      const timeoutMs = Math.min(25_000, remaining);
      const { checkBrandConsistency } = await import("./brandConsistency");
      const results = await Promise.all(captions.map(async (v, vi) => {
        if (!v?.caption || v.caption.length > 6000) return null;
        const res = await checkBrandConsistency({
          caption: v.caption,
          brandPrefix,
          userMsg,
          taskLabel: String((args.template as any).label ?? args.template.id),
          isZhTW: brandMarket.isZhTW,
          timeoutMs,
        });
        if (res.status === "fixed") {
          // 修正稿一樣要過品牌硬規則與格式合約，跟禁用詞改寫後同一套修補。
          let fixed = await enforceBrandRulesOnText(args.brandId, res.caption).catch(() => res.caption);
          fixed = adCopyTask ? repairAdCopy(fixed, requestedUrl)
            : shotListTask ? repairShotList(fixed)
            : listingSpec ? repairListing(fixed, listingSpec)
            : adSlotTask ? repairAdSlot(fixed, adSlotTask)
            : fixed;
          v.caption = fixed;
        }
        return { variantIndex: vi, status: res.status, issues: res.issues, ...(res.reason ? { reason: res.reason } : {}), ...(res.before ? { before: res.before } : {}) };
      }));
      for (const r of results) if (r) brandConsistency.push(r);
      const allSkipped = brandConsistency.length > 0 && brandConsistency.every((r) => r.status === "skipped");
      stCheck.status = allSkipped ? "failed" : "done";
      stCheck.completedAt = Date.now() - startedAt;
      if (allSkipped) console.warn(`[orchestra] brandcheck skipped for ${args.template.id}: ${brandConsistency[0]?.reason ?? "unknown"}`);
    }
    (captions as any).__brandConsistency = brandConsistency;

    // ── 法規合規檢查（2026-09-30 CJ「要多加一道寫完後的合規檢查，也寫在任務卡上的顯示進度」）──
    // 品牌在策略層「法規」有啟用中的卡才跑（沒有就不列這一關、不多花呼叫）。放在一致性檢查
    // 之後、checkpoint 之前：用戶第一眼看到的就是審過的版本。跟一致性檢查同一套預算與修補。
    const regulationCompliance: import("./regulationCompliance").RegulationComplianceRecord[] = [];
    if (Array.isArray(captions) && captions.length && args.brandId
        && !args.config.calendarMerge && !isStrategyDocTask) {
      const { loadActiveRegulations } = await import("../../../strategy/core/brand/brandRegulations");
      const hasRegs = (await loadActiveRegulations(args.brandId)).length > 0;
      if (hasRegs) {
        const stReg = stage("regcheck", "法規合規檢查");
        const remaining = tierBudget - (Date.now() - startedAt) - 15_000;
        const { checkVariantsCompliance } = await import("./regulationCompliance");
        const recs = await checkVariantsCompliance({
          brandId: args.brandId,
          captions,
          isZhTW: brandMarket.isZhTW,
          timeoutMs: Math.min(25_000, remaining),
          onFixed: async (vi, text) => {
            let fixed = await enforceBrandRulesOnText(args.brandId, text).catch(() => text);
            fixed = adCopyTask ? repairAdCopy(fixed, requestedUrl)
              : shotListTask ? repairShotList(fixed)
              : listingSpec ? repairListing(fixed, listingSpec)
              : adSlotTask ? repairAdSlot(fixed, adSlotTask)
              : fixed;
            captions[vi]!.caption = fixed;
          },
        });
        for (const r of recs ?? []) regulationCompliance.push(r);
        const allSkipped = regulationCompliance.length > 0 && regulationCompliance.every((r) => r.status === "skipped");
        stReg.status = allSkipped ? "failed" : "done";
        stReg.completedAt = Date.now() - startedAt;
        if (allSkipped) console.warn(`[orchestra] regcheck skipped for ${args.template.id}: ${regulationCompliance[0]?.reason ?? "unknown"}`);
      }
    }
    (captions as any).__regulationCompliance = regulationCompliance;

    // ── Checkpoint (2026-05-14 「先回 caption + brief、image 跟 QA 變 async polling」) ─
    // Captions + briefs are ready. If the caller passed `onCheckpoint`,
    // (a) persist a PARTIAL mission_outputs row now with progress='caption_ready',
    // (b) attach outputId/missionId to the partial result,
    // (c) signal the caller — they can return to the user immediately.
    // The orchestra keeps running; when it finishes we UPDATE the same
    // row to progress='done' (or 'failed') instead of inserting a new one.
    // 2026-05-14 (fb-60-serial-3 forensic): granular trace so when a task
    // run doesn't save, we can pinpoint which gate skipped recordTaskRun.
    if (args.onCheckpoint && args.userId) {
      try {
        console.log(`[orchestra:trace] task=${args.template.id} tier=${tier} userId=${args.userId} brandId=${args.brandId} → checkpoint gate entered`);
        // 2026-05-18 (CJ「行事曆其他支柱格式是亂的」): for calendar tasks
        // collapse the per-pillar captions into ONE merged calendar at the
        // checkpoint too, so caption_ready already shows a single clean
        // calendar instead of 5 raw pillar tabs.
        const expandedCal = args.config.calendarMerge
          ? expandCalendarVariants(captions.map((c) => c?.caption ?? ""))
          : [];
        const partialVariants: OrchestraVariant[] = args.config.calendarMerge
          ? (expandedCal.length > 0 ? expandedCal : [{
              label: "30 天行事曆",
              caption: mergeCalendarPosts(captions.map((c) => c?.caption ?? "")),
              hashtags: [],
              image: { style: null, url: null, status: "skipped" as any },
            }])
          : Array.from({ length: args.config.variants }, (_, i) => {
              const cap = captions[i];
              return {
                label: cap?.label ?? args.config.variantLabels[i] ?? `版本 ${i + 1}`,
                caption: (cap?.caption ?? "").trim(),
                hashtags: cap?.hashtags ?? [],
                image: { style: briefs[i] ?? null, url: null, status: "pending" as any },
              };
            });
        const partial: OrchestraResult = {
          taskId: args.template.id,
          totalLatencyMs: Date.now() - startedAt,
          fetchedUrl,
          urlFetchFailure,
          captionAgent: captionLoad.meta,
          imageAgent: imageLoad.meta,
          variants: partialVariants,
          stages: [...stages],
          ok: partialVariants.some((v) => v.caption.length > 0),
          errors: [...errors],
          references: researchRefs,
          researchNote,
          strategist: strategistMeta && strategistAnchor
            ? { agentName: strategistMeta.name, agentTitle: strategistMeta.title, anchor: strategistAnchor }
            : null,
          // specialtyMeta is only loaded in the 60s/100s extras stage which
          // runs AFTER this checkpoint, so it's always null at checkpoint
          // time. The final result re-populates it when extras complete.
          specialtyAgent: null,
        };

        console.log(`[orchestra:trace] task=${args.template.id} partial.ok=${partial.ok} variants=${partial.variants.length} firstCaptionLen=${partial.variants[0]?.caption?.length ?? 0}`);
        if (partial.ok && !isRunCancelled()) {
          const { recordTaskRun } = await import("../../../platform/core/ops/recordTaskRun");
          const { titleFromCaption } = await import("./titleFromCaption");
          const idPrefix = (args.template.id ?? "").split("-")[0] ?? "";
          const idChannelMap: Record<string, string> = {
            fb: "facebook", ig: "instagram", yt: "youtube", tt: "tiktok",
            li: "linkedin", em: "email", pr: "press", br: "brand", rs: "audience",
          };
          const channel = String(
            (args.template as any).channel
              ?? args.template.outputDefaults?.platform
              ?? idChannelMap[idPrefix]
              ?? "other"
          );
          const tierStr = (tier as "30s" | "60s" | "99s");
          const flatLabel: string = typeof args.template.label === "string"
            ? args.template.label
            : (args.template.label?.zh ?? args.template.label?.en ?? args.template.id);
          const persisted = await recordTaskRun({
            userId: args.userId,
            brandId: args.brandId ?? null,
            workspace: channel,
            taskId: args.template.id,
            taskLabel: flatLabel,
            tier: tierStr,
            outputType: safeOutputTypeForPostType(args.template.outputDefaults?.post_type),
            title: titleFromCaption(partialVariants[0]?.caption, flatLabel),
            content: JSON.stringify(partialVariants, null, 2),
            metadata: {
              latencyMs: Date.now() - startedAt,
              captionAgent: captionLoad.meta ?? null,
              imageAgent: imageLoad.meta ?? null,
              stages: [...stages],
              fetchedUrl: fetchedUrl ?? null,
              urlFetchFailure,
              errors: [...errors],
              ok: true,
              variantCount: partialVariants.length,
              inputs: args.inputs ?? {},
              // 2026-08-11: audience attribution anchor — see args.audienceTag.
              audienceTag: args.audienceTag ?? null,
              productId: args.productId ?? null,
              eventId: args.eventId ?? null,
              campaignItem: args.campaignItem
                ? { eventId: args.campaignItem.eventId, itemId: args.campaignItem.itemId, paid: args.campaignItem.paid }
                : null,
              references: researchRefs,
              researchNote,
              regulationCompliance: (captions as any).__regulationCompliance ?? [],
              // 商品頁：欄位規格（成品頁據此拆欄位、標出超過上限的欄位）。
              listing: listingSpec,
            },
            thumbnailUrl: null,
            progress: "caption_ready",
          });
          persistedOutputId = persisted.outputId;
          persistedMissionId = persisted.missionId;
          if (persistedOutputId) markRunDelivered(args.runKey);
          console.log(`[orchestra:trace] task=${args.template.id} checkpoint recordTaskRun returned outputId=${persistedOutputId} missionId=${persistedMissionId}`);
          (partial as any).outputId = persistedOutputId;
          (partial as any).missionId = persistedMissionId;
          (partial as any).progress = "caption_ready";
        }

        if (!isRunCancelled()) args.onCheckpoint(partial);
      } catch (e) {
        console.warn("[orchestra] onCheckpoint persistence failed (non-fatal):", (e as Error)?.message);
      }
    }

    // ── Stage 3: parallel image gen — only when runImageGen=true ───────
    // 30s tier: runImageGen=false → briefs are written but no image model is called.
    // The carousel renders style direction text in the mockup image slot;
    // user clicks "用此風格生圖" per variant to opt into MediaGenFlow.
    const willRender = args.config.runImageGen && args.config.images > 0;
    const stGen = willRender
      // Every image is gpt-image-2 (one same-model retry, no swap); the per-image
      // modelId records which model ran. Keep the stage label model-neutral.
      ? stage("gen", `平行生圖 ×${args.config.images}`)
      : null;

    const taskPlatform = args.template.id.split("-")[0];
    // 2026-07-19: brand palette loaded once per run → injected into every
    // image brief so generated visuals carry the brand color scheme.
    const brandPalette = await loadBrandPaletteHexes(args.brandId);
    const brandIdentity = await loadBrandIdentityForImage(args.brandId);
    // 2026-07-27 (CJ「合成圖也套用真實產品圖片」): when this run is scoped
    // to a specific product, fetch its real photo once so every variant's
    // image composites the actual product — same fidelity bar as the manual
    // RunPage「使用真實產品圖」panel. Brand-level (no productId) runs are
    // unaffected — there's no single product to anchor to.
    const loadedSubjectImageUrl = willRender ? await loadProductImageUrl(args.brandId, args.productId) : null;
    const productSubject = resolveProductSubjectReference(args.productId, loadedSubjectImageUrl);
    const images: OrchestraVariant["image"][] = willRender && briefs.length
      ? await Promise.all(briefs.map((b, i) =>
          // Theater standard: prompt derives from the variant's CAPTION;
          // the Chinese brief is display-only (style).
          genOneImage({
            content: captions[i]?.caption ?? "",
            style: b,
            platform: taskPlatform,
            palette: brandPalette,
            brandIdentity,
            subjectImageUrl: productSubject.imageUrl,
            subjectImageRequired: productSubject.required,
          }, args.config)))
      : briefs.length
        ? briefs.map((b) => ({ style: b, url: null, status: "skipped" as const }))
        : Array.from({ length: args.config.images }, () => ({ style: null, url: null, status: "skipped" as const }));

    if (stGen) {
      const ok = images.filter((i) => i.status === "ready").length;
      stGen.status = ok > 0 ? "done" : "failed";
      stGen.completedAt = Date.now() - startedAt;
    }
    // 2026-05-13: surface image-gen failures so the run page can show
    // why thumbnailUrl ended up null (was previously silent).
    for (const img of images) {
      if ((img.status === "failed" || img.status === "timeout") && img.errorMsg) {
        errors.push(`image(${img.status}): ${String(img.errorMsg).slice(0, 200)}`);
      }
    }


    // ── Assemble variants ──────────────────────────────────────────────
    // Hook-task post-processing: each variant's caption from the LLM is
    // just the hook (30-60 chars) — orchestra appends the user's original
    // article verbatim. This keeps each LLM call tiny (high reliability)
    // and preserves the article exactly as user wrote it.
    //
    // No silent quality-fallback: if a variant LLM call failed both
    // attempts, the variant ships with empty caption + the per-slide
    // warning UI tells the user to retry. We never hide the failure with
    // a clone of another variant.
    // 2026-05-18 (CJ「整理原文、讓原文跟標題相符」): fb-30-pure-text-hook
    // no longer appends the body verbatim — the LLM now returns the full
    // post (hook + a re-structured, hook-consistent body). So this is
    // disabled (no other task ever set it true).
    const isHookTask = false;
    const articleBody =
      isHookTask
        ? (args.inputs["article_body"] ?? args.inputs["topic"] ?? "").trim()
        : "";

    const variants: OrchestraVariant[] = [];
    const N = args.config.variants;
    // 2026-05-19 (CJ 驗收 kl-60-pitch-pack v#2「守門未生效」): guaranteed
    // final backstop — even if the post-caption gate's mutation was lost
    // (stale process / repopulated captions / different path), clean the
    // caption ONE more time here, the last point before persistence.
    // 2026-07-17 多市場: gate on zh-TW too — the sanitizer would corrupt
    // non-Chinese output (emoji strip / ！→。 / straight→「」quotes).
    // 2026-10-08：寫法學自品牌自己文章的卡（keepOwnVoice）不過這道守門——見 FBTaskTemplate。
    const _voiceGated = brandMarket.isZhTW && !args.template.keepOwnVoice && (isTikTokBodyTask(args.template) ||
      isYouTubeBodyTask(args.template) || isKOLBodyTask(args.template));
    // 2026-07-20 (CJ QA「產出文案有斷字/漏字」— original text was gone so the
    // corrupting layer couldn't be identified): keep the writer's RAW caption
    // (pre-dedupe/pre-sanitize) in metadata whenever the transform chain
    // changed it. Next report = diff metadata.rawCaptions vs content and the
    // guilty transform falls out immediately.
    const rawCaptions: Array<{ label: string; raw: string }> = [];
    for (let i = 0; i < N; i++) {
      const cap = captions[i];
      const label = cap?.label ?? args.config.variantLabels[i] ?? `版本 ${i + 1}`;
      let caption = (cap?.caption ?? "").trim();
      const _rawCaption = caption;
      if (caption && isHookTask && articleBody) {
        // 2026-05-11 (CJ「文案前面幾句重複的問題」): the LLM is told to write
        // ONLY a hook, but sometimes ignores the instruction and writes the
        // full caption (or includes the body's opening sentence in its hook
        // output). Then we append articleBody → user sees duplicated lead.
        // Two-layer guard:
        //  (a) If "hook" exceeds 120 chars OR already contains the body's
        //      first sentence, treat it as a full caption attempt — strip
        //      back to the first 1-2 sentences before appending body.
        //  (b) Always run mergeHookAndBody which dedupes overlapping paragraphs.
        caption = mergeHookAndBody(caption, articleBody);
      }
      // 2026-05-12 (CJ「文案中第一段話跟文中最後一段重複」): always run
      // internal-dedupe even when no separate articleBody. Catches the
      // writer LLM duplicating its own hook + hashtag groups within a
      // single output.
      if (caption && !listingSpec) caption = deduplicateInternalCaption(caption);
      // 2026-06-10 (CJ「資訊不夠時不要用 [請補充] 佔位符」改造):
      // Strip placeholder brackets from body captions.
      // 99s strategy docs (calendar / toolkit / playbook) legitimately use
      // [請補充：來源] for user fill-in — skip those by tier.
      const isStrategyDoc = (args.template.id ?? "").includes("-99-") &&
        /calendar|toolkit|playbook|策略|月曆|工具包/.test(args.template.id ?? "");
      // 商品頁跳過：stripPlaceholderBrackets 會把 \s{2,}（含換行）壓成一個空格，條列會黏成一行。
      if (caption && !isStrategyDoc && !listingSpec) caption = stripPlaceholderBrackets(caption);
      if (caption && _voiceGated) caption = voiceSanitizeZhTW(caption);
      // 2026-07-18 多市場: Latin-punctuation markets get stray CJK
      // punctuation cleaned (writer prompt scaffolding is Chinese, the
      // model occasionally slips a 。／， into EN/DE/FR output).
      if (caption && latinPunctLang(brandMarket.outputLanguage)) caption = normalizeLatinPunct(caption);
      // 2026-08-23: 分格腳本必須是這條 chain 的**最後一步**。上面每一關
      // （mergeHookAndBody / deduplicateInternalCaption / voiceSanitizeZhTW）
      // 都會重排段落，實測會把「下一格的時間戳」黏回上一格「字卡：」那行，
      // 整份腳本只認得出 1 格。在上游修沒有用 —— 這裡才是持久化前最後一點。
      if (caption && shotListTask) caption = normalizeShotList(caption);
      // 商品頁同理：最後一步把欄位標題與條列排回標準格式。
      if (caption && listingSpec) caption = normalizeListing(caption, listingSpec);
      if (!caption) {
        errors.push(`variant ${i} (${label}) caption 兩次嘗試都失敗`);
      }
      if (_rawCaption && _rawCaption !== caption) {
        rawCaptions.push({ label, raw: _rawCaption.slice(0, 1200) });
      }
      variants.push({
        label,
        caption,
        hashtags: cap?.hashtags ?? [],
        // 2026-05-28 (CJ「我還沒按下生成圖片，不應該顯示生成失敗」):
        // When images[i] is missing it means auto-gen never produced a result
        // (threw before push, or was skipped in an error path). Use "skipped"
        // rather than "failed" so the mockup shows a neutral "tap to generate"
        // state instead of a red "generation failed" error the user didn't trigger.
        // Actual failures (gpt-image-2 failed twice) already push an explicit
        // {status:"failed", canSwitchTo} into images[i] above.
        image: images[i] ?? { style: briefs[i] ?? null, url: null, status: "skipped" },
      });
    }

    // ── Stage 3.55: calendar merge ─────────────────────────────────────
    // 2026-05-18 (CJ「分配不同 agent 處理不同類型內容比較快」): each
    // variant is one content PILLAR generated by its own parallel agent.
    // Merge all pillar JSON arrays into ONE day-sorted 30-day calendar
    // and collapse to a single variant the Calendar mockup renders.
    if (args.config.calendarMerge) {
      const expanded = expandCalendarVariants(variants.map((v) => v.caption ?? ""));
      variants.length = 0;
      if (expanded.length > 0) {
        variants.push(...expanded);
      } else {
        variants.push({
          label: "30 天行事曆",
          caption: mergeCalendarPosts([]),
          hashtags: [],
          image: { style: null, url: null, status: "skipped" },
        });
        errors.push("calendar: 所有支柱都解析失敗");
      }
    }

    // ── Stage 3.6: carousel / album cards (single post, N card images) ──
    // 2026-05-18 (CJ「carousel 一個貼文還是只出現一張圖」): when the task
    // is a multi-card deliverable, split the post into N cards and render
    // one image per card, attached to the (single) variant as cards[].
    const cardsN = args.config.cardsPerVariant ?? 0;
    if (cardsN > 1 && variants[0]?.caption) {
      try {
        // 2026-08-01: yt-60-storyboard's primary input key is
        // "topic_or_script", not "topic"/"context" — widen the fallback
        // chain so the splitter still gets a topic line instead of blank.
        const topic = (
          args.inputs["topic"] ?? args.inputs["context"] ??
          args.inputs["topic_or_script"] ?? args.inputs["topic_or_url"] ?? ""
        ).trim();
        const cardSpecs = await callCarouselCards({
          caption: variants[0].caption,
          topic,
          n: cardsN,
          brandPrefix,
          imagePersona: imageLoad.persona,
          aspectRatio: args.config.aspectRatio ?? "1:1",
          kind: args.config.cardsKind ?? "carousel",
        });
        const cardImages = await Promise.all(
          cardSpecs.map((c) => genOneImage(
            // Theater standard: each card's own text is the caption source.
            // 2026-08-02 (CJ「產品圖似乎跟他原本的不同」): this block skipped
            // the subjectImageUrl wiring Stage 3 already does above (line
            // ~2382) — every card was pure text-to-image, so the model
            // invented its own product instead of compositing the real one.
            {
              content: `${c.headline}\n${c.body}`.trim(),
              style: c.imageBrief,
              platform: args.template.id.split("-")[0],
              palette: brandPalette,
              brandIdentity,
              subjectImageUrl: productSubject.imageUrl,
              subjectImageRequired: productSubject.required,
            },
            args.config,
          )),
        );
        variants[0].cards = cardSpecs.map((c, idx) => ({
          headline: c.headline,
          body: c.body,
          image: cardImages[idx] ?? {
            style: c.imageBrief,
            prompt: null,
            url: null,
            status: "failed" as const,
          },
        }));
        const okCards = (variants[0].cards ?? []).filter((c) => c.image.status === "ready").length;
        if (okCards === 0) errors.push("carousel: 卡片圖全部生成失敗");
      } catch (e: any) {
        errors.push(`carousel cards: ${String(e?.message ?? e).slice(0, 160)}`);
      }
    }

    // ── Stage 3.5: 60s/100s production extras (replies / time / followup) ─
    // Per-variant fanout. Each extras agent is a small LLM call (~5-10s).
    // Failures non-fatal; variant ships without that extra.
    const extrasCfg = args.config.extras;
    // Pre-load specialty agent persona if needed (shared across all variants)
    let specialtyMeta: AgentMeta | null = null;
    let specialtyPersona = "";
    const useSpecialty =
      (tier === "60s" || tier === "99s") &&
      !!resolvedSpecialtyId &&
      !!extrasCfg &&
      (extrasCfg.compareTable || extrasCfg.timingAdvisor || extrasCfg.legalAssistant);
    if (useSpecialty) {
      const specLoad = await loadAgent(resolvedSpecialtyId);
      specialtyMeta = specLoad.meta;
      specialtyPersona = specLoad.persona;
    }
    // 2026-05-08: pre-load extras helper personas (one DB read each, before
    // variant fanout) so each variant's helper LLM call gets the agent's
    // real-person persona prepended. JSON-driven, zero runtime resolution.
    let replyPersona = "", timingPersona = "", followupPersona = "";
    if ((tier === "60s" || tier === "99s") && extrasCfg) {
      const replyId    = resolveAgentId(taskId, "replyWriter",    null);
      const timingId   = resolveAgentId(taskId, "timingAdvisor",  null);
      const followupId = resolveAgentId(taskId, "followupWriter", null);
      const [r1, r2, r3] = await Promise.all([
        replyId    ? loadAgent(replyId).then(x => x.persona).catch(() => "") : Promise.resolve(""),
        timingId   ? loadAgent(timingId).then(x => x.persona).catch(() => "") : Promise.resolve(""),
        followupId ? loadAgent(followupId).then(x => x.persona).catch(() => "") : Promise.resolve(""),
      ]);
      replyPersona = r1; timingPersona = r2; followupPersona = r3;
    }
    if ((tier === "60s" || tier === "99s") && extrasCfg) {
      const stExtras = stage("extras", "撰寫留言模板 / 發文時段 / 追蹤貼文" + (useSpecialty ? " / 專業檢核" : ""));
      try {
        await Promise.all(
          variants.map(async (v) => {
            if (!v.caption) return; // skip extras for empty variants
            const channel = taskChannel;
            const viralSrc = (args.inputs["viral_source"] ?? "").toString();
            const trendSrc = (args.inputs["trend_topic"] ?? "").toString();
            const testSrc = (args.inputs["testimonial_source"] ?? "").toString();
            const consent = (args.inputs["consent_status"] ?? "").toString();
            // 2026-09-29（CJ「onbrand 使用的 agent，生文前都要讀取策略層的內容」）：
            // 這幾個附加產出以前只拿到人設＋貼文，完全沒有品牌大腦——回覆範本和
            // 追蹤貼文是會直接發出去的字，不能不認得品牌。
            const withBrain = (p: string) => (brandPrefix ? `${p}\n# 品牌大腦（所有建議與文字都要符合）\n${brandPrefix}\n` : p);
            const subResults = await Promise.all([
              extrasCfg.replyTemplates && extrasCfg.replyTemplates > 0
                ? callReplyTemplates({ caption: v.caption, channel, n: extrasCfg.replyTemplates, persona: withBrain(replyPersona) })
                : Promise.resolve([] as Array<{ userSays: string; yourReply: string }>),
              extrasCfg.postingTime ? callPostingTime({ caption: v.caption, channel, persona: withBrain(timingPersona) }) : Promise.resolve(""),
              extrasCfg.followupPost ? callFollowupPost({ caption: v.caption, channel, persona: withBrain(followupPersona) }) : Promise.resolve(""),
              extrasCfg.compareTable && useSpecialty
                ? callCompareTable({ caption: v.caption, viralSource: viralSrc, persona: withBrain(specialtyPersona) })
                : Promise.resolve(""),
              extrasCfg.timingAdvisor && useSpecialty
                ? callTimingAdvisor({ caption: v.caption, trendTopic: trendSrc, persona: withBrain(specialtyPersona) })
                : Promise.resolve(""),
              extrasCfg.legalAssistant && useSpecialty
                ? callLegalAssistant({ caption: v.caption, testimonialSource: testSrc, consentStatus: consent, persona: withBrain(specialtyPersona) })
                : Promise.resolve(""),
            ]);
            // 會直接發出去的字，一樣過禁用詞／替換對照。
            const replies = await Promise.all(subResults[0].map(async (r) => ({
              ...r, yourReply: await enforceBrandRulesOnText(args.brandId, r.yourReply).catch(() => r.yourReply),
            })));
            const postingTime = subResults[1];
            const followupPost = subResults[2] ? await enforceBrandRulesOnText(args.brandId, subResults[2]).catch(() => subResults[2]) : "";
            const compareTable = subResults[3];
            const timingAdvice = subResults[4];
            const legalCheck = subResults[5];
            v.extras = {
              ...(replies.length > 0 ? { replyTemplates: replies } : {}),
              ...(postingTime ? { postingTime } : {}),
              ...(followupPost ? { followupPost } : {}),
              ...(compareTable ? { compareTable } : {}),
              ...(timingAdvice ? { timingAdvice } : {}),
              ...(legalCheck ? { legalCheck } : {}),
            };
          }),
        );
        stExtras.status = "done";
        stExtras.completedAt = Date.now() - startedAt;
      } catch (e: any) {
        stExtras.status = "failed";
        stExtras.completedAt = Date.now() - startedAt;
        errors.push(`extras: ${String(e?.message ?? e)}`);
      }
    }

    // ── Stage 4: QA review (60s/100s tier only, parallel per variant) ─────
    // Jordan Hayes (squadLeadQA) reviews each variant against task + brand.
    // QA runs AFTER caption assembly so it sees the final user-facing text.
    if (tier === "60s" || tier === "99s") {
      const stQA = stage("qa", `Jordan Hayes 審核 ${variants.length} 個變體`);
      try {
        const { runSquadLeadQA } = await import("../squad/squadLeadQA");
        const qaResults = await Promise.allSettled(
          variants.map((v) =>
            Promise.race([
              runSquadLeadQA({
                agentName: captionLoad.meta?.name ?? "caption_writer",
                agentTitle: captionLoad.meta?.title,
                // 2026-05-11 — flatten { en, zh } | string label to string.
                taskTitle: typeof args.template.label === "string"
                  ? args.template.label
                  : (args.template.label?.zh ?? args.template.label?.en ?? args.template.id),
                agentOutput: v.caption,
                brandName: args.brandId ? `Brand #${args.brandId}` : undefined,
                userRequest: userMsg.slice(0, 500),
              }),
              timeoutPromise<never>(QA_BUDGET_MS, `qa[${v.label}]`),
            ]),
          ),
        );
        // Attach QA result to each variant for client display
        for (let i = 0; i < variants.length; i++) {
          const r = qaResults[i];
          if (r?.status === "fulfilled" && r.value) {
            (variants[i] as any).qa = {
              status: r.value.status,
              comment: r.value.comment,
              score: r.value.overallScore,
              suggestions: r.value.suggestions,
            };
          }
        }
        const passed = qaResults.filter((r) => r?.status === "fulfilled" && (r.value as any)?.status === "pass").length;
        stQA.status = passed > 0 ? "done" : "failed";
        stQA.completedAt = Date.now() - startedAt;
      } catch (e: any) {
        stQA.status = "failed";
        stQA.completedAt = Date.now() - startedAt;
        errors.push(`qa: ${String(e?.message ?? e)}`);
      }
    }

    return {
      taskId: args.template.id,
      totalLatencyMs: Date.now() - startedAt,
      fetchedUrl,
      urlFetchFailure,
      captionAgent: captionLoad.meta,
      imageAgent: imageLoad.meta,
      variants,
      stages,
      ok: variants.some((v) => v.caption.length > 0),
      errors,
      // 2026-06-05 (CJ「不阻擋，事後解釋」): expose brand-rule fixes so
      // RunPage can trigger a friendly Mia nudge after generation.
      references: researchRefs,
      researchNote,
      brandFixes: (captions as any).__brandFixes ?? [],
      brandConsistency: (captions as any).__brandConsistency ?? [],
      regulationCompliance: (captions as any).__regulationCompliance ?? [],
      // 2026-07-20 (CJ QA 斷字/漏字 forensics): raw pre-transform captions.
      rawCaptions,
      strategist: strategistMeta && strategistAnchor
        ? { agentName: strategistMeta.name, agentTitle: strategistMeta.title, anchor: strategistAnchor }
        : null,
      specialtyAgent: specialtyMeta,
    };
  })();

  // Hard 20s budget — whatever's done by then is what we ship
  try {
    const result = await Promise.race([
      orchestra,
      new Promise<OrchestraResult>((resolve) =>
        setTimeout(() => {
          resolve({
            taskId: args.template.id,
            totalLatencyMs: tierBudget,
            fetchedUrl: null,
            captionAgent: null,
            imageAgent: null,
            variants: args.config.variantLabels.slice(0, args.config.variants).map((l) => ({
              label: l,
              caption: "",
              hashtags: [],
              image: { style: null, url: null, status: "timeout" },
            })),
            stages,
            ok: false,
            errors: [`orchestra: hard ${Math.round(tierBudget / 1000)}s budget exceeded`],
          });
        }, tierBudget),
      ),
    ]);

    // Auto-record to mission_outputs so /projects shows this run.
    // 2026-05-09 (CJ direction): bubble outputId up so client can
    // navigate to /run/:outputId immediately after run completes
    // (Phase 2 route-based architecture). Non-fatal: failure here
    // doesn't break the user-facing response.
    //
    // 2026-05-09 (CJ feedback): persist even on partial failure (ok=false)
    // when at least 1 variant has caption. Partial output is still useful
    // — user wants to see the other variants AND keep nav consistent
    // (always go to /run/:id). Filtering on result.ok hid valid runs.
    const hasUsableVariant = result.variants.some((v) => (v.caption ?? "").trim().length > 0);
    console.log(`[orchestra:trace] task=${args.template.id} final gate: hasUsableVariant=${hasUsableVariant} persistedOutputId=${persistedOutputId} userId=${args.userId} → ${args.userId && hasUsableVariant ? "WILL SAVE" : "SKIP"}`);
    if (isRunCancelled()) {
      // Cancelled: never write (or finalise) an output. A checkpoint row that
      // already exists is closed out so the UI stops polling it.
      if (persistedOutputId) {
        try {
          const { finaliseTaskRun } = await import("../../../platform/core/ops/recordTaskRun");
          await finaliseTaskRun({ outputId: persistedOutputId, progress: "failed", progressDetail: "cancelled" });
        } catch { /* best effort */ }
      }
    } else if (args.userId && hasUsableVariant) {
      try {
        const { recordTaskRun, finaliseTaskRun } = await import("../../../platform/core/ops/recordTaskRun");
        const firstImage = result.variants.find((v) => v.image?.url)?.image?.url ?? null;
        // 2026-05-09 (CJ fix): templates have no .channel field — pull
        // platform from outputDefaults (which IS set). Fallback to
        // taskId prefix (fb-* / ig-* / yt-* / ...). 'other' is last resort.
        const idPrefix = (args.template.id ?? "").split("-")[0] ?? "";
        const idChannelMap: Record<string, string> = {
          fb: "facebook", ig: "instagram", yt: "youtube", tt: "tiktok",
          li: "linkedin", em: "email", pr: "press", br: "brand", rs: "audience",
        };
        const channel = String(
          (args.template as any).channel
            ?? args.template.outputDefaults?.platform
            ?? idChannelMap[idPrefix]
            ?? "other"
        );
        const tierStr = (tier as "30s" | "60s" | "99s");
        // 2026-05-11 — flatten { en, zh } | string label to string for DB.
        const flatLabel: string = typeof args.template.label === "string"
          ? args.template.label
          : (args.template.label?.zh ?? args.template.label?.en ?? args.template.id);
        const titleFor = (await import("./titleFromCaption")).titleFromCaption(result.variants[0]?.caption, flatLabel);
        const fullMetadata = stampGenMetrics({
          latencyMs: result.totalLatencyMs,
          // 2026-05-09 (P2 — agent thinking panel): persist FULL agent
          // objects (id/name/title/avatarUrl) + stages + fetchedUrl so
          // /run/:id can render the agent workflow without reconstructing.
          captionAgent: result.captionAgent ?? null,
          imageAgent: result.imageAgent ?? null,
          stages: result.stages ?? [],
          fetchedUrl: result.fetchedUrl ?? null,
          urlFetchFailure: result.urlFetchFailure ?? null,
          // 2026-10-04：寫作前上網查到的案例與說法（成品頁顯示「資料來源」）。
          references: result.references ?? [],
          researchNote: result.researchNote ?? null,
          listing: isListingTemplate(args.template) ? args.template.listingSpec : null,
          errors: result.errors ?? [],
          ok: result.ok ?? true,
          variantCount: result.variants.length,
          // 2026-05-09 (CJ): persist inputs so /run/:id 重跑同任務 can
          // navigate back to the task with the user's prior answers
          // pre-filled (no need to re-type 主問題 input).
          inputs: args.inputs ?? {},
          // 2026-08-11: audience attribution anchor — see args.audienceTag.
          audienceTag: args.audienceTag ?? null,
          // 2026-05-11 (CJ): persist scope so /projects can filter
          // missions by product/event and /run page can re-apply scope.
          productId: args.productId ?? null,
          eventId: args.eventId ?? null,
          // 2026-09-30：活動企劃的那一篇（產出頁、本週企劃靠 paid 標「廣告文案」）。
          campaignItem: args.campaignItem
            ? { eventId: args.campaignItem.eventId, itemId: args.campaignItem.itemId, paid: args.campaignItem.paid }
            : null,
          // 2026-06-05 (CJ「不阻擋，事後解釋」): brand-rule fixes from
          // enforceBrandRulesOnTextWithReport, so RunPage can trigger a
          // Mia nudge ("發現你寫了 X，已自動改成 Y，想調整定位嗎？").
          brandFixes: (result as any).brandFixes ?? [],
          brandConsistency: (result as any).brandConsistency ?? [],
          // 2026-09-30：法規合規檢查（regulationCompliance.ts），成品頁顯示「已依 N 條法規檢查」。
          regulationCompliance: (result as any).regulationCompliance ?? [],
          // 2026-07-20 (CJ QA 斷字/漏字 forensics): raw writer captions for
          // any variant the transform chain modified — diff against content
          // to identify the corrupting layer.
          rawCaptions: (result as any).rawCaptions ?? [],
        }, { durationMs: Date.now() - startedAt, ok: result.ok ?? true, taskId: args.template.id });

        if (persistedOutputId) {
          // 2026-05-14 (async path): row was inserted at checkpoint with
          // progress='caption_ready'. UPDATE it now to 'done' with the
          // full image/extras/QA payload.
          await finaliseTaskRun({
            outputId: persistedOutputId,
            content: JSON.stringify(result.variants, null, 2),
            metadata: fullMetadata,
            thumbnailUrl: firstImage,
            title: titleFor,
            progress: "done",
          });
          (result as any).outputId = persistedOutputId;
          (result as any).missionId = persistedMissionId;
        } else {
          // Sync path: no checkpoint was used — insert as before.
          const persisted = await recordTaskRun({
            userId: args.userId,
            brandId: args.brandId ?? null,
            workspace: channel,
            taskId: args.template.id,
            taskLabel: flatLabel,
            tier: tierStr,
            outputType: safeOutputTypeForPostType(args.template.outputDefaults?.post_type),
            title: titleFor,
            content: JSON.stringify(result.variants, null, 2),
            metadata: fullMetadata,
            thumbnailUrl: firstImage,
          });
          (result as any).outputId = persisted.outputId;
          (result as any).missionId = persisted.missionId;
        }
      } catch (e) {
        console.warn("[runOrchestra] recordTaskRun failed:", (e as Error).message);
      }
    }

    return result;
  } catch (e: any) {
    return {
      taskId: args.template.id,
      totalLatencyMs: Date.now() - startedAt,
      fetchedUrl: null,
      captionAgent: null,
      imageAgent: null,
      variants: [],
      stages,
      ok: false,
      errors: [String(e?.message ?? e)],
    };
  }
}



/**
 * Public entry. Runs the orchestra inside a cancel scope: every LLM / image
 * call checks the scope's signal first, so a cancelled run stops issuing
 * provider calls and writes no output. When never cancelled this is identical
 * to the previous behaviour (plus duration telemetry).
 */
export async function runOrchestra(args: Parameters<typeof runOrchestraInner>[0]): Promise<OrchestraResult> {
  const controller = new AbortController();
  const outer = args.signal;
  const onOuterAbort = () => controller.abort();
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener("abort", onOuterAbort, { once: true });
  }
  const t0 = Date.now();
  let result: OrchestraResult | null = null;
  try {
    result = await runWithCancel(controller.signal, () => runOrchestraInner(args));
    const cancelled = outer?.aborted === true;
    if (cancelled) {
      result = { ...result, ok: false, errors: [...(result.errors ?? []), "cancelled"] };
      (result as any).cancelled = true;
    }
    return result;
  } finally {
    const cancelled = outer?.aborted === true;
    // Stop work left running after the hard budget fired.
    controller.abort();
    outer?.removeEventListener("abort", onOuterAbort);
    try {
      logGenCompleted({ durationMs: Date.now() - t0, ok: result?.ok ?? false, taskId: args.template.id, cancelled });
    } catch { /* telemetry must never break generation */ }
  }
}
