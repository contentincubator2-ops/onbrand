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

const HARD_BUDGET_MS  = 20_000; // 30s tier
const HARD_BUDGET_60S = 50_000; // 60s tier (5 variants + QA)
const HARD_BUDGET_100S= 100_000;// 100s tier (scout + video)
const PER_IMAGE_MS    = 10_000;
const LLM_BUDGET_MS   = 10_000;
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
 *  / azure-northcentral (DeepSeek-V3.2/R1). Others fall back to qwen. */
function aiModelToProvider(aiModel: string | null | undefined): ModelProvider {
  if (!aiModel) return "qwen";
  const m = aiModel.toLowerCase();
  if (m.includes("qwen")) return "qwen";
  if (m.includes("kimi")) return "azure-foundry";
  if (m.includes("glm") || m.includes("zhipu")) return "zhipu";
  if (m.includes("claude")) return "azure-position"; // claude-haiku/sonnet/opus
  if (m.includes("deepseek")) return "azure-northcentral";
  return "qwen"; // safe default
}

export async function loadAgent(id: number | null | undefined): Promise<{ meta: AgentMeta | null; persona: string; aiModel: string | null }> {
  if (!id) return { meta: null, persona: "", aiModel: null };
  try {
    const [rows]: any = await localPool.execute(
      `SELECT id, name, title, bio, specialty, methodology, taskSystemPrompt, aiModel, avatarUrl FROM agents WHERE id = ? LIMIT 1`,
      [id],
    );
    const a = (rows as any[])?.[0];
    if (!a) return { meta: null, persona: "", aiModel: null };
    // taskSystemPrompt is the agent's full role manual (200-500w). When
    // present it dominates — it IS the writing instruction set. bio /
    // specialty / methodology become identity flavor.
    const taskBlock = a.taskSystemPrompt
      ? `\n# 你的工作守則（必讀，違反等於失敗）\n${a.taskSystemPrompt}\n`
      : "";
    const persona =
      `你是 ${a.name}，${a.title}。\n` +
      (a.bio ? `背景：${a.bio}\n` : "") +
      (a.specialty ? `專長：${a.specialty}\n` : "") +
      (a.methodology ? `方法論：${a.methodology}\n` : "") +
      taskBlock +
      `用你的口氣寫，不要寫得像通用 AI。\n\n`;
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
  const provider: ModelProvider = agentAiModel
    ? aiModelToProvider(agentAiModel)
    : (template.preferredModel === "any" ? "qwen" : (template.preferredModel as any));
  const explicitModel: string | undefined = agentAiModel || undefined;

  // First attempt
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
          provider,
          explicitModel,
        ),
        timeoutPromise<never>(LLM_BUDGET_MS, `caption[${label}]`),
      ]);
      const parsed = tryParseJson(r.content);
      const caption =
        typeof (parsed as any)?.caption === "string" ? (parsed as any).caption.trim() : "";
      if (caption.length > 0) {
        return {
          label,
          caption,
          hashtags: Array.isArray((parsed as any)?.hashtags)
            ? (parsed as any).hashtags.slice(0, 15).map(String)
            : undefined,
        };
      }
      lastErr = new Error(`empty caption for ${label}`);
    } catch (e) {
      lastErr = e;
    }
    // brief backoff before retry
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
  /** Caller's userId — used by recordTaskRun to write the output into
   *  mission_outputs so /projects can find it. Optional for back-compat. */
  userId?: number;
  /** Tier override — 60s/100s scale variants + add QA stage. Default 30s. */
  tier?: OrchestraTier;
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
        buildBrandContext(args.brandId).catch(() => ""),
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
        caption = `${caption}\n\n${articleBody}`;
      }
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
                taskTitle: args.template.label,
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
    // Non-fatal: failure here doesn't break the user-facing response.
    if (args.userId && result.ok && result.variants.length > 0) {
      try {
        const { recordTaskRun } = await import("./recordTaskRun");
        const firstImage = result.variants.find((v) => v.image?.url)?.image?.url ?? null;
        const channel = String((args.template as any).channel ?? "other");
        const tierStr = (tier as "30s" | "60s" | "100s");
        await recordTaskRun({
          userId: args.userId,
          brandId: args.brandId ?? null,
          workspace: channel,
          taskId: args.template.id,
          taskLabel: args.template.label ?? args.template.id,
          tier: tierStr,
          title: result.variants[0]?.caption?.slice(0, 80) || args.template.label,
          content: JSON.stringify(result.variants, null, 2),
          metadata: {
            latencyMs: result.totalLatencyMs,
            captionAgent: result.captionAgent?.name,
            imageAgent: result.imageAgent?.name,
            variantCount: result.variants.length,
          },
          thumbnailUrl: firstImage,
        });
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
