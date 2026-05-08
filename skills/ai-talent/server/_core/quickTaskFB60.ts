/**
 * Facebook 60s tier — production-package tasks (2026-05-06).
 *
 * Each task = real production package shipped by a multi-agent team:
 *   Stage 1 (parallel ~12s): Strategist (optional) + Caption Writer × N
 *                            + Image Director × N + Flux gen
 *   Stage 2 (parallel ~10s): Hashtag (Emma) + Reply (Helen ×5) + Schedule
 *                            (David) + Followup (Sophie) + Specialty (#10/11/12)
 *   Stage 3 (~8s):           QA Reviewer (Jordan Hayes)
 *
 * Total wall ~30-35s; budget 50s.
 *
 * Universal helpers (every task — orchestra wires automatically):
 *   - Emma Zhang (30005)   — hashtag strategist
 *   - Helen Sung (180163)  — reply writer (5 templates per variant)
 *   - David Wang (30003)   — scheduler / posting time
 *   - Sophie Ho (60012)    — followup post writer
 *   - Jordan Hayes         — QA reviewer (via squadLeadQA.ts)
 *   - Mandy Cheng (239184) — image director (every task)
 *
 * Per-task specialists differ — see FB_60S_AGENT_MATRIX in plan file.
 */
import type { FBTaskTemplate, OrchestraConfig } from "./quickTaskFB";

// Universal team IDs (used by orchestra; no need to repeat per-task)
export const FB60_UNIVERSAL = {
  hashtagAgentId: 30012,    // Mia Su — Meta Ads Specialist (2034 char)
  replyAgentId: 180163,     // Helen Sung
  schedulerAgentId: 30003,  // David Wang
  followupAgentId: 60012,   // Sophie Ho
  imageDirectorId: 220887,  // Claire Chen — Brand Visual Designer (977 char)
} as const;

const FB60_TONE = `
語氣要求：自然口語、有 hook、不要 "親愛的客戶" 或 "歡迎購買" 的官腔。
品牌語氣若 system context 已給，務必貼合，不要用罐頭模板。
hashtag 不超過 5 個（FB 觀眾不愛 hashtag 海）。`;

// ─── 12 FB 60s tasks ─────────────────────────────────────────────────────

