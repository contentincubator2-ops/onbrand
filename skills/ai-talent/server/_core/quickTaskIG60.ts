/**
 * Instagram 60s tier — production-package tasks (2026-05-06).
 *
 * Mirrors FB60 multi-agent pattern. Each task = 8-9 agents in 3 stages:
 *   Stage 1 (parallel): Strategist + Caption × N + Image Director × N + Flux
 *   Stage 2 (parallel): Hashtag/Reply/Schedule/Followup + Specialty
 *   Stage 3:            QA Reviewer
 *
 * Image director: Nancy Yeh (180170) — IG-native visual lead (≠ Mandy/FB).
 * Universal helpers + QA shared across all channels.
 */
import type { FBTaskTemplate, OrchestraConfig } from "./quickTaskFB";

const NANCY = 180170; // Nancy Yeh — IG Visual Direction Lead (主場 feed-full)
// 2026-05-08 (CJ direction): per-task unique image directors for IG 60s
const IG60_DIR_ANGEL  = 220866; // Angel Chen — Brand Narrative Editor
const IG60_DIR_OWEN   = 220868; // Owen Chen — Brand Narrative Editor
const IG60_DIR_RITA   = 220862; // Rita Chen — Brand Narrative Editor
const IG60_DIR_KAREN  = 220864; // Karen Chen — Brand Narrative Editor
const IG60_DIR_NELSON = 220863; // Nelson Chen — Brand Narrative Editor
const IG60_DIR_TODD   = 220730; // Todd Huang — Decision Design Consultant
const IG60_DIR_DAWN   = 220725; // Dawn Su — Decision Design Consultant
const IG60_DIR_BRIAN  = 220727; // Brian Yeh — Decision Design Consultant
const IG60_DIR_PENNY  = 220724; // Penny Huang — Decision Design Consultant

const IG_TONE = `
語氣要求：自然像朋友、有 IG-native 的呼吸感。不要罐頭口吻。
hashtag 集中放最後一行，5-10 個（IG 容忍量比 FB 高，但別 hashtag 海）。`;

// ─── 10 IG 60s tasks ─────────────────────────────────────────────────────

