/**
 * Facebook quick-task templates (2026-05-05).
 *
 * 30s / 60s / 90s tier definitions for every FB post type.
 * Each template returns a QuickTaskOutput (see quickTaskOutput.ts) shaped
 * for the matching mockup variant in PlatformMockup/facebook*.tsx.
 *
 * Critical design rule: 30s/60s/90s timer covers TEXT + STYLE DIRECTION ONLY.
 * Image / video rendering is opt-in via MediaGenFlow (separate flow, no SLA).
 */

export interface FBTaskTemplate {
  id: string;                              // e.g. "fb-30-caption-short"
  tier: "30s" | "60s" | "90s" | "100s";
  postType: string;                        // matches mockup format key
  label: string;                           // user-facing chip label
  description: string;                     // 1-line UI hint
  /**
   * 2026-05-05: agent_id is the existing agents.id in mos_db whose persona,
   * bio, methodology and system_prompt drive this task. Loaded at runtime
   * by runQuick mutation and injected into the LLM call. The card UI shows
   * this agent's avatar + name as the "who's writing for you".
   * Optional during incremental rollout — 60s/90s tier tasks may not have
   * been mapped yet. UI falls back to generic when undefined.
   */
  agent_id?: number;
  skill_slug?: string;
  primary_question?: string;
  primary_input?: { key: string; placeholder?: string; type: "text" | "textarea" };
  inputs: Array<{ key: string; label: string; type: "text" | "textarea"; required: boolean; placeholder?: string }>;
  systemPrompt: string;                    // task-specific instruction, appended AFTER agent persona
  preferredModel: "qwen" | "zhipu" | "azure-foundry" | "azure-position" | "hermes" | "any";
  /** maxTokens cap — 30s aim ~400, 60s ~900, 90s ~1800 */
  maxTokens: number;
  /** Default platform & post_type the quickTask output should embed.
   * Widened 2026-05-05 to support IG / Threads / etc. as channel rollout
   * progresses (see project_30s_task_sop.md). */
  outputDefaults: {
    platform: "facebook" | "instagram" | "threads" | "linkedin" | "tiktok" | "youtube" | "email" | "press";
    post_type: string;
  };
}

// Helper to keep prompt blocks tidy
const FB_TONE_SUFFIX = `
語氣要求：自然口語、有 hook、不要 "親愛的客戶" 或 "歡迎購買" 的官腔。
品牌語氣若 system context 已給，務必貼合，不要用罐頭模板。
hashtag 不超過 5 個（FB 觀眾不愛 hashtag 海）。`;

// ─── 30s tier (10 tasks — pure text, fast model) ────────────────────────────

