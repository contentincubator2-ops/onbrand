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

import type { TaskSource } from "./taskSource";

/**
 * 2026-05-11 — `DerivePath` describes WHERE an input's value can be
 * pulled from the brand context (so the modal doesn't ask users for
 * data the system already has).
 *
 * Dot-path syntax against the resolved brand context object:
 *   brand.name
 *   brand.industry
 *   brand.positioning.audience.primary
 *   brand.positioning.competition.direct  (array of { name, position, ... })
 *   brand.positioning.differentiation.summary
 *   brand.positioning.goldenCircle.why
 *   product.positioning.coreStatement
 *   event.positioning.smp.singleMindedProposition
 *
 * `mode` controls the modal behaviour when a derived value is found:
 *   auto    — skip the prompt entirely, use the derived value silently
 *   confirm — pre-fill the field, let the user edit or confirm
 *   ask     — still ask, but show the derived value as a hint
 */
export type DerivePath = string;
export interface InputDerive {
  from: DerivePath[];
  mode: "auto" | "confirm" | "ask";
  /** Optional template for shaping the derived raw value into a string
   *  the user / LLM will see. e.g., for an array of competitor objects
   *  → "屈臣氏、86 小舖、Watsons". Implemented as a registry of shapers
   *  keyed by the last segment of the first `from` path. */
  shape?: "auto" | "list-names" | "summary";
}

export interface TaskInput {
  key: string;
  label: string;
  type: "text" | "textarea";
  required: boolean;
  placeholder?: string;
  /** 2026-05-11 — if this input is derivable from brand positioning, the
   *  intake modal will pre-fill or skip it. See InputDerive comment. */
  derive?: InputDerive;
}

/**
 * Meta 的廣告格式。就這四種 —— 來源是 facebook.com/business/ads-guide 的
 * 導覽列，不是我們歸納的。
 *
 * 「即時體驗」（Instant Experience）刻意不列：它是點擊後的全螢幕著陸體驗，
 * 包在上面四種之外，不是並列的第五種格式。
 */
export type AdFormat = "image" | "video" | "carousel" | "collection";

export interface FBTaskTemplate {
  id: string;                              // e.g. "fb-30-caption-short"
  tier: "30s" | "60s" | "90s" | "99s";
  postType: string;                        // matches mockup format key
  /**
   * Display label. Legacy form was a single string. 2026-05-11 introduced
   * structured form { en, zh } so the bilingual title can stay in sync —
   * UI renders { en, zh } as "English · 中文" without manual concatenation.
   * Legacy string still supported during migration.
   */
  label: string | { en: string; zh: string };
  /** 1-line UI hint. 2026-07-18 多市場: bilingual like label. */
  description: string | { en: string; zh: string };
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
  /**
   * 2026-09-05 — 這張卡的結構「憑什麼這樣寫」。分類與規則見 taskSource.ts；
   * 顯示名在 client/src/v2/lib/sourceVocabulary.ts。
   *
   * 未標記 = 長青公式（平台通則），那是誠實的預設值，不需要出處。
   * 標成 award / benchmark / viral / brand-method 就必須說得出具體來源 ——
   * 卡片會把它印在 pill 上，答不出來比不標更傷。
   */
  source?: TaskSource;
  /**
   * 2026-09-11 (CJ「還是沒有直接打開，就可以看到那些廣告形式的文字」)
   *
   * 這張廣告卡產出的東西可以用在 Meta 的哪幾種廣告格式。
   *
   * ── 為什麼是屬性而不是分類 ───────────────────────────────────────
   * Meta 的廣告格式只有四種（圖像／影片／輪播／精選集，見 ads-guide 導覽列），
   * 但我們的 6 張廣告卡全部是**欄位卡**：標題、主要文字、說明、行動呼籲。
   * 一組標題四種格式都能用 —— 它不屬於任何一種格式，而是跨全部。
   *
   * 所以格式不能當 pill 分類（那會變成三個空分類，違反「開分類要出得了貨」），
   * 但它應該印在卡片上，因為使用者打開頁面時要看得到 Meta 的用語。
   * 只有真的綁定單一格式的卡才會只填一個（例如一鏡到底腳本＝影片）。
   *
   * 識別碼用英文，顯示名在 client/src/v2/content/lib/taskFormats.ts ——
   * 與 taskSource / tierVocabulary 同一套分工：識別碼永不改名，顯示名隨時
   * 可改而且只改一個地方。
   */
  adFormats?: AdFormat[];
  primary_question?: string;
  primary_input?: { key: string; placeholder?: string; type: "text" | "textarea"; derive?: InputDerive };
  inputs: TaskInput[];
  /**
   * 2026-05-11 — declarative list of brand-context paths the task
   * implicitly reads (in addition to per-input `derive`). Drives the
   * "我會用 X 來跑這個任務" confirmation strip in the modal.
   */
  contextSources?: DerivePath[];
  systemPrompt: string;                    // task-specific instruction, appended AFTER agent persona
  // 2026-05-16: added "anthropic" | "openai" so zh-TW tasks (e.g. KOL)
  // can pin a non-Chinese provider explicitly. aiModelToProvider still
  // overrides when the assigned agent has an aiModel.
  preferredModel: "qwen" | "zhipu" | "azure-foundry" | "azure-position" | "hermes" | "anthropic" | "openai" | "any";
  /** maxTokens cap — 30s aim ~400, 60s ~900, 90s ~1800 */
  maxTokens: number;
  /** Default platform & post_type the quickTask output should embed.
   * Widened 2026-05-05 to support IG / Threads / etc. as channel rollout
   * progresses (see project_30s_task_sop.md). */
  outputDefaults: {
    // 2026-08-29 官網頻道 (web-)：mission_outputs.platform 的 enum 沒有 "web"，
    // recordTaskRun 的 SAFE_PLATFORMS 會把未知值降級成 "other"（能寫入，但
    // 丟失語意）。"doc" 在 enum 值域內且語意正確，所以官網長文用它。
    // mockup 不靠這個欄位 —— RunPage Layer 1 由 taskId 前綴決定。
    platform: "facebook" | "instagram" | "threads" | "linkedin" | "tiktok" | "youtube" | "email" | "press" | "doc" | "generic";
    post_type: string;
  };
  /**
   * 2026-05-16 (CJ「KOL Brief 完全不符標準 — 還是被改寫成貼文」):
   * "document" tasks (structured brief / spec / doc) must NOT go
   * through the social-caption scaffolding (台灣社群 master persona +
   * 「主角必須是輸入內容」+ 貼文格式規則) which forces the model to
   * rewrite input into a FB post. When set, the orchestra builds a
   * lean doc-oriented prompt where template.systemPrompt is dominant
   * and the caption field carries the full Markdown document verbatim.
   * Defaults to social when omitted.
   */
  outputMode?: "social" | "document";
  /**
   * 2026-09-01：給「AI 潤稿」用的任務知識。
   *
   * polishInput 只拿得到 buildBrandPrefix(..., "core")，那份 digest 沒有任何
   * 任務專屬的領域知識。結果是它為五感十築的貼文卡問出「對應十築建築標準中
   * 的哪一項？（例如：光線、通風、材質、空間機能、人文連結…）」——
   * 這五個沒有一個是真的十築標準，全是模型自己編的。
   *
   * 這裡放「潤稿時必須知道的事實清單」，不放輸出格式規則（那是 systemPrompt
   * 的事，而且太長）。
   */
  polishHint?: string;
}

