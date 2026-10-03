/**
 * 編排器的型別、各階段時間預算與 aiModel→供應商對照。
 */
import { type StillImageChoice } from "../../../../platform/core/media/stillImageModels";
import { type UrlSummary } from "../../../../platform/core/web/urlContext";
import { type ModelProvider } from "../../../../platform/core/llm/multiModelRouter";

// 2026-05-10 (CJ overnight finishing pass): 3 tasks still timeout with
// 30s budget — fb-30-ad-primary, yt-30-end-cta, br-30-brand-voice (the
// heaviest system prompts in the catalog). Bump LLM 30→40s, HARD 70→100s.
// nginx already at 150s upstream so plenty of headroom. Variants run in
// parallel so wall-clock = max(variant), not sum. Worst case: variant
// timeouts (40s) + retry (40s) + brief stage (10s) = 90s, fits in 100s.
export const HARD_BUDGET_MS  = 100_000;

export const HARD_BUDGET_60S = 130_000;

export const HARD_BUDGET_99S= 150_000;

// Per-attempt ceiling for one image (gpt-image-2 measures 14–24s; a 5-image YT
// run finished inside 35s). genOneImage makes at most two same-model attempts.
export const PRIMARY_IMAGE_CAP_MS = 35_000;

export const LLM_BUDGET_MS   = 40_000;

// 2026-05-18 (CJ「想辦法加速」): the strategist anchor runs SEQUENTIALLY
// before captions (captions depend on it), so its budget is dead time on
// the critical path until the user sees output. It's non-fatal (callers
// fall back to brand context if it's empty) → cap it tight. Cuts up to
// ~18s off every strategist task's time-to-first-output / 502 risk.
export const STRATEGIST_BUDGET_MS = 22_000;

export const QA_BUDGET_MS    = 12_000;

export type OrchestraTier = "30s" | "60s" | "99s";

export interface AgentMeta {
  id: number;
  name: string;
  title: string;
  avatarUrl: string | null;
}

export interface OrchestraStage {
  key: string;
  label: string;
  startedAt: number;
  completedAt?: number;
  status: "pending" | "running" | "done" | "failed";
}

export interface OrchestraVariant {
  label: string;
  caption: string;
  hashtags: string[];
  image: {
    style: string | null;
    /**
     * 2026-08-19 (客戶回報「產出跟指令大相逕庭的圖」): the prompt that was
     * used to drive the image model. `style` is the agent-written Chinese
     * 風格方向 — display-only, it never reaches the model (see genOneImage).
     * RunPage's 改配圖 panel used to pre-fill its editable prompt box from
     * `style`, so users compared a brief the model never saw against the
     * image and (correctly) concluded the two had nothing to do with each
     * other. Persist the real brief so the box shows what made this image.
     */
    prompt?: string | null;
    /** Traditional Chinese equivalent shown and edited in RunPage. */
    promptZh?: string | null;
    /** The model that ran — always the one requested; there is no automatic swap. */
    modelId?: string | null;
    requestedModelId?: string | null;
    url: string | null;
    status: "ready" | "failed" | "skipped" | "timeout";
    errorMsg?: string;
    /** Set on a failed gpt-image-2 image: the UI may offer this model. It is never run automatically. */
    canSwitchTo?: StillImageChoice;
  };
  /**
   * 2026-05-18 (CJ「carousel 一個貼文還是只出現一張圖」): a carousel /
   * album is ONE post made of N cards, each with its own image. Single
   * version, multi-image. When config.cardsPerVariant is set the orchestra
   * fills this with one entry per card (headline + body + its own image).
   * The carousel mockup renders these as the swipeable cards.
   */
  cards?: Array<{
    headline: string;
    body: string;
    image: {
      style: string | null;
      prompt?: string | null;
      promptZh?: string | null;
      modelId?: string | null;
      requestedModelId?: string | null;
      url: string | null;
      status: "ready" | "failed" | "skipped" | "timeout" | "pending";
      errorMsg?: string;
      canSwitchTo?: StillImageChoice;
    };
  }>;
  /**
   * 60s tier production-package extras. Always optional — 30s tier leaves
   * everything undefined; 60s+ populates per OrchestraConfig.extras flags.
   */
  extras?: {
    /** Best posting time recommendation (e.g. "週四 19:00-21:00") */
    postingTime?: string;
    /** Reply templates: anticipated user comment → brand response */
    replyTemplates?: Array<{ userSays: string; yourReply: string }>;
    /** A 24-hour-later followup post that builds on this one */
    followupPost?: string;
    /** Storyboard frames for video / Reel / Shorts (each = scene description) */
    storyboard?: Array<{ frame: number; visual: string; voiceover?: string }>;
    /** IG profile highlight cover briefs (3-5) */
    highlightCovers?: Array<{ name: string; visual: string }>;
    /** FB 60s #10 viral-rewrite — original vs adapted compare */
    compareTable?: string;
    /** FB 60s #11 trend-rewrite — timing advisor recommendation */
    timingAdvice?: string;
    /** FB 60s #12 testimonial-rewrite — legal / consent check */
    legalCheck?: string;
  };
}