export const FB_60S_TASKS_V2: FBTaskTemplate[] = [
  // 1. 單篇完整貼文 — Aiden Hsu
  {
    id: "fb-60-single-full",
    tier: "60s",
    postType: "feed",
    label: "FB 單篇完整貼文",
    description: "5 variants + 5 真生圖 + 留言模板 + 發文時段 + 24h 跟進",
    agent_id: 222211, // Hsieh Jia-Rong — Meta Ads Creative Strategist (1322 char)
    skill_slug: "fb-copywriting",
    primary_question: "今天這篇貼文要講什麼？",
    primary_input: { key: "topic", placeholder: "例：春季新品 / 客戶感謝 / 產品 lifestyle", type: "textarea" },
    inputs: [
      { key: "topic", label: "貼文主題", type: "textarea", required: true },
      { key: "feeling", label: "想讓觀眾有什麼感覺", type: "text", required: false },
    ],
    systemPrompt: `產出 FB 單張完整圖文貼文 caption（200-400 字）。
結構：hook → 故事/細節 → 共鳴 → CTA。可用 markdown bold 強調 1-2 處。
${FB60_TONE}`,
    preferredModel: "qwen",
    maxTokens: 1100,
    outputDefaults: { platform: "facebook", post_type: "feed" },
  },

  // 2. 連結貼文 — Tina Ji
  {
    id: "fb-60-link-full",
    tier: "60s",
    postType: "feed",
    label: "FB 連結貼文（完整版）",
    description: "OG 文案 + 縮圖風格 + 引言 + 留言模板 + 發文時段",
    agent_id: 60021, // Tina Ji
    skill_slug: "social-copy",
    primary_question: "貼上要分享的連結",
    primary_input: { key: "url", placeholder: "https://...", type: "text" },
    inputs: [
      { key: "url", label: "連結網址", type: "text", required: true },
      { key: "context", label: "為什麼分享 / 內容摘要", type: "textarea", required: true },
    ],
    systemPrompt: `產出 FB 連結貼文（caption 100-200 字 hook + why-care）。
title 寫 OG title（45-65 字）；description 寫 OG description（150 字內）。
不要直接複製文章標題。${FB60_TONE}`,
    preferredModel: "qwen",
    maxTokens: 900,
    outputDefaults: { platform: "facebook", post_type: "feed" },
  },

  // 3. Album 4 張組合 — Strategist: Grace Wu, Writer: Yizhen Lai
  {
    id: "fb-60-album-4",
    tier: "60s",
    postType: "album",
    label: "FB Album 4 張組合",
    description: "Strategist 規劃敘事弧 + 4 張一致風格 + caption 統合敘事",
    agent_id: 60068, // Yizhen Lai (Brand Story Copy)
    skill_slug: "social-copy",
    primary_question: "什麼場合 / 主題？",
    primary_input: { key: "occasion", placeholder: "例：公司活動、產品 lifestyle、幕後", type: "textarea" },
    inputs: [
      { key: "occasion", label: "場合 / 主題", type: "textarea", required: true },
    ],
    systemPrompt: `產出 FB 4 張相片貼文 caption（200-300 字統合敘事）。
注意敘事弧：開場 / 細節 / 高潮 / 收尾。
${FB60_TONE}`,
    preferredModel: "qwen",
    maxTokens: 1100,
    outputDefaults: { platform: "facebook", post_type: "album" },
  },

  // 4. Carousel 5 卡 — Strategist: Kevin Lin, Writer: Tyler Brooks
  {
    id: "fb-60-carousel-5",
    tier: "60s",
    postType: "carousel",
    label: "FB Carousel 5 卡輪播",
    description: "Hook-Build-Turn-Payoff-CTA + Strategist 結構 + 5 卡敘事",
    agent_id: 224061, // Xiu Yi Chen — Email & CRM Strategist Beauty SG (1250 char)
    skill_slug: "social-copy",
    primary_question: "輪播主題是什麼？",
    primary_input: { key: "topic", placeholder: "輪播 5 卡要傳達的主題", type: "textarea" },
    inputs: [
      { key: "topic", label: "輪播主題", type: "textarea", required: true },
    ],
    systemPrompt: `產出 FB Carousel 5 卡（敘事弧：Hook → Build → Turn → Payoff → CTA）。
caption 是輪播主貼文文（150-250 字 tease 整組要看完）。
${FB60_TONE}`,
    preferredModel: "qwen",
    maxTokens: 1400,
    outputDefaults: { platform: "facebook", post_type: "carousel" },
  },

  // 5. 5 天倒數系列 — Strategist: Ryan Yu, Writer: Claire Hsu  (multi-post)
  {
    id: "fb-60-countdown-5day",
    tier: "60s",
    postType: "feed",
    label: "FB 5 天倒數系列",
    description: "Strategist 設計倒數弧 + 5 天 5 篇平行寫作 + 各自配圖",
    agent_id: 180159, // Claire Hsu
    skill_slug: "social-media-manager",
    primary_question: "活動名稱是？",
    primary_input: { key: "event_name", placeholder: "例：週年慶 / 新品上市 / 限時優惠", type: "text" },
    inputs: [
      { key: "event_name", label: "活動名稱", type: "text", required: true },
      { key: "event_date", label: "活動日期", type: "text", required: false, placeholder: "例：5/15" },
      { key: "key_offer", label: "主要優惠 / hook", type: "textarea", required: true },
    ],
    systemPrompt: `產出 FB 倒數系列其中 1 篇（80-130 字）。
規則：① 開頭凸顯天數（用數字 + emoji） ② 中間放 1 個尚未公開的小細節 / 倒數獨家 ③ 最後 CTA。
不要每天都用一樣的 "倒數X天" 結構，要有變化。
本次任務你寫的是「{label}」這天的貼文（label 會由 orchestra 帶入）。
${FB60_TONE}`,
    preferredModel: "qwen",
    maxTokens: 600,
    outputDefaults: { platform: "facebook", post_type: "feed" },
  },

  // 6. 活動 launch kit (4 篇) — Strategist: Eric Lin, Writer: Sarah Liu
  {
    id: "fb-60-launch-kit",
    tier: "60s",
    postType: "event",
    label: "FB 活動 launch kit (4 篇)",
    description: "Eric Lin 設計 launch arc + 預告×2 / 當日 / 事後 4 篇平行",
    agent_id: 30016, // Grace Lin — Brand Copywriter (2308 char)
    skill_slug: "fb-copywriting",
    primary_question: "活動名稱 + 日期？",
    primary_input: { key: "event_name", placeholder: "例：5/20 線上發表會", type: "text" },
    inputs: [
      { key: "event_name", label: "活動名稱", type: "text", required: true },
      { key: "event_when", label: "日期 / 時間", type: "text", required: true },
      { key: "event_why", label: "為什麼參加 / 重點", type: "textarea", required: true },
    ],
    systemPrompt: `產出 FB 活動 launch kit 其中 1 篇（150-250 字）。
本次你寫的是「{label}」階段的貼文（預告 1 / 預告 2 / 當日 / 事後）。
- 預告 1：埋懸念，先不揭曉
- 預告 2：揭主題 + 報名 CTA
- 當日：直播感、現場感、即時感
- 事後：回顧亮點 + 錯過的人怎麼補
${FB60_TONE}`,
    preferredModel: "qwen",
    maxTokens: 900,
    outputDefaults: { platform: "facebook", post_type: "event" },
  },

  // 7. 直播完整配套 (6 段) — Strategist: Live Engagement, Writer: Vicky Feng
  {
    id: "fb-60-live-suite",
    tier: "60s",
    postType: "feed",
    label: "FB 直播完整配套 (6 段)",
    description: "預告 / 開場 / 3 爆點 / 精華回顧 6 篇平行",
    agent_id: 30009, // Amy Huang — Event Marketing Strategy PM
    skill_slug: "social-copy",
    primary_question: "這次直播主題？",
    primary_input: { key: "live_topic", placeholder: "例：產品試用 / 新品發表 / Q&A", type: "text" },
    inputs: [
      { key: "live_topic", label: "直播主題", type: "text", required: true },
      { key: "key_points", label: "預計重點（3-5 個）", type: "textarea", required: true },
      { key: "live_time", label: "直播時間", type: "text", required: false },
    ],
    systemPrompt: `產出 FB 直播配套貼文其中 1 段（80-200 字依段而異）。
本次你寫的是「{label}」段（預告 / 開場宣告 / 爆點 1 / 爆點 2 / 爆點 3 / 精華回顧）。
- 預告：為什麼非看不可 + 開鈴鐺 CTA
- 開場宣告：直播剛開始，邀請朋友來
- 爆點 X：直播中的金句、現場 1 個亮點截圖式描述
- 精華回顧：錯過的人 1 分鐘看完 + 完整錄播 CTA
${FB60_TONE}`,
    preferredModel: "qwen",
    maxTokens: 900,
    outputDefaults: { platform: "facebook", post_type: "feed" },
  },

  // 8. 釘選 + 3 配套 — Writer: Aiden Hsu (multi-post 4)
  {
    id: "fb-60-pinned-suite",
    tier: "60s",
    postType: "pinned",
    label: "FB 釘選 + 3 配套",
    description: "釘選主貼文 + 3 種補充配套（FAQ / about / 案例）",
    agent_id: 224059, // Rui Xuan Teo — Social Media Strategist Beauty SG (1149 char)
    skill_slug: "fb-copywriting",
    primary_question: "想讓新訪客 3 秒內知道你做什麼？",
    primary_input: { key: "brand_focus", placeholder: "我們是誰、做什麼、為什麼追蹤", type: "textarea" },
    inputs: [
      { key: "brand_focus", label: "品牌 focus", type: "textarea", required: true },
    ],
    systemPrompt: `產出 FB 釘選 + 配套貼文其中 1 篇。
本次你寫的是「{label}」（釘選主文 / FAQ / about us / 代表案例）。
釘選主文 300-500 字；配套各 200-300 字。
釘選會留很久，不要寫時效性內容（"最新"、"本月" 都不要）。
${FB60_TONE}`,
    preferredModel: "qwen",
    maxTokens: 1100,
    outputDefaults: { platform: "facebook", post_type: "pinned" },
  },

  // 9. 3 篇連載 — Strategist: Nelson Chen, Writer: Reed Lee
  {
    id: "fb-60-serial-3",
    tier: "60s",
    postType: "feed",
    label: "FB 3 篇連載敘事",
    description: "Nelson Chen 設計 3 集弧 + Reed Lee 寫 3 篇有勾連",
    agent_id: 220752, // Reed Lee
    skill_slug: "social-copy",
    primary_question: "想連載講什麼故事？",
    primary_input: { key: "story_topic", placeholder: "例：客戶轉型 / 團隊成長 / 產品研發歷程", type: "textarea" },
    inputs: [
      { key: "story_topic", label: "連載主題", type: "textarea", required: true },
    ],
    systemPrompt: `產出 FB 3 篇連載其中 1 篇（200-350 字）。
本次你寫的是「{label}」集（第 1 集 / 第 2 集 / 第 3 集）。
- 第 1 集：埋懸念 + 預告下集
- 第 2 集：轉折 + 加深
- 第 3 集：揭曉 / 收束 + 整體 CTA
篇與篇要有勾連（每篇結尾留 1 句鉤子帶到下一篇）。
${FB60_TONE}`,
    preferredModel: "qwen",
    maxTokens: 900,
    outputDefaults: { platform: "facebook", post_type: "feed" },
  },

  // 10. 爆款改寫 — Strategist: Kevin Liu, Writer: Siyu Li, Specialty: Cheng-Tse Liao
  {
    id: "fb-60-viral-rewrite",
    tier: "60s",
    postType: "feed",
    label: "FB 爆款改寫",
    description: "Kevin Liu 找原爆款結構 + Siyu Li 改寫品牌版 + 對照表",
    agent_id: 60048, // Siyu Li
    skill_slug: "fb-copywriting",
    primary_question: "貼上爆款原文（或連結），我們會分析結構並改寫成你的版本",
    primary_input: { key: "viral_source", placeholder: "貼上原爆款貼文 / 連結 / 主題", type: "textarea" },
    inputs: [
      { key: "viral_source", label: "爆款原文 / 連結 / 主題", type: "textarea", required: true },
      { key: "brand_angle", label: "我方品牌角度（可選）", type: "textarea", required: false },
    ],
    systemPrompt: `產出 FB 爆款改寫文（200-400 字）。
**核心原則**：保留原爆款的「敘事結構 / hook 機制 / 情緒節奏」，但內容換成品牌自己的事。不是抄文字，是學結構。
不要直接複製原文用詞。注意法規 / 抄襲分寸。
${FB60_TONE}`,
    preferredModel: "qwen",
    maxTokens: 1100,
    outputDefaults: { platform: "facebook", post_type: "feed" },
  },

  // 11. 時事改寫文 — Strategist: Mark Davis, Writer: Dale Yu, Specialty: Trend Researcher
  {
    id: "fb-60-trend-rewrite",
    tier: "60s",
    postType: "feed",
    label: "FB 時事改寫文",
    description: "Mark Davis 評估時事關聯 + Dale Yu 寫品牌切入點 + 時效性檢核",
    agent_id: 220755, // Dale Yu
    skill_slug: "social-copy",
    primary_question: "想搭哪個時事？",
    primary_input: { key: "trend_topic", placeholder: "例：奧運 / AI 新聞 / 季節節日", type: "textarea" },
    inputs: [
      { key: "trend_topic", label: "時事主題", type: "textarea", required: true },
      { key: "brand_angle", label: "品牌切入角度（可選）", type: "textarea", required: false },
    ],
    systemPrompt: `產出 FB 時事改寫文（150-300 字）。
**核心原則**：時事是 hook，品牌是 punchline。前 1/3 講時事，後 2/3 拉回品牌。
**禁忌**：不要假裝你是事件當事人；不要在敏感事件（災難、政治、人命）上消費；不要寫成蹭熱度。
${FB60_TONE}`,
    preferredModel: "qwen",
    maxTokens: 900,
    outputDefaults: { platform: "facebook", post_type: "feed" },
  },

  // 12. 客戶見證改寫文 — Strategist: Kurt Chen, Writer: Yawen Ma, Specialty: Jason Evans
  {
    id: "fb-60-testimonial-rewrite",
    tier: "60s",
    postType: "feed",
    label: "FB 客戶見證改寫文",
    description: "Kurt Chen 找見證結構 + Yawen Ma 改寫敘事 + Jason Evans 法務檢核",
    agent_id: 60031, // Yawen Ma
    skill_slug: "fb-copywriting",
    primary_question: "貼上原始客戶見證 / 訪談 / 評價",
    primary_input: { key: "testimonial_source", placeholder: "客戶原話、訪談逐字、評論截圖文字", type: "textarea" },
    inputs: [
      { key: "testimonial_source", label: "客戶見證原文", type: "textarea", required: true },
      { key: "consent_status", label: "已取得發布同意？", type: "text", required: false, placeholder: "yes / 匿名化 / 待確認" },
    ],
    systemPrompt: `產出 FB 客戶見證改寫文（200-350 字）。
**核心原則**：保留客戶情感真實感，重組敘事讓重點凸顯。
**法務 / 倫理**：
- 預設匿名化（除非明確標 "yes"），姓名只留首字
- 不要編造客戶沒說過的話
- 數字 / 成效宣稱必須有原文支持
- 結尾不要寫成廣告口吻
${FB60_TONE}`,
    preferredModel: "qwen",
    maxTokens: 1100,
    outputDefaults: { platform: "facebook", post_type: "feed" },
  },

  // 13. FB 廣告完整包 A/B/C — 3 個獨立廣告，每個含 caption + 3 張視覺
  // 替代危機回覆任務，per CJ direction 2026-05-06
  {
    id: "fb-60-ad-pack-3",
    tier: "60s", postType: "ad",
    label: "FB 廣告完整包 A/B/C",
    description: "3 個獨立廣告（情感 / 理性 / 反差切角），每個含完整 caption + 3 張配圖風格",
    agent_id: 224179, // Lorenzo Dela Rosa — Social Media Strategist Health PH (1145 char)
    skill_slug: "fb-ad-copy",
    primary_question: "這檔廣告的主推產品 / 受眾 / 賣點？",
    primary_input: { key: "campaign", placeholder: "例：母親節健力餐高蛋白組合，職業媽媽 35-50 歲", type: "textarea" },
    inputs: [
      { key: "campaign", label: "Campaign 主題", type: "textarea", required: true },
    ],
    systemPrompt: `產出 FB 廣告完整包其中 1 支廣告（150-300 字）。
本次你寫的是「{label}」這個切角的完整廣告。
結構：headline (25 字) + primary text (80-150 字) + CTA (10 字)。
caption 欄位整合輸出格式：
[Headline] xxx
[Primary] xxxxx
[CTA] xxx
每個切角獨立完整，可直接複製到 Ads Manager。${FB60_TONE}`,
    preferredModel: "qwen",
    maxTokens: 900,
    outputDefaults: { platform: "facebook", post_type: "ad" },
  },
];