export const FB_30S_TASKS: FBTaskTemplate[] = [
  {
    id: "fb-30-caption-short",
    tier: "30s",
    postType: "feed",
    label: "FB 短貼文 caption",
    description: "100-200 字單張圖文 caption，含 1 句 hook + 1 個 CTA",
    agent_id: 239183,             // Aiden Hsu — fb-brief-writer
    skill_slug: "fb-copywriting",
    primary_question: "今天這篇貼文要講什麼？可以貼網址（會自動讀取）、原文、或主題描述",
    primary_input: { key: "topic", placeholder: "例：https://your-blog.com/article  /  春季新品上市  /  母親節活動", type: "textarea" },
    inputs: [
      { key: "topic", label: "今天要講什麼？", type: "textarea", required: true, placeholder: "例：春季新品上市 / 母親節活動 / 客戶感謝" },
    ],
    systemPrompt: `產出單張圖文 FB 貼文 caption，100-200 字。
結構：第 1 句 hook 拉注意 / 中間 1-2 段內容鋪陳 / 最後 1 句 CTA。
${FB_TONE_SUFFIX}
另外給 1 句 image_style_direction.summary 描述配圖風格方向（不是 prompt，只是風格描述）。`,
    preferredModel: "qwen",
    maxTokens: 400,
    outputDefaults: { platform: "facebook", post_type: "feed" },
  },
  {
    id: "fb-30-pure-text-hook",
    tier: "30s",
    postType: "feed",
    label: "FB 純文字 hook 3 種",
    description: "3 種不同口吻的開場 hook，自動接上你原本的貼文內容",
    agent_id: 239183,             // Aiden Hsu — hook-writing
    skill_slug: "hook-writing",
    primary_question: "貼上你原本要發的貼文 / 文章內容，我會幫你寫 5 種不同口吻的開場接上去",
    primary_input: { key: "article_body", placeholder: "貼上完整的貼文內文（hook 會接在最前面）", type: "textarea" },
    inputs: [
      { key: "article_body", label: "原本的貼文內容", type: "textarea", required: true },
    ],
    systemPrompt: `任務：用戶提供了一段「原本要發的貼文內文」（在 article_body 輸入裡）。
你只要寫 hook（開場句），**不要重複貼用戶的原文** — orchestra 會在後端自動把原文接到你寫的 hook 後面。

每個 variant.caption = 那個口吻的 hook（30-60 字，1-2 句即可）。
不要寫成 "[hook]\\n\\n[原文]"，只寫 hook。
口吻分別：反問式 / 數字式 / 反差式（依 Plan B 強制規則的順序）。
${FB_TONE_SUFFIX}`,
    preferredModel: "qwen",
    maxTokens: 600,
    outputDefaults: { platform: "facebook", post_type: "feed" },
  },
  {
    id: "fb-30-link-caption",
    tier: "30s",
    postType: "feed",
    label: "FB 連結貼文 caption",
    description: "分享網址時的引言文（含 OG 預覽期待）",
    agent_id: 60021,              // Tina Ji — Facebook/Instagram Social Copywriter
    skill_slug: "social-copy",
    primary_question: "貼上你要分享的連結網址",
    primary_input: { key: "url", placeholder: "https://...", type: "text" },
    inputs: [
      { key: "url", label: "連結網址", type: "text", required: true, placeholder: "https://…" },
      { key: "topic", label: "為什麼分享這個？", type: "textarea", required: false },
    ],
    systemPrompt: `產出 FB 連結貼文 caption（80-150 字）。
結構：1 句 hook 點出讀者會錯過什麼 / 1 段 why-care / CTA 引導點連結。
不要直接複製文章標題。連結 OG preview 會自動長出，不必描述縮圖。`,
    preferredModel: "qwen",
    maxTokens: 400,
    outputDefaults: { platform: "facebook", post_type: "feed" },
  },
  {
    id: "fb-30-comment-reply",
    tier: "30s",
    postType: "comment",
    label: "FB 留言回覆（一般）",
    description: "正面 / 中性留言的品牌回覆",
    agent_id: 60021,              // Tina Ji — Social Copywriter, brand voice
    skill_slug: "social-copy",
    primary_question: "貼上原始用戶留言，或留言所在的貼文連結",
    primary_input: { key: "user_comment", placeholder: "用戶說了什麼？整段留言貼進來", type: "textarea" },
    inputs: [
      { key: "user_comment", label: "用戶留言", type: "textarea", required: true },
      { key: "tone", label: "回覆口吻（warm / professional / playful）", type: "text", required: false, placeholder: "warm" },
    ],
    systemPrompt: `產出 FB 商家對用戶留言的回覆（30-80 字）。
規則：先呼應對方訊息 → 再給 1 個有溫度的小細節 → 結尾留「下次再聊」式邀請而非結束。
不要 "感謝您的支持！" 罐頭。
output: caption 放回覆文，description 放原始用戶留言（用於 mockup 顯示）。`,
    preferredModel: "qwen",
    maxTokens: 300,
    outputDefaults: { platform: "facebook", post_type: "comment" },
  },
  {
    id: "fb-30-crisis-reply-short",
    tier: "30s",
    postType: "comment",
    label: "FB 危機 / 客訴回覆（短）",
    description: "Lagadec 4 段壓縮版（致歉+解釋+承諾+私訊邀請）",
    agent_id: 239185,             // Brian Chou — fb-crisis-comms
    skill_slug: "crisis-communication",
    primary_question: "貼上客戶抱怨內容（或留言截圖文字）",
    primary_input: { key: "user_complaint", placeholder: "客戶說了什麼？盡可能完整貼進來", type: "textarea" },
    inputs: [
      { key: "user_complaint", label: "客戶抱怨內容", type: "textarea", required: true },
      { key: "context", label: "已知事實 / 處理狀態（可選）", type: "textarea", required: false },
    ],
    systemPrompt: `產出 FB 客訴留言的「壓縮版 Lagadec 4 段」回覆（80-150 字）。
規則：① 真誠致歉（不要 "若有造成困擾" 推託式）② 簡短解釋發生什麼 ③ 具體承諾 + 時程 ④ 提供私訊管道。
不要承諾無法做到的事。語氣專業但有人味。
output: caption 放回覆文，description 放原始抱怨內容。`,
    preferredModel: "azure-position", // Claude — 客訴敏感度需要好點的模型
    maxTokens: 400,
    outputDefaults: { platform: "facebook", post_type: "comment" },
  },
  {
    id: "fb-30-pinned-short",
    tier: "30s",
    postType: "pinned",
    label: "FB 釘選貼文短文案",
    description: "粉專置頂用，講清楚「我們是誰」「為什麼追蹤」",
    agent_id: 239183,             // Aiden Hsu — brand voice + atomized-content
    skill_slug: "fb-copywriting",
    primary_question: "想讓第一次來粉專的人，3 秒內知道你做什麼？",
    primary_input: { key: "brand_focus", placeholder: "我們是誰、做什麼、為什麼值得追蹤", type: "textarea" },
    inputs: [
      { key: "brand_focus", label: "想讓新訪客知道什麼？", type: "textarea", required: true },
    ],
    systemPrompt: `產出 FB 釘選貼文文案（150-250 字）。
結構：① 1 句強烈定位（我們在做什麼，誰受惠）② 3 個具體價值點（用 emoji 條列）③ CTA 引導追蹤 / 點連結。
釘選會留很久，文案不要寫時效性內容（"最新"、"本月" 都不要）。
另外給配圖 style_direction.summary。`,
    preferredModel: "qwen",
    maxTokens: 500,
    outputDefaults: { platform: "facebook", post_type: "pinned" },
  },
  {
    id: "fb-30-story-text",
    tier: "30s",
    postType: "story",
    label: "FB Story 文案",
    description: "9:16 ephemeral 配文 + overlay 主標",
    agent_id: 30002,              // Sarah Liu — AI Brand Story CMO
    skill_slug: "fb-copywriting",
    primary_question: "今天的 Story 想說什麼？",
    primary_input: { key: "topic", placeholder: "例：幕後花絮 / 限時優惠 / 提問 sticker", type: "textarea" },
    inputs: [
      { key: "topic", label: "Story 想傳達什麼", type: "textarea", required: true },
    ],
    systemPrompt: `產出 FB Story 文案。
output: caption 放完整 Story 文（30-60 字，會疊在圖片上） / title 放 1 個 5-8 字的 overlay 主標 / image_style_direction 是 9:16 直式風格描述。
不要寫長段。Story 要快速吸睛即拋。`,
    preferredModel: "qwen",
    maxTokens: 300,
    outputDefaults: { platform: "facebook", post_type: "story" },
  },
  {
    id: "fb-30-live-title",
    tier: "30s",
    postType: "feed", // pre-live announcement post is feed-shaped
    label: "FB 直播標題 + 預告短文",
    description: "直播開始前 1-2 小時的預告 caption",
    agent_id: 40,                 // Vicky Feng — Live Stream Host (Plan B, 2026-05-05)
    skill_slug: "social-copy",
    primary_question: "今天的直播要講什麼？",
    primary_input: { key: "live_topic", placeholder: "例：產品試用、新品發表、Q&A", type: "text" },
    inputs: [
      { key: "live_topic", label: "直播主題", type: "text", required: true },
      { key: "live_time", label: "直播時間（可選）", type: "text", required: false, placeholder: "例：今晚 8:00" },
    ],
    systemPrompt: `產出 FB 直播預告貼文。
output: title 放 8-15 字直播標題（具體有 hook，不要 "今晚直播"） / caption 放 80-150 字預告文（為什麼要看 + 會講什麼 + 呼籲開鈴鐺）。
不要承諾不確定的內容。`,
    preferredModel: "qwen",
    maxTokens: 400,
    outputDefaults: { platform: "facebook", post_type: "feed" },
  },
  {
    id: "fb-30-hashtag-set",
    tier: "30s",
    postType: "feed",
    label: "FB hashtag 建議組",
    description: "10-15 個分層 hashtag（核心 / 中型 / 長尾）",
    agent_id: 60021,              // Tina Ji — social copywriter
    skill_slug: "fb-best-practices",
    primary_question: "貼文主題或品牌產業是？",
    primary_input: { key: "topic", placeholder: "例：手沖咖啡 / B2B SaaS / 母嬰用品", type: "textarea" },
    inputs: [
      { key: "topic", label: "貼文主題 / 產業", type: "textarea", required: true },
    ],
    systemPrompt: `產出 10-15 個 FB 適用的 hashtag（FB 不像 IG，不要 #海，但仍可加）。
分層：① 3-5 個品牌/核心 ② 3-5 個產業中型 ③ 3-5 個長尾或活動性。
output: hashtags 陣列（不要含 # 前綴），caption 放 1 句使用建議。`,
    preferredModel: "qwen",
    maxTokens: 250,
    outputDefaults: { platform: "facebook", post_type: "feed" },
  },
  {
    id: "fb-30-countdown-1day",
    tier: "30s",
    postType: "feed",
    label: "FB 活動倒數一句 hype",
    description: "倒數 N 天的單篇推文（系列中的一篇）",
    agent_id: 180159,             // Claire Hsu — fb-countdown-series lead
    skill_slug: "social-media-manager",
    primary_question: "活動名稱 + 還剩幾天？",
    primary_input: { key: "event_name", placeholder: "例：週年慶 / 新品上市 / 限時優惠", type: "text" },
    inputs: [
      { key: "event_name", label: "活動名稱", type: "text", required: true },
      { key: "days_left", label: "剩幾天", type: "text", required: true, placeholder: "3" },
    ],
    systemPrompt: `產出 FB 活動倒數系列其中一篇（80-130 字）。
規則：① 開頭凸顯天數（用數字 + emoji） ② 中間放 1 個尚未公開的小細節 / 倒數獨家 ③ 最後 CTA。
不要每天都用一樣的 "倒數X天" 結構，要有變化。
配圖 style_direction.summary 給 1 句倒數視覺風格。`,
    preferredModel: "qwen",
    maxTokens: 350,
    outputDefaults: { platform: "facebook", post_type: "feed" },
  },
];