/** Strategist anchor (system-wide, shared across all variants of one task). */
export interface OrchestraStrategist {
  agentName: string;
  agentTitle?: string;
  anchor: string; // 4-8 line structure anchor for series tasks
}

export interface OrchestraResult {
  taskId: string;
  totalLatencyMs: number;
  fetchedUrl: {
    url: string;
    title: string | null;
    chars: number;
    og: UrlSummary["og"];
  } | null;
  /** The input contained a URL, but neither the page nor a supported fallback
   * yielded promptable content. Optional for persisted-record compatibility. */
  urlFetchFailure?: {
    url: string;
    reason: "content_unavailable";
  } | null;
  captionAgent: AgentMeta | null;
  imageAgent: AgentMeta | null;
  variants: OrchestraVariant[];
  stages: OrchestraStage[];
  ok: boolean;
  errors: string[];
  /** Strategist output (only present for narrativeArc tasks) */
  strategist?: OrchestraStrategist | null;
  /** Specialty role agent meta (FB 60s #10/11/12) */
  specialtyAgent?: AgentMeta | null;
  /** 2026-06-05: brand-rule fixes (banned words / term substitutions detected
   *  in raw captions). Empty when no fixes were needed. Used by RunPage to
   *  surface a Mia nudge ("發現你寫了 X，想調整定位？") instead of silently
   *  rewriting. */
  brandFixes?: Array<{
    variantIndex: number;
    bannedHits: string[];
    subsApplied: Array<{ from: string; to: string }>;
    rewrittenByLLM: boolean;
  }>;
  /** 2026-09-30: 品牌一致性檢查結果（brandConsistency.ts），每個變體一筆；
   *  status = consistent / fixed / flagged / skipped。 */
  brandConsistency?: Array<{
    variantIndex: number;
    status: string;
    issues: Array<{ aspect: string; detail: string }>;
    reason?: string;
    /** fixed 時的原稿 */
    before?: string;
  }>;
  /** 2026-09-30: 法規合規檢查（regulationCompliance.ts），每個版本一筆；品牌沒有法規時是空陣列。 */
  regulationCompliance?: import("../regulationCompliance").RegulationComplianceRecord[];
  /** 2026-07-20 (CJ QA 斷字/漏字 forensics): raw writer captions for any
   *  variant the post-processing chain modified — persisted to metadata so
   *  the corrupting transform can be identified by diffing against content. */
  rawCaptions?: Array<{ label: string; raw: string }>;
}

/** Map agent.aiModel string → ModelProvider used by callModel.
 *  Working providers (probe 2026-05-08 after endpoint+shape fixes):
 *  qwen / zhipu / azure-foundry (Kimi) / azure-position (claude-haiku/sonnet)
 *  / azure-northcentral (DeepSeek-V3.2/R1). Others fall back to qwen.
 *  Exported so theaterRouter (and other places) can derive provider from
 *  agent.aiModel consistently. */
export function aiModelToProvider(aiModel: string | null | undefined): ModelProvider {
  // 2026-05-16 (CJ「剛剛的決定似乎不好」→ Option B, FINAL): Taiwan-only
  // product, no Chinese models (qwen/zhipu emit Simplified + mainland
  // phrasing). Spread load across non-Chinese providers so anthropic
  // isn't a single bottleneck under 100-user load.
  //
  // Definitive raw-endpoint probes (2026-05-16) — what's ACTUALLY real:
  //   ✅ anthropic     — claude-sonnet-4-6, confirmed real
  //   ✅ openai         — gpt-4.1-mini, confirmed real (had been wrongly
  //                       deprecated → secretly anthropic; un-deprecated)
  //   ❌ azure-claude   — raw POST → HTTP 401 "invalid subscription"
  //   ❌ azure-foundry  — raw POST → HTTP 401 "invalid subscription"
  // BOTH Azure resources are dead (subscription-level, not key — the
  // 84-char rotated keys are present but rejected). Putting either in
  // the weights only meant a hidden boost to anthropic via fallback,
  // which defeats the spread. So the weighted pick is ONLY the two
  // proven-independent backends. anthropic leads (best zh-TW); openai
  // takes a large minority to genuinely offload it.
  //   anthropic 55%  ·  openai 45%
  // Both Azure providers stay in the fallback CHAIN — they auto-recover
  // as backstops the instant the Azure subscription is reactivated
  // (ops action; not a code fix). Chinese models remain chain
  // last-resort only. Callers pass model=undefined so each provider
  // uses its proven default (no cross-provider 404). Circuit breaker
  // still backstops each pick.
  void aiModel;
  return Math.random() < 0.55 ? "anthropic" : "openai";
}