/**
 * 2026-05-11 — resolve a structured-or-string label to the active locale.
 * For now we always render zh; en is shown as a small subtitle in the
 * modal header so the bilingual semantics stay visible without doubling
 * the chip label width.
 */
export function labelZh(t: FBTaskTemplate): string {
  return typeof t.label === "string" ? t.label : t.label.zh;
}
export function labelEn(t: FBTaskTemplate): string | null {
  if (typeof t.label === "string") {
    // Legacy: pull the first ASCII run as the EN candidate, e.g.
    // "FB 30 天內容月曆" → null (no leading EN), "User Research 競品..." → "User Research".
    const m = t.label.match(/^[A-Za-z][A-Za-z0-9 \-/]+(?=\s|$)/);
    return m ? m[0].trim() : null;
  }
  return t.label.en;
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
    label: { en: "FB Short Post", zh: "FB 短貼文" },
    description: { en: "100-200-word post with an opening hook + CTA", zh: "100-200 字圖文貼文，含開場吸引句 + 行動呼籲" },
    agent_id: 30020,              // Iris Yi — Social Media Manager (2001 char persona)
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
    label: { en: "FB Text-Only Openers ×3", zh: "FB 純文字開場句 3 種" },
    description: { en: "3 openers in different voices, spliced onto your existing draft", zh: "3 種不同口吻的開場句，自動接上你原本的貼文內容" },
    agent_id: 224079,             // Kavitha Nair — Social Media Strategist (1191 char)
    skill_slug: "hook-writing",
    primary_question: "貼上你原本要發的貼文 / 文章內容，我會幫你寫 5 種不同口吻的開場接上去",
    primary_input: { key: "article_body", placeholder: "貼上完整的貼文內文（hook 會接在最前面）", type: "textarea" },
    inputs: [
      { key: "article_body", label: "原本的貼文內容", type: "textarea", required: true },
    ],
    // 2026-05-18 (CJ「呈現時一併整理原文格式與邏輯，讓原文跟標題相符」):
    // was hook-only + verbatim body append (body 跟 hook 常不搭、又一大坨).
    // Now output a COMPLETE post: hook + a re-structured body in the same
    // angle/tone. All facts preserved, nothing invented.
    systemPrompt: `任務：用戶在「原本的貼文內容」提供要發布的內文（可能很亂、是一大段）。
請輸出「一篇可以直接發的完整 FB 貼文」= 開場 hook ＋ 整理過的內文。

每個 variant.caption = 完整貼文（不是只有 hook）：
1. 開場 hook（1–2 句，該變體的口吻）。
2. 緊接「重新整理過的內文」：
   - 保留「原本的貼文內容」的**所有事實、數字、名稱、論點**——不可新增、不可刪改事實、不可杜撰。
   - 但**應該**重排順序、分段、刪冗詞，讓邏輯通順。
   - 內文切角與語氣要**呼應這個 hook**（hook 問什麼內文就回答什麼；hook 講反差內文就把反差講清楚）——讓「標題與原文相符」。
   - 排版易讀：短段落、必要時條列；不要一整坨。
口吻分別：反問式 / 數字式 / 反差式（依 Plan B 強制規則的順序）。
caption 就是最終要發的貼文本身，不要寫「hook：」「內文：」標籤、不要解釋。
${FB_TONE_SUFFIX}`,
    preferredModel: "qwen",
    maxTokens: 600,
    outputDefaults: { platform: "facebook", post_type: "feed" },
  },
  {
    id: "fb-30-link-caption",
    tier: "30s",
    postType: "feed",
    label: { en: "FB Link Post", zh: "FB 連結貼文" },
    description: { en: "Intro copy for link shares (with OG-preview anticipation)", zh: "分享網址時的引言文（含 OG 預覽期待）" },
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
    label: { en: "FB Comment Reply (General)", zh: "FB 留言回覆（一般）" },
    description: { en: "On-brand replies to positive / neutral comments", zh: "正面 / 中性留言的品牌回覆" },
    agent_id: 180162,             // Jason Peng | Social Media Copywriter
    skill_slug: "social-copy",
    primary_question: "貼上原始用戶留言，或留言所在的貼文連結",
    primary_input: { key: "user_comment", placeholder: "用戶說了什麼？整段留言貼進來", type: "textarea" },
    inputs: [
      { key: "user_comment", label: "用戶留言", type: "textarea", required: true },
      { key: "tone", label: "回覆口吻（溫暖 / 專業 / 活潑）", type: "text", required: false, placeholder: "warm" },
    ],
    systemPrompt: `產出 FB 商家對用戶留言的回覆（30-80 字）。
規則：先呼應對方訊息 → 再給 1 個有溫度的小細節 → 結尾留「下次再聊」式邀請而非結束。
不要 "感謝您的支持！" 罐頭。
output: caption 放回覆文，description 放原始用戶留言（用於 mockup 顯示）。`,
    preferredModel: "qwen",
    maxTokens: 300,
    outputDefaults: { platform: "facebook", post_type: "comment" },
  },
  // FB Ad Asset tasks — replace 危機/客訴回覆 (P0 risk per CJ QA, 2026-05-06).
  // LLM has high variance on crisis comms (real reputational risk if mis-fire).
  // Ad asset tasks are safer + LLM strength: produce N differentiated options.
  {
    id: "fb-30-ad-headline",
    tier: "30s",
    postType: "ad",
    label: { en: "FB Ad Headlines ×5", zh: "FB 廣告標題 5 種" },
    adFormats: ["image", "video", "carousel", "collection"],

    description: { en: "5 ad headlines from different angles (under 25 chars) — paste straight into Ads Manager", zh: "5 種切角的廣告標題（25 字內），直接複製到 Ads Manager 用" },
    agent_id: 239023,             // Ellis Yeh — VP Breakthrough Advertising（Eugene Schwartz headline 大師）
    skill_slug: "fb-ad-copy",
    primary_question: "這檔廣告主推什麼？產品 / 賣點 / 受眾簡述",
    primary_input: { key: "product_focus", placeholder: "例：母親節健力餐高蛋白系列，給沒時間煮飯的職業媽媽", type: "textarea" },
    inputs: [
      { key: "product_focus", label: "產品 / 賣點 / 受眾", type: "textarea", required: true },
    ],
    // 2026-05-18 (CJ「寫 5 種但只看到一種」): was variants:1 cramming
    // 5 headlines into one caption. Now 1 headline PER variant → 5
    // pills you can compare/switch.
    systemPrompt: `產出「一個」FB 廣告 headline（這次只寫這一個變體）。25 字以內、有 hook、口語感、不要官腔、不要編號。
依本變體的切角（variantLabel）下手，五種切角各自的精神：
- 痛點挑戰式：戳中受眾最煩的那件事。
- 數據驚奇式：用一個具體數字 / 反差當主角。
- 反問引發式：一個讓人停下滑動的問句。
- 情境共鳴式：描述用戶真實生活場景的一句。
- 結果承諾式：明確、可信的利益承諾。
caption 欄位就放這「一個」headline 本身，不要解釋、不要前綴。
輸入籠統或資訊不足時：**照樣產出**——用品牌定位與常識補足合理假設，寫出通用但有力的 headline。**絕對不要**反問、要求澄清、說明資訊不足；caption 出現任何非 headline 的內容都算錯誤。${FB_TONE_SUFFIX}`,
    preferredModel: "qwen",
    maxTokens: 120,
    outputDefaults: { platform: "facebook", post_type: "ad" },
  },
  {
    id: "fb-30-ad-primary",
    tier: "30s",
    postType: "ad",
    label: { en: "FB Ad Primary Text ×5", zh: "FB 廣告主要文字 5 種" },
    adFormats: ["image", "video", "carousel", "collection"],

    description: { en: "5 primary texts in different voices (80-150 words) for different audience psychologies", zh: "5 種口吻的廣告主要文字（80-150 字），對應不同受眾心理" },
    agent_id: 224114,             // Bùi Thị Thu — Social Media Strategist eCommerce (1160 char)
    skill_slug: "fb-ad-copy",
    primary_question: "這檔廣告的主題 / 產品 / 受眾？",
    primary_input: { key: "topic", placeholder: "例：健力餐母親節組合，職業媽媽 35-50 歲", type: "textarea" },
    inputs: [
      { key: "topic", label: "主題 / 產品 / 受眾", type: "textarea", required: true },
    ],
    // 2026-05-18 (CJ「寫 5 種只給一種、還有 \\n\\n」): was variants:1
    // cramming 5 into one caption. Now 1 primary text PER variant.
    systemPrompt: `產出「一個」FB 廣告 primary text（這次只寫這一個變體，80–150 字）。
依本變體切角（variantLabel），五種版本各自精神：
- 故事式：用一個具體場景/小故事開場帶出產品。
- 數據式：用一個具體數字/反差當主軸。
- 反差式：用前後對照凸顯改變。
- 見證式：用第三人稱描述某位用戶的真實體驗。
- 簡短直球式：最短、最直接，直接講利益＋CTA。
要有自己的 hook → body → CTA。
**換行用真正的換行（直接按 Enter 斷行/分段），絕對不要輸出「\\n」這種字面符號。**
caption 欄位就放這「一個」primary text 本身，不要編號、不要用 --- 分隔、不要解釋。${FB_TONE_SUFFIX}`,
    preferredModel: "qwen",
    maxTokens: 400,
    outputDefaults: { platform: "facebook", post_type: "ad" },
  },
  {
    id: "fb-30-ad-cta",
    tier: "30s",
    postType: "ad",
    label: { en: "FB Ad CTAs ×5", zh: "FB 廣告行動呼籲 5 種" },
    adFormats: ["image", "video", "carousel", "collection"],

    description: { en: "5 CTA button texts + when to use each", zh: "5 個 CTA 按鈕文字 + 每個 CTA 的搭配情境建議" },
    agent_id: 239024,             // Emerson Huang — VP Customer Value Optimization（funnel CTA）
    skill_slug: "fb-ad-copy",
    // 2026-05-18 (CJ「只給一個但承諾五個 + 需要產品與動作才寫得有意義」):
    // variants 1→5 (one CTA per variant). 30s 表單只送一個 input → 用單
    // 一 textarea 同時收「要推的產品 + 想引導的動作」。
    primary_question: "要推的產品/服務 + 想引導用戶做什麼動作？",
    primary_input: { key: "context", placeholder: "例：SoWork AI 諮詢預約系統，想引導潛在客戶『預約 demo』", type: "textarea" },
    inputs: [
      { key: "context", label: "要推的產品/服務 + 想引導的動作", type: "textarea", required: true },
    ],
    systemPrompt: `根據用戶提供的「產品/服務 + 想引導的動作」，產出「一個」FB 廣告 CTA。
依本變體的 CTA 風格（variantLabel）：
- 急迫感：扣限時/數量/名額。
- 利益強調：點出按下去馬上得到什麼。
- 軟性邀請：試/看/體驗，低承諾。
- 對話感：聊聊/談談，像找人說話。
- 直接動作：購買/加入/預約，乾脆。
輸出格式：第一行＝CTA 按鈕文字（6–12 字，貼合該產品與動作，不要泛用「了解更多」）；第二行＝「適合：<一句搭配情境>」。
不要編號、不要解釋。${FB_TONE_SUFFIX}`,
    preferredModel: "qwen",
    maxTokens: 150,
    outputDefaults: { platform: "facebook", post_type: "ad" },
  },
  {
    id: "fb-30-ad-description",
    tier: "30s",
    postType: "ad",
    label: { en: "FB Link-Ad Descriptions ×5", zh: "FB 廣告說明 5 種（連結廣告）" },
    // 精選集沒有「說明」這一欄，所以只列三種。
    adFormats: ["image", "video", "carousel"],

    description: { en: "Link-ad description (under 30 chars), 5 angles", zh: "連結廣告的「說明」欄（30 字內），5 種切入角度" },
    agent_id: 224054,             // Mei Xin Ho — Social Media Strategist Health SG (1148 char)
    skill_slug: "fb-ad-copy",
    primary_question: "連結要導向哪？產品頁 / 活動頁 / 文章 / app 下載？",
    primary_input: { key: "link_purpose", placeholder: "例：導到健力餐 14 包組合產品頁", type: "textarea" },
    inputs: [
      { key: "link_purpose", label: "連結目的 / 著陸頁主題", type: "textarea", required: true },
    ],
    // 2026-05-18 (CJ「只給一個但承諾五個」): variants 1→5, one per variant.
    systemPrompt: `產出「一個」FB 連結廣告 description（30 字內），依本變體切角（variantLabel）：
- 數據：價格/數量/時效。
- 利益強調：點進去得到什麼。
- 信任強化：保固/評價/背書。
- 急迫感：限時/限量。
- 簡短直白：最短、最直接。
緊扣用戶提供的著陸頁主題，不要泛用。只輸出這一句 description，不要編號、不要解釋。${FB_TONE_SUFFIX}`,
    preferredModel: "qwen",
    maxTokens: 90,
    outputDefaults: { platform: "facebook", post_type: "ad" },
  },
  {
    id: "fb-30-pinned-short",
    tier: "30s",
    postType: "pinned",
    label: { en: "FB Pinned-Post Short Copy", zh: "FB 置頂貼文短文案" },
    description: { en: "Pinned-post copy: who we are + why follow us", zh: "粉專置頂用，講清楚「我們是誰」「為什麼追蹤」" },
    agent_id: 60024,             // Jason Gong | Tech Brand Social Copywriter
    skill_slug: "fb-copywriting",
    primary_question: "想讓第一次來粉專的人，3 秒內知道你做什麼？",
    primary_input: { key: "brand_focus", placeholder: "我們是誰、做什麼、為什麼值得追蹤", type: "textarea" },
    inputs: [
      { key: "brand_focus", label: "想讓新訪客知道什麼？", type: "textarea", required: true },
    ],
    systemPrompt: `產出 FB 置頂貼文文案（150-250 字）。
結構：① 1 句強烈定位（我們在做什麼，誰受惠）② 3 個具體價值點（用 emoji 條列）③ CTA 引導追蹤 / 點連結。
置頂會留很久，文案不要寫時效性內容（"最新"、"本月" 都不要）。
另外給配圖 style_direction.summary。`,
    preferredModel: "qwen",
    maxTokens: 500,
    outputDefaults: { platform: "facebook", post_type: "pinned" },
  },
  {
    id: "fb-30-story-text",
    tier: "30s",
    postType: "story",
    label: { en: "FB Story Copy", zh: "FB 限時動態文案" },
    description: { en: "9:16 ephemeral copy + overlay headline", zh: "9:16 ephemeral 配文 + overlay 主標" },
    agent_id: 30002,              // Sarah Liu — AI Brand Story CMO
    skill_slug: "fb-copywriting",
    primary_question: "今天的 Story 想說什麼？",
    primary_input: { key: "topic", placeholder: "例：幕後花絮 / 限時優惠 / 提問 sticker", type: "textarea" },
    inputs: [
      { key: "topic", label: "限時動態想傳達什麼", type: "textarea", required: true },
    ],
    // 2026-05-18 (CJ「FB 限時動態文案任務沒有產出文字」): orchestra 只抽
    // caption 欄位，title/image_style_direction 會被丟掉或污染 caption。
    // 改成只回乾淨 JSON {caption}，caption 內第一行就是 5-8 字主標、
    // 換行後接 Story 文，全部疊圖呈現，確保一定有文字產出。
    systemPrompt: `產出 1 則 FB 限時動態文案，只輸出 JSON：{"caption":"<主標>\\n<Story文>"}
規則：
- 第 1 行 = 5-8 字 overlay 主標（強鉤、可單獨成立）
- 換行後 = Story 文 30-60 字，口語、快速吸睛即拋，不要長段、不要 hashtag
- caption 以外不要任何欄位、不要解釋、不要 markdown 圍欄`,
    preferredModel: "qwen",
    maxTokens: 300,
    outputDefaults: { platform: "facebook", post_type: "story" },
  },
  {
    id: "fb-30-live-title",
    tier: "30s",
    postType: "feed", // pre-live announcement post is feed-shaped
    label: { en: "FB Live Title + Teaser", zh: "FB 直播標題 + 預告短文" },
    description: { en: "Teaser caption for 1-2 hours before going live", zh: "直播開始前 1-2 小時的預告 caption" },
    agent_id: 180150,             // Brian Lin — Influencer Marketing Manager (live promotion expert)
    skill_slug: "social-copy",
    // 2026-05-18 (CJ「直播一開始的問題，是否也要提示要提供直播時間」):
    // 30s 表單只送單一 primary input，原本 inputs[] 的 live_time 永遠
    // 收不到 → 預告文沒有時間（直播預告沒時間等於沒用）。把時間併進
    // 同一個 textarea 引導，prompt 從中解析；沒給時間就留明確佔位。
    primary_question: "直播主題 + 直播時間？",
    primary_input: {
      key: "live_topic",
      placeholder: "例：新品開箱實測 ｜ 今晚 8:00 直播（沒定時間可先不填，預告文會留時間待補欄位）",
      type: "textarea",
    },
    inputs: [
      { key: "live_topic", label: "直播主題 + 時間", type: "textarea", required: true },
    ],
    systemPrompt: `產出 FB 直播預告貼文。輸入內含直播主題，可能也含直播時間（如「今晚 8:00」「5/20 20:00」）。
output: title 放 8-15 字直播標題（具體有 hook，不要 "今晚直播"） / caption 放 80-150 字預告文（為什麼要看 + 會講什麼 + 明確點出直播時間 + 呼籲開鈴鐺）。
規則：
- 輸入有給時間 → 預告文必須清楚寫出該時間
- 輸入沒給時間 → 在預告文時間位置寫「⏰ 直播時間：[請補上]」，不要自行編造時間
- 不要承諾不確定的內容。`,
    preferredModel: "qwen",
    maxTokens: 400,
    outputDefaults: { platform: "facebook", post_type: "feed" },
  },
  {
    id: "fb-30-hashtag-set",
    tier: "30s",
    postType: "feed",
    label: { en: "FB Hashtag Set", zh: "FB 主題標籤建議組" },
    description: { en: "10-15 tiered hashtags (core / mid / long-tail)", zh: "10-15 個分層 hashtag（核心 / 中型 / 長尾）" },
    agent_id: 220583,             // Hsin-Yi Weng — IG/FB Marketing Specialist（hashtag 在地化）
    skill_slug: "fb-best-practices",
    primary_question: "貼文主題或品牌產業是？",
    primary_input: { key: "topic", placeholder: "例：手沖咖啡 / B2B SaaS / 母嬰用品", type: "textarea" },
    inputs: [
      { key: "topic", label: "貼文主題 / 產業", type: "textarea", required: true },
    ],
    // 2026-08-12 (bug checklist C5「應產出10-15個分層hashtag，但實際產出一般
    // 貼文文案，完全沒有任何hashtag」): the old prompt asked for a SEPARATE
    // hashtags[] array + a one-sentence caption — a two-field split the model
    // unreliably followed, often defaulting to writing a normal FB post into
    // caption instead. ig-30-hashtag-set / tt-30-hashtag-set never had this
    // bug because they use a simpler, proven design: caption directly LISTS
    // the hashtags. Align FB to that same working pattern instead of relying
    // on the fragile split.
    systemPrompt: `產出 10-15 個 FB 適用的 hashtag（FB 不像 IG，不要 #海，但仍可加）。
分層：① 3-5 個品牌/核心 ② 3-5 個產業中型 ③ 3-5 個長尾或活動性。
caption 直接列出這 10-15 個 hashtag 本身（每個 # 前綴 + 空格分隔，依三個分層換行並各加一句簡短說明）。
【嚴格格式】caption 每一行只能是「# 開頭的標籤 + 空格分隔」或分層說明短句，絕對不要寫成一段抒情、敘事或行銷文案（例如不要寫「每個早晨都值得一杯好咖啡…」這種完整段落）——這個任務的產出就是標籤本身，不是貼文。每個 # 後面緊接標籤文字、中間不能有空格（例如 #艾莉詩 是對的，# 艾莉詩 是錯的，因為有空格的話在 FB 上不會變成可點擊的標籤）。`,
    preferredModel: "qwen",
    maxTokens: 250,
    outputDefaults: { platform: "facebook", post_type: "feed" },
  },
  {
    id: "fb-30-countdown-1day",
    tier: "30s",
    postType: "feed",
    label: { en: "FB Event-Countdown Hype Line", zh: "FB 活動倒數一句造勢" },
    description: { en: "A single N-days-left countdown post (one in a series)", zh: "倒數 N 天的單篇推文（系列中的一篇）" },
    agent_id: 180159,             // Claire Hsu — fb-countdown-series lead
    skill_slug: "social-media-manager",
    // 2026-05-10 (CJ audit B-01 fix): 原本 inputs 有 2 個 required 欄位
    // (event_name + days_left)，但 UI 只 render primary_input 那一個 →
    // 後端 validation 永遠失敗。改成單一 textarea 讓用戶一起輸入。
    primary_question: "活動名稱 + 還剩幾天？（一起寫）",
    primary_input: { key: "event_context", placeholder: "例：週年慶剩 3 天 / 新品上市倒數 7 天", type: "textarea" },
    inputs: [
      { key: "event_context", label: "活動 + 倒數天數", type: "textarea", required: true },
    ],
    systemPrompt: `產出 FB 活動倒數系列其中一篇（80-130 字）。
從用戶輸入解析「活動名稱」+「剩幾天」自動套用。
規則：① 開頭凸顯天數（用數字 + emoji） ② 中間放 1 個尚未公開的小細節 / 倒數獨家 ③ 最後 CTA。
不要每天都用一樣的 "倒數X天" 結構，要有變化。
配圖 style_direction.summary 給 1 句倒數視覺風格。`,
    preferredModel: "qwen",
    maxTokens: 350,
    outputDefaults: { platform: "facebook", post_type: "feed" },
  },

  // ── 爆款結構卡（2026-09-05）─────────────────────────────────────────
  // 每張的 source 都帶 metric + asOf：爆款的證據是傳播數字，而數字會過期，
  // 所以 validateTaskSource 對 viral 強制要求「傳了多少」與「什麼時候量的」。
  // agent_id / skill_slug 一律沿用同 postType 現役卡在生產環境用的組合。
  {
    id: "fb-30-ad-viral-monologue",
    tier: "30s",
    postType: "ad",
    label: { en: "Self-Roast Ad Monologue", zh: "FB 廣告：一鏡到底自嘲腳本" },
    // 唯一綁定單一格式的廣告卡 —— 它產出的是影片腳本。
    adFormats: ["video"],

    description: { en: "Opens with your own worst review", zh: "用自家最常被嫌的那一點開場" },
    agent_id: 224114,              // Ivy Kuo — FB Ad Copy
    skill_slug: "fb-ad-copy",
    source: {
      type: "viral",
      short: "Dollar Shave Club",
      metric: "48 小時 12,000 筆訂單，首小時官網被灌爆",
      asOf: "2012-03",
      takeaway:
        "開場先講自己最弱的地方，觀眾就沒有理由關掉——自嘲買到的是信任，不是笑聲。",
    },
    primary_question: "這支廣告要賣什麼？你最常被嫌的是哪一點？",
    primary_input: { key: "topic", placeholder: "例：訂閱制刮鬍刀 / 常被嫌「便宜的一定不好用」", type: "textarea" },
    inputs: [
      { key: "topic", label: "產品 + 最常被嫌的一點", type: "textarea", required: true },
    ],
    systemPrompt: `你要寫的是一支「一鏡到底、由品牌自己人對著鏡頭講完」的 FB 廣告腳本。

結構（照順序，不要跳）：
1. 第一句就講出這個產品最常被嫌的那一點，用對方會講的原話，不要美化。
2. 承認它——不要辯解、不要「但是我們其實」。承認完才有下一步。
3. 用一個具體到不像行銷的細節，解釋為什麼你們仍然這樣做。
4. 收在一個「你可以現在就試」的動作，語氣是邀請不是命令。

硬規則：
- 全篇第一人稱，像一個人在講話，不是旁白。
- 禁止形容詞堆疊（頂級／極致／完美／領先）。一個都不要。
- 禁止「我們相信」「我們致力於」這類品牌腔。
- 150-350 字，能被一口氣念完。`,
    preferredModel: "qwen",
    maxTokens: 600,
    outputDefaults: { platform: "facebook", post_type: "ad" },
  },
  {
    id: "fb-30-reel-self-roast",
    tier: "30s",
    postType: "reel",
    label: { en: "Reel: Act Out the Bad Review", zh: "FB Reels：把負評演出來" },
    description: { en: "Short-video script built from real complaints", zh: "拿客訴原句當台詞的短影音腳本" },
    agent_id: 60033,              // 沿用短影音腳本 agent
    skill_slug: "short-video-script",
    source: {
      type: "viral",
      short: "Ryanair 自嘲短影音",
      metric: "單月 16 支影片近 3,000 萬次觀看",
      asOf: "2022-08",
      takeaway:
        "把客訴原句當台詞念出來，品牌站在觀眾那一邊，抱怨就變成素材。",
    },
    primary_question: "你最常收到的抱怨是哪一句？（原句照貼，不要修飾）",
    primary_input: { key: "topic", placeholder: "例：「你們的座位真的很窄」／「排隊排超久」", type: "textarea" },
    inputs: [
      { key: "topic", label: "最常收到的抱怨原句", type: "textarea", required: true },
    ],
    systemPrompt: `你要寫一支 15-25 秒的直式短影音腳本，主題是「把用戶對我們的抱怨演出來」。

結構：
1. 前 2 秒：把抱怨原句原封不動打成字卡，一個字都不要改。
2. 中段：品牌方（人或吉祥物）當場承認，而且演得比抱怨的人還誇張。
3. 收尾：給一個真的能解決或真的沒打算解決的答案——都可以，但要誠實。

硬規則：
- 逐鏡輸出，每一鏡標秒數、畫面、字卡文字。
- 字卡每行不超過 12 字。
- 不要出現「我們深感抱歉」這種公關語言，那會殺掉整支片。
- 不要為了好笑而扭曲事實；抱怨是真的，回答也要是真的。`,
    preferredModel: "qwen",
    maxTokens: 700,
    outputDefaults: { platform: "facebook", post_type: "reel" },
  },
  {
    id: "fb-30-carousel-data-recap",
    tier: "30s",
    postType: "carousel",
    label: { en: "Carousel: Data as a Shareable Scorecard", zh: "FB 多卡：把數據變成想分享的成績單" },
    description: { en: "One number per card, last card is the flex", zh: "一張卡一個數字，最後一張讓人想貼出去" },
    agent_id: 180148,              // 沿用 fb-99-carousel-5 的 agent
    skill_slug: "social-copy",
    source: {
      type: "viral",
      short: "Spotify Wrapped",
      metric: "24 小時 2 億人參與、逾 6.3 億次分享",
      asOf: "2025-12",
      takeaway:
        "一張卡只放一個數字，而且那個數字要是「關於他的」——人分享的是自己，不是你的品牌。",
    },
    primary_question: "你手上有哪些關於「這位顧客自己」的數字？",
    primary_input: { key: "topic", placeholder: "例：他今年回購 7 次 / 使用總時數 / 會員第幾天", type: "textarea" },
    inputs: [
      { key: "topic", label: "可以講給單一顧客聽的數字", type: "textarea", required: true },
    ],
    systemPrompt: `你要產出一組 5 張的 FB 多卡輪播文案，把數據變成使用者「想貼出去」的成績單。

每一張卡的規格：
- 只放一個數字，配一句不超過 15 字的說明。
- 那個數字必須是關於「這位使用者自己」的，不是品牌的總量。
  （「你今年回購 7 次」可以；「我們賣出 300 萬瓶」不行。）
- 第 1 張要讓人願意往右滑：先給一個他猜不到的數字。
- 第 5 張是可以被截圖分享的總結，要有一句他會想引用的話。

硬規則：
- 逐張輸出，標明第幾張。
- 沒有拿到的數字就不要編，寧可少一張卡。
- 不要在任何一張卡放促銷或 CTA，那會讓人不想分享。`,
    preferredModel: "qwen",
    maxTokens: 900,
    outputDefaults: { platform: "facebook", post_type: "carousel" },
  },
  {
    id: "fb-30-album-period-recap",
    tier: "30s",
    postType: "album",
    label: { en: "Album: Period Recap Set", zh: "FB 相簿：一段期間的回顧圖組" },
    description: { en: "Each image stands alone; together they are proof", zh: "每張各自成立，整組是一段時間的證據" },
    agent_id: 60068,              // 沿用 fb-60-album-4 的 agent
    skill_slug: "social-copy",
    source: {
      type: "viral",
      short: "Spotify Wrapped",
      metric: "24 小時 2 億人參與、逾 6.3 億次分享",
      asOf: "2025-12",
      takeaway:
        "每張圖各自成立、整組合起來才是一段時間的證據；回顧的力氣在「原來累積了這麼多」。",
    },
    primary_question: "要回顧哪一段期間？這段期間發生了什麼？",
    primary_input: { key: "topic", placeholder: "例：開店第一年 / 這一季的新品 / 團隊今年做的事", type: "textarea" },
    inputs: [
      { key: "topic", label: "期間 + 這段期間的事件", type: "textarea", required: true },
    ],
    systemPrompt: `你要寫一組 4 張的 FB 相簿貼文：一段期間的回顧。

規格：
- 主文 100-150 字，說清楚「這是哪一段時間」以及「為什麼現在回頭看」。
- 4 張圖各配一句圖說，每句不超過 25 字。
- 每一句圖說單獨看都要成立（有人只看到第 3 張也要看得懂）。
- 4 句合起來要能看出累積，不是 4 件無關的事。

硬規則：
- 用具體的事件與數字，不要「充實的一年」這種話。
- 沒有提供的事就不要補，寧可只寫 3 張。
- 結尾不要促銷，回顧的說服力來自累積本身。`,
    preferredModel: "qwen",
    maxTokens: 700,
    outputDefaults: { platform: "facebook", post_type: "album" },
  },
  {
    id: "fb-30-story-serial-event",
    tier: "30s",
    postType: "story",
    label: { en: "Story: Serialise One Event", zh: "FB 限時動態：把一件事拆成連續劇" },
    description: { en: "Each frame leaves an unanswered question", zh: "每則留一個過夜的問題" },
    agent_id: 30002,              // Sarah Liu — AI Brand Story CMO
    skill_slug: "fb-copywriting",
    source: {
      type: "viral",
      short: "Duolingo「Duo 之死」",
      metric: "兩週 17 億次自然曝光，吉祥物提及單日增 25,560%",
      asOf: "2025-02",
      takeaway:
        "事件要留一個沒答案的問題過夜，觀眾才有理由回來看下一則。",
    },
    primary_question: "要拆的是哪一件事？它的結局是什麼？",
    primary_input: { key: "topic", placeholder: "例：新店裝修到開幕 / 一支新品從打樣到上架", type: "textarea" },
    inputs: [
      { key: "topic", label: "事件 + 已知的結局", type: "textarea", required: true },
    ],
    systemPrompt: `你要把一件事拆成 5 則連續的 FB 限時動態，一天一則。

每一則的規格：
- 第 1 行是 5-8 字的疊字主標，可以單獨成立。
- 接 30-60 字的內文，口語、即拋。
- 每一則結尾必須留一個「明天才會知道」的問題。最後一則才給答案。

硬規則：
- 逐則輸出，標明第幾天。
- 懸念要是真的（結局確實還沒發生或還沒公布），不要假吊胃口。
- 第 5 則要回答第 1 則丟出的那個問題，不能換一個。
- 不要在中間任何一則放促銷。`,
    preferredModel: "qwen",
    maxTokens: 900,
    outputDefaults: { platform: "facebook", post_type: "story" },
  },
  {
    id: "fb-30-pinned-stance",
    tier: "30s",
    postType: "pinned",
    label: { en: "Pinned: Brand Stance", zh: "FB 置頂：品牌立場宣言" },
    description: { en: "The line you are willing to pay for", zh: "願意付代價的那一句話" },
    agent_id: 60024,              // 沿用 fb-30-pinned-short 的 agent
    skill_slug: "fb-copywriting",
    source: {
      type: "viral",
      short: "Nike × Colin Kaepernick",
      metric: "單日社群聲量 +1,400%、270 萬則品牌提及",
      asOf: "2018-09",
      takeaway:
        "立場要讓一部分人不同意才算立場；置頂的是你願意為它付代價的那句話。",
    },
    primary_question: "你們有什麼主張，是會讓一部分客人不同意的？",
    primary_input: { key: "topic", placeholder: "例：我們不做折扣 / 我們只用台灣種的 / 我們拒接這類案子", type: "textarea" },
    inputs: [
      { key: "topic", label: "會有人不同意的主張", type: "textarea", required: true },
    ],
    systemPrompt: `你要寫一則會被釘在粉專最上面的品牌立場宣言。

結構：
1. 開頭直接講主張，一句話，不鋪陳。
2. 講出這個主張讓你們放棄了什麼——具體到可以被查證（少賺的生意、拒絕的合作、變慢的出貨）。
3. 講出為什麼仍然這樣做，用一件具體發生過的事，不要用理念。
4. 收在一句可以被引用的話。

硬規則：
- 必須有人會不同意。如果整篇讀起來人人都會點頭，那不是立場，重寫。
- 禁止「我們相信」「我們堅持」開頭。用做過的事代替。
- 不要提到競爭對手。
- 180-350 字。`,
    preferredModel: "qwen",
    maxTokens: 600,
    outputDefaults: { platform: "facebook", post_type: "pinned" },
  },
  {
    id: "fb-30-comment-signal-boost",
    tier: "30s",
    postType: "comment",
    label: { en: "Comment: Turn One Reply Into an Event", zh: "FB 留言：把一則留言變成事件" },
    description: { en: "Give the commenter a challenge others join", zh: "給留言者一個大家想加入的挑戰" },
    agent_id: 180162,              // 沿用 fb-30-comment-reply 的 agent
    skill_slug: "social-copy",
    source: {
      type: "viral",
      short: "Wendy's × Carter Wilkerson",
      metric: "340 萬次轉推，當時史上最多",
      asOf: "2017-05",
      takeaway:
        "給留言者一個可完成的挑戰，其他人就有理由加入；回覆的目的是把對話變成大家的事。",
    },
    primary_question: "這則留言說了什麼？你願意給出什麼？",
    primary_input: { key: "topic", placeholder: "例：有人問「買幾次才有免運」／我們可以給一年份", type: "textarea" },
    inputs: [
      { key: "topic", label: "留言內容 + 你願意給的東西", type: "textarea", required: true },
    ],
    systemPrompt: `你要寫 3 種公開回覆，把一則普通留言變成別人也想參與的事。

每一種都要：
- 直接對留言者說話，用他的原話當支點。
- 開出一個明確、可完成、可被驗證的條件（數字要具體）。
- 條件要高到有挑戰性，但不要高到明顯做不到。
- 留一個讓旁觀者也能出手的縫（轉發、tag、投票都算）。

硬規則：
- 每則 40-120 字，讀起來像人在講話。
- 不要用官方帳號腔，不要「感謝您的支持」。
- 開出去的條件必須是品牌真的願意兌現的；不確定就把數字寫保守。
- 不要嘲諷留言者本人。`,
    preferredModel: "qwen",
    maxTokens: 500,
    outputDefaults: { platform: "facebook", post_type: "comment" },
  },
  {
    id: "fb-30-event-challenge",
    tier: "30s",
    postType: "event",
    label: { en: "Event: Participation Challenge", zh: "FB 活動：參與式挑戰貼文" },
    description: { en: "Learn it in 10s, look good doing it", zh: "動作要 10 秒學得會、拍起來有面子" },
    agent_id: 30016,              // 沿用 fb-60-launch-kit 的 agent
    skill_slug: "fb-copywriting",
    source: {
      type: "viral",
      short: "ALS 冰桶挑戰",
      metric: "1,700 萬支影片、逾 2,800 萬人參與互動",
      asOf: "2014-08",
      takeaway:
        "挑戰要三件事同時成立：動作 10 秒學得會、拍起來有面子、而且必須指名下一個人。",
    },
    primary_question: "這次活動想讓大家做什麼動作？為了什麼？",
    primary_input: { key: "topic", placeholder: "例：帶自己的杯子來店裡拍一張 / 曬出用了三年的舊款", type: "textarea" },
    inputs: [
      { key: "topic", label: "要大家做的動作 + 活動目的", type: "textarea", required: true },
    ],
    systemPrompt: `你要寫一則發起參與式挑戰的 FB 活動貼文。

必須同時成立的三件事（缺一個就會沒人參加）：
1. 動作 10 秒內學得會，而且不需要買任何東西才能做。
2. 拍出來對參加者本人是加分的——他願意讓朋友看到。
3. 內建接力：參加完要指名下一個人，並說清楚指名的方式。

貼文結構：
- 開頭 1 句說清楚要做什麼，不要先講理念。
- 中段：怎麼做（步驟不超過 3 步）、怎麼指名、到什麼時候。
- 結尾：為什麼值得做——一句話，具體，不要口號。

硬規則：
- 不要設「購買才能參加」的門檻。
- 期限要明確到日期。
- 200-400 字。`,
    preferredModel: "qwen",
    maxTokens: 700,
    outputDefaults: { platform: "facebook", post_type: "event" },
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
  /**
   * 2026-08-29：這張卡的 caption 生成逾時上限（毫秒）。不給就用 orchestra
   * 的預設 40s。
   *
   * 為什麼需要它：預設 40s 是照「一則貼文」的長度訂的。要求一次產出整個月
   * 排程的卡（五感十築行事曆，一次 3 篇摘要）在 40s 內生不完，兩次嘗試都
   * 逾時，變體回空字串 —— 任務看起來成功，產出卻是空白。
   *
   * 上限請留在 90s 以內：nginx /trpc 的 proxy_read_timeout 是 230s、Node
   * server.timeout 220s，30s 層是同步回應，整條鏈要留餘裕給其他階段。
   */
  captionBudgetMs?: number;
  /**
   * 2026-08-31：整個 orchestra job 的硬性上限（毫秒）。不給就依 tier 取
   * HARD_BUDGET_MS(30s)=100s / 130s / 150s。
   *
   * 為什麼需要：captionBudgetMs 只管單次 caption 生成，外面還有一層 job
   * 總預算。案例卡把 caption 開到 90s，加上 strategist 錨點與品牌 context
   * 抓取就超過 30s 層的 100s，任務直接以
   * 「orchestra: hard 100s budget exceeded」失敗 —— 使用者看到的是
   * 「這位 AI 專家目前無法產出文案」。
   *
   * 上限請留在 150s 以內（與 99s 層相同，已驗證安全）：nginx /trpc 是
   * 230s、Node server.timeout 220s，30s 層是同步回應。
   */
  hardBudgetMs?: number;
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
  /** 2026-05-18 (CJ): fully skip the 99s scout stage (its logic lives in
   *  the prompt). scout otherwise fires for EVERY 99s task and adds
   *  latency / 502 risk that silently drops the last fanout variants. */
  disableScout?: boolean;
  /**
   * 2026-05-18 (CJ「承諾是完整貼文 → 圖完成才展示 mockup」): when true,
   * the deliverable is a complete post (copy + image) and the UI must NOT
   * show the mockup at the caption-ready checkpoint — it stays in a
   * "generating" state until images finish, then reveals the full post.
   * The orchestra still fires the checkpoint (fast return, no 502, polling
   * continues); this flag is surfaced to the client so it holds rendering.
   */
  holdForImages?: boolean;
  /**
   * 2026-05-18 (CJ「carousel 要真的出 N 張卡圖」): for carousel / album
   * tasks the deliverable is ONE post made of N cards, each with its own
   * image. When set, the orchestra writes N card briefs + renders N card
   * images and attaches them to the single variant as `cards[]` (instead
   * of 1 image per alternative version). The carousel mockup renders them.
   */
  cardsPerVariant?: number;
  /**
   * 2026-08-01: cardsPerVariant reuses ONE splitter LLM call for every task
   * that sets it. "carousel" (default) frames the split as social-carousel
   * copy (Hook→Build→Turn→Payoff→CTA, ≤14 char headline). "storyboard"
   * frames it as film shots (duration/visual/VO/camera, longer body) — used
   * by yt-60-storyboard so a video shot list doesn't get squeezed into ad-
   * carousel copy language. Same JSON contract either way (headline/body/
   * image), so nothing downstream of the split needs to know which kind ran.
   */
  cardsKind?: "carousel" | "storyboard";
  /**
   * 2026-05-18 (CJ「分配不同 agent 處理不同類型內容，比較快」): calendar
   * tasks fan out by content PILLAR — each variantLabel is a pillar group
   * generated by its own parallel agent (callCaptionWriter fanout). When
   * set, the orchestra MERGES all pillar-group JSON arrays into ONE
   * day-sorted calendar (collapsed to a single variant the Calendar
   * mockup renders). ~5× faster than one sequential mega-call → no 502.
   */
  calendarMerge?: boolean;
  /** 2026-05-18 (CJ): use a MINIMAL clean prompt (persona + task prompt
   *  + brand context only) — no social-caption scaffolding/craft. For
   *  strict structured deliverables (e.g. newsjack 4-field format) whose
   *  format/guardrails the social scaffolding otherwise overrides. */
  cleanPrompt?: boolean;
  /**
   * 2026-08-22 (CJ「IG 直播配套應該是完整直播範本」): cleanPrompt's two
   * per-variant lines were written for newsjack (「只接這一個時事/角度」+
   * 【角度】【為什麼會被報】…四欄). A second cleanPrompt task with a
   * different field set needs its own wording, so both lines are
   * overridable. Omitted → newsjack defaults (unchanged behaviour).
   */
  cleanPromptVariantHint?: string;
  cleanPromptCaptionSpec?: string;
  /**
   * 2026-08-22: the narrativeArc strategist prompt hardcoded 「FB 系列貼文
   * （N 篇）」, which steers every downstream writer toward posts. Tasks whose
   * deliverable is not a post series (e.g. a live run-of-show) override the
   * noun + counting unit here. Omitted → 「FB 系列貼文」/「篇」.
   */
  strategistDeliverable?: string;
  strategistUnit?: string;
}

