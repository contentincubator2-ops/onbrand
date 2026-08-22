/**
 * quickTaskOrchestra — Plan B 20-second parallel fanout (2026-05-05).
 *
 * For each FB 30s task we run, in parallel:
 *   1. caption_writer (existing template agent) → 1 LLM call → N caption variants
 *   2. image_director (Mandy Cheng / 239184)   → 1 LLM call → N image briefs
 *   3. flux-schnell × N                          → parallel image gen
 *
 * URL fetch + persona loads + brand context all kick off at t=0 alongside.
 *
 * Hard ceiling 20 seconds wall-clock. Per-image budget 7s. If an image
 * doesn't make it, the variant ships with image.status="timeout" and the UI
 * shows a "補完中" chip — orchestra never blocks the whole carousel.
 *
 * Cost ~$0.017 / orchestra (1 LLM call ×2 + Flux Schnell ×5 @ $0.003).
 */
import { callModel, type ModelProvider } from "./multiModelRouter";
import { dispatchGenerate, checkJob } from "./mediaGen";
import {
  captionToBilingualVisualBrief,
  loadBrandIdentityForImage,
  loadBrandPaletteHexes,
  type BrandIdentityForImage,
} from "./visualBrief";
import { buildImageGuardBlock } from "./imagePromptGuards";
import {
  PRODUCT_SUBJECT_UNAVAILABLE_ERROR,
  resolveProductSubjectReference,
} from "./productSubjectPolicy";
import { probeImageUrl } from "./imageFetch";
import { findFirstUrl, fetchUrlSummary, formatUrlSummaryForPrompt, type UrlSummary } from "./urlContext";
import { detectNonDeliverable } from "./captionSanity";
import { isAdCopyTemplate, extractRequestedUrl, buildAdCopyRule, validateAdCopy, repairAdCopy } from "./adCopyContract";
import { extractYouTubeId, fetchYouTubeContext, formatYouTubeContextForPrompt } from "./youtubeContext";
import { fetchViralPatterns, formatViralPatternsForPrompt } from "./socialListeningScout";
import { buildBrandPrefix as buildBrandContext, enforceBrandRulesOnText, enforceBrandRulesOnTextWithReport } from "./brandContext";
import { isEmailTask, isEmailBodyTask, EDM_CRAFT_RUBRIC, edmPlaybookFor } from "./edmCraft";
import { isInstagramTask, isInstagramBodyTask, IG_CRAFT_RUBRIC, igPlaybookFor } from "./igCraft";
import { isFacebookBodyTask, FB_CRAFT_RUBRIC, fbPlaybookFor } from "./fbCraft";
import { isLinkedInBodyTask, LI_CRAFT_RUBRIC, liPlaybookFor } from "./liCraft";
import { isTikTokBodyTask, TT_CRAFT_RUBRIC, ttPlaybookFor } from "./ttCraft";
import { isYouTubeBodyTask, YT_CRAFT_RUBRIC, ytPlaybookFor } from "./ytCraft";
import { isPRBodyTask, PR_CRAFT_RUBRIC, prPlaybookFor } from "./prCraft";
import { isBrandStrategyBodyTask, BR_CRAFT_RUBRIC, brPlaybookFor } from "./brCraft";
import { isKOLBodyTask, KL_CRAFT_RUBRIC, klPlaybookFor } from "./klCraft";
import { isResearchBodyTask, RS_CRAFT_RUBRIC, rsPlaybookFor } from "./rsCraft";
import { isCrossplatformBodyTask, CW_CRAFT_RUBRIC, cwPlaybookFor } from "./cwCraft";
import { loadBrandKnowledgeForPrompt } from "../routers/brandKnowledgeRouter";
import { getBrandRealContent } from "./brandRealContent";
import { resolveAgentId } from "./agentAssignments";
import { getCopywritingMasterPrompt, type MarketCode, type PlatformCode } from "./copywritingMaster";
import { getBrandMarket, DEFAULT_BRAND_MARKET, type BrandMarket } from "./brandMarket";
import type { FBTaskTemplate, OrchestraConfig } from "./quickTaskFB";
import localPool from "../localDb";

// 2026-05-10 (CJ overnight finishing pass): 3 tasks still timeout with
// 30s budget — fb-30-ad-primary, yt-30-end-cta, br-30-brand-voice (the
// heaviest system prompts in the catalog). Bump LLM 30→40s, HARD 70→100s.
// nginx already at 150s upstream so plenty of headroom. Variants run in
// parallel so wall-clock = max(variant), not sum. Worst case: variant
// timeouts (40s) + retry (40s) + brief stage (10s) = 90s, fits in 100s.
const HARD_BUDGET_MS  = 100_000; // 30s tier
const HARD_BUDGET_60S = 130_000; // 60s tier
const HARD_BUDGET_99S= 150_000; // 100s tier
// 2026-05-13 (CJ「30~99秒的圖都生成不了」): PiAPI Flux Schnell takes 8–15s
// in practice (poll loop adds 1s minimum between checks). The previous
// 10s budget timed out almost every generation — variants came back with
// status:"timeout" and thumbnailUrl ended up null. Bumped to 45s so a
// typical 12s gen lands well within budget; per-tier hard budget still
// caps the overall job. Variants run in parallel so wall time stays low.
const PER_IMAGE_MS    = 45_000;
const LLM_BUDGET_MS   = 40_000;
// 2026-05-18 (CJ「想辦法加速」): the strategist anchor runs SEQUENTIALLY
// before captions (captions depend on it), so its budget is dead time on
// the critical path until the user sees output. It's non-fatal (callers
// fall back to brand context if it's empty) → cap it tight. Cuts up to
// ~18s off every strategist task's time-to-first-output / 502 risk.
const STRATEGIST_BUDGET_MS = 22_000;
const QA_BUDGET_MS    = 12_000;

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
    /** Actual provider model and whether the primary silently fell back. */
    modelId?: string | null;
    requestedModelId?: string | null;
    fallbackUsed?: boolean;
    url: string | null;
    status: "ready" | "failed" | "skipped" | "timeout";
    errorMsg?: string;
  };
  /**
   * 2026-07-29 Tier-1 TikTok video formats: the variant's image animated
   * into a short vertical clip. `posterUrl` is the still it was animated
   * from, so the UI can show a poster frame while the clip loads (and
   * still has something to render if the clip failed).
   */
  video?: {
    url: string | null;
    posterUrl: string | null;
    status: "ready" | "failed" | "skipped" | "timeout" | "pending";
    errorMsg?: string;
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
      fallbackUsed?: boolean;
      url: string | null;
      status: "ready" | "failed" | "skipped" | "timeout" | "pending";
      errorMsg?: string;
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
  /** 2026-07-20 (CJ QA 斷字/漏字 forensics): raw writer captions for any
   *  variant the post-processing chain modified — persisted to metadata so
   *  the corrupting transform can be identified by diffing against content. */
  rawCaptions?: Array<{ label: string; raw: string }>;
}

// ── Helpers ──────────────────────────────────────────────────────────────

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

/**
 * Field-level char caps so a single huge field can't blow the persona
 * budget. Total persona budget is PERSONA_TOTAL_CAP — we walk fields in
 * priority order and stop when budget hits zero.
 */
const PERSONA_TOTAL_CAP = 5000;
const FIELD_CAPS: Record<string, number> = {
  bio:              500,
  specialty:        1500,
  methodology:      1500,
  experienceDetail: 600,
  workingPrinciples:1000,
  specialtySummary: 400,
  tool_instructions:800,
  bio_zh:           300,
  caseStudies:      800,   // applied to JSON-stringified body
  taskSystemPrompt: 2000,  // canonical work manual when present
};

/** Trim a single string field to its cap, with "…" suffix if cut. */
function trimField(s: string | null | undefined, cap: number): string {
  if (!s) return "";
  const t = String(s).trim();
  if (t.length <= cap) return t;
  return t.slice(0, cap - 1).trimEnd() + "…";
}

/** Render caseStudies JSON as a human-readable summary chunk. */
function renderCaseStudies(raw: any): string {
  if (!raw) return "";
  let arr: any;
  try { arr = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return ""; }
  if (!Array.isArray(arr)) return "";
  const lines: string[] = [];
  for (const cs of arr.slice(0, 5)) {
    if (!cs) continue;
    const brand = cs.brand ?? cs.client ?? "";
    const result = cs.result ?? cs.outcome ?? cs.summary ?? "";
    const role = cs.role ?? "";
    const yr = cs.year ?? "";
    const parts = [brand, role, yr].filter(Boolean).join(" · ");
    if (parts || result) lines.push(`- ${parts}${parts ? "：" : ""}${result}`);
  }
  return lines.join("\n");
}

export async function loadAgent(id: number | null | undefined): Promise<{ meta: AgentMeta | null; persona: string; aiModel: string | null }> {
  if (!id) return { meta: null, persona: "", aiModel: null };
  try {
    // 2026-05-12 (CJ「都是有完整經歷的人」+ "我要的是全站任務都同一個標準"):
    // pull ALL 10 rich text fields, not just 4. The agents table has
    // experienceDetail, workingPrinciples, specialtySummary, tool_instructions,
    // bio_zh, caseStudies JSON — previously ignored. Total persona is
    // capped at PERSONA_TOTAL_CAP chars so even the thickest agent
    // (Amy Su, 7811 char) fits within first-token budget (~5000 chars
    // ≈ 1700 tokens ≈ 200-500ms latency add).
    const [rows]: any = await localPool.execute(
      `SELECT id, name, title, bio, specialty, methodology, taskSystemPrompt,
              experienceDetail, workingPrinciples, specialtySummary,
              tool_instructions, bio_zh, caseStudies,
              aiModel, avatarUrl
       FROM agents WHERE id = ? LIMIT 1`,
      [id],
    );
    const a = (rows as any[])?.[0];
    if (!a) return { meta: null, persona: "", aiModel: null };

    // Build sections in priority order. taskSystemPrompt is most authoritative;
    // workingPrinciples + methodology are second; bio + specialty are identity.
    const sections: Array<{ label: string; body: string }> = [];
    const push = (label: string, body: string) => {
      if (body.trim()) sections.push({ label, body });
    };
    push("背景",         trimField(a.bio,             FIELD_CAPS.bio!));
    push("中文背景",     trimField(a.bio_zh,          FIELD_CAPS.bio_zh!));
    push("專長",         trimField(a.specialty,       FIELD_CAPS.specialty!));
    push("專長摘要",     trimField(a.specialtySummary,FIELD_CAPS.specialtySummary!));
    push("經歷",         trimField(a.experienceDetail,FIELD_CAPS.experienceDetail!));
    push("方法論",       trimField(a.methodology,     FIELD_CAPS.methodology!));
    push("工作原則",     trimField(a.workingPrinciples,FIELD_CAPS.workingPrinciples!));
    push("工具與流程",   trimField(a.tool_instructions,FIELD_CAPS.tool_instructions!));
    push("代表案例",     trimField(renderCaseStudies(a.caseStudies), FIELD_CAPS.caseStudies!));

    // Greedy fill within total cap.
    const header = `你是 ${a.name}，${a.title}。\n`;
    let body = "";
    let usedChars = header.length;
    for (const s of sections) {
      const chunk = `${s.label}：${s.body}\n`;
      if (usedChars + chunk.length > PERSONA_TOTAL_CAP) {
        // Try to squeeze in a trimmed version
        const remaining = PERSONA_TOTAL_CAP - usedChars - s.label.length - 4;
        if (remaining > 80) {
          const cut = trimField(s.body, remaining);
          const partial = `${s.label}：${cut}\n`;
          body += partial;
          usedChars += partial.length;
        }
        break;
      }
      body += chunk;
      usedChars += chunk.length;
    }

    // taskSystemPrompt goes last, with a distinct heading. If we'd overflow,
    // truncate but still always include it because it's the work-manual.
    let tsp = trimField(a.taskSystemPrompt, FIELD_CAPS.taskSystemPrompt!);
    if (tsp) {
      const tspHeader = `\n# 工作守則（必讀，違反等於失敗）\n`;
      const budgetLeft = PERSONA_TOTAL_CAP - usedChars - tspHeader.length;
      if (budgetLeft < tsp.length && budgetLeft > 100) {
        tsp = trimField(tsp, budgetLeft);
      } else if (budgetLeft <= 100) {
        tsp = ""; // no room
      }
    }

    const persona =
      header + body +
      (tsp ? `\n# 工作守則（必讀，違反等於失敗）\n${tsp}\n` : "") +
      `\n用你的口氣寫，不要寫得像通用 AI。\n\n`;

    return {
      meta: { id: a.id, name: a.name, title: a.title, avatarUrl: a.avatarUrl ?? null },
      persona,
      aiModel: a.aiModel ?? null,
    };
  } catch { return { meta: null, persona: "", aiModel: null }; }
}

// 2026-05-18 (CJ「行事曆」): merge N pillar-group JSON arrays into ONE
// day-sorted calendar JSON string. Tolerant of fences / surrounding text.
function mergeCalendarPosts(captionStrings: string[]): string {
  const all: any[] = [];
  for (const c of captionStrings) {
    let s = String(c ?? "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const a = s.indexOf("["), b = s.lastIndexOf("]");
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) all.push(...arr.filter((p) => p && typeof p === "object"));
    } catch { /* skip a malformed pillar slice */ }
  }
  all.sort((x, y) => (Number(x?.day) || 0) - (Number(y?.day) || 0));
  const n = all.length || 1;
  all.forEach((p, i) => { p.day = Math.min(30, Math.max(1, Math.round(((i + 1) * 30) / n))); });
  return JSON.stringify(all);
}

// 2026-05-19 (CJ 驗收 kl-60-pitch-pack v#2「守門未生效」): hoisted to
// module scope so it can run BOTH in the post-caption gate AND again as
// a final pass right before variants are persisted — a guaranteed
// backstop independent of which upstream path populated the caption.
// Deterministic, zero-cost, idempotent (safe to run twice).
/**
 * 2026-06-10 (CJ「資訊不夠時不要用 [請補充] 佔位符」改造):
 * Strip [請補充：…] / [待補：…] / [ASSUMPTION] / [TODO] / [TBD] / [placeholder]
 * markers from body captions. Used by ALL 30s/60s body tasks (NOT 99s docs
 * which legitimately use these placeholders for strategy briefs).
 *
 * Cleans up orphan whitespace / trailing punctuation left behind so the
 * scrub doesn't leave weird artifacts like "我們的活動。。從昨天開始" etc.
 */