// ─── Plan B Orchestra config (2026-05-05) ──────────────────────────────────
//
// 20-second parallel-fanout spec. For each 30s task we declare:
//   - variants:           how many caption deliverables (3 or 5)
//   - images:             how many real-generated images (0, 1, or 5)
//   - imageDirectorId:    agent that writes the visual briefs (null = no images)
//   - aspectRatio:        Flux Schnell aspect ratio
//   - fluxSize:           explicit pixel size for the image_size param
//   - imageQualitySteps:  inference steps (4 = fast, 8 = higher quality for 釘選)
//   - variantLabels:      口吻 names — drives the LLM's variant slots + UI chips
//
// Tasks not listed (4, 5, 9 — 留言/客訴/hashtag) need no image gen — orchestra
// just runs caption_writer and skips image_director entirely.

export interface OrchestraConfig {
  variants: number;
  /** Number of image style briefs to write (separate from whether we render). */
  images: number;
  /**
   * 2026-05-05 (CJ direction): 30s tier returns style direction text only,
   * no real image generation. The "用此風格生圖" button below each variant
   * lets the user opt into MediaGenFlow when they actually want a render.
   * - false → image_director writes briefs, Flux is NOT called (default 30s)
   * - true  → image_director writes briefs + Flux Schnell renders them
   *
   * 60s tier auto-overrides this to true (real images = key differentiator).
   */
  runImageGen: boolean;
  imageDirectorId: number | null;
  aspectRatio: "1:1" | "1.91:1" | "9:16" | "16:9" | null;
  fluxSize: "square_hd" | "landscape_4_3" | "portrait_9_16" | "landscape_16_9" | null;
  imageQualitySteps: number; // Flux Schnell: 4 default, 8 for higher quality
  variantLabels: string[];
  /** Caption length range hint (chars, lower bound) for prompt + UI badge */
  captionMinChars: number;
  captionMaxChars: number;
  /**
   * 60s tier extras — production-package add-ons that turn a "draft" into
   * "ready-to-publish". Each task picks which extras it wants. Orchestra
   * dispatches the extra agents in parallel after caption is done.
   *
   * Default: undefined → no extras (30s behavior).
   * In 60s tier orchestra auto-fills sensible defaults if config doesn't set.
   */
  extras?: {
    /** N reply templates per variant (e.g. 5 = 5 example user→brand exchanges) */
    replyTemplates?: number;
    /** Algorithmic recommendation of best posting time (uses brand_brain history) */
    postingTime?: boolean;
    /** A 24h-later followup post draft */
    followupPost?: boolean;
    /** Storyboard frames for video tasks (3-6) */
    storyboard?: number;
    /** Highlight cover briefs for IG profile tasks (3-5) */
    highlightCovers?: number;
    /** A/B test pairs (forces 2 of the variants to be A/B opposites) */
    abTestPairs?: boolean;
    /**
     * FB 60s production-package extras (2026-05-06).
     * Multi-post + specialty-role tasks build on the universal extras above.
     */
    /** Multi-post fanout count — caption_writer × N parallel (e.g. 5-day = 5) */
    postsCount?: number;
    /** Strategist runs first; output piped into N parallel writers as anchor */
    narrativeArc?: boolean;
    /** Compare table: original viral post vs adapted brand version (#10) */
    compareTable?: boolean;
    /** Timing advisor: should we post now? (#11 current-events) */
    timingAdvisor?: boolean;
    /** Legal assistant: consent / anonymize check (#12 testimonial) */
    legalAssistant?: boolean;
  };
  /**
   * 60s FB-only — strategist agent runs BEFORE caption_writer to set the
   * narrative structure / theme arc for multi-post tasks. Output is piped
   * into the per-variant caption fanout as an anchor section.
   */
  strategistAgentId?: number;
  /**
   * 60s FB-only — task-specific specialty role (Compare Editor / Timing
   * Advisor / Legal Assistant). Runs in parallel with extras stage.
   */
  specialtyAgentId?: number;
  /**
   * Multi-post task post-type labels (e.g. ["預告 1","預告 2","當日","事後"]
   * for launch-kit). Drives variant labels when extras.postsCount is set.
   */
  postLabels?: string[];
  /**
   * 100s tier — kind of real-time data scout fetches:
   *   viral (default) / festivals / trending / news
   * - festivals: 月曆 / 季度 — scout 抓即將到來的節慶
   * - trending: 時事改寫 / 跟風 — scout 抓目前熱門
   * - news: thought-leadership / quarterly — scout 抓產業最新
   */
  scoutKind?: "viral" | "festivals" | "trending" | "news";
}