// ─── Orchestra configs (per task) ──────────────────────────────────────────
//
// Universal helpers (Emma / Helen / David / Sophie / Jordan) wired by
// orchestra automatically when tier === "60s" + extras populated.
// imageDirectorId = Mandy Cheng (239184) for every task.

const MANDY    = 220887;  // Claire Chen — Brand Visual Designer (977 char, was Mandy 199)
// 2026-05-08 (CJ direction): per-task unique image directors for FB 60s
const FB60_DIR_LUKE   = 220734; // Luke Hsu — Quantitative Research Designer
const FB60_DIR_REINA  = 220736; // Reina Yang — Quantitative Research Designer
const FB60_DIR_BLAKE  = 220737; // Blake Yeh — Quantitative Research Designer
const FB60_DIR_RUTH   = 220739; // Ruth Chou — Quantitative Research Designer
const FB60_DIR_UMA    = 220740; // Uma Tsai — Quantitative Research Designer
const FB60_DIR_JUSTIN = 220756; // Justin Huang — Insights Storyteller
const FB60_DIR_PAUL   = 220757; // Paul Hsu — Insights Storyteller
const FB60_DIR_FRED   = 220758; // Fred Hung — Insights Storyteller
const FB60_DIR_CHLOE_Y= 220759; // Chloe Yang — Insights Storyteller
const FB60_DIR_WENDY  = 220760; // Wendy Cheng — Insights Storyteller
const FB60_DIR_LYDIA  = 220723; // Lydia Tsai — Decision Design Consultant
const FB60_DIR_DREW   = 220726; // Drew Chen — Decision Design Consultant