const MANDY_ID = 220887;     // Claire Chen — Brand Visual Designer (977 char persona, was Mandy 199)
// 2026-05-08 (CJ direction): every FB-30s task gets its own image director.
// All from existing mos_db pool with bio 400+ chars; no new agents.
const RITA_ID    = 220862;   // Rita Chen — Brand Narrative Editor
const KAREN_ID   = 220864;   // Karen Chen — Brand Narrative Editor
const ANGEL_ID   = 220866;   // Angel Chen — Brand Narrative Editor
const OWEN_ID    = 220868;   // Owen Chen — Brand Narrative Editor
const YUTING_ID  = 220535;   // Yu-Ting Tien — Creative Production Manager
const JAKE_ID    = 220751;   // Jake Chou — Insights Storyteller

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
    imageDirectorId: RITA_ID,
    aspectRatio: "1.91:1",
    fluxSize: "landscape_4_3",
    imageQualitySteps: 4,
    variantLabels: ["反問式", "數字式", "反差式"],
    // 2026-05-18: now a full post (hook + cleaned body), not a 60-char hook.
    captionMinChars: 150,
    captionMaxChars: 1200,
  },
  "fb-30-link-caption": {
    variants: 3,
    images: 1, // alt cover only (in case OG image is bad)
    runImageGen: false,
    imageDirectorId: KAREN_ID,
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
  // Ad asset configs — single LLM call per task returns N options inline in caption.
  // (1 variant because the LLM emits all 5 options at once; we don't fan out.)
  "fb-30-ad-headline": {
    variants: 5,
    images: 0,
    runImageGen: false,
    imageDirectorId: null,
    aspectRatio: null,
    fluxSize: null,
    imageQualitySteps: 0,
    variantLabels: ["痛點挑戰", "數據驚奇", "反問引發", "情境共鳴", "結果承諾"],
    captionMinChars: 6,
    captionMaxChars: 30,
  },
  "fb-30-ad-primary": {
    variants: 5,
    images: 0,
    runImageGen: false,
    imageDirectorId: null,
    aspectRatio: null,
    fluxSize: null,
    imageQualitySteps: 0,
    variantLabels: ["故事式", "數據式", "反差式", "見證式", "簡短直球"],
    captionMinChars: 60,
    captionMaxChars: 220,
  },
  "fb-30-ad-cta": {
    variants: 5,
    images: 0,
    runImageGen: false,
    imageDirectorId: null,
    aspectRatio: null,
    fluxSize: null,
    imageQualitySteps: 0,
    variantLabels: ["急迫感", "利益強調", "軟性邀請", "對話感", "直接動作"],
    captionMinChars: 6,
    captionMaxChars: 90,
  },
  "fb-30-ad-description": {
    variants: 5,
    images: 0,
    runImageGen: false,
    imageDirectorId: null,
    aspectRatio: null,
    fluxSize: null,
    imageQualitySteps: 0,
    variantLabels: ["數據", "利益強調", "信任強化", "急迫感", "簡短直白"],
    captionMinChars: 6,
    captionMaxChars: 40,
  },
  "fb-30-pinned-short": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: ANGEL_ID,
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
    imageDirectorId: OWEN_ID,
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
    imageDirectorId: YUTING_ID,
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
    imageDirectorId: JAKE_ID,
    aspectRatio: "1:1",
    fluxSize: "square_hd",
    imageQualitySteps: 4,
    variantLabels: ["焦慮式", "FOMO式", "期待式"],
    captionMinChars: 60,
    captionMaxChars: 120,
  },

  // ── 爆款結構卡 ──────────────────────────────────────────────────────
  "fb-30-ad-viral-monologue": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: MANDY_ID,
    aspectRatio: "1.91:1",
    fluxSize: "landscape_4_3",
    imageQualitySteps: 4,
    variantLabels: ["自嘲開場", "反話術開場", "老闆親上陣"],
    captionMinChars: 150,
    captionMaxChars: 350,
  },
  "fb-30-reel-self-roast": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: MANDY_ID,
    aspectRatio: "9:16",
    fluxSize: "portrait_9_16",
    imageQualitySteps: 4,
    variantLabels: ["直接照念", "誇張演出", "反問觀眾"],
    captionMinChars: 100,
    captionMaxChars: 250,
  },
  "fb-30-carousel-data-recap": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: MANDY_ID,
    aspectRatio: "1:1",
    fluxSize: "square_hd",
    imageQualitySteps: 4,
    variantLabels: ["成就感版", "反差版", "排名版"],
    captionMinChars: 200,
    captionMaxChars: 450,
  },
  "fb-30-album-period-recap": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: MANDY_ID,
    aspectRatio: "1:1",
    fluxSize: "square_hd",
    imageQualitySteps: 4,
    variantLabels: ["時序版", "主題版", "人物版"],
    captionMinChars: 200,
    captionMaxChars: 400,
  },
  "fb-30-story-serial-event": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: MANDY_ID,
    aspectRatio: "9:16",
    fluxSize: "portrait_9_16",
    imageQualitySteps: 4,
    variantLabels: ["懸念版", "倒數版", "共同決定版"],
    captionMinChars: 150,
    captionMaxChars: 320,
  },
  "fb-30-pinned-stance": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: MANDY_ID,
    aspectRatio: "1.91:1",
    fluxSize: "landscape_4_3",
    imageQualitySteps: 4,
    variantLabels: ["宣言版", "拒絕版", "承諾版"],
    captionMinChars: 180,
    captionMaxChars: 350,
  },
  "fb-30-comment-signal-boost": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: MANDY_ID,
    aspectRatio: "1:1",
    fluxSize: "square_hd",
    imageQualitySteps: 4,
    variantLabels: ["開條件版", "抬價版", "拉旁人版"],
    captionMinChars: 40,
    captionMaxChars: 120,
  },
  "fb-30-event-challenge": {
    variants: 3,
    images: 3,
    runImageGen: false,
    imageDirectorId: MANDY_ID,
    aspectRatio: "1.91:1",
    fluxSize: "landscape_4_3",
    imageQualitySteps: 4,
    variantLabels: ["指名接力版", "曬成果版", "限時共創版"],
    captionMinChars: 200,
    captionMaxChars: 400,
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


/** Helper: get all FB tasks across tiers in a single list.
 *  2026-05-06: legacy FB_60S_TASKS removed from this list — new
 *  FB_60S_TASKS_V2 (in quickTaskFB60.ts) is the canonical 60s pool with
 *  multi-agent collaboration. Router merges FB60V2 separately. */
export function listAllFBTasks() {
  return [
    ...FB_30S_TASKS.map(t => ({ ...t, kind: "fast" as const })),
  ];
}