const MANDY_ID = 239184; // FB Visual Direction Lead

// 2026-05-05 v2: variants 3 across the board, runImageGen=false for 30s.
// Image briefs are still written by Mandy so users see direction text inside
// each mockup; clicking "用此風格生圖" opens MediaGenFlow on demand.

export const FB_30S_ORCHESTRA: Record<string, OrchestraConfig> = {
  "fb-30-caption-short": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: MANDY_ID,
    aspectRatio: "1:1",
    fluxSize: "square_hd",
    imageQualitySteps: 4,
    variantLabels: ["情感版", "理性版", "數據版"],
    captionMinChars: 100,
    captionMaxChars: 200,
  },
  "fb-30-pure-text-hook": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: MANDY_ID,
    aspectRatio: "1.91:1",
    fluxSize: "landscape_4_3",
    imageQualitySteps: 4,
    variantLabels: ["反問式", "數字式", "反差式"],
    captionMinChars: 30,
    captionMaxChars: 60,
  },
  "fb-30-link-caption": {
    variants: 3,
    images: 1, // alt cover only (in case OG image is bad)
    runImageGen: false,
    imageDirectorId: MANDY_ID,
    aspectRatio: "1.91:1",
    fluxSize: "landscape_4_3",
    imageQualitySteps: 4,
    variantLabels: ["資訊式", "故事式", "問題式"],
    captionMinChars: 80,
    captionMaxChars: 150,
  },
  "fb-30-comment-reply": {
    variants: 3,
    images: 0,
    runImageGen: false,
    imageDirectorId: null,
    aspectRatio: null,
    fluxSize: null,
    imageQualitySteps: 0,
    variantLabels: ["溫暖式", "專業式", "反問式"],
    captionMinChars: 30,
    captionMaxChars: 80,
  },
  "fb-30-crisis-reply-short": {
    variants: 3,
    images: 0,
    runImageGen: false,
    imageDirectorId: null,
    aspectRatio: null,
    fluxSize: null,
    imageQualitySteps: 0,
    variantLabels: ["克制式", "標準式", "具體承諾式"],
    captionMinChars: 80,
    captionMaxChars: 150,
  },
  "fb-30-pinned-short": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: MANDY_ID,
    aspectRatio: "1.91:1",
    fluxSize: "landscape_4_3",
    imageQualitySteps: 8,
    variantLabels: ["功能訴求", "情感訴求", "故事訴求"],
    captionMinChars: 150,
    captionMaxChars: 250,
  },
  "fb-30-story-text": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: MANDY_ID,
    aspectRatio: "9:16",
    fluxSize: "portrait_9_16",
    imageQualitySteps: 4,
    variantLabels: ["驚喜式", "親密式", "教學式"],
    captionMinChars: 30,
    captionMaxChars: 60,
  },
  "fb-30-live-title": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: MANDY_ID,
    aspectRatio: "16:9",
    fluxSize: "landscape_16_9",
    imageQualitySteps: 4,
    variantLabels: ["懸念式", "數據式", "直球式"],
    captionMinChars: 8,
    captionMaxChars: 25,
  },
  "fb-30-hashtag-set": {
    variants: 3,
    images: 0,
    runImageGen: false,
    imageDirectorId: null,
    aspectRatio: null,
    fluxSize: null,
    imageQualitySteps: 0,
    variantLabels: ["曝光導向 (20)", "品牌導向 (8)", "利基導向 (12)"],
    captionMinChars: 0,
    captionMaxChars: 600,
  },
  "fb-30-countdown-1day": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: MANDY_ID,
    aspectRatio: "1:1",
    fluxSize: "square_hd",
    imageQualitySteps: 4,
    variantLabels: ["焦慮式", "FOMO式", "期待式"],
    captionMinChars: 60,
    captionMaxChars: 120,
  },
};

