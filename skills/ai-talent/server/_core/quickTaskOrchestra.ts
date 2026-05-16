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
import { dispatchGenerate } from "./mediaGen";
import { findFirstUrl, fetchUrlSummary, formatUrlSummaryForPrompt, type UrlSummary } from "./urlContext";
import { extractYouTubeId, fetchYouTubeContext, formatYouTubeContextForPrompt } from "./youtubeContext";
import { fetchViralPatterns, formatViralPatternsForPrompt } from "./socialListeningScout";
import { buildBrandPrefix as buildBrandContext } from "./brandContext";
import { loadBrandKnowledgeForPrompt } from "../routers/brandKnowledgeRouter";
import { getBrandRealContent } from "./brandRealContent";
import { resolveAgentId } from "./agentAssignments";
import { getCopywritingMasterPrompt, type PlatformCode } from "./copywritingMaster";
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
const HARD_BUDGET_100S= 150_000; // 100s tier
// 2026-05-13 (CJ「30~99秒的圖都生成不了」): PiAPI Flux Schnell takes 8–15s
// in practice (poll loop adds 1s minimum between checks). The previous
// 10s budget timed out almost every generation — variants came back with
// status:"timeout" and thumbnailUrl ended up null. Bumped to 45s so a
// typical 12s gen lands well within budget; per-tier hard budget still
// caps the overall job. Variants run in parallel so wall time stays low.
const PER_IMAGE_MS    = 45_000;
const LLM_BUDGET_MS   = 40_000;
const QA_BUDGET_MS    = 12_000;