export const FB_60S_ORCHESTRA: Record<string, OrchestraConfig> = {
  // 1. 單篇完整貼文
  "fb-60-single-full": {
    variants: 5,
    images: 5,
    runImageGen: true,
    imageDirectorId: MANDY,
    aspectRatio: "1:1",
    fluxSize: "square_hd",
    imageQualitySteps: 4,
    variantLabels: ["情感版", "理性版", "故事版", "數據版", "懸念版"],
    captionMinChars: 200,
    captionMaxChars: 400,
    extras: { replyTemplates: 5, postingTime: true, followupPost: true },
  },

  // 2. 連結貼文
  "fb-60-link-full": {
    variants: 5,
    images: 5,
    runImageGen: true,
    imageDirectorId: FB60_DIR_LUKE,
    aspectRatio: "1.91:1",
    fluxSize: "landscape_4_3",
    imageQualitySteps: 4,
    variantLabels: ["資訊式", "故事式", "問題式", "懸念式", "數據式"],
    captionMinChars: 100,
    captionMaxChars: 200,
    extras: { replyTemplates: 5, postingTime: true, followupPost: true },
  },

  // 3. Album 4 張 — strategist: Grace Wu
  "fb-60-album-4": {
    variants: 5,
    images: 5,
    runImageGen: true,
    imageDirectorId: FB60_DIR_REINA,
    aspectRatio: "1:1",
    fluxSize: "square_hd",
    imageQualitySteps: 4,
    variantLabels: ["紀錄式", "情感式", "幕後式", "對比式", "里程碑式"],
    captionMinChars: 200,
    captionMaxChars: 300,
    strategistAgentId: 180006, // Grace Wu — Brand Storyteller
    extras: {
      replyTemplates: 5, postingTime: true, followupPost: true,
      narrativeArc: true,
    },
  },

  // 4. Carousel 5 卡 — strategist: Kevin Lin (180030)
  "fb-60-carousel-5": {
    variants: 5,
    images: 5,
    runImageGen: true,
    imageDirectorId: FB60_DIR_BLAKE,
    aspectRatio: "1:1",
    fluxSize: "square_hd",
    imageQualitySteps: 4,
    variantLabels: ["教學式", "清單式", "故事式", "數據式", "對比式"],
    captionMinChars: 150,
    captionMaxChars: 250,
    strategistAgentId: 180030, // Kevin Lin — Content Strategy
    extras: {
      replyTemplates: 5, postingTime: true, followupPost: true,
      narrativeArc: true,
    },
  },

  // 5. 5 天倒數系列 — multi-post 5; strategist: Ryan Yu
  "fb-60-countdown-5day": {
    variants: 5,
    images: 5,
    runImageGen: true,
    imageDirectorId: FB60_DIR_RUTH,
    aspectRatio: "1:1",
    fluxSize: "square_hd",
    imageQualitySteps: 4,
    variantLabels: ["Day 5", "Day 4", "Day 3", "Day 2", "Day 1"],
    captionMinChars: 80,
    captionMaxChars: 130,
    strategistAgentId: 60007, // Ryan Yu — Growth + campaign-orch
    postLabels: ["Day 5", "Day 4", "Day 3", "Day 2", "Day 1"],
    extras: {
      postsCount: 5, narrativeArc: true,
      replyTemplates: 5, postingTime: true, followupPost: true,
    },
  },

  // 6. 活動 launch kit 4 篇 — strategist: Eric Lin
  "fb-60-launch-kit": {
    variants: 4,
    images: 4,
    runImageGen: true,
    imageDirectorId: FB60_DIR_UMA,
    aspectRatio: "1:1",
    fluxSize: "square_hd",
    imageQualitySteps: 4,
    variantLabels: ["預告 1", "預告 2", "當日", "事後"],
    captionMinChars: 150,
    captionMaxChars: 250,
    strategistAgentId: 30008, // Ryan Lee — Media & PR Strategy PM (2175 char)
    postLabels: ["預告 1", "預告 2", "當日", "事後"],
    extras: {
      postsCount: 4, narrativeArc: true,
      replyTemplates: 5, postingTime: true, followupPost: true,
    },
  },

  // 7. 直播完整配套 6 段 — strategist: Live Engagement (232765)
  "fb-60-live-suite": {
    variants: 6,
    images: 6,
    runImageGen: true,
    imageDirectorId: FB60_DIR_JUSTIN,
    aspectRatio: "16:9",
    fluxSize: "landscape_16_9",
    imageQualitySteps: 4,
    variantLabels: ["預告", "開場宣告", "爆點 1", "爆點 2", "爆點 3", "精華回顧"],
    captionMinChars: 80,
    captionMaxChars: 200,
    strategistAgentId: 60032, // Kevin Gong — F&B Short Video Scriptwriter (1010 char, live-stream-friendly)
    postLabels: ["預告", "開場宣告", "爆點 1", "爆點 2", "爆點 3", "精華回顧"],
    extras: {
      postsCount: 6, narrativeArc: true,
      replyTemplates: 5, postingTime: true, followupPost: true,
    },
  },

  // 8. 釘選 + 3 配套 — multi-post 4 (no strategist; Aiden writes all)
  "fb-60-pinned-suite": {
    variants: 4,
    images: 4,
    runImageGen: true,
    imageDirectorId: FB60_DIR_PAUL,
    aspectRatio: "1:1",
    fluxSize: "square_hd",
    imageQualitySteps: 8,
    variantLabels: ["釘選主文", "FAQ", "about us", "代表案例"],
    captionMinChars: 200,
    captionMaxChars: 500,
    postLabels: ["釘選主文", "FAQ", "about us", "代表案例"],
    extras: {
      postsCount: 4,
      replyTemplates: 5, postingTime: true, followupPost: true,
    },
  },

  // 9. 3 篇連載 — multi-post 3; strategist: Nelson Chen
  "fb-60-serial-3": {
    variants: 3,
    images: 3,
    runImageGen: true,
    imageDirectorId: FB60_DIR_FRED,
    aspectRatio: "1:1",
    fluxSize: "square_hd",
    imageQualitySteps: 4,
    variantLabels: ["第 1 集", "第 2 集", "第 3 集"],
    captionMinChars: 200,
    captionMaxChars: 350,
    strategistAgentId: 220863, // Nelson Chen — Narrative Editor
    postLabels: ["第 1 集", "第 2 集", "第 3 集"],
    extras: {
      postsCount: 3, narrativeArc: true,
      replyTemplates: 5, postingTime: true, followupPost: true,
    },
  },

  // 10. 爆款改寫 — strategist: Kevin Liu, specialty: Cheng-Tse Liao (compare)
  "fb-60-viral-rewrite": {
    variants: 5,
    images: 5,
    runImageGen: true,
    imageDirectorId: FB60_DIR_CHLOE_Y,
    aspectRatio: "1:1",
    fluxSize: "square_hd",
    imageQualitySteps: 4,
    variantLabels: ["保結構式", "情感放大式", "反差式", "數據式", "故事式"],
    captionMinChars: 200,
    captionMaxChars: 400,
    strategistAgentId: 180142, // Kevin Liu — Social Listening
    specialtyAgentId: 220504,  // Cheng-Tse Liao — Compare Editor
    extras: {
      compareTable: true,
      replyTemplates: 5, postingTime: true, followupPost: true,
    },
  },

  // 11. 時事改寫文 — strategist: Mark Davis, specialty: Trend Researcher
  "fb-60-trend-rewrite": {
    variants: 5,
    images: 5,
    runImageGen: true,
    imageDirectorId: FB60_DIR_WENDY,
    aspectRatio: "1:1",
    fluxSize: "square_hd",
    imageQualitySteps: 4,
    variantLabels: ["評論式", "幽默式", "資訊式", "立場式", "中立式"],
    captionMinChars: 150,
    captionMaxChars: 300,
    strategistAgentId: 90011, // Mark Davis — Public Affairs
    specialtyAgentId: 220959, // Trend Researcher — Timing Advisor
    extras: {
      timingAdvisor: true,
      replyTemplates: 5, postingTime: true, followupPost: true,
    },
  },

  // 12. 客戶見證改寫文 — strategist: Kurt Chen, specialty: Jason Evans (legal)
  "fb-60-testimonial-rewrite": {
    variants: 5,
    images: 5,
    runImageGen: true,
    imageDirectorId: FB60_DIR_LYDIA,
    aspectRatio: "1:1",
    fluxSize: "square_hd",
    imageQualitySteps: 4,
    variantLabels: ["故事式", "對比式", "數據式", "情感式", "簡短式"],
    captionMinChars: 200,
    captionMaxChars: 350,
    strategistAgentId: 220754, // Kurt Chen — Insights Storyteller
    specialtyAgentId: 180855,  // Jason Evans — Risk & Compliance
    extras: {
      legalAssistant: true,
      replyTemplates: 5, postingTime: true, followupPost: true,
    },
  },

  // 13. FB 廣告完整包 A/B/C — multi-post fanout for 3 ad angles
  "fb-60-ad-pack-3": {
    variants: 3,
    images: 3,
    runImageGen: true,
    imageDirectorId: FB60_DIR_DREW,
    aspectRatio: "1:1",
    fluxSize: "square_hd",
    imageQualitySteps: 4,
    variantLabels: ["情感切角", "理性切角", "反差切角"],
    captionMinChars: 150,
    captionMaxChars: 300,
    postLabels: ["情感切角", "理性切角", "反差切角"],
    extras: {
      postsCount: 3,
      replyTemplates: 5, postingTime: true, followupPost: true,
    },
  },
};

/** Resolve an FB 60s task id → orchestra config; null if not found. */
export function getFB60OrchestraConfig(taskId: string): OrchestraConfig | null {
  return FB_60S_ORCHESTRA[taskId] ?? null;
}

/** Resolve an FB 60s task id → template; null if not found. */
export function getFB60Template(taskId: string): FBTaskTemplate | null {
  return FB_60S_TASKS_V2.find((t) => t.id === taskId) ?? null;
}