/** Resolve a task id to its orchestra config; null if task isn't Plan-B-ready. */
export function getOrchestraConfig(taskId: string): OrchestraConfig | null {
  return FB_30S_ORCHESTRA[taskId] ?? null;
}

// ─── 60s tier ────────────────────────────────────────────────────────────
// 2026-05-06: Legacy FB_60S_TASKS removed. Canonical 60s pool now lives
// in quickTaskFB60.ts (FB_60S_TASKS_V2) — multi-agent collaboration
// with strategist + caption + image + 5 universal helpers + QA.


// ─── 90s tier — light wrappers around existing squads ──────────────────────
//
// The 90s tier mostly maps to existing FB squads (fb-monthly-calendar,
// fb-event-launch-kit, fb-quarterly-strategy, etc.). These are 5-step
// missions that already run in 5-15 min real-world; "90s" is aspirational.
// We expose them in the quick-task list so users can launch them with the
// same UX as 30s/60s, but execution still uses the existing squad pipeline.
//
// See scripts/seed-fb-additional-squads.ts and seed-fb-calendar-variants.ts
// for the full squad inventory. The list below is the user-facing label map.

export const FB_90S_TASK_INDEX: Array<{
  id: string;
  squad_slug: string;
  postType: string;
  label: string;
  description: string;
}> = [
  { id: "fb-90-monthly-calendar",       squad_slug: "fb-monthly-calendar",       postType: "feed",     label: "FB 完整月曆 30 天", description: "Joe Pulizzi 內容支柱法 + KPI 預估 + pillar 配比" },
  { id: "fb-90-monthly-calendar-promo", squad_slug: "fb-monthly-calendar-product-promo", postType: "feed", label: "FB 月曆（商品促銷）", description: "促銷型內容支柱配比" },
  { id: "fb-90-event-launch",           squad_slug: "fb-event-launch-kit",       postType: "event",    label: "FB 活動上線套組",    description: "GaryVee Jab-Jab-Right-Hook 法" },
  { id: "fb-90-countdown-series",       squad_slug: "fb-countdown-series",       postType: "feed",     label: "FB 倒數活動系列 7-14 天", description: "Cialdini Scarcity 緊迫倒數法" },
  { id: "fb-90-account-reposition",     squad_slug: "fb-account-reposition",     postType: "feed",     label: "FB 帳號重新定位",    description: "Trout & Ries Positioning + Pulizzi Tilt" },
  { id: "fb-90-quarterly-strategy",     squad_slug: "fb-quarterly-strategy",     postType: "feed",     label: "FB 季度策略",        description: "Pulizzi Quarterly Cadence" },
  { id: "fb-90-monthly-analytics",      squad_slug: "fb-monthly-analytics",      postType: "feed",     label: "FB 月度成效報告",    description: "Kaushik Web Analytics 2.0 + Engagement Pyramid" },
  { id: "fb-90-carousel-10frame",       squad_slug: "fb-carousel",               postType: "carousel", label: "FB Carousel 10 卡完整敘事", description: "Hook-Build-Turn-Payoff 完整弧" },
  { id: "fb-90-reels-full",             squad_slug: "fb-reels-script",           postType: "reel",     label: "FB Reels 完整腳本",  description: "Hook-Hold-Payoff（含分鏡 + 配樂方向）" },
  { id: "fb-90-livestream-suite",       squad_slug: "fb-livestream-prep",        postType: "feed",     label: "FB 直播完整套組",    description: "預告 + 摘要 + 轉錄重點剪（成對敘事）" },
  { id: "fb-90-crisis-full",            squad_slug: "fb-crisis-comms",           postType: "comment",  label: "FB 完整危機公關",    description: "Lagadec 4 段 + 後續追蹤 + 媒體聲明" },
];

/** Helper: get all FB tasks across tiers in a single list.
 *  2026-05-06: legacy FB_60S_TASKS removed from this list — new
 *  FB_60S_TASKS_V2 (in quickTaskFB60.ts) is the canonical 60s pool with
 *  multi-agent collaboration. Router merges FB60V2 separately. */
export function listAllFBTasks() {
  return [
    ...FB_30S_TASKS.map(t => ({ ...t, kind: "fast" as const })),
    ...FB_90S_TASK_INDEX.map(t => ({
      id: t.id,
      tier: "90s" as const,
      postType: t.postType,
      label: t.label,
      description: t.description,
      kind: "squad" as const,
      squad_slug: t.squad_slug,
    })),
  ];
}