export function stripPlaceholderBrackets(s: string): string {
  if (!s) return s;
  return s
    // With content: "[請補充：日期]" + optional trailing punctuation
    .replace(/[\[【]\s*(?:請補充|待補|請填入|TODO|ASSUMPTION|TBD|placeholder)[：:][^\[\]【】\n]*[\]】][。，,\.\s]*/g, "")
    // Without content: "[請補充]" + optional trailing punctuation
    .replace(/[\[【]\s*(?:請補充|待補|請填入|TODO|ASSUMPTION|TBD|placeholder)\s*[\]】][。，,\.\s]*/g, "")
    // Cleanup
    .replace(/\s{2,}/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

export function voiceSanitizeZhTW(s: string): string {
  return s
    // emoji 一律移除（含 😉 俏皮符號）
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2122}\u{2139}\u{203C}\u{2049}]/gu, "")
    // 大陸用詞 → 台灣用語
    .replace(/渠道/g, "管道")
    // KOL 業配套語 / 空洞感性句 → 收斂
    .replace(/(?:特別是)?在這個數位時代[，,]?/g, "")
    .replace(/讓我們的品牌故事更加精彩/g, "把品牌故事說得更清楚")
    .replace(/更加精彩/g, "更完整")
    .replace(/期待你的回音/g, "想聽聽你的想法")
    .replace(/期待你的回應/g, "想聽聽你的想法")
    .replace(/(?:讓我們一起)?打造出引人注目的內容(?:吧)?/g, "一起把內容做好")
    .replace(/引人注目/g, "")
    .replace(/感受到突破品牌行銷的興奮/g, "")
    .replace(/非常契合/g, "很契合")
    .replace(/管理品牌形象時更有信心和便利/g, "更穩地守住品牌的一致")
    .replace(/管理品牌形象/g, "守住品牌的一致")
    .replace(/突破性的功能/g, "這個功能")
    .replace(/強大功能/g, "這個功能")
    .replace(/不得不點贊/g, "")
    // v#3 業配收尾套語 → 收斂
    .replace(/感謝你花時間閱讀我們的提案/g, "謝謝你花時間看完")
    .replace(/非常期待與你合作/g, "希望有機會一起做這件事")
    .replace(/非常樂意隨時跟你聊聊/g, "隨時可以聊聊")
    .replace(/希望能一起創造美好的合作/g, "希望這次合作能對彼此都有意義")
    .replace(/(?:讓我們一起|一起)創造美好的合作/g, "")
    .replace(/讓我們一起創造/g, "一起做出")
    .replace(/期待聽到你的想法/g, "想聽聽你的想法")
    // 帶貨/浮誇/效率詞 → 沉穩守護者語感（軟改寫，不硬刪以免斷句）
    .replace(/全台(?:品牌)?行銷人注意/g, "給品牌行銷人的觀察")
    .replace(/注意[！!]/g, "")
    .replace(/快來試試(?:看)?/g, "可以試試")
    .replace(/趕快試試看/g, "可以試試")
    .replace(/快來檢查一下/g, "值得檢查一下")
    .replace(/快來一起看看/g, "一起看看")
    .replace(/快來/g, "")
    .replace(/讓你的品牌亮起來/g, "讓品牌好好說話")
    .replace(/(?:讓品牌)?大放異彩/g, "")
    .replace(/宇宙無敵/g, "")
    .replace(/超神奇/g, "")
    .replace(/(?:讓你的品牌語音)?(?:在數位世界裡)?響亮無比/g, "讓品牌的聲音被聽見")
    .replace(/響亮無比/g, "")
    .replace(/在快速(?:進化|變化)的數位世界裡/g, "")
    .replace(/業界(?:的)?佼佼者/g, "")
    .replace(/不再擔心/g, "不必再擔心")
    .replace(/行銷新篇章/g, "行銷的下一步")
    .replace(/讓我們一起期待/g, "值得期待")
    .replace(/一起來討論吧/g, "歡迎一起想想")
    // 常見簡體漏字 → 繁體
    .replace(/精准/g, "精準")
    .replace(/内容/g, "內容")
    .replace(/数据/g, "數據")
    // 「通過」誤用 → 「透過」（表 via/經由 的語境；保守鎖定後接詞）
    .replace(/通過(?=直播|首映|預告|頻道|這場|本次|這次|社群|留言|評論)/g, "透過")
    // 英文直引號包中文 → 全形「」
    .replace(/"([^"\n]{1,40})"/g, "「$1」")
    // 2026-06-10 (CJ「資訊不夠時不要用 [請補充] 佔位符」改造):
    // OLD: kept [請補充/待補/請填入] as placeholders (preserved by exclusion).
    // NEW: STRIP all placeholder brackets — including these and any
    // [ASSUMPTION] / [TODO] / [TBD] markers. With content (e.g.
    // "[請補充：日期]"), drop the whole token; with optional trailing
    // punctuation (。，,.) consumed in one pass.
    .replace(/[\[【]\s*(?:請補充|待補|請填入|TODO|ASSUMPTION|TBD|placeholder)[：:][^\[\]【】\n]*[\]】][。，,\.\s]*/g, "")
    .replace(/[\[【]\s*(?:請補充|待補|請填入|TODO|ASSUMPTION|TBD|placeholder)\s*[\]】][。，,\.\s]*/g, "")
    // OTHER bracket-wrapped sentences (not placeholders) → unwrap
    .replace(/(^|\n)\s*[\[【]\s*([^\[\]【】\n]{6,})\s*[\]】]\s*(?=\n|$)/g, "$1$2")
    // 句尾與句中驚嘆號（! 與 ！）一律 → 句號
    .replace(/[!！]+/g, "。")
    // 清理改寫後的殘留
    .replace(/。{2,}/g, "。")
    .replace(/(^|\n)\s*。\s*/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * 2026-07-18 (CJ 多市場實測): the writer LLM occasionally slips CJK
 * punctuation into non-CJK output because the prompt scaffolding is
 * Chinese (observed: "part of the Lumen Coffee crew。" in an EN email).
 * Deterministic cleanup for languages that use Latin punctuation.
 *
 * Do NOT run for zh* (obviously) or ja* (Japanese legitimately uses
 * 。、「」) — use latinPunctLang() as the gate.
 */
export function latinPunctLang(outputLanguage?: string | null): boolean {
  const l = (outputLanguage ?? "zh-TW").toLowerCase();
  return !l.startsWith("zh") && !l.startsWith("ja");
}
export function normalizeLatinPunct(s: string): string {
  return s
    .replace(/。/g, ". ")
    .replace(/，/g, ", ")
    .replace(/、/g, ", ")
    .replace(/：/g, ": ")
    .replace(/；/g, "; ")
    .replace(/！/g, "! ")
    .replace(/？/g, "? ")
    .replace(/[「『]/g, " “")
    .replace(/[」』]/g, "” ")
    .replace(/（/g, " (")
    .replace(/）/g, ") ")
    .replace(/％/g, "%")
    .replace(/　/g, " ")
    // cleanup: no space before closing punct / collapse doubles
    .replace(/ +([,.;:!?)])/g, "$1")
    .replace(/\( +/g, "(")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +$/gm, "");
}

// 2026-05-18 (CJ「每篇一個可編輯 mockup + 日期 + 批量 .ics」): expand the
// merged calendar posts into ONE VARIANT PER POST so the existing
// per-variant UI (pills nav / 跟 agent 改文案 / 改圖 / 排程發布) works
// per post. Label carries the real date + pillar (RunPage parses it for
// the batch .ics); caption is the clean publishable post text.
function expandCalendarVariants(captionStrings: string[]): OrchestraVariant[] {
  const merged = mergeCalendarPosts(captionStrings);
  let posts: any[] = [];
  try { posts = JSON.parse(merged); } catch { posts = []; }
  if (!Array.isArray(posts) || posts.length === 0) return [];
  const today = new Date();
  return posts.map((p, i) => {
    const dayN = Math.max(1, Math.min(60, Number(p?.day) || i + 1));
    const d = new Date(today.getTime() + (dayN - 1) * 86400000);
    const dateStr = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
    const pillar = String(p?.pillar ?? "").trim() || "貼文";
    const hook = String(p?.hook ?? "").trim();
    const message = String(p?.message ?? "").trim();
    const cta = String(p?.cta ?? "").trim();
    const caption = [hook, message, cta ? `→ ${cta}` : ""].filter(Boolean).join("\n\n");
    return {
      // label is parseable: "<YYYY/MM/DD> · 第N天 · <pillar>"
      label: `${dateStr} · 第 ${dayN} 天 · ${pillar}`,
      caption,
      hashtags: [],
      image: { style: null, url: null, status: "skipped" as const },
    };
  });
}

function tryParseJson(text: string): any {
  let t = (text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = t.search(/[{\[]/);
  if (start > 0) t = t.slice(start);
  const lastBrace = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (lastBrace >= 0) t = t.slice(0, lastBrace + 1);
  try { return JSON.parse(t); } catch { return null; }
}

function timeoutPromise<T>(ms: number, label: string): Promise<T> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms),
  );
}

// 2026-08-02 (CJ「標題居然變成『我收到你的任務了』」): the L3 raw-text
// fallback in extractCaption() below ships whatever the model wrote
// verbatim once JSON parsing fails — including a chat-assistant
// acknowledgment the model tacked on before the real content ("我收到你的
// 任務了，以下是分鏡規劃：..."). titleFromCaption() then faithfully lifts
// that first sentence as the mission title. The "不要前言" instructions in
// the system prompt are a request, not a guarantee — strip the common
// acknowledgment openers as a deterministic backstop, applied once at the
// single choke point every caption passes through (regardless of which
// parse layer produced it).
const LEADING_ACK_RE =
  /^(?:好的[，,！!。]?\s*)?(?:我(?:已)?收到(?:你|您)的(?:任務|需求|指令)了?|以下(?:是|為)(?:你|您)?(?:準備|規劃|產出)?的?|這(?:是|篇是)(?:你|您)?(?:的)?|我(?:會|將)(?:為(?:你|您))?)[^\n，,：:]{0,60}[，,：:\n]\s*/;

function stripCaptionPreamble(caption: string): string {
  const stripped = caption.replace(LEADING_ACK_RE, "").trim();
  return stripped.length > 0 ? stripped : caption;
}

// ── Caption writer — N parallel LLM calls, one per variant ──────────────
//
// Design (CJ direction 2026-05-05): instead of 1 LLM call producing N JSON
// variants (which truncates / drops a variant when tokens get tight), we
// fan out N small calls. Each writes EXACTLY one variant. Failures are
// isolated; one missing variant gets retried once, rather than poisoning
// the whole batch. Wall time stays the same because they run in parallel.
//
// Each single-variant call is tiny (~150-300 tokens) so it never truncates.