export const IG_60S_TASKS: FBTaskTemplate[] = [
  // 1. IG 單篇完整貼文 — Iris Liang
  {
    id: "ig-60-feed-full",
    tier: "60s",
    postType: "feed",
    label: "IG 單篇完整貼文",
    description: "5 variants + 5 真生圖 + hashtag + 留言模板 + 發文時段",
    agent_id: 180166, // Iris Liang
    skill_slug: "instagram-copywriting",
    primary_question: "今天這篇 IG 貼文要講什麼？",
    primary_input: { key: "topic", placeholder: "例：新品上市、客戶分享、幕後花絮", type: "textarea" },
    inputs: [
      { key: "topic", label: "貼文主題", type: "textarea", required: true },
    ],
    systemPrompt: `產出 IG 單圖文完整貼文 caption（120-250 字）。
結構：hook → 細節 / 故事 → 邀請（留言 / 收藏 / 分享）。
${IG_TONE}`,
    preferredModel: "qwen",
    maxTokens: 900,
    outputDefaults: { platform: "instagram", post_type: "feed" },
  },

  // 2. IG Reel 完整腳本 — Siyu Lin (Reels), strategist: Kevin Lin
  {
    id: "ig-60-reel-full",
    tier: "60s",
    postType: "reel",
    label: "IG Reel 完整腳本",
    description: "Strategist 規劃 Hook-Hold-Payoff + 完整腳本 + 9:16 視覺",
    agent_id: 60029, // Siyu Lin
    skill_slug: "short-video-scriptwriter",
    primary_question: "這支 Reel 主題 / 賣點？",
    primary_input: { key: "topic", placeholder: "例：30 秒教學 / 開箱 / 反差展示", type: "textarea" },
    inputs: [
      { key: "topic", label: "Reel 主題", type: "textarea", required: true },
    ],
    systemPrompt: `產出 IG Reel 完整 caption + 腳本（300-500 字）。
結構：[0-3s] hook 口播 / [3-15s] hold 內容 / [15-30s] payoff + CTA。
每段標時間戳。配 9:16 直式視覺。
${IG_TONE}`,
    preferredModel: "qwen",
    maxTokens: 1200,
    outputDefaults: { platform: "instagram", post_type: "reel" },
  },

  // 3. IG Carousel 7 卡輪播 — Tyler Brooks, strategist: Kevin Lin
  {
    id: "ig-60-carousel-7",
    tier: "60s",
    postType: "carousel",
    label: "IG Carousel 7 卡輪播",
    description: "Strategist 規劃敘事弧 + 7 卡內容 + 統一視覺基調",
    agent_id: 224159, // Lukman Hakim — Social Media Strategist Beauty ID (1135 char)
    skill_slug: "carousel-copywriter",
    primary_question: "輪播主題？",
    primary_input: { key: "topic", placeholder: "教學 / 清單 / 故事 / 對比 etc.", type: "textarea" },
    inputs: [
      { key: "topic", label: "輪播主題", type: "textarea", required: true },
    ],
    systemPrompt: `產出 IG 7 卡 Carousel 主貼文 caption（150-250 字 tease）。
注意：每張卡片都要讓人想滑下一張。
${IG_TONE}`,
    preferredModel: "qwen",
    maxTokens: 1100,
    outputDefaults: { platform: "instagram", post_type: "carousel" },
  },

  // 4. IG Story 完整一組 (3 frames) — Wendy Su, multi-post 3
  {
    id: "ig-60-story-3frame",
    tier: "60s",
    postType: "story",
    label: "IG Story 3 幀完整組",
    description: "前情 / 重點 / CTA 三幀連貫敘事 + sticker 互動建議",
    agent_id: 180168, // Wendy Su
    skill_slug: "social-copy",
    primary_question: "Story 想傳達什麼？",
    primary_input: { key: "topic", placeholder: "例：新品預告、限時優惠、提問互動", type: "textarea" },
    inputs: [
      { key: "topic", label: "Story 主題", type: "textarea", required: true },
    ],
    systemPrompt: `產出 IG Story 其中 1 幀內容。
本次你寫的是「{label}」幀（前情鋪陳 / 重點揭曉 / CTA 收束）。
caption 30-60 字 overlay 文 + title 5-8 字大標。
9:16 直式風格。每幀互相呼應。
${IG_TONE}`,
    preferredModel: "qwen",
    maxTokens: 500,
    outputDefaults: { platform: "instagram", post_type: "story" },
  },

  // 5. IG 5 天倒數系列 — Iris Liang fanout, strategist: Ryan Yu, multi-post 5
  {
    id: "ig-60-countdown-5day",
    tier: "60s",
    postType: "feed",
    label: "IG 5 天倒數系列",
    description: "Strategist 設計倒數弧 + 5 天 5 篇平行寫作 + 各自配圖",
    agent_id: 220584, // Ying-Chen Yu — IG/FB Marketing Specialist (vibe-marketing)
    skill_slug: "instagram-copywriting",
    primary_question: "倒數什麼活動？",
    primary_input: { key: "event_name", placeholder: "例：新品 / 週年慶 / 直播", type: "text" },
    inputs: [
      { key: "event_name", label: "活動名稱", type: "text", required: true },
      { key: "key_offer", label: "主要 hook / 優惠", type: "textarea", required: true },
    ],
    systemPrompt: `產出 IG 倒數系列其中 1 篇（80-130 字）。
本次你寫的是「{label}」這天的貼文。
規則：① 開頭凸顯天數 ② 1 個未公開細節 ③ CTA。每天結構要變化，不要每天都一樣。
${IG_TONE}`,
    preferredModel: "qwen",
    maxTokens: 600,
    outputDefaults: { platform: "instagram", post_type: "feed" },
  },

  // 6. IG Profile Highlight 完整套組 — Emma Zhang writer, multi-post 5
  {
    id: "ig-60-highlight-suite",
    tier: "60s",
    postType: "profile",
    label: "IG Profile Highlight 5 組封面 + 內容",
    description: "5 個精選封面（about / 商品 / FAQ / 客評 / 案例）+ 視覺一致",
    agent_id: 180196, // Kevin Liao — Product Marketing Manager (1750 char)
    skill_slug: "instagram-strategy",
    primary_question: "想凸顯什麼樣的精選？",
    primary_input: { key: "highlight_focus", placeholder: "例：產品介紹 / 創辦故事 / 客戶見證", type: "textarea" },
    inputs: [
      { key: "highlight_focus", label: "Highlight 主題", type: "textarea", required: true },
    ],
    systemPrompt: `產出 IG Profile Highlight 其中 1 組（封面 + 內容說明）。
本次你寫的是「{label}」這個 highlight。
caption 30-60 字封面說明 + image_style 描述 9:16 ICON 風格（極簡、品牌色一致）。
${IG_TONE}`,
    preferredModel: "qwen",
    maxTokens: 500,
    outputDefaults: { platform: "instagram", post_type: "profile" },
  },

  // 7. IG Live 完整配套 — Yiting Tsai, strategist: Live Engagement, multi-post 5
  {
    id: "ig-60-live-suite",
    tier: "60s",
    postType: "live",
    label: "IG Live 直播完整配套 (5 段)",
    description: "預告 / 開場 / 高潮 / 結尾 / 精華 5 段平行",
    agent_id: 60072, // Yiting Tsai
    skill_slug: "live-content",
    primary_question: "直播主題？",
    primary_input: { key: "live_topic", placeholder: "Q&A / 新品試用 / 創辦故事", type: "text" },
    inputs: [
      { key: "live_topic", label: "直播主題", type: "text", required: true },
      { key: "key_points", label: "預計 3-5 個重點", type: "textarea", required: true },
    ],
    systemPrompt: `產出 IG Live 配套貼文其中 1 段（80-200 字依段而異）。
本次你寫的是「{label}」段（預告 / 開場宣告 / 高潮亮點 / 結尾 CTA / 精華回顧）。
${IG_TONE}`,
    preferredModel: "qwen",
    maxTokens: 800,
    outputDefaults: { platform: "instagram", post_type: "live" },
  },

  // 8. IG 3 篇連載 — Yizhen Lai, strategist: Nelson Chen, multi-post 3
  {
    id: "ig-60-serial-3",
    tier: "60s",
    postType: "feed",
    label: "IG 3 篇連載敘事",
    description: "Strategist 設計 3 集弧 + 3 篇有勾連的連載貼文",
    agent_id: 60068, // Yizhen Lai (Brand Story Copy)
    skill_slug: "social-copy",
    primary_question: "想連載講什麼故事？",
    primary_input: { key: "story_topic", placeholder: "客戶轉型 / 團隊成長 / 產品歷程", type: "textarea" },
    inputs: [
      { key: "story_topic", label: "連載主題", type: "textarea", required: true },
    ],
    systemPrompt: `產出 IG 3 篇連載其中 1 篇（150-250 字）。
本次你寫的是「{label}」集（第 1 / 2 / 3 集）。
篇與篇要有勾連（每篇結尾留鉤子帶到下一篇）。
${IG_TONE}`,
    preferredModel: "qwen",
    maxTokens: 800,
    outputDefaults: { platform: "instagram", post_type: "feed" },
  },

  // 9. IG 爆款改寫 — Jake Chou, strategist: Kevin Liu, specialty: Cheng-Tse Liao
  {
    id: "ig-60-viral-rewrite",
    tier: "60s",
    postType: "feed",
    label: "IG 爆款改寫",
    description: "Strategist 找原爆款結構 + 改寫品牌版 + 對照表",
    agent_id: 220751, // Jake Chou
    skill_slug: "instagram-copywriting",
    primary_question: "貼上爆款原文 / 連結 / 主題",
    primary_input: { key: "viral_source", placeholder: "原爆款貼文 / 連結 / 主題", type: "textarea" },
    inputs: [
      { key: "viral_source", label: "爆款原文 / 連結 / 主題", type: "textarea", required: true },
      { key: "brand_angle", label: "品牌切入角度（可選）", type: "textarea", required: false },
    ],
    systemPrompt: `產出 IG 爆款改寫文（150-300 字）。
保留原爆款的「敘事結構 / hook 機制 / 情緒節奏」，內容換成品牌自己的事。學結構不抄文字。
${IG_TONE}`,
    preferredModel: "qwen",
    maxTokens: 900,
    outputDefaults: { platform: "instagram", post_type: "feed" },
  },

  // 10. IG 客戶見證改寫 — Emily Wang, strategist: Kurt Chen, specialty: Jason Evans
  {
    id: "ig-60-testimonial-rewrite",
    tier: "60s",
    postType: "feed",
    label: "IG 客戶見證改寫",
    description: "Strategist 找見證結構 + 改寫敘事 + 法務檢核",
    agent_id: 180143, // Emily Wang
    skill_slug: "instagram-copywriting",
    primary_question: "貼上客戶見證 / 訪談 / 評價",
    primary_input: { key: "testimonial_source", placeholder: "客戶原話、訪談逐字、評論截圖文字", type: "textarea" },
    inputs: [
      { key: "testimonial_source", label: "客戶見證原文", type: "textarea", required: true },
      { key: "consent_status", label: "已取得發布同意？", type: "text", required: false, placeholder: "yes / 匿名化 / 待確認" },
    ],
    systemPrompt: `產出 IG 客戶見證改寫文（150-250 字）。
保留客戶情感真實感，重組敘事讓重點凸顯。
法務：預設匿名化、不編造客戶沒說過的話、數字宣稱必須有原文支持。
${IG_TONE}`,
    preferredModel: "qwen",
    maxTokens: 900,
    outputDefaults: { platform: "instagram", post_type: "feed" },
  },
];