export type OrchestraTier = "30s" | "60s" | "100s";

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
    url: string | null;
    status: "ready" | "failed" | "skipped" | "timeout";
    errorMsg?: string;
  };
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
  /** Agent's aiModel field — maps to provider (qwen/Kimi/glm). null = use template.preferredModel */
  agentAiModel?: string | null;
  /** Strategist anchor (multi-post / narrativeArc tasks) — injected before user msg */
  strategistAnchor?: string;
}): Promise<{ label: string; caption: string; hashtags?: string[] }> {
  const { template, config, label, captionPersona, brandPrefix, urlContext, userMsg, agentAiModel, strategistAnchor } = args;
  // Multi-post / labeled-slot tasks reference {label} in template.systemPrompt;
  // substitute the actual post slot before sending to LLM.
  const filledSystemPrompt = template.systemPrompt.replace(/\{label\}/g, label);

  const lengthHint =
    config.captionMaxChars > 0
      ? `字數 ${config.captionMinChars}-${config.captionMaxChars} 字。`
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
      `若 URL 抓到的內容跟品牌領域不相關，那就照 URL 主題寫，不要硬扯品牌。\n`
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
  const masterBlock = getCopywritingMasterPrompt({ market: "zh-TW", platform: platformCode });

  const system =
    masterBlock + "\n\n" +
    `# 你的角色 / 寫作風格參考\n` +
    captionPersona +
    `\n# 任務說明（特定任務規範 — 蓋過上方平台通則）\n` +
    filledSystemPrompt +
    strategistSection +
    `\n\n【本次任務】只寫 1 個變體：**${label}**。\n` +
    `${lengthHint}\n\n` +
    `【角色 vs 主角 — 重要】\n` +
    `上面的「角色」只是給你**寫作口吻**參考。**主角永遠是用戶或用戶輸入的內容**（在 user message + URL context）。\n` +
    `絕對不要把你（agent）的職稱、姓名、服務描述、自我介紹寫進輸出。\n` +
    `不要寫「我是 ___」、「___ 專家，幫 ___ 做 ___」、不要把你的姓名（例如 #NinaYeh / @JanetChang）寫成 hashtag、@mention 或 caption 內任何形式。\n` +
    subjectRule +
    `\n【格式要求 — 重要】\n` +
    `- caption 欄位**絕對不要**寫「${template.label}」、「${label}」或任務 / label 名稱。\n` +
    `- caption 欄位**絕對不要**夾雜視覺描述、英文 prompt、「image_style:」、「visual:」等技術註記。圖片風格由另一位 agent 獨立處理，這裡只放最終發到平台的純文字內容。\n` +
    `- 用自然斷行（兩個 newline 分段）。**不要**用「｜」全形管道符號當分隔線。\n` +
    `- emoji 點綴用就好，不要每段開頭都塞 emoji。\n` +
    `- hashtag 集中放在文末**最後一行**，不要散落文中。\n` +
    `- 段落像真人寫的，不要排成「標題｜內文｜hashtag」結構化卡片。\n` +
    `- 若任務有時間戳結構（如 [0-3s]），務必保留每段秒數標記，不要省略。\n\n` +
    // 2026-05-16 (CJ「品質不佳，是否第一題要強制更多資訊」root cause):
    // 這是一鍵產出的 30 秒任務，使用者不會回頭補資料。模型若反問
    // 「我需要更多資訊，請提供…」= 直接交付失敗、品質歸零。強制：
    // 永遠先交出可用成品，未知處用 [待補：xxx] 佔位，絕不反問。
    `【絕不反問 — 最高優先，違反即視為失敗】\n` +
    `這是一鍵速產任務，使用者不會再補充。**無論資訊多不足，都必須直接產出一份完整、可用的成品**。\n` +
    `- 嚴禁輸出任何「我需要更多資訊」「請提供」「請補充」「為了完成需要…」之類反問或要求清單。\n` +
    `- 缺具體事實（日期 / 數字 / 人名 / 連結 / 活動細節）時：用合理假設寫完，把不確定處用「[待補：例如 活動日期]」這種中括號佔位字串標出，讓用戶一眼能替換。\n` +
    `- caption 必須是最終可發布的文字本身，不是給用戶的提問或工作說明。\n\n` +
    `輸出嚴格 JSON 物件（不是陣列）：\n` +
    `{"caption":"<完整貼文>","hashtags":["..."]}\n` +
    `第一個字元就是 {。不要 markdown code fence、不要前言。\n` +
    brandSection +
    (hasUrl ? `\n# URL 抓到的內容（本次主題來源 — 必須以此為主）\n${urlContext}` : "");

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
  while (attempt < 2) {
    attempt++;
    try {
      // 2nd attempt: append explicit reminder to user msg, lowering model
      // creativity and forcing strict JSON.
      const userMsgWithReminder = attempt === 2
        ? `${userMsg}\n\n[REMINDER] 上次回應沒給可解析的 caption。請嚴格回覆 {"caption":"...","hashtags":[]} JSON，第一個字元就是 {，不要任何 markdown / 前言 / 解釋。`
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
        return { label, caption: out.caption, hashtags: out.hashtags };
      }
      lastErr = new Error(`empty caption for ${label} — raw[0:200]: ${lastRaw.slice(0, 200)}`);
      console.warn(`[callOneVariant] attempt ${attempt} failed for ${label} (raw len=${lastRaw.length}): ${lastRaw.slice(0, 300)}`);
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
  agentAiModel?: string | null;
  strategistAnchor?: string;
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
  const system =
    imagePersona +
    `任務：寫 1 條**繁體中文**視覺方向描述，呼應「${label}」這個口吻。\n` +
    `比例：${config.aspectRatio ?? "1:1"}\n` +
    subjectRule +
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
}): Promise<string> {
  const { strategistPersona, template, brandPrefix, urlContext, userMsg, postLabels } = args;
  const system =
    `# 你的角色\n` +
    strategistPersona +
    `\n# 任務\n` +
    `用戶要產出 FB 系列貼文（${postLabels.length} 篇）。你不寫 caption — 你寫整體「結構錨點」給後續寫手用。\n\n` +
    `產出 4-8 行繁體中文，涵蓋：\n` +
    `1) 整體 narrative 主題 / 核心訊息\n` +
    `2) 每篇的角色定位（${postLabels.map((l) => `「${l}」`).join(" / ")}）\n` +
    `3) 篇與篇之間的勾連邏輯（每篇結尾如何帶到下一篇）\n` +
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
      timeoutPromise<never>(LLM_BUDGET_MS, "strategist"),
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

// ── Single image gen with per-image timeout ─────────────────────────────

async function genOneImage(prompt: string, config: OrchestraConfig): Promise<OrchestraVariant["image"]> {
  if (!prompt) return { style: null, url: null, status: "skipped" };
  try {
    // 2026-05-05: switched from fal/flux-schnell to piapi/flux-pro
    // (CJ direction — fal.ai account was billing-locked, refund irrecoverable;
    // PiAPI Flux Pro is sync, ~5–13s per image, no fal dependency).
    const r = await Promise.race([
      dispatchGenerate("piapi/flux-schnell", {
        prompt,
        aspectRatio: (config.aspectRatio === "1.91:1" ? "16:9" : config.aspectRatio) as any,
        quality: config.imageQualitySteps >= 8 ? "high" : "medium",
      }),
      timeoutPromise<never>(PER_IMAGE_MS, "piapi-flux-schnell"),
    ]);
    if (r.status === "ready" && r.url) {
      return { style: prompt, url: r.url, status: "ready" };
    }
    return { style: prompt, url: null, status: "failed", errorMsg: r.errorMsg ?? "no url returned" };
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    return { style: prompt, url: null, status: msg.includes("exceeded") ? "timeout" : "failed", errorMsg: msg };
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
  if (tier === "60s" || tier === "100s") {
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
  const tierBudget = tier === "60s" ? HARD_BUDGET_60S : tier === "100s" ? HARD_BUDGET_100S : HARD_BUDGET_MS;

  const startedAt = Date.now();
  const stages: OrchestraStage[] = [];
  const errors: string[] = [];

  function stage(key: string, label: string): OrchestraStage {
    const s: OrchestraStage = { key, label, startedAt: Date.now() - startedAt, status: "running" };
    stages.push(s);
    return s;
  }

  const userMsg =
    Object.entries(args.inputs)
      .map(([k, v]) => `[${k}] ${v}`)
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
    const ytUrlInput = inputValues.find((v) => !!extractYouTubeId(v));

    // 100s tier: also kick off scout (viral patterns research) in parallel
    const isResearchTier = tier === "100s";
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

    const [captionLoad, imageLoad, ytContext, urlSummary, brandPrefix, viralPatterns] = await Promise.all([
      loadAgent(resolvedLeadId),
      loadAgent(resolvedImageDirId),
      ytUrlInput
        ? (async () => { try { return await fetchYouTubeContext(ytUrlInput); } catch { return null; } })()
        : Promise.resolve(null),
      // Generic URL fetch only when there's a non-YT URL
      (async () => {
        if (ytUrlInput) return null; // skip — YT path handles it
        for (const v of inputValues) {
          const url = findFirstUrl(v);
          if (url) {
            try { return await fetchUrlSummary(url); } catch { return null; }
          }
        }
        return null;
      })(),
      // Brand context + knowledge base + REAL public content merged.
      // brandRealContent (website + social via Perplexity) is the strongest
      // grounding signal — without it AI hallucinates industry from brand
      // name (e.g. 桂冠營養研究室 → 美妝). 2026-05-08 (CJ direction).
      Promise.all([
        buildBrandContext(args.brandId, args.productId, args.eventId).catch(() => ""),
        args.brandId ? loadBrandKnowledgeForPrompt(args.brandId).catch(() => "") : Promise.resolve(""),
        args.brandId
          ? getBrandRealContent(args.brandId).then(r => r.context).catch(() => "")
          : Promise.resolve(""),
      ]).then(([prefix, knowledge, real]) => prefix + (knowledge || "") + (real || "")),
      // Scout stage — only fires for 100s tier. scoutKind drives WHAT we fetch:
      // viral (default) / festivals (calendar tasks) / trending (時事改寫) / news.
      isResearchTier
        ? (async () => {
            try {
              return await fetchViralPatterns({
                channel: taskChannel,
                topic: taskTopic,
                brandId: args.brandId,
                kind: args.config.scoutKind ?? "viral",
              });
            } catch { return null; }
          })()
        : Promise.resolve(null),
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
      (tier === "60s" || tier === "100s") &&
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
        strategistAnchor: strategistAnchor || undefined,
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
        const partialVariants: OrchestraVariant[] = Array.from({ length: args.config.variants }, (_, i) => {
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
          const tierStr = (tier as "30s" | "60s" | "100s");
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
            title: titleFromCaption(partialVariants[0]?.caption, flatLabel),
            content: JSON.stringify(partialVariants, null, 2),
            metadata: {
              latencyMs: Date.now() - startedAt,
              captionAgent: captionLoad.meta ?? null,
              imageAgent: imageLoad.meta ?? null,
              stages: [...stages],
              fetchedUrl: fetchedUrl ?? null,
              errors: [...errors],
              ok: true,
              variantCount: partialVariants.length,
              inputs: args.inputs ?? {},
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
    const willRender = args.config.runImageGen && args.config.images > 0;
    const stGen = willRender
      ? stage("gen", `Flux Schnell ×${args.config.images} 平行生圖`)
      : null;

    const images: OrchestraVariant["image"][] = willRender && briefs.length
      ? await Promise.all(briefs.map((b) => genOneImage(b, args.config)))
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
    const isHookTask = args.template.id === "fb-30-pure-text-hook";
    const articleBody =
      isHookTask
        ? (args.inputs["article_body"] ?? args.inputs["topic"] ?? "").trim()
        : "";

    const variants: OrchestraVariant[] = [];
    const N = args.config.variants;
    for (let i = 0; i < N; i++) {
      const cap = captions[i];
      const label = cap?.label ?? args.config.variantLabels[i] ?? `版本 ${i + 1}`;
      let caption = (cap?.caption ?? "").trim();
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
      if (!caption) {
        errors.push(`variant ${i} (${label}) caption 兩次嘗試都失敗`);
      }
      variants.push({
        label,
        caption,
        hashtags: cap?.hashtags ?? [],
        image: images[i] ?? { style: briefs[i] ?? null, url: null, status: args.config.images > 0 ? "failed" : "skipped" },
      });
    }

    // ── Stage 3.5: 60s/100s production extras (replies / time / followup) ─
    // Per-variant fanout. Each extras agent is a small LLM call (~5-10s).
    // Failures non-fatal; variant ships without that extra.
    const extrasCfg = args.config.extras;
    // Pre-load specialty agent persona if needed (shared across all variants)
    let specialtyMeta: AgentMeta | null = null;
    let specialtyPersona = "";
    const useSpecialty =
      (tier === "60s" || tier === "100s") &&
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
    if ((tier === "60s" || tier === "100s") && extrasCfg) {
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
    if ((tier === "60s" || tier === "100s") && extrasCfg) {
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
    if (tier === "60s" || tier === "100s") {
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
      captionAgent: captionLoad.meta,
      imageAgent: imageLoad.meta,
      variants,
      stages,
      ok: variants.some((v) => v.caption.length > 0),
      errors,
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
        const tierStr = (tier as "30s" | "60s" | "100s");
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
          errors: result.errors ?? [],
          ok: result.ok ?? true,
          variantCount: result.variants.length,
          // 2026-05-09 (CJ): persist inputs so /run/:id 重跑同任務 can
          // navigate back to the task with the user's prior answers
          // pre-filled (no need to re-type 主問題 input).
          inputs: args.inputs ?? {},
          // 2026-05-11 (CJ): persist scope so /projects can filter
          // missions by product/event and /run page can re-apply scope.
          productId: args.productId ?? null,
          eventId: args.eventId ?? null,
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