async function callOneVariant(args: {
  template: FBTaskTemplate;
  config: OrchestraConfig;
  label: string;
  captionPersona: string;
  brandPrefix: string;
  urlContext: string;
  userMsg: string;
  /** Actual args.inputs keys for the deterministic internal-key leak gate. */
  inputKeys: readonly string[];
  /** Agent's aiModel field — maps to provider (qwen/Kimi/glm). null = use template.preferredModel */
  agentAiModel?: string | null;
  /** Strategist anchor (multi-post / narrativeArc tasks) — injected before user msg */
  strategistAnchor?: string;
  /** 2026-07-17 多市場: brand's master-persona market. undefined = legacy zh-TW; null = no matching master → omit block. */
  market?: MarketCode | null;
  /** Whether final copy must be zh-TW; used by the non-deliverable gate. */
  isZhTW: boolean;
  /** Ad-copy tasks: landing URL the user typed (deterministically extracted); null = none. */
  requestedUrl?: string | null;
}): Promise<{ label: string; caption: string; hashtags?: string[] }> {
  const { template, config, label, captionPersona, brandPrefix, urlContext, userMsg, inputKeys, agentAiModel, strategistAnchor, market, isZhTW } = args;
  const adCopy = isAdCopyTemplate(template);
  const requestedUrl = adCopy ? (args.requestedUrl ?? null) : null;
  // Multi-post / labeled-slot tasks reference {label} in template.systemPrompt;
  // substitute the actual post slot before sending to LLM.
  // {today} → market-appropriate date format so PR datelines / calendar
  // dates are never stale. zh markets (and legacy undefined) keep
  // YYYY年M月D日; other known markets use their locale; unmapped → ISO.
  const _now = new Date();
  const todayStr = (market === undefined || (market ?? "").startsWith("zh"))
    ? `${_now.getFullYear()}年${_now.getMonth() + 1}月${_now.getDate()}日`
    : market
    ? _now.toLocaleDateString(market, { year: "numeric", month: "long", day: "numeric" })
    : _now.toISOString().slice(0, 10);
  const filledSystemPrompt = template.systemPrompt
    .replace(/\{label\}/g, label)
    .replace(/\{today\}/g, todayStr);

  // 2026-05-16 (CJ「一句話 brand brief 變成長文改寫 — 指令太短還是
  // agent 不準？」root cause): a single soft "字數 X-Y 字" line gets
  // buried under the master persona + guardrails, so micro-tasks
  // (headline / one-liner) blow past the cap and rewrite the pasted
  // source instead of compressing. For small caps make the constraint
  // authoritative + explicitly frame it as compression, not rewrite.
  const lengthHint =
    config.captionMaxChars > 0
      ? (config.captionMaxChars <= 60
          ? `【嚴格字數 — 最高優先】整個 caption 必須在 ${config.captionMinChars}-${config.captionMaxChars} 字以內，` +
            `只能是 1 句，不分段、不加 hashtag、不加開場白或解釋。` +
            `這是「濃縮」任務：使用者貼的長文只是素材，你的工作是把它` +
            `提煉成符合任務要求的那一句，**嚴禁改寫或摘要成多段**。`
          : `字數 ${config.captionMinChars}-${config.captionMaxChars} 字。`)
      : "字數依任務本身規範。";

  // Critical ordering: urlContext goes AFTER brandPrefix so URL content is
  // the most recent context the LLM sees. Plus explicit precedence rule.
  //
  // 2026-05-06: Hard-found bug — brand_brain prefix says "所有產出都要符合
  // 下面的定位" which overrode URL content (e.g. cars video → Shopee
  // shopping copy because user's brand was Shopee-related). When URL is
  // present, wrap brandPrefix with a hard override: subject = URL, brand
  // = voice-only, ignore brand positioning / products / services.
  const hasUrl = urlContext.length > 0;
  const brandSection = hasUrl
    ? brandPrefix
      ? `\n# 品牌（**只取語氣參考，主題請看下面 URL**）\n` +
        `⚠️ 重要：以下品牌資訊「**只用於語氣 / 用詞 / 受眾**」。` +
        `絕對不要把品牌的定位、產品、服務塞進這次的 caption。` +
        `若 URL 是談汽車、品牌是 Shopee 工具 — caption 必須關於汽車，跟 Shopee 無關。\n` +
        `（以下品牌大腦摘要原本要求「所有產出都要符合定位」，但本次任務 URL 已指定主題，這條規則暫時關閉。）\n` +
        brandPrefix
      : ""
    : `\n# 品牌語氣參考\n${brandPrefix}`;
  const subjectRule = hasUrl
    ? `\n【主題優先序 — 最重要】\n` +
      `本次任務的「主題」=上面 URL 抓到的內容。品牌不是主題。\n` +
      `caption 必須具體呼應 URL 內容（提到影片裡的事件、數字、名稱、人事物），不要寫通用模板，不要繞回品牌主商品。\n` +
      `即使 URL 主題與品牌領域完全無關，也必須直接以 URL 主題撰寫貼文，不要硬扯品牌。\n` +
      `嚴禁輸出提問、澄清請求、說明、免責聲明、或任何非貼文內容。\n` +
      `素材不足時，以標題與描述推論主題撰寫；不得臆造具體數據或事件細節。\n` +
      `一律使用品牌目標市場語言輸出。\n`
    : "";

  const strategistSection = strategistAnchor
    ? `\n# 系列敘事框架（由 strategist 規劃 — 必須遵循）\n${strategistAnchor}\n` +
      `↑ 上面是整個系列的結構錨點。你寫的這篇必須對應「${label}」這一段，` +
      `且與其他段呼應、不重複內容。\n`
    : "";

  // 2026-05-08 (CJ — sowork-ai-v2 study): inject the per-market master
  // persona BEFORE task-specific rules. Was: thin "為品牌寫一篇 FB
  // 短貼文" → output reads generic. Now: full 10-year-veteran 台灣社群
  // master with cultural element bank + ban list, then platform guide,
  // THEN task-specific systemPrompt. 3 layers of grounding.
  const platformCode = (template.outputDefaults?.platform ?? "facebook") as PlatformCode;
  // 2026-07-17 多市場: market comes from brands.targetCountry/outputLanguage.
  // null = brand's language has no master persona (e.g. th/vi) → omit the
  // block entirely; the market section in brandPrefix carries the language
  // directive. undefined (legacy callers) keeps the zh-TW default.
  const masterBlock = market === null
    ? ""
    : getCopywritingMasterPrompt({ market: market ?? "zh-TW", platform: platformCode });

  // 2026-05-16 (CJ「KOL Brief 完全不符標準」root cause): document
  // tasks bypass the social-caption scaffolding entirely. The 台灣社群
  // master persona + 「主角必須是輸入內容」+ 貼文格式規則 jointly force
  // the model to rewrite the pasted material into a FB post, ignoring
  // the structured-document systemPrompt. Lean prompt: template
  // instruction is dominant; input is explicitly raw material to be
  // distilled into the document, NOT rewritten into a post.
  // 2026-05-17 (CJ「學習 IAC 得獎 email」): email-family tasks get the
  // award-grade craft rubric + per-use-case playbook appended after the
  // task instruction. Brand-agnostic craft (HOW); brand essence still
  // from the digest, hard rules from the post-gen enforcement layer.
  // 2026-05-17: inject the heavy rubric ONLY for full-body email tasks.
  // Atomic fragments (subject-line / preview-text, 3 distinct angle
  // variants in ≤30 chars) were homogenised by the big shared block —
  // their own per-{label} prompt handles craft.
  const edmBlock = isEmailBodyTask(template)
    ? `\n\n${EDM_CRAFT_RUBRIC}\n\n${edmPlaybookFor(template.id)}\n`
    : "";
  // 2026-05-17 (CJ「IG 也要得獎工藝層」): IG-family body tasks get the
  // visual+copy dual-track rubric + per-use-case playbook, mirroring
  // edmBlock. Atomic fragments (hashtag/bio/dm/comment) excluded by
  // isInstagramBodyTask — their own per-{label} prompt handles craft.
  const igBlock = isInstagramBodyTask(template)
    ? `\n\n${IG_CRAFT_RUBRIC}\n\n${igPlaybookFor(template.id)}\n`
    : "";
  // 2026-05-17 (CJ「所有平台都要得獎工藝層」): FB / LI / TT / YT body tasks
  // each get a platform-specific award-grade rubric + per-task playbook,
  // same architecture as edmBlock / igBlock. Atomic fragments excluded by
  // their respective isXxxBodyTask guards.
  const fbBlock = isFacebookBodyTask(template)
    ? `\n\n${FB_CRAFT_RUBRIC}\n\n${fbPlaybookFor(template.id)}\n`
    : "";
  const liBlock = isLinkedInBodyTask(template)
    ? `\n\n${LI_CRAFT_RUBRIC}\n\n${liPlaybookFor(template.id)}\n`
    : "";
  const ttBlock = isTikTokBodyTask(template)
    ? `\n\n${TT_CRAFT_RUBRIC}\n\n${ttPlaybookFor(template.id)}\n`
    : "";
  const ytBlock = isYouTubeBodyTask(template)
    ? `\n\n${YT_CRAFT_RUBRIC}\n\n${ytPlaybookFor(template.id)}\n`
    : "";
  // 2026-05-17 (CJ「所有平台都要得獎工藝層」): PR / Brand Strategy / KOL /
  // Research / Cross-Platform craft layers — same architecture as above.
  const prBlock = isPRBodyTask(template)
    ? `\n\n${PR_CRAFT_RUBRIC}\n\n${prPlaybookFor(template.id)}\n`
    : "";
  const brBlock = isBrandStrategyBodyTask(template)
    ? `\n\n${BR_CRAFT_RUBRIC}\n\n${brPlaybookFor(template.id)}\n`
    : "";
  const klBlock = isKOLBodyTask(template)
    ? `\n\n${KL_CRAFT_RUBRIC}\n\n${klPlaybookFor(template.id)}\n`
    : "";
  const rsBlock = isResearchBodyTask(template)
    ? `\n\n${RS_CRAFT_RUBRIC}\n\n${rsPlaybookFor(template.id)}\n`
    : "";
  const cwBlock = isCrossplatformBodyTask(template)
    ? `\n\n${CW_CRAFT_RUBRIC}\n\n${cwPlaybookFor(template.id)}\n`
    : "";

  // 2026-07-18 多市場 (P2): the 11 award-craft rubrics are zh-TW "structure
  // textbooks" with Taiwan cultural framing. Rather than maintaining 11×N
  // per-market rewrites, non-zh-TW markets get ONE override: keep the
  // STRUCTURE (hook / narrative arc / rhythm / close), localize everything
  // else. Applies when the brand's market is known and not zh-TW (null =
  // unmapped language — note still applies; undefined = legacy zh-TW).
  const anyCraft = edmBlock || igBlock || fbBlock || liBlock || ttBlock ||
    ytBlock || prBlock || brBlock || klBlock || rsBlock || cwBlock;
  const craftLocaleNote = (market !== undefined && market !== "zh-TW" && anyCraft)
    ? `\n\n【工藝準則在地化 — 重要】上方得獎工藝準則是以台灣市場中文寫成的「結構教材」：` +
      `只取其結構（開場鉤子 / 敘事弧 / 節奏 / 收尾 / 格式），**輸出一律用品牌目標市場語言**；` +
      `文化引用（節慶 / 場景 / 慣用語 / 平台梗）改用目標市場的在地等效，不得出現台灣特有元素（夜市 / 便利商店 / 中元節…）。\n`
    : "";

  // 2026-05-18 (CJ「行事曆其他支柱格式是亂的」): calendar pillar agents
  // must emit a STRICT JSON array. The social-caption scaffolding below
  // (craft rubric + 「只寫 1 個變體 caption」+「不要排成結構化卡片」+
  // {caption} object wrapper) actively fights that → prose/garbage.
  // Give calendar a MINIMAL clean prompt: persona + the strict task
  // prompt + brand context only.
  // 2026-05-18 (CJ 驗收 newsjack): calendar AND any cleanPrompt task
  // bypass the social-caption scaffolding (craft rubric + 「只寫1變體
  // caption」+「hashtag 放文末」+「不要結構化卡片」) which sabotages
  // strict structured formats / guardrails (the newsjack 4-field format
  // + no-hashtag rule kept being overridden).
  // 2026-05-19 (CJ 驗收 newsjack #3「JSON 裸輸出，每個 tab 顯示相同 blob」):
  // calendarMerge 與 cleanPrompt 之前被合併成同一個 calMode，都被要求
  // 「只輸出 JSON 陣列」。calendar 是「一次呼叫產全部 → 下游 split」所以
  // 要陣列；但 cleanPrompt 任務（newsjack）走 per-variant fanout，每個
  // {label} 是獨立 LLM call，被要求輸出陣列 → 每個 call 都吐出全部 5
  // 變體的 JSON array → 每個 tab 顯示相同 blob、渲染器拆不開。
  //   calendarMode：保留陣列輸出（merge/split 在下游）
  //   cleanMode   ：minimal 乾淨 prompt（保留 guardrail 不被社群 scaffold
  //                 蓋掉）+ 單變體 + 標準單一 JSON 物件輸出，讓既有
  //                 per-variant fanout + L1 extractCaption 正常分流。
  const calendarMode = !!config.calendarMerge;
  const cleanMode = !!config.cleanPrompt && !config.calendarMerge;
  const docMode = template.outputMode === "document";
  const deliverableOnlyRule =
    `\n\n【只輸出可交付成品 — 最高優先，違反即視為失敗】\n` +
    `這是一鍵速產任務，使用者不會再補充。**無論資訊多不足，都必須直接產出一份完整、可用的成品**。\n` +
    `- 禁止輸出任何審議過程、選項評估、抓取流程、處理步驟或模型內心獨白。\n` +
    `- 禁止自述工作原則、限制、降級策略或「我的處理方式」，不得解釋理由。\n` +
    `- 嚴禁反問或要求補充，尤其不得輸出「我需要更多資訊」「請提供」「請補充」「為了完成需要…」等句子或要求清單。\n` +
    `- 禁止輸出輸入欄位的內部名稱（例如 snake_case 識別字）；只使用使用者看得懂的自然語言。\n` +
    `- 來源連結抓不到內容時，直接依 URL 標題、描述與主題完成任務要求的成品；不得提及、暗示或解釋抓取失敗。\n` +
    `caption 只能包含最終可發布文字本身。`;
  const promptCore = calendarMode
    ? `# 角色（寫作口吻參考）\n${captionPersona}\n\n` +
      `# 任務（最高指令，必須完全遵循；只輸出 JSON 陣列，不要任何其他文字）\n` +
      filledSystemPrompt +
      `\n\n# 品牌脈絡（素材，扣回用，不要照抄）\n${brandPrefix}` +
      (hasUrl ? `\n\n# 參考素材（URL 抓到的內容）\n${urlContext}` : "")
    : cleanMode
    ? `# 角色（寫作口吻參考，不要把自我介紹寫進輸出）\n${captionPersona}\n\n` +
      `# 任務（最高指令，必須完全逐條遵循其格式與【絕對規則】）\n` +
      filledSystemPrompt +
      // 2026-08-22: strategist anchor was missing from cleanMode — a
      // multi-segment clean-prompt task (live run-of-show) needs the arc
      // just as much as a social one. No-op for newsjack (no strategist).
      strategistSection +
      `\n\n【本次只產 1 個變體】**${label}**：` +
      (config.cleanPromptVariantHint ??
        `只接「這一個」時事/角度，完全照任務指定的四欄純文字格式輸出這 1 個變體的內容。`) +
      `\n**嚴禁**輸出 JSON 陣列、**嚴禁**一次列出多個變體、**嚴禁**把其他 ` +
      `tab 的內容也寫進來——每個變體是獨立一次產出，只有一份。\n\n` +
      `【輸出格式】輸出嚴格 JSON 物件（不是陣列）：\n` +
      `{"caption":"${config.cleanPromptCaptionSpec ??
        `<這 1 個變體的四欄純文字內容，保留【角度】【為什麼會被報】【一句 pitch】【建議下一步】四個方括號標題與換行>`
      }","hashtags":[]}\n` +
      `第一個字元就是 {。不要 code fence、不要前言、caption 外不要多寫字。\n` +
      `\n# 品牌脈絡（素材，扣回用，不要照抄）\n${brandPrefix}` +
      (hasUrl ? `\n\n# 參考素材（URL 抓到的內容）\n${urlContext}` : "")
    : docMode
    ? // 2026-05-16 (CJ「人設應該 follow agent，不要到處都是人設指令」):
      // doc tasks use the ASSIGNED agent's persona as the voice/role —
      // no hardcoded "文件撰寫者", no social master. captionPersona is
      // the KOL-savvy agent we picked for this task.
      `# 你的角色（用此專業背景與口吻撰寫）\n` +
      captionPersona +
      `\n# 任務說明（最高指令 — 必須完全遵循其章節結構與順序）\n` +
      filledSystemPrompt +
      edmBlock +
      igBlock +
      fbBlock +
      liBlock +
      ttBlock +
      ytBlock +
      prBlock +
      brBlock +
      klBlock +
      rsBlock +
      cwBlock +
      craftLocaleNote +
      strategistSection +
      `\n\n【本次只產 1 個變體】**${label}**：在不更動章節結構的前提下，` +
      `用此變體的風格詮釋（完整正式版＝最詳盡；精簡重點版＝每節更精煉；活動主題版＝圍繞本次活動主軸）。\n` +
      `${lengthHint}\n\n` +
      `【素材使用 — 關鍵】\n` +
      `user message / URL / 品牌資訊都只是**素材**。你的工作是從中萃取資訊、` +
      `填進文件對應章節，**嚴禁把素材照抄或改寫成一篇文章 / 社群貼文**。` +
      `缺的具體資訊一律用「[待補：例如 上稿日期]」標出，絕不反問使用者、絕不省略任何章節。\n\n` +
      `【輸出格式】\n` +
      `輸出嚴格 JSON 物件：{"caption":"<文件完整內容>","hashtags":[]}\n` +
      `caption 內就是完整 Markdown 文件本身，**完整保留 # 標題、表格、> 引言等 Markdown 結構**。` +
      `第一個字元就是 {。不要 code fence、不要前言、不要在 caption 外多寫任何字。\n` +
      brandSection +
      (hasUrl ? `\n# 素材：URL 抓到的內容（萃取用，不要照抄）\n${urlContext}` : "")
    : masterBlock + "\n\n" +
    `# 你的角色 / 寫作風格參考\n` +
    captionPersona +
    `\n# 任務說明（特定任務規範 — 蓋過上方平台通則）\n` +
    filledSystemPrompt +
    edmBlock +
    igBlock +
    fbBlock +
    liBlock +
    ttBlock +
    ytBlock +
    prBlock +
    brBlock +
    klBlock +
    rsBlock +
    cwBlock +
    craftLocaleNote +
    strategistSection +
    `\n\n【本次任務】只寫 1 個變體：**${label}**。\n` +
    `${lengthHint}\n\n` +
    `【角色 vs 主角 — 重要】\n` +
    `上面的「角色」只是給你**寫作口吻**參考。**主角永遠是用戶或用戶輸入的內容**（在 user message + URL context）。\n` +
    `絕對不要把你（agent）的職稱、姓名、服務描述、自我介紹寫進輸出。\n` +
    `不要寫「我是 ___」、「___ 專家，幫 ___ 做 ___」、不要把你的姓名（例如 #NinaYeh / @JanetChang）寫成 hashtag、@mention 或 caption 內任何形式。\n` +
    subjectRule +
    `\n【格式要求 — 重要】\n` +
    `- caption 欄位**絕對不要**寫「${typeof template.label === "string" ? template.label : (template.label?.zh ?? template.label?.en ?? template.id)}」、「${label}」或任務 / label 名稱。\n` +
    `- caption 欄位**絕對不要**夾雜視覺描述、英文 prompt、「image_style:」、「visual:」等技術註記。圖片風格由另一位 agent 獨立處理，這裡只放最終發到平台的純文字內容。\n` +
    `- 用自然斷行（兩個 newline 分段）。**不要**用「｜」全形管道符號當分隔線。\n` +
    `- emoji 點綴用就好，不要每段開頭都塞 emoji。\n` +
    `- hashtag 集中放在文末**最後一行**，不要散落文中。\n` +
    `- 段落像真人寫的，不要排成「標題｜內文｜hashtag」結構化卡片。\n` +
    `- 若任務有時間戳結構（如 [0-3s]），務必保留每段秒數標記，不要省略。\n\n` +
    // 2026-05-16 (CJ「品質不佳，是否第一題要強制更多資訊」root cause):
    // 2026-06-10 (CJ「資訊不夠時不要用 [請補充] 佔位符」改造):
    // Old version told AI to use [待補：xxx] placeholders when missing data.
    // Those leaked to users as ugly bracket-text in the final caption.
    // New version: 3-step smart fallback (素材 → 場景 → 對話起手式).
    // Placeholders forbidden entirely; defensive scrub also strips them
    // post-LLM (see sanitizeCaption regex below).
    `\n【缺資訊時的處理 — 三步降級，禁用任何佔位符】\n` +
    `**絕對不准**輸出「[待補：xxx]」「[請補充：xxx]」「[填入：xxx]」「[ASSUMPTION]」這類括號標記。\n` +
    `缺具體事實（日期 / 數字 / 人名 / 連結）時，按順序降級：\n` +
    `1. 先從〈品牌大腦〉〈URL 抓到的內容〉抓真實素材填空。\n` +
    `2. 還是不夠 → **用具體場景敘述**取代「具體數據宣稱」。\n` +
    `   ✗ 壞：「87% 的人都這樣」（沒來源不准寫數字）\n` +
    `   ✓ 好：「晚上 8 點打開冰箱，看到剩半盒...」（場景畫面不需來源）\n` +
    `3. 場景也想不出 → 用「對話起手式」：「我跟一位 [TA 角色] 聊到...」「上週客人說了一句話讓我想很久...」\n\n` +
    `輸出嚴格 JSON 物件（不是陣列）：\n` +
    `{"caption":"<完整貼文>","hashtags":["..."]}\n` +
    `第一個字元就是 {。不要 markdown code fence、不要前言。\n` +
    brandSection +
    (hasUrl ? `\n# URL 抓到的內容（本次主題來源 — 必須以此為主）\n${urlContext}` : "");
  // Ad-copy contract goes LAST so it is the freshest instruction and wins
  // over the social scaffold's「不要排成結構化卡片」rule.
  const system = promptCore + deliverableOnlyRule + (adCopy ? buildAdCopyRule(requestedUrl) : "");

  // Provider + model selection priority:
  //   1. Agent's aiModel (from JSON-assigned real-person agent) — uses both
  //      provider mapping AND the exact model string (so claude-haiku stays
  //      claude-haiku, not silently downgraded to claude-sonnet via DEFAULT)
  //   2. Template's preferredModel (per-task hardcoded provider only)
  //   3. qwen as final default
  // 2026-05-16 (CJ「新聞稿品質太差，agent 是否也很差」root cause):
  // when the assigned agent has NO aiModel, this used to fall back to
  // template.preferredModel — which is hardcoded "qwen" (a Chinese
  // model) for almost EVERY quick-task template (FB / PR / KOL / …).
  // For a Taiwan-only product that emits weird Simplified / mainland
  // phrasing → the systemic "agent quality" complaint. Fix: route the
  // no-agent path through the SAME zh-TW Option-B policy. Only honour
  // preferredModel when it explicitly names a safe non-Chinese
  // provider; "qwen"/"zhipu"/azure-*/"any" all get the weighted
  // non-Chinese pick (anthropic 55% / openai 45%).
  const zhSafePick = (): ModelProvider => (Math.random() < 0.55 ? "anthropic" : "openai");
  const pm = template.preferredModel as string;
  const provider: ModelProvider = agentAiModel
    ? aiModelToProvider(agentAiModel)
    : (pm === "anthropic" || pm === "openai" ? (pm as ModelProvider) : zhSafePick());
  // 2026-05-16 (CJ「企劃台慢」root cause): aiModelToProvider now FORCE-
  // returns "anthropic" (zh-TW policy). The agent's aiModel string
  // (e.g. "glm-4-flash", "qwen3-32b", "claude-haiku-4-5") is Azure /
  // vendor naming — passing it as the explicit model to the *direct*
  // Anthropic API → 404 not_found on EVERY call → wasted RTT then
  // fallback to openai. That 404-then-retry on every single LLM call
  // is why theater (63 calls/run) crawled. Fix: stop pinning the
  // per-agent model. Let each provider use its own proven default
  // (anthropic → claude-sonnet-4-6, confirmed working via probe).
  const explicitModel: string | undefined = undefined;
  void agentAiModel; // provider already derived above; model intentionally unset

  // 2026-05-09 (CJ direction「掃描 ai provider + agent model 匹配」):
  // Resilient parse. LLM sometimes returns valid Chinese caption but in a
  // shape tryParseJson can't extract (e.g. nested object, plain text without
  // braces, "caption" key in different language). Fall through 3 layers:
  //   L1: strict JSON with .caption field (preferred)
  //   L2: any object with a string field that looks like the caption
  //   L3: raw text (strip code fences) if it's substantial Chinese/English
  //       — better to ship usable copy than fail the variant entirely.
  const extractCaption = (raw: string, parsed: any): { caption: string; hashtags?: string[] } => {
    // L1: standard shape
    if (typeof parsed?.caption === "string" && parsed.caption.trim().length > 0) {
      return {
        caption: parsed.caption.trim(),
        hashtags: Array.isArray(parsed?.hashtags) ? parsed.hashtags.slice(0, 15).map(String) : undefined,
      };
    }
    // L2: alternate keys (LLM sometimes uses "content", "text", "post", "貼文")
    if (parsed && typeof parsed === "object") {
      for (const key of ["content", "text", "post", "貼文", "文案", "body"]) {
        if (typeof parsed[key] === "string" && parsed[key].trim().length > 0) {
          return { caption: parsed[key].trim(), hashtags: Array.isArray(parsed?.hashtags) ? parsed.hashtags.slice(0, 15).map(String) : undefined };
        }
      }
      // Array shape: take first string field
      if (Array.isArray(parsed) && parsed[0]) {
        const first = parsed[0];
        if (typeof first === "string" && first.trim().length > 0) return { caption: first.trim() };
        if (typeof first?.caption === "string") return { caption: first.caption.trim() };
        // 2026-05-18 (CJ「行事曆產出空白」): a top-level array of objects
        // (e.g. the calendar's [{day,pillar,hook,…}, …]) has no .caption
        // and L3's length cap would drop it → empty. Preserve the whole
        // array as a JSON-string caption so calendarMerge can parse it.
        // 2026-05-19 (CJ 驗收 newsjack #3): ONLY do this for calendar. For
        // cleanMode (newsjack) the prompt now forces a single object per
        // fanout call; if the model still regresses to an array, dumping
        // the whole JSON into every tab is exactly the reported P0. Format
        // the FIRST element's fields into the readable four-欄 text so the
        // tab shows usable copy instead of a raw JSON blob.
        if (typeof first === "object") {
          if (calendarMode) return { caption: JSON.stringify(parsed) };
          const fields = ["角度", "為什麼會被報", "一句 pitch", "建議下一步"];
          const lines = fields
            .filter((k) => typeof first[k] === "string" && first[k].trim())
            .map((k) => `【${k}】${String(first[k]).trim()}`);
          if (lines.length > 0) return { caption: lines.join("\n\n") };
          return { caption: JSON.stringify(first) };
        }
      }
    }
    // L3: raw text fallback. Strip code fences + JSON-y noise. If at least
    // 30 chars of substantive text remain, ship it.
    const cleaned = (raw ?? "")
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .replace(/^\s*\{[\s\S]*?"caption"\s*:\s*"/i, "") // strip leading {"caption":"
      .replace(/"\s*[,}][\s\S]*$/, "")                 // strip trailing
      .trim();
    if (cleaned.length >= 30 && cleaned.length <= 2000 && /[一-鿿]|[A-Za-z]{10,}/.test(cleaned)) {
      console.warn(`[callOneVariant] L3 raw-text fallback for ${label} (${cleaned.length} chars)`);
      return { caption: cleaned };
    }
    return { caption: "" };
  };

  let attempt = 0;
  let lastErr: any = null;
  let lastRaw = ""; // for diagnostics
  let adCopyIssue = ""; // ad-copy contract violation from the previous attempt
  while (attempt < 2) {
    attempt++;
    try {
      // 2nd attempt: append explicit reminder to user msg, lowering model
      // creativity and forcing strict JSON.
      const userMsgWithReminder = attempt === 2
        ? `${userMsg}\n\n[REMINDER] ${adCopyIssue ? `上次回應違反廣告格式合約：${adCopyIssue}。請照【廣告格式合約】重寫。` : "上次回應沒給可解析、可交付的 caption。"}請嚴格回覆 {"caption":"...","hashtags":[]} JSON，第一個字元就是 {，不要任何 markdown / 前言 / 解釋。不得要求澄清，不得輸出審議過程、選項評估、自述工作原則、處理步驟或輸入欄位內部名稱；來源抓不到內容時就依 URL 標題、描述與主題直接寫，絕不說明抓取失敗。caption 只能放最終成品。`
        : userMsg;
      const r = await Promise.race([
        callModel(
          [
            { role: "system", content: system },
            { role: "user", content: userMsgWithReminder },
          ],
          undefined,
          provider,
          explicitModel,
        ),
        timeoutPromise<never>(LLM_BUDGET_MS, `caption[${label}]`),
      ]);
      lastRaw = r.content ?? "";
      const parsed = tryParseJson(lastRaw);
      const out = extractCaption(lastRaw, parsed);
      if (out.caption.length > 0) {
        const caption = stripCaptionPreamble(out.caption);
        const sanity = detectNonDeliverable(caption, { isZhTW, structured: calendarMode, inputKeys });
        if (!sanity) {
          if (adCopy) {
            const issue = validateAdCopy(caption, requestedUrl);
            if (issue && attempt < 2) {
              // Contract miss on the first try → one strict retry (the
              // reminder below names the exact violation).
              lastErr = new Error(`ad-copy contract miss for ${label} (${issue.reason}): ${issue.detail}`);
              adCopyIssue = issue.detail;
              console.warn(`[callOneVariant] attempt ${attempt} contract miss for ${label} (${issue.reason}): ${lastRaw.slice(0, 300)}`);
              continue;
            }
            if (issue) {
              // Last attempt: ship what we have, deterministically repaired
              // (URL appended to [Primary]). Missing markers cannot be repaired.
              console.warn(`[callOneVariant] ad-copy contract still unmet for ${label} (${issue.reason}) — applying repair`);
              return { label, caption: repairAdCopy(caption, requestedUrl), hashtags: out.hashtags };
            }
          }
          return { label, caption, hashtags: out.hashtags };
        }
        lastErr = new Error(`non-deliverable caption for ${label} (${sanity.reason}) — raw[0:200]: ${lastRaw.slice(0, 200)}`);
        console.warn(`[callOneVariant] attempt ${attempt} rejected for ${label} (${sanity.reason}): ${lastRaw.slice(0, 300)}`);
      } else {
        lastErr = new Error(`empty caption for ${label} — raw[0:200]: ${lastRaw.slice(0, 200)}`);
        console.warn(`[callOneVariant] attempt ${attempt} failed for ${label} (raw len=${lastRaw.length}): ${lastRaw.slice(0, 300)}`);
      }
    } catch (e) {
      lastErr = e;
      console.warn(`[callOneVariant] attempt ${attempt} threw for ${label}:`, (e as Error)?.message);
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 250));
  }
  throw lastErr ?? new Error(`caption[${label}] exhausted retries`);
}

async function callCaptionWriter(args: {
  template: FBTaskTemplate;
  config: OrchestraConfig;
  captionPersona: string;
  brandPrefix: string;
  urlContext: string;
  userMsg: string;
  inputKeys: readonly string[];
  agentAiModel?: string | null;
  strategistAnchor?: string;
  market?: MarketCode | null;
  isZhTW: boolean;
  requestedUrl?: string | null;
}): Promise<Array<{ label: string; caption: string; hashtags?: string[] }>> {
  const labels = args.config.variantLabels.slice(0, args.config.variants);
  // Parallel fanout — each variant in its own LLM call.
  // Promise.allSettled so one failure doesn't kill the others.
  const settled = await Promise.allSettled(
    labels.map((label) =>
      callOneVariant({ ...args, label }),
    ),
  );
  return settled.map((s, i) =>
    s.status === "fulfilled"
      ? s.value
      : { label: labels[i] ?? `版本 ${i + 1}`, caption: "", hashtags: undefined },
  );
}

// ── Image director LLM call ─────────────────────────────────────────────

// Per-variant fanout: same reliability play as caption_writer. Each brief
// is its own tiny LLM call (~100 tokens). Failure isolated, retry per slot.
async function callOneBrief(args: {
  template: FBTaskTemplate;
  config: OrchestraConfig;
  label: string;
  imagePersona: string;
  brandPrefix: string;
  urlContext: string;
  userMsg: string;
}): Promise<string> {
  const { config, label, imagePersona, brandPrefix, urlContext, userMsg } = args;
  const hasUrl = urlContext.length > 0;
  const subjectRule = hasUrl
    ? `視覺主題=URL 抓到的影片 / 文章內容。**不要**把品牌主商品畫進視覺。\n`
    : "";
  // 2026-05-17 (CJ「IG 視覺也要得獎工藝」): IG-family tasks get the
  // 【視覺 craft】 portion of the IG rubric so style direction follows
  // award-grade composition + correct aspect ratio + brand visual
  // identity. IG-gated — non-IG image flows unchanged.
  const igVisualBlock = isInstagramTask(args.template)
    ? `\n# IG 視覺工藝（嚴格遵守）\n` +
      `- 首屏鉤子：0.5 秒內讓人停下；高對比、單一焦點、留白給文字。\n` +
      `- 比例正確（${config.aspectRatio ?? "1:1"}），錯比例＝被裁切＝失敗。\n` +
      `- 構圖服務內容（封面承諾/輪播遞進/Reel 字卡空間）。\n` +
      `- 品牌視覺一致：色彩/字體/濾鏡/構圖語言與品牌大腦一致，可一眼認出。\n`
    : "";
  // 2026-05-18 (CJ「每個版本的圖應該要不一樣，現在都是一樣」): every
  // brief got the same userMsg + only a one-word tone label, so the 5
  // visuals converged. Give each label a CONCRETELY different visual
  // lens (subject framing / scene / composition / palette) and an
  // explicit must-differ rule so the set diverges.
  const labelLens: Record<string, string> = {
    "情感版": "聚焦人物表情與肢體情緒、特寫、暖色光、淺景深",
    "理性版": "簡潔資訊式構圖、幾何排版、冷調、留白、產品/介面為主體",
    "故事版": "敘事場景、環境帶入、中景、自然光、生活感瞬間",
    "數據版": "視覺化數字/圖表元素、強對比、單一焦點、現代極簡",
    "懸念版": "局部遮蔽/未揭曉的構圖、戲劇光影、暗調、引發好奇",
    // 5天倒數系列 — 視覺隨日期升溫，第1天最強衝擊
    "第5天": "開闊介紹性構圖，品牌主視覺清晰，色彩溫和友善，傳遞「初次見面」的第一印象感",
    "第4天": "聚焦產品或服務核心細節，特寫鏡頭展示差異化，乾淨背景突出主體優勢",
    "第3天": "社群感與真實感，使用情境場景或人物見證，溫暖自然光，生活感真實瞬間",
    "第2天": "視覺緊迫感，高對比搶眼色彩，強調限時或獨家元素，色調比前幾天更飽和",
    "第1天": "最強視覺衝擊，戲劇光影與高飽和對比色，最終倒數的緊張感，聚焦單一明確行動",
  };
  const lens = labelLens[label] ?? `緊扣「${label}」的獨特視覺概念，與其他版本明顯不同`;
  const system =
    imagePersona +
    `任務：寫 1 條**繁體中文**視覺方向描述，呼應「${label}」這個口吻。\n` +
    `此版本的視覺切角（務必照此走，不要寫成通用品牌圖）：${lens}。\n` +
    `這是一組多版本中的「${label}」，**必須與其他版本在主體、場景、構圖、色調上明顯不同**，不可雷同。\n` +
    `比例：${config.aspectRatio ?? "1:1"}\n` +
    igVisualBlock +
    subjectRule +
    // 2026-07-16 (CJ「七日發布台的是標準」): this Chinese brief is DISPLAY
    // ONLY (the UI 風格方向 text). The image-model prompt is derived from
    // the finished caption via captionToVisualBrief — theater's standard.
    `規則：30-60 字繁中、涵蓋主體 / 構圖 / 光線 / 色彩 / 氛圍、不要疊文字、不要 logo。\n\n` +
    `輸出嚴格 JSON 物件：{"summary":"<中文視覺描述>"}\n` +
    `第一個字元就是 {。不要 markdown code fence、不要前言。\n` +
    (hasUrl ? brandPrefix : `\n${brandPrefix}`) +
    (hasUrl ? `\n# URL 抓到的內容（主題來源）\n${urlContext}` : "");

  let attempt = 0;
  let lastErr: any = null;
  while (attempt < 2) {
    attempt++;
    try {
      const r = await Promise.race([
        callModel(
          [
            { role: "system", content: system },
            { role: "user", content: userMsg },
          ],
          undefined,
          "qwen",
        ),
        timeoutPromise<never>(LLM_BUDGET_MS, `brief[${label}]`),
      ]);
      const parsed = tryParseJson(r.content);
      const summary =
        typeof (parsed as any)?.summary === "string" ? (parsed as any).summary.trim() : "";
      if (summary.length > 0) return summary;
      // sometimes LLM returns string directly
      if (typeof r.content === "string" && r.content.trim().length > 0 && !r.content.includes("{")) {
        return r.content.trim().slice(0, 280);
      }
      lastErr = new Error(`empty brief for ${label}`);
    } catch (e) { lastErr = e; }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 200));
  }
  throw lastErr ?? new Error(`brief[${label}] exhausted retries`);
}