// ─── Orchestra configs ──────────────────────────────────────────────────────

export const IG_60S_ORCHESTRA: Record<string, OrchestraConfig> = {
  "ig-60-feed-full": {
    variants: 5, images: 5, runImageGen: true, imageDirectorId: NANCY,
    aspectRatio: "1:1", fluxSize: "square_hd", imageQualitySteps: 4,
    variantLabels: ["情感版", "理性版", "故事版", "數據版", "懸念版"],
    captionMinChars: 120, captionMaxChars: 250,
    extras: { replyTemplates: 5, postingTime: true, followupPost: true },
  },

  "ig-60-reel-full": {
    variants: 5, images: 5, runImageGen: true, imageDirectorId: IG60_DIR_ANGEL,
    aspectRatio: "9:16", fluxSize: "portrait_9_16", imageQualitySteps: 4,
    variantLabels: ["教學版", "故事版", "反差版", "節奏版", "懸念版"],
    captionMinChars: 200, captionMaxChars: 400,
    extras: { replyTemplates: 5, postingTime: true, followupPost: true },
  },

  "ig-60-carousel-7": {
    variants: 5, images: 5, runImageGen: true, imageDirectorId: IG60_DIR_OWEN,
    aspectRatio: "1:1", fluxSize: "square_hd", imageQualitySteps: 4,
    variantLabels: ["教學式", "清單式", "故事式", "對比式", "金句式"],
    captionMinChars: 150, captionMaxChars: 250,
    strategistAgentId: 222308, // Hsin-Yi Wu — Email Marketing & CRM Strategist (1415 char)
    extras: { replyTemplates: 5, postingTime: true, followupPost: true, narrativeArc: true },
  },

  "ig-60-story-3frame": {
    variants: 3, images: 3, runImageGen: true, imageDirectorId: IG60_DIR_RITA,
    aspectRatio: "9:16", fluxSize: "portrait_9_16", imageQualitySteps: 4,
    variantLabels: ["前情鋪陳", "重點揭曉", "CTA 收束"],
    captionMinChars: 30, captionMaxChars: 60,
    postLabels: ["前情鋪陳", "重點揭曉", "CTA 收束"],
    extras: { postsCount: 3, replyTemplates: 5, postingTime: true, followupPost: true },
  },

  "ig-60-countdown-5day": {
    variants: 5, images: 5, runImageGen: true, imageDirectorId: IG60_DIR_KAREN,
    aspectRatio: "1:1", fluxSize: "square_hd", imageQualitySteps: 4,
    variantLabels: ["Day 5", "Day 4", "Day 3", "Day 2", "Day 1"],
    captionMinChars: 80, captionMaxChars: 130,
    strategistAgentId: 224084, // Michelle Lim — Social Media Strategist Beauty MY (1178 char)
    postLabels: ["Day 5", "Day 4", "Day 3", "Day 2", "Day 1"],
    extras: { postsCount: 5, narrativeArc: true, replyTemplates: 5, postingTime: true, followupPost: true },
  },

  "ig-60-highlight-suite": {
    variants: 5, images: 5, runImageGen: true, imageDirectorId: IG60_DIR_NELSON,
    aspectRatio: "9:16", fluxSize: "portrait_9_16", imageQualitySteps: 8,
    variantLabels: ["About", "商品", "FAQ", "客評", "案例"],
    captionMinChars: 30, captionMaxChars: 60,
    postLabels: ["About", "商品", "FAQ", "客評", "案例"],
    extras: { postsCount: 5, highlightCovers: 5, replyTemplates: 5, postingTime: true, followupPost: true },
  },

  "ig-60-live-suite": {
    variants: 5, images: 5, runImageGen: true, imageDirectorId: IG60_DIR_TODD,
    aspectRatio: "9:16", fluxSize: "portrait_9_16", imageQualitySteps: 4,
    variantLabels: ["預告", "開場宣告", "高潮亮點", "結尾 CTA", "精華回顧"],
    captionMinChars: 80, captionMaxChars: 200,
    strategistAgentId: 60034, // Ethan Tsai — Travel Short Video Scriptwriter (942 char)
    postLabels: ["預告", "開場宣告", "高潮亮點", "結尾 CTA", "精華回顧"],
    extras: { postsCount: 5, narrativeArc: true, replyTemplates: 5, postingTime: true, followupPost: true },
  },

  "ig-60-serial-3": {
    variants: 3, images: 3, runImageGen: true, imageDirectorId: IG60_DIR_DAWN,
    aspectRatio: "1:1", fluxSize: "square_hd", imageQualitySteps: 4,
    variantLabels: ["第 1 集", "第 2 集", "第 3 集"],
    captionMinChars: 150, captionMaxChars: 250,
    strategistAgentId: 30020, // Iris Yi — Social Media Manager (2001 char)
    postLabels: ["第 1 集", "第 2 集", "第 3 集"],
    extras: { postsCount: 3, narrativeArc: true, replyTemplates: 5, postingTime: true, followupPost: true },
  },

  "ig-60-viral-rewrite": {
    variants: 5, images: 5, runImageGen: true, imageDirectorId: IG60_DIR_BRIAN,
    aspectRatio: "1:1", fluxSize: "square_hd", imageQualitySteps: 4,
    variantLabels: ["保結構式", "情感放大式", "反差式", "數據式", "故事式"],
    captionMinChars: 150, captionMaxChars: 300,
    strategistAgentId: 180155, // Grace Liao — Social Media Advertising Specialist (1594 char)
    specialtyAgentId: 180605,  // Jason Lee — SVP & General Counsel (compare/claims review)
    extras: { compareTable: true, replyTemplates: 5, postingTime: true, followupPost: true },
  },

  "ig-60-testimonial-rewrite": {
    variants: 5, images: 5, runImageGen: true, imageDirectorId: IG60_DIR_PENNY,
    aspectRatio: "1:1", fluxSize: "square_hd", imageQualitySteps: 4,
    variantLabels: ["故事式", "對比式", "數據式", "情感式", "簡短式"],
    captionMinChars: 150, captionMaxChars: 250,
    strategistAgentId: 220754, // Kurt Chen
    specialtyAgentId: 180559,  // Deborah Williams — VP & Chief Legal Officer
    extras: { legalAssistant: true, replyTemplates: 5, postingTime: true, followupPost: true },
  },
};

export function getIG60Template(taskId: string): FBTaskTemplate | null {
  return IG_60S_TASKS.find((t) => t.id === taskId) ?? null;
}
export function getIG60OrchestraConfig(taskId: string): OrchestraConfig | null {
  return IG_60S_ORCHESTRA[taskId] ?? null;
}