async function callImageDirector(args: {
  template: FBTaskTemplate;
  config: OrchestraConfig;
  imagePersona: string;
  brandPrefix: string;
  urlContext: string;
  userMsg: string;
}): Promise<string[]> {
  const { config } = args;
  if (!config.imageDirectorId || config.images === 0) return [];

  // Per-variant fanout — same reliability mechanism as caption_writer.
  const labels = config.variantLabels.slice(0, config.images);
  const settled = await Promise.allSettled(
    labels.map((label) => callOneBrief({ ...args, label })),
  );
  return settled.map((s, i) =>
    s.status === "fulfilled" ? s.value : `（${labels[i] ?? `brief ${i + 1}`} brief 生成失敗 — 請點「用此風格生圖」自己描述）`,
  );
}

// ── Carousel / album cards: split ONE post into N cards ─────────────────
//
// 2026-05-18 (CJ「carousel 一個貼文還是只出現一張圖」): a carousel is one
// post made of N cards, each with its own headline + body + image. Given
// the generated post caption, split it into N cards (headline ≤14 / body
// ≤40) and a per-card visual brief. Conservative — only restructures the
// caption, no fabricated facts.
async function callCarouselCards(args: {
  caption: string;
  topic: string;
  n: number;
  brandPrefix: string;
  imagePersona: string;
  aspectRatio: string;
  kind?: "carousel" | "storyboard";
}): Promise<Array<{ headline: string; body: string; imageBrief: string }>> {
  const { caption, topic, n, brandPrefix, imagePersona, aspectRatio, kind = "carousel" } = args;
  const isStoryboard = kind === "storyboard";
  const bodyMax = isStoryboard ? 160 : 90;
  const system =
    imagePersona +
    (isStoryboard
      ? `你是影片分鏡師。把下面這份逐鏡頭腳本，拆成正好 ${n} 格分鏡，維持原本的鏡頭順序（不要打亂、不要新增或刪減鏡頭）。\n` +
        `每格需要：\n` +
        `- headline：這格的簡短標籤（≤ 14 字，例："鏡頭 1・開場"）\n` +
        `- body：這格的時長＋畫面內容＋口白/字幕＋運鏡，整合成一段（≤ 90 字）\n` +
        `- image：這格畫面的視覺方向描述（30-60 字繁中，涵蓋主體/構圖/光線/色彩/氛圍，比例 ${aspectRatio}，不疊文字、不放 logo），要延續同一場景的推進，不要每格各自獨立無關\n` +
        `嚴格規則：只根據原始腳本拆解與重組，**不可新增或捏造鏡頭內容**。\n`
      : `你是輪播內容設計師。把下面這篇 FB 輪播貼文，拆成正好 ${n} 張卡，敘事弧：Hook → Build → Turn → Payoff → CTA。\n` +
        `每張卡需要：\n` +
        `- headline：≤ 14 字、強鉤、可單獨成立\n` +
        `- body：≤ 40 字、承接 headline、口語\n` +
        `- image：該卡的視覺方向描述（30-60 字繁中，涵蓋主體/構圖/光線/色彩/氛圍，比例 ${aspectRatio}，不疊文字、不放 logo），每張卡視覺要明顯不同\n` +
        `嚴格規則：只根據貼文內容拆解與重組，**不可新增或捏造事實**。\n`) +
    `輸出嚴格 JSON 陣列，長度正好 ${n}：[{"headline":"...","body":"...","image":"..."}, ...]\n` +
    `第一個字元就是 [。不要 markdown code fence、不要前言。\n` +
    brandPrefix;
  const userMsg = isStoryboard
    ? `主題：${topic}\n\n逐鏡頭腳本：\n${caption}`
    : `主題：${topic}\n\n輪播貼文：\n${caption}`;
  let attempt = 0;
  let lastErr: any = null;
  while (attempt < 2) {
    attempt++;
    try {
      const r = await Promise.race([
        callModel(
          [{ role: "system", content: system }, { role: "user", content: userMsg }],
          undefined,
          "qwen",
        ),
        timeoutPromise<never>(LLM_BUDGET_MS, "carousel-cards"),
      ]);
      const parsed = tryParseJson(r.content);
      const arr = Array.isArray(parsed) ? parsed : (parsed?.cards ?? parsed?.variants ?? []);
      if (Array.isArray(arr) && arr.length > 0) {
        return arr.slice(0, n).map((c: any, i: number) => ({
          headline: String(c?.headline ?? c?.title ?? `卡 ${i + 1}`).trim().slice(0, 28),
          body: String(c?.body ?? c?.desc ?? c?.text ?? "").trim().slice(0, bodyMax),
          imageBrief: String(c?.image ?? c?.imageBrief ?? c?.visual ?? "").trim().slice(0, 280),
        }));
      }
      lastErr = new Error("empty cards");
    } catch (e) { lastErr = e; }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 200));
  }
  throw lastErr ?? new Error("carousel cards exhausted retries");
}

// ── 60s tier extras: reply templates / posting time / followup post ─────
//
// Each extra is its own tiny LLM call (qwen, ~10s budget). Failures are
// non-fatal — the variant ships without that extra and UI shows "—".

async function callReplyTemplates(args: { caption: string; channel: string; n: number; persona?: string }): Promise<Array<{ userSays: string; yourReply: string }>> {
  const { caption, channel, n, persona } = args;
  const personaPrefix = persona ? `${persona}\n` : "";
  const system =
    personaPrefix +
    `你是社群留言策劃師。基於下面這篇即將發出的 ${channel} 貼文，預測 ${n} 種最可能的用戶留言（從正面到質疑都涵蓋），並寫出對應的品牌回覆。\n\n` +
    `每一組：用戶可能會說的話（30 字內，自然口吻）+ 品牌怎麼回（30-60 字，有溫度不罐頭）。\n\n` +
    `輸出嚴格 JSON 陣列：[{"userSays":"...","yourReply":"..."}, ...]\n` +
    `第一個字元是 [。不要 markdown 圍籬。\n`;
  try {
    const r = await Promise.race([
      callModel(
        [{ role: "system", content: system }, { role: "user", content: `貼文：\n${caption}` }],
        undefined,
        "qwen",
      ),
      timeoutPromise<never>(LLM_BUDGET_MS, "reply_templates"),
    ]);
    const parsed = tryParseJson(r.content);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, n).map((p: any) => ({
      userSays: String(p?.userSays ?? "").slice(0, 200),
      yourReply: String(p?.yourReply ?? "").slice(0, 400),
    })).filter((p) => p.userSays && p.yourReply);
  } catch { return []; }
}

async function callPostingTime(args: { caption: string; channel: string; persona?: string }): Promise<string> {
  const { caption, channel, persona } = args;
  const personaPrefix = persona ? `${persona}\n` : "";
  const system =
    personaPrefix +
    `根據下面這篇 ${channel} 貼文的主題、語氣、對象，推薦 1 個最佳發文時段。\n` +
    `回答格式：「週X HH:MM-HH:MM｜理由（30 字內）」。例：「週四 19:00-21:00｜下班通勤後滑社群高峰，貼文輕鬆題材剛好接住」\n` +
    `不要列多個選項，只給最推薦的 1 個。`;
  try {
    const r = await Promise.race([
      callModel(
        [{ role: "system", content: system }, { role: "user", content: caption.slice(0, 800) }],
        undefined,
        "qwen",
      ),
      timeoutPromise<never>(8_000, "posting_time"),
    ]);
    return r.content.trim().slice(0, 200);
  } catch { return ""; }
}

async function callFollowupPost(args: { caption: string; channel: string; persona?: string }): Promise<string> {
  const { caption, channel, persona } = args;
  const personaPrefix = persona ? `${persona}\n` : "";
  const system =
    personaPrefix +
    `這是即將發到 ${channel} 的主貼文。請寫一篇 24 小時後的追蹤貼文（80-150 字），延伸主貼文的對話：\n` +
    `- 不要重複主貼文重點\n- 可以是補充細節、回答留言常見問題、或下集預告\n- 語氣連貫\n` +
    `直接給追蹤貼文文字（不要加 prefix 像 "Day 2:"）。`;
  try {
    const r = await Promise.race([
      callModel(
        [{ role: "system", content: system }, { role: "user", content: caption.slice(0, 800) }],
        undefined,
        "qwen",
      ),
      timeoutPromise<never>(LLM_BUDGET_MS, "followup_post"),
    ]);
    return r.content.trim().slice(0, 800);
  } catch { return ""; }
}

// ── Strategist stage (FB 60s narrativeArc tasks) ────────────────────────
//
// Runs BEFORE caption_writer fanout. Outputs a 4-8 line "structure anchor"
// that gets piped into each per-variant call. This makes multi-post tasks
// (5-day countdown, 3-serial, launch-kit, live-suite) cohere across slots
// without each writer reinventing the arc.
//
// Cost: 1 LLM call ~6-8s. Adds to wall but reduces caption inconsistency.

async function callStrategist(args: {
  template: FBTaskTemplate;
  strategistPersona: string;
  brandPrefix: string;
  urlContext: string;
  userMsg: string;
  postLabels: string[];
  /** 2026-08-22: what the writers are actually producing. Default keeps the
   *  original 「FB 系列貼文」/「篇」 wording for every existing task. */
  deliverable?: string;
  unit?: string;
}): Promise<string> {
  const { strategistPersona, template, brandPrefix, urlContext, userMsg, postLabels } = args;
  const deliverable = args.deliverable ?? "FB 系列貼文";
  const unit = args.unit ?? "篇";
  const system =
    `# 你的角色\n` +
    strategistPersona +
    `\n# 任務\n` +
    `用戶要產出${deliverable}（${postLabels.length} ${unit}）。你不寫 caption — 你寫整體「結構錨點」給後續寫手用。\n\n` +
    `產出 4-8 行繁體中文，涵蓋：\n` +
    `1) 整體 narrative 主題 / 核心訊息\n` +
    `2) 每${unit}的角色定位（${postLabels.map((l) => `「${l}」`).join(" / ")}）\n` +
    `3) ${unit}與${unit}之間的勾連邏輯（每${unit}結尾如何帶到下一${unit}）\n` +
    `4) 整體調性（情感 / 理性 / 緊湊 / 慢敘事 etc.）\n\n` +
    `直接給結構錨點文字，不要前言。\n` +
    (urlContext ? `\n# URL 內容\n${urlContext}` : "") +
    `\n# 品牌語氣\n${brandPrefix}`;
  try {
    const r = await Promise.race([
      callModel(
        [{ role: "system", content: system }, { role: "user", content: userMsg }],
        undefined,
        "qwen",
      ),
      timeoutPromise<never>(STRATEGIST_BUDGET_MS, "strategist"),
    ]);
    return r.content.trim().slice(0, 1500);
  } catch { return ""; }
}

// ── Specialty role outputs (FB 60s tasks #10/11/12) ─────────────────────

async function callCompareTable(args: { caption: string; viralSource: string; persona: string }): Promise<string> {
  const { caption, viralSource, persona } = args;
  const system =
    persona +
    `任務：用戶提供了一篇爆款原文，以及我們改寫後的品牌版。你寫一份 4-6 行對照分析：\n` +
    `- 原文 hook 機制 vs 改寫版 hook\n- 原文敘事結構 vs 改寫版結構\n- 情緒節奏對照\n- 品牌切入點是否自然\n` +
    `輸出純文字，不要 JSON、不要 markdown table。`;
  try {
    const r = await Promise.race([
      callModel(
        [{ role: "system", content: system }, { role: "user", content: `# 爆款原文\n${viralSource.slice(0, 800)}\n\n# 改寫版\n${caption.slice(0, 800)}` }],
        undefined,
        "qwen",
      ),
      timeoutPromise<never>(LLM_BUDGET_MS, "compare_table"),
    ]);
    return r.content.trim().slice(0, 1000);
  } catch { return ""; }
}

async function callTimingAdvisor(args: { caption: string; trendTopic: string; persona: string }): Promise<string> {
  const { caption, trendTopic, persona } = args;
  const system =
    persona +
    `任務：分析這個時事題材的時效性，給品牌「現在發 / 等等發 / 不要發」的建議。\n` +
    `4-6 行繁中：① 時事熱度判斷 ② 發文時機建議（具體時間範圍）③ 風險點（敏感、過時、爭議）④ 加分點。\n` +
    `輸出純文字。`;
  try {
    const r = await Promise.race([
      callModel(
        [{ role: "system", content: system }, { role: "user", content: `# 時事題材\n${trendTopic.slice(0, 400)}\n\n# 改寫版貼文\n${caption.slice(0, 600)}` }],
        undefined,
        "qwen",
      ),
      timeoutPromise<never>(LLM_BUDGET_MS, "timing_advisor"),
    ]);
    return r.content.trim().slice(0, 1000);
  } catch { return ""; }
}

async function callLegalAssistant(args: { caption: string; testimonialSource: string; consentStatus: string; persona: string }): Promise<string> {
  const { caption, testimonialSource, consentStatus, persona } = args;
  const system =
    persona +
    `任務：客戶見證改寫文的法務 / 倫理檢核。輸出 4-6 行繁中：\n` +
    `① 同意狀態判斷（已同意 / 需匿名 / 待確認）\n` +
    `② 改寫版有無違反原意 / 編造事實\n` +
    `③ 數字 / 成效宣稱是否有原文支持\n` +
    `④ 個資 / 識別資訊是否需脫敏\n` +
    `⑤ 風險評分（低 / 中 / 高）+ 1 句建議\n` +
    `輸出純文字。`;
  try {
    const r = await Promise.race([
      callModel(
        [{ role: "system", content: system }, { role: "user", content: `# 同意狀態\n${consentStatus || "未標示"}\n\n# 客戶原話\n${testimonialSource.slice(0, 600)}\n\n# 改寫版\n${caption.slice(0, 600)}` }],
        undefined,
        "qwen",
      ),
      timeoutPromise<never>(LLM_BUDGET_MS, "legal_assistant"),
    ]);
    return r.content.trim().slice(0, 1000);
  } catch { return ""; }
}

// 2026-05-18 (CJ「fb-60-carousel-5 mockup 沒套用」根因): recordTaskRun
// never received an outputType, so it defaulted to "post" → RunPage
// Layer-2 resolved every task to facebook:feed whenever taskId metadata
// was absent (legacy / edge rows). Map the task's post_type to a SAFE
// outputType that RunPage's outputTypeToFormat resolves correctly
// (notably carousel → "slide" → carousel mockup). Belt-and-braces with
// the taskId Layer-1 path so the right mockup shows regardless.
function safeOutputTypeForPostType(
  postType: string | undefined | null,
): "post" | "story" | "reel" | "ad_copy" | "slide" {
  switch (String(postType ?? "post")) {
    case "carousel": return "slide";       // RunPage: slide → carousel
    case "story":    return "story";
    case "reel":     return "reel";
    case "ad":       return "ad_copy";     // RunPage: ad_copy → ad
    case "pinned":
    case "feed":
    case "post":
    default:         return "post";        // RunPage: post → feed
  }
}

// 2026-07-27 (CJ「七日工作台，合成圖也套用真實產品圖片」): the manual
// RunPage 改圖 panel already composites the real product photo via Nano
// Banana (see MediaGenFlow.tsx「📦 使用真實產品圖」+ mediaRouter media.generate).
// The 七日工作台 orchestra never had an equivalent — genOneImage always
// text-to-image'd an AI-imagined product. When a run is scoped to a
// specific product (args.productId set), fetch that product's real photo
// once per run so every variant's image composites the actual product
// instead of hallucinating one. Mirrors mediaRouter.listProductImages'
// positioning-JSON lookup (kept file-local — no tRPC round trip needed
// server-side).
async function loadProductImageUrl(brandId?: number | null, productId?: number | null): Promise<string | null> {
  if (!brandId || !productId) return null;
  try {
    const [rows]: any = await localPool.execute(
      `SELECT positioning FROM products WHERE id = ? AND brandId = ? LIMIT 1`,
      [productId, brandId],
    );
    let p: any = (rows as any[])?.[0]?.positioning;
    if (!p) return null;
    if (typeof p === "string") p = JSON.parse(p);
    const candidates = [
      p?.imageUrl, p?.image,
      p?._interim?.imageUrl, p?._interim?.image,
      Array.isArray(p?.images) ? p.images[0] : null,
      Array.isArray(p?._interim?.images) ? p._interim.images[0] : null,
      Array.isArray(p?._assets?.photos)
        ? (typeof p._assets.photos[0] === "string" ? p._assets.photos[0] : p._assets.photos[0]?.url)
        : null,
    ];
    for (const c of candidates) {
      if (typeof c === "string" && /^https?:\/\//.test(c) && await probeImageUrl(c, 8_000)) return c;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Single image gen with per-image timeout ─────────────────────────────

/* 2026-07-16 (CJ「七日發布台的是標準，不應該被更改，是其他任務要對齊七日
 * 發布台的標準」): the image prompt is now produced EXACTLY the way theater
 * does it — the finished CAPTION is converted to a short English visual
 * brief by the shared captionToVisualBrief (verbatim theater logic: same
 * provider, same prompt, same params). The agent-written Chinese 風格方向
 * (`style`) is display-only and never reaches the model. When no caption is
 * available (empty variant / failure placeholder), the Chinese style text is
 * fed to the same converter instead — identical pipeline either way. */
async function genOneImage(
  args: {
    content: string; style: string | null; platform?: string; palette?: Array<{ hex: string; role: string }>;
    brandIdentity?: BrandIdentityForImage | null;
    /** 2026-07-27 (CJ「合成圖也套用真實產品圖片」): real product photo URL —
     *  when set, routes to Nano Banana subject-reference compositing instead
     *  of text-to-image, mirroring the manual RunPage「使用真實產品圖」panel. */
    subjectImageUrl?: string | null;
    /** True when the run is product-scoped even if its stored photo is broken. */
    subjectImageRequired?: boolean;
  },
  config: OrchestraConfig,
): Promise<OrchestraVariant["image"]> {
  const prompt = args.style ?? ""; // returned as `style` — what the UI shows
  const source = (args.content || args.style || "").trim();
  if (!source) return { style: args.style, prompt: null, promptZh: null, url: null, status: "skipped" };
  if (args.subjectImageRequired && !args.subjectImageUrl) {
    return {
      style: args.style,
      prompt: null,
      promptZh: null,
      modelId: null,
      requestedModelId: "google/nano-banana",
      fallbackUsed: false,
      url: null,
      status: "failed",
      errorMsg: PRODUCT_SUBJECT_UNAVAILABLE_ERROR,
    };
  }
  // 2026-08-19: hoisted out of the try so every return path can persist the
  // generated visual brief that drove the model (see image.prompt). Provider
  // safety/fidelity guardrails are appended separately and are not UI content.
  let modelPrompt: string | null = null;
  let displayPromptZh: string | null = null;
  try {
    const subjectMode = !!args.subjectImageUrl;
    // 2026-07-19 (CJ「品牌顏色會被貫穿到圖片生成的指令中嗎」): brand palette
    // rides along into the shared brief converter → on-brand color schemes.
    const visualBrief = await captionToBilingualVisualBrief({
      caption: source,
      platform: args.platform,
      palette: args.palette,
      brandIdentity: args.brandIdentity,
      subjectMode,
    });
    modelPrompt = visualBrief.prompt;
    displayPromptZh = visualBrief.promptZh;
    // 2026-05-18 (CJ「目前的圖很不行，最好的生圖模型是什麼」): quick-task
    // images were hardcoded to piapi/flux-schnell — the fastest/lowest-
    // quality Flux tier (draft-grade, weak prompt adherence). Upgrade the
    // default to Google Imagen 4 (best quality/speed balance for branded
    // marketing visuals, robust prompt adherence, fewer safety false-
    // positives than gpt-image-1). Flux Schnell stays as the reliability
    // fallback so a provider hiccup never blanks the card.
    const aspect = (config.aspectRatio === "1.91:1" ? "16:9" : config.aspectRatio) as any;
    // 2026-07-07 (CJ「YT 縮圖出現不是國字的國字」): image models hallucinate
    // garbled CJK text, worst under 16:9 thumbnail framing. The real title is
    // overlaid in the mockup/output layer, so this image must be a CLEAN,
    // text-free background. Append a dominant NO-TEXT directive to the positive
    // prompt (imagen-4 has no negative_prompt field) AND pass a real
    // negative_prompt (honoured by the flux-schnell fallback + SDXL/Ideogram).
    // 2026-07-27 (CJ「鏡子裡的她，跟實際的髮型或頭的轉向不同」): mirror /
    // reflective-surface compositions are a well-known failure mode for
    // every text-to-image model — they cannot keep a reflection physically
    // consistent with the subject's actual pose. Rather than trying to
    // prompt our way to a correct reflection (unreliable), avoid the
    // composition entirely — same philosophy as the NO-TEXT policy: route
    // around what models can't do, don't ship the broken result.
    // 2026-08-19 (客戶回報「勾選真實產品後再產圖，出現錯誤中文字」): this file
    // used to carry its own paraphrase of the fidelity guard, so tightening
    // imageGen's copy left this path on the old, looser wording. Import the
    // shared constant — one guard, one place to fix it.
    const {
      PRODUCT_FAITHFUL_PROMPT_BLOCK,
      NO_MIRROR_PROMPT_BLOCK,
      NO_MIRROR_NEGATIVE_PROMPT,
    } = await import("./imageGen");
    const promptNoText = `${modelPrompt}\n\n${buildImageGuardBlock({
      subjectMode,
      productFaithfulBlock: PRODUCT_FAITHFUL_PROMPT_BLOCK,
      noMirrorBlock: NO_MIRROR_PROMPT_BLOCK,
    })}`;
    const opts = {
      prompt: promptNoText,
      aspectRatio: aspect,
      quality: "high" as const,
      ...(args.subjectImageUrl ? { imageUrl: args.subjectImageUrl } : {}),
      // Product-subject mode can't send the blanket text-suppression negative —
      // it would fight the real product's own printed label. Mirror-only there,
      // matching imageGen.ts and mediaRouter.generate.
      negativePrompt: subjectMode
        ? NO_MIRROR_NEGATIVE_PROMPT
        : "text, letters, words, numbers, chinese characters, japanese characters, " +
          "korean characters, cjk, title, headline, caption, subtitle, label, badge, " +
          "sticker, signage, watermark, signature, logo, typography, gibberish glyphs, " +
          "fake characters, writing, mirror, reflection, reflective surface",
    };
    const tryModel = async (modelId: string, label: string, capMs: number) =>
      Promise.race([
        dispatchGenerate(modelId, opts),
        timeoutPromise<never>(capMs, label),
      ]);
    // 2026-05-18 (CJ「現在沒有產出圖了」regression): the imagen primary +
    // flux fallback were each capped at PER_IMAGE_MS (45s) → worst case
    // 90s, blowing the ~30-60s background budget so the card never
    // resolved. Cap the imagen attempt tight (25s); if it fails/slow,
    // the proven Flux Schnell fallback still finishes inside budget.
    // 2026-05-18 (CJ「想辦法加速」): Imagen 4 normally returns < 18s;
    // capping the primary attempt tighter means a slow Imagen falls back
    // to the proven (faster) Flux sooner. Saves up to ~7s/image on the
    // slow path — directly shortens the hold-for-images wait.
    const IMAGEN_CAP_MS = 18_000;
    // 2026-07-07 (CJ「鎖定 gpt-image-2」): a task may pin its primary image
    // model (e.g. YT → gpt-image-2 for clean 16:9 backgrounds). gpt-image-2 is
    // slower than imagen-4, so give the override a wider cap. Flux Schnell
    // stays the reliability fallback either way.
    // 2026-07-27: subjectMode always routes through Nano Banana (image-edit,
    // not text-to-image) — it's the only model here that takes a subject
    // reference photo.
    const primaryModel = subjectMode ? "google/nano-banana" : (config.imageModelOverride ?? "google/imagen-4-default");
    const primaryCapMs = subjectMode ? 35_000 : (config.imageModelOverride ? 35_000 : IMAGEN_CAP_MS);
    let r;
    let fallbackUsed = false;
    try {
      r = await tryModel(primaryModel, primaryModel, primaryCapMs);
      if (!(r.status === "ready" && r.url)) throw new Error(r.errorMsg ?? `${primaryModel} no url`);
    } catch (e: any) {
      // 2026-07-25 product-faithful gen policy (imageGen.ts): a hallucinated
      // product is worse than a failed run — do NOT fall back to text-to-image
      // when a real product photo was requested, it would silently ship a
      // fake product. Non-product runs keep the proven Flux Schnell fallback.
      if (subjectMode) {
        return {
          style: prompt,
          prompt: modelPrompt,
          promptZh: displayPromptZh,
          modelId: primaryModel,
          requestedModelId: primaryModel,
          fallbackUsed: false,
          url: null,
          status: "failed",
          errorMsg: String(e?.message ?? e),
        };
      }
      fallbackUsed = true;
      r = await tryModel("piapi/flux-schnell", "piapi-flux-schnell", PER_IMAGE_MS);
    }
    if (r.status === "ready" && r.url) {
      return {
        style: prompt,
        prompt: modelPrompt,
        promptZh: displayPromptZh,
        modelId: r.modelId,
        requestedModelId: primaryModel,
        fallbackUsed,
        url: r.url,
        status: "ready",
      };
    }
    return {
      style: prompt,
      prompt: modelPrompt,
      promptZh: displayPromptZh,
      modelId: r.modelId,
      requestedModelId: primaryModel,
      fallbackUsed,
      url: null,
      status: "failed",
      errorMsg: r.errorMsg ?? "no url returned",
    };
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    return { style: prompt, prompt: modelPrompt, promptZh: displayPromptZh, url: null, status: msg.includes("exceeded") ? "timeout" : "failed", errorMsg: msg };
  }
}

// ── Single image-to-video with polling ──────────────────────────────────
//
// 2026-07-29 (CJ「模仿 TikTok 產品影片類型」Tier 1). Animates an already-
// rendered still into a short vertical clip. Deliberately image-to-video,
// never text-to-video, for three reasons:
//   1. The still already went through the full brand pipeline (palette,
//      NO-TEXT guard, and — when the run is product-scoped — real-product
//      Nano Banana compositing). t2v would throw all of that away and
//      hallucinate a different product every clip.
//   2. Tier 1 formats are FACELESS by design. Lip-sync is unavailable
//      (PiAPI plan blocks kling lip_sync; the Hedra entry is broken), so
//      any format needing a talking mouth is out of scope here.
//   3. One still → one clip keeps the subject identical across variants.
//
// Kling i2v measured ~150s for a 10s clip, so this NEVER fits a sync tier
// budget — callers must use the async (onCheckpoint) path.
const VIDEO_POLL_MS = 10_000;
// std-mode i2v measured ~150s. Tail-frame clips are forced to pro mode (std
// rejects image_tail_url) and pro is materially slower — a probe saw one
// variant finish while the other blew past 360s. Give tail-frame renders a
// much wider ceiling; plain clips keep the tighter one.
const VIDEO_MAX_WAIT_MS = 6 * 60_000;
const VIDEO_MAX_WAIT_TAIL_MS = 11 * 60_000;

/**
 * 2026-07-29 (probe caught this): mediaGen saves renders locally and returns
 * a RELATIVE url ("/static/covers/media-img-….png"). Kling fetches the image
 * over the public internet, so a relative path fails submit with
 *   "invalid image_url: malformed url: missing scheme".
 * Product photos coming from loadProductImageUrl are already absolute (it
 * filters on /^https?:\/\//), so only freshly-rendered stills need this.
 */
function absoluteMediaUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const base = (process.env.PUBLIC_APP_URL ?? process.env.APP_URL ?? "https://onbrand.sowork.ai")
    .replace(/\/+$/, "");
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

async function genOneVideo(
  args: { imageUrl: string; caption: string; motionHint?: string; tailImageUrl?: string | null },
  config: OrchestraConfig,
): Promise<NonNullable<OrchestraVariant["video"]>> {
  const poster = args.imageUrl;
  const sourceUrl = absoluteMediaUrl(args.imageUrl);
  const tailUrl = args.tailImageUrl ? absoluteMediaUrl(args.tailImageUrl) : null;
  const modelId = config.videoModel ?? "piapi/kling-v1-6-i2v";
  try {
    const motion =
      args.motionHint?.trim() ||
      "Slow, smooth cinematic camera push-in on the product. Subtle natural " +
      "movement only. Keep the product identical to the source frame.";
    // Two different jobs, so two different prompts:
    //  - no tail frame → the subject must NOT change; morphing is the most
    //    common i2v failure and silently ships a wrong-looking product.
    //  - tail frame → the whole point IS to change, so "hold everything
    //    identical" would fight the interpolation. Only the product itself
    //    is pinned; the surrounding state is allowed to transform.
    const prompt = tailUrl
      ? `${motion} Transition smoothly and continuously from the first frame's ` +
        `state to the final frame's state in a single unbroken shot. The change ` +
        `should feel natural and gradual, never a hard cut. Any product visible ` +
        `keeps its exact shape, colors and printed label throughout. No text or ` +
        `captions appear on screen.`
      : `${motion} Hold the subject's shape, colors, materials and any printed ` +
        `label exactly as in the source image. Static, stable framing. No text ` +
        `or captions appear on screen.`;

    const submit = await dispatchGenerate(modelId, {
      prompt: prompt.slice(0, 800),
      imageUrl: sourceUrl,
      ...(tailUrl ? { imageTailUrl: tailUrl } : {}),
      aspectRatio: (config.aspectRatio === "1.91:1" ? "16:9" : config.aspectRatio) as any,
      durationSec: config.videoDurationSec ?? 5,
      videoNegativePrompt:
        "text, letters, captions, subtitles, watermark, logo overlay, " +
        (tailUrl ? "" : "morphing product, shape change, extra objects appearing, ") +
        "scene cut, camera shake, distorted proportions",
    } as any);

    if (submit.status === "ready" && submit.url) {
      return { url: submit.url, posterUrl: poster, status: "ready" };
    }
    if (submit.status === "failed" || !submit.taskId) {
      return {
        url: null, posterUrl: poster, status: "failed",
        errorMsg: submit.errorMsg ?? `${modelId} submit returned no taskId`,
      };
    }

    const taskId = submit.taskId;
    const startedAt = Date.now();
    const maxWaitMs = tailUrl ? VIDEO_MAX_WAIT_TAIL_MS : VIDEO_MAX_WAIT_MS;
    while (Date.now() - startedAt < maxWaitMs) {
      await new Promise((r) => setTimeout(r, VIDEO_POLL_MS));
      const r = await checkJob(modelId, taskId);
      if (r.status === "ready" && r.url) {
        return { url: r.url, posterUrl: poster, status: "ready" };
      }
      if (r.status === "failed") {
        return {
          url: null, posterUrl: poster, status: "failed",
          errorMsg: r.errorMsg ?? `${modelId} reported failure`,
        };
      }
    }
    return {
      url: null, posterUrl: poster, status: "timeout",
      errorMsg: `${modelId} exceeded ${maxWaitMs / 1000}s${tailUrl ? " (tail-frame/pro)" : ""}`,
    };
  } catch (e: any) {
    return { url: null, posterUrl: poster, status: "failed", errorMsg: String(e?.message ?? e) };
  }
}

// ── Main entry ───────────────────────────────────────────────────────────

export async function runOrchestra(args: {
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
}): Promise<OrchestraResult> {
  // Tier-based config scaling (additive, doesn't mutate original config).
  // 60s/100s bumps variants 3 → 5 but task config typically only has 3
  // variantLabels. Pad with extra labels so each new variant has a usable
  //口吻 instead of "版本 4" fallback.
  const tier: OrchestraTier = args.tier ?? "30s";
  if (tier === "60s" || tier === "99s") {
    const baseLabels = args.config.variantLabels;
    const extraLabels = ["進階版", "替代版", "極簡版", "完整版"]; // generic fallbacks
    const scaledLabels = baseLabels.length >= 5
      ? baseLabels.slice(0, 5)
      : [...baseLabels, ...extraLabels.slice(0, 5 - baseLabels.length)];

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
        variants: 5,
        images: args.config.images > 0 ? 5 : 0,
        variantLabels: scaledLabels,
        runImageGen: args.config.images > 0,  // 60s: yes if task has visual
        extras: { ...defaultExtras, ...(args.config.extras ?? {}) },
      },
    };
  }
  // 2026-07-29 Tier-1 video: Kling i2v measures ~150s for a single 10s clip,
  // which alone equals the LARGEST sync budget — with the normal race the run
  // would always be killed mid-render and ship status:"timeout" clips. Video
  // tasks therefore get a much larger ceiling. This is only safe because the
  // user is NOT waiting on it: video tasks run through the async onCheckpoint
  // path (captions return in ~30-40s, clips land in the same mission_outputs
  // row later). The ceiling still exists so a hung provider can't leak a
  // forever-pending job.
  // Must exceed the slowest per-clip ceiling (tail-frame/pro = 11 min) plus
  // the caption/still stages, or the outer race would kill a render that was
  // about to land — which is exactly how a probe lost one variant at 360s.
  const VIDEO_BUDGET_MS = (args.config.videoTailHint ? 15 : 8) * 60_000;
  const baseBudget = tier === "60s" ? HARD_BUDGET_60S : tier === "99s" ? HARD_BUDGET_99S : HARD_BUDGET_MS;
  const tierBudget = args.config.runVideoGen ? VIDEO_BUDGET_MS : baseBudget;

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

    const [captionLoad, imageLoad, ytContext, urlSummary, brandPrefix, viralPatterns, brandMarket] = await Promise.all([
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
      // Brand context + knowledge base + REAL public content merged.
      // brandRealContent (website + social via Perplexity) is the strongest
      // grounding signal — without it AI hallucinates industry from brand
      // name (e.g. 桂冠營養研究室 → 美妝). 2026-05-08 (CJ direction).
      Promise.all([
        // 2026-05-17 蒸餾+分層: short/atomic tasks (30s/60s) get the
        // distilled brand core (focused → faster, cheaper, more
        // on-brand); only strategic/long-form (100s or document) get
        // the full heavy block that needs golden-circle/story depth.
        buildBrandContext(
          args.brandId, args.productId, args.eventId,
          (tier === "99s" || args.template.outputMode === "document") ? "full" : "core",
        ).catch(() => ""),
        args.brandId ? loadBrandKnowledgeForPrompt(args.brandId).catch(() => "") : Promise.resolve(""),
        args.brandId
          ? getBrandRealContent(args.brandId).then(r => r.context).catch(() => "")
          : Promise.resolve(""),
      ]).then(([prefix, knowledge, real]) => prefix + (knowledge || "") + (real || "")),
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
    ]);

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
            v.caption = adCopyTask ? repairAdCopy(report.text, requestedUrl) : report.text;
            if (adCopyTask) {
              const issue = validateAdCopy(v.caption, requestedUrl);
              if (issue) console.warn(`[orchestra] ad-copy contract unmet after brand rewrite (${v.label}): ${issue.detail}`);
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
          const { invokeLLM } = await import("./llm");
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
          const { invokeLLM } = await import("./llm");
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
    if (brandMarket.isZhTW && Array.isArray(captions) && captions.length &&
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
          const { invokeLLM } = await import("./llm");
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
      };
      for (const v of captions) {
        if (!v?.caption) continue;
        v.caption = v.caption.replace(/[么这个们时应说让优体关实现发内数据网资讯构习众签动钩击门问题]/g,
          (c: string) => S2T[c] ?? c);
      }
    }

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
          strategist: strategistMeta && strategistAnchor
            ? { agentName: strategistMeta.name, agentTitle: strategistMeta.title, anchor: strategistAnchor }
            : null,
          // specialtyMeta is only loaded in the 60s/100s extras stage which
          // runs AFTER this checkpoint, so it's always null at checkpoint
          // time. The final result re-populates it when extras complete.
          specialtyAgent: null,
        };

        console.log(`[orchestra:trace] task=${args.template.id} partial.ok=${partial.ok} variants=${partial.variants.length} firstCaptionLen=${partial.variants[0]?.caption?.length ?? 0}`);
        if (partial.ok) {
          const { recordTaskRun } = await import("./recordTaskRun");
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
            },
            thumbnailUrl: null,
            progress: "caption_ready",
          });
          persistedOutputId = persisted.outputId;
          persistedMissionId = persisted.missionId;
          console.log(`[orchestra:trace] task=${args.template.id} checkpoint recordTaskRun returned outputId=${persistedOutputId} missionId=${persistedMissionId}`);
          (partial as any).outputId = persistedOutputId;
          (partial as any).missionId = persistedMissionId;
          (partial as any).progress = "caption_ready";
        }

        args.onCheckpoint(partial);
      } catch (e) {
        console.warn("[orchestra] onCheckpoint persistence failed (non-fatal):", (e as Error)?.message);
      }
    }

    // ── Stage 3: parallel image gen — only when runImageGen=true ───────
    // 30s tier: runImageGen=false → briefs are written but no Flux call.
    // The carousel renders style direction text in the mockup image slot;
    // user clicks "用此風格生圖" per variant to opt into MediaGenFlow.
    // 2026-07-29: a video task's clip is its still animated, so video always
    // implies rendering the still — otherwise runVideoGen would silently
    // produce nothing (every image "skipped" → every clip skipped).
    const willRender = (args.config.runImageGen || !!args.config.runVideoGen) && args.config.images > 0;
    const stGen = willRender
      // The primary is usually Imagen, can be GPT/Nano Banana, and may fall
      // back to Flux. Per-image modelId records the actual provider; keep the
      // stage label provider-neutral instead of claiming every image was Flux.
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

    // ── Stage 3.4: image → video (Tier-1 TikTok formats) ───────────────
    // Only runs when the task opts in via runVideoGen. Each ready image is
    // animated into its own clip, in parallel. A variant whose image failed
    // is skipped rather than falling back to text-to-video — same policy as
    // product-faithful image gen: a hallucinated product is worse than no
    // clip, and t2v cannot see the source product at all.
    const wantVideo = !!args.config.runVideoGen;
    let videos: Array<NonNullable<OrchestraVariant["video"]>> | null = null;
    if (wantVideo) {
      const readyCount = images.filter((im) => im.status === "ready" && im.url).length;
      const stVid = stage("video", `Kling i2v ×${readyCount} 平行生影片`);

      // Before/after cards need a SECOND still — the same scene in its
      // "after" state — to hand Kling as the end frame. Reuses genOneImage so
      // the tail frame goes through the identical model/brand/product-fidelity
      // path as the head frame; only the caption gains a state directive.
      let tailImages: Array<OrchestraVariant["image"] | null> | null = null;
      if (args.config.videoTailHint) {
        const stTail = stage("video-tail", `結束格 ×${readyCount} 生圖`);
        tailImages = await Promise.all(
          images.map((im, i) =>
            im.status === "ready" && im.url
              ? genOneImage(
                  {
                    content: `${captions[i]?.caption ?? ""}\n\n【這一格的畫面狀態】${args.config.videoTailHint}`,
                    style: briefs[i] ?? null,
                    platform: taskPlatform,
                    palette: brandPalette,
                    brandIdentity,
                    subjectImageUrl: productSubject.imageUrl,
                    subjectImageRequired: productSubject.required,
                  },
                  args.config,
                )
              : Promise.resolve(null),
          ),
        );
        const okTail = tailImages.filter((t) => t?.status === "ready").length;
        stTail.status = okTail > 0 ? "done" : "failed";
        stTail.completedAt = Date.now() - startedAt;
      }

      videos = await Promise.all(
        images.map((im, i) =>
          im.status === "ready" && im.url
            ? genOneVideo(
                {
                  imageUrl: im.url,
                  caption: captions[i]?.caption ?? "",
                  motionHint: args.config.videoMotionHint,
                  // A failed tail still degrades to a normal single-state clip
                  // rather than failing the whole variant.
                  tailImageUrl: tailImages?.[i]?.status === "ready" ? tailImages[i]!.url : null,
                },
                args.config,
              )
            : Promise.resolve<NonNullable<OrchestraVariant["video"]>>({
                url: null,
                posterUrl: im.url ?? null,
                status: "skipped",
                errorMsg: "no source image to animate",
              }),
        ),
      );
      const okVid = videos.filter((v) => v.status === "ready").length;
      stVid.status = okVid > 0 ? "done" : "failed";
      stVid.completedAt = Date.now() - startedAt;
      for (const v of videos) {
        if ((v.status === "failed" || v.status === "timeout") && v.errorMsg) {
          errors.push(`video(${v.status}): ${String(v.errorMsg).slice(0, 200)}`);
        }
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
    const _voiceGated = brandMarket.isZhTW && (isTikTokBodyTask(args.template) ||
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
      if (caption) caption = deduplicateInternalCaption(caption);
      // 2026-06-10 (CJ「資訊不夠時不要用 [請補充] 佔位符」改造):
      // Strip placeholder brackets from body captions.
      // 99s strategy docs (calendar / toolkit / playbook) legitimately use
      // [請補充：來源] for user fill-in — skip those by tier.
      const isStrategyDoc = (args.template.id ?? "").includes("-99-") &&
        /calendar|toolkit|playbook|策略|月曆|工具包/.test(args.template.id ?? "");
      if (caption && !isStrategyDoc) caption = stripPlaceholderBrackets(caption);
      if (caption && _voiceGated) caption = voiceSanitizeZhTW(caption);
      // 2026-07-18 多市場: Latin-punctuation markets get stray CJK
      // punctuation cleaned (writer prompt scaffolding is Chinese, the
      // model occasionally slips a 。／， into EN/DE/FR output).
      if (caption && latinPunctLang(brandMarket.outputLanguage)) caption = normalizeLatinPunct(caption);
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
        // Actual failures (both Imagen + Flux returned errors) already push
        // an explicit {status:"failed"} into images[i] above.
        image: images[i] ?? { style: briefs[i] ?? null, url: null, status: "skipped" },
        // Tier-1 video formats only — undefined for every existing task, so
        // no current mockup changes behaviour.
        ...(videos ? { video: videos[i] ?? { url: null, posterUrl: null, status: "skipped" as const } } : {}),
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
            const subResults = await Promise.all([
              extrasCfg.replyTemplates && extrasCfg.replyTemplates > 0
                ? callReplyTemplates({ caption: v.caption, channel, n: extrasCfg.replyTemplates, persona: replyPersona })
                : Promise.resolve([] as Array<{ userSays: string; yourReply: string }>),
              extrasCfg.postingTime ? callPostingTime({ caption: v.caption, channel, persona: timingPersona }) : Promise.resolve(""),
              extrasCfg.followupPost ? callFollowupPost({ caption: v.caption, channel, persona: followupPersona }) : Promise.resolve(""),
              extrasCfg.compareTable && useSpecialty
                ? callCompareTable({ caption: v.caption, viralSource: viralSrc, persona: specialtyPersona })
                : Promise.resolve(""),
              extrasCfg.timingAdvisor && useSpecialty
                ? callTimingAdvisor({ caption: v.caption, trendTopic: trendSrc, persona: specialtyPersona })
                : Promise.resolve(""),
              extrasCfg.legalAssistant && useSpecialty
                ? callLegalAssistant({ caption: v.caption, testimonialSource: testSrc, consentStatus: consent, persona: specialtyPersona })
                : Promise.resolve(""),
            ]);
            const replies = subResults[0];
            const postingTime = subResults[1];
            const followupPost = subResults[2];
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
        const { runSquadLeadQA } = await import("../squadLeadQA");
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
      brandFixes: (captions as any).__brandFixes ?? [],
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
    if (args.userId && hasUsableVariant) {
      try {
        const { recordTaskRun, finaliseTaskRun } = await import("./recordTaskRun");
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
        const titleFor = (await import("../_core/titleFromCaption")).titleFromCaption(result.variants[0]?.caption, flatLabel);
        const fullMetadata = {
          latencyMs: result.totalLatencyMs,
          // 2026-05-09 (P2 — agent thinking panel): persist FULL agent
          // objects (id/name/title/avatarUrl) + stages + fetchedUrl so
          // /run/:id can render the agent workflow without reconstructing.
          captionAgent: result.captionAgent ?? null,
          imageAgent: result.imageAgent ?? null,
          stages: result.stages ?? [],
          fetchedUrl: result.fetchedUrl ?? null,
          urlFetchFailure: result.urlFetchFailure ?? null,
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
          // 2026-06-05 (CJ「不阻擋，事後解釋」): brand-rule fixes from
          // enforceBrandRulesOnTextWithReport, so RunPage can trigger a
          // Mia nudge ("發現你寫了 X，已自動改成 Y，想調整定位嗎？").
          brandFixes: (result as any).brandFixes ?? [],
          // 2026-07-20 (CJ QA 斷字/漏字 forensics): raw writer captions for
          // any variant the transform chain modified — diff against content
          // to identify the corrupting layer.
          rawCaptions: (result as any).rawCaptions ?? [],
        };

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
 * 2026-05-11 (CJ「文案前面幾句重複的問題」) — merge LLM-written hook with
 * user-provided article body, defensively de-duplicating any opening lines.
 *
 * The LLM is instructed to write ONLY a hook (30-60 chars). It sometimes
 * ignores this and either:
 *  (a) writes the full caption including the body's opening,
 *  (b) truncates mid-sentence at the token limit while ALSO including
 *      the body opener, so the user sees "[truncated lead]…[full body]"
 *      with the same first line twice.
 *
 * Strategy:
 *  1. Split both strings into paragraphs.
 *  2. If the hook's last paragraph is a substring/superstring of the
 *     body's first paragraph (>= 60% overlap), drop the duplicate.
 *  3. If the hook is suspiciously long (> 200 chars), trim it back to
 *     the first 1-2 sentences (the actual hook).
 *  4. Join with double newline.
 *
 * Idempotent + safe for the normal case (short hook, no overlap).
 */
function mergeHookAndBody(hook: string, body: string): string {
  const cleanHook = hook.trim();
  const cleanBody = body.trim();
  if (!cleanBody) return cleanHook;
  if (!cleanHook) return cleanBody;

  // Step 1: trim back a runaway "hook" that's actually a full caption.
  let h = cleanHook;
  if (h.length > 200) {
    // Take first 1-2 sentences (ending on Chinese or ASCII terminator).
    const m = h.match(/^[\s\S]*?[。！？!?]/);
    if (m && m[0].length >= 20 && m[0].length <= 200) {
      h = m[0].trim();
    } else {
      // Fallback: first 120 chars
      h = h.slice(0, 120).trim();
    }
  }

  // Step 2: dedupe overlap between end of hook and start of body.
  const bodyFirstPara = cleanBody.split(/\n\s*\n/)[0] ?? cleanBody;
  const bodyFirstSentence = (bodyFirstPara.match(/^[^。！？!?\n]+[。！？!?]?/) ?? [bodyFirstPara])[0]!.trim();
  if (bodyFirstSentence.length >= 10 && h.includes(bodyFirstSentence)) {
    // Hook already contains body's opening — drop body's opening from body.
    const rest = cleanBody.slice(bodyFirstPara.indexOf(bodyFirstSentence) + bodyFirstSentence.length).trimStart();
    // If there's a paragraph break right after, keep it; otherwise add one.
    const sep = rest.startsWith("\n") ? "" : "\n\n";
    return `${h}${sep}${rest}`;
  }

  // Step 3: check if hook is a substring of body opener (rare, but defensive).
  if (h.length >= 15 && cleanBody.startsWith(h)) {
    return cleanBody;
  }

  return `${h}\n\n${cleanBody}`;
}

/**
 * 2026-05-12 (CJ「文案中第一段話跟最後一段重複」): after mergeHookAndBody
 * we still see captions where the writer LLM internally duplicated content
 * (hook appears twice, hashtags 3x, etc). Run a strong pass that detects:
 *   - Duplicate paragraphs (same after whitespace/punctuation normalize)
 *   - Duplicate hashtag-only lines (collapse to last occurrence)
 *   - Adjacent sentences with high overlap (≥80%)
 */
export function deduplicateInternalCaption(text: string): string {
  if (!text) return text;
  const norm = (s: string) =>
    s.toLowerCase()
      .replace(/[\s　]+/g, " ")
      .replace(/[，。、！？!?，、：:；;]/g, "")
      .trim();

  // Split into paragraphs by blank lines
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length <= 1) return text;

  const HASHTAG_LINE_RE = /^(\s*#\S+\s*)+$/;
  const seen = new Set<string>();
  const out: string[] = [];
  // Walk in REVERSE so the LAST occurrence of hashtags wins (industry
  // convention: hashtags at end of post).
  for (let i = paragraphs.length - 1; i >= 0; i--) {
    const p = paragraphs[i]!;
    const key = norm(p);
    if (!key) continue;
    // Skip if this exact paragraph already accepted later in the post
    if (seen.has(key)) continue;
    // For hashtag-only paragraphs: also dedupe by the set of hashtags
    // (handles "#a #b #c" vs "#a #b #c " with trailing space variants).
    if (HASHTAG_LINE_RE.test(p)) {
      const hashtagKey = "HASHTAGS:" + p.match(/#\S+/g)!.sort().join(" ").toLowerCase();
      if (seen.has(hashtagKey)) continue;
      seen.add(hashtagKey);
    }
    // For sentence-form paragraphs: also block paragraphs that are
    // substrings of an already-accepted paragraph (handles "X with hashtags"
    // vs "X" appearing as separate paragraphs).
    let isSubsetOfAccepted = false;
    for (const accepted of seen) {
      if (accepted.length > 10 && accepted.includes(key) && key.length >= 10) {
        isSubsetOfAccepted = true;
        break;
      }
    }
    if (isSubsetOfAccepted) continue;
    seen.add(key);
    out.unshift(p);
  }
  return out.join("\n\n");
}
