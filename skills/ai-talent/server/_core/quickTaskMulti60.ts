/**
 * Multi-channel 60s tier — production-package tasks (2026-05-06).
 *
 * Consolidates TikTok / LinkedIn / Email / Press Release / Brand Positioning /
 * User Research 60s task pools. Each channel has 5-7 tasks following the
 * FB60 multi-agent pattern (strategist + caption × N + image × N + extras + QA).
 *
 * Image directors (per channel):
 *   - TikTok:    Anna Tseng (180165)
 *   - LinkedIn:  Zeyu Yang (60071)
 *   - Email:     Nathan Lu (60062)
 *   - Press:     Mark Hsu (60035 — assumed; falls back to template)
 *   - Brand:     Boyu Hsu (60030 — repurposed)
 *   - Research:  Janet Chang (24 — repurposed)
 */
import type { FBTaskTemplate, OrchestraConfig } from "./quickTaskFB";

const TONE = (channel: string) => `語氣要求：自然、貼合 ${channel} 平台 native 風格、不要罐頭。`;

// 2026-05-08: per-task unique image directors across all Multi60 platforms
// ─── TikTok 60s ─────────────────────────────────────────────────────────
const TT_IMG  = 180165; // Anna Tseng (主場 foryou-full)
const TT_IMG2 = 220890; // Evan Chen — Digital Experience Designer
const TT_IMG3 = 220891; // Emma Chen — Digital Experience Designer
export const TT_60S_TASKS: FBTaskTemplate[] = [
  {
    id: "tt-60-foryou-full",
    tier: "60s", postType: "foryou",
    label: "TikTok ForYou 完整影片包",
    description: "Hook + hold + payoff 完整 60 秒腳本 + 5 變體",
    agent_id: 210001, skill_slug: "short-video-script", // Jason Tsai — AI Customer Service Strategy Director (1767 char)
    primary_question: "這支 TikTok 主題？",
    primary_input: { key: "topic", placeholder: "教學 / 反差 / 揭密 / 開箱", type: "textarea" },
    inputs: [{ key: "topic", label: "影片主題", type: "textarea", required: true }],
    systemPrompt: `產出 TikTok ForYou 完整 60 秒腳本（300-500 字）。
[0-3s] hook 緊抓 / [3-45s] hold + 反轉 / [45-60s] payoff + CTA。每段標時間戳。
${TONE("TikTok")}`,
    preferredModel: "qwen", maxTokens: 1100,
    outputDefaults: { platform: "tiktok", post_type: "foryou" },
  },
  {
    id: "tt-60-series-3",
    tier: "60s", postType: "foryou",
    label: "TikTok 3 集系列",
    description: "Strategist 設計 3 集弧 + 3 集腳本連貫",
    agent_id: 220506, skill_slug: "short-video-script", // Po-Hung Chen — Short-form Video Producer
    primary_question: "想做 3 集系列講什麼？",
    primary_input: { key: "story_topic", placeholder: "教學系列 / 故事系列", type: "textarea" },
    inputs: [{ key: "story_topic", label: "系列主題", type: "textarea", required: true }],
    systemPrompt: `產出 TikTok 3 集系列其中 1 集（300-450 字腳本）。本集是「{label}」。
${TONE("TikTok")}`,
    preferredModel: "qwen", maxTokens: 1000,
    outputDefaults: { platform: "tiktok", post_type: "foryou" },
  },
  {
    id: "tt-60-viral-rewrite",
    tier: "60s", postType: "foryou",
    label: "TikTok 爆款改寫",
    description: "Strategist 找原爆款結構 + 改寫品牌版 + 對照表",
    agent_id: 220508, skill_slug: "short-video-script", // Cheng-Han Lee — Short-form Video Producer Tech
    primary_question: "貼上爆款影片連結 / 主題",
    primary_input: { key: "viral_source", placeholder: "原爆款 TikTok 影片 / 主題", type: "textarea" },
    inputs: [
      { key: "viral_source", label: "爆款原文 / 連結", type: "textarea", required: true },
      { key: "brand_angle", label: "品牌切入角度", type: "textarea", required: false },
    ],
    systemPrompt: `產出 TikTok 爆款改寫腳本（300-500 字）。保留原 hook 機制與結構。
${TONE("TikTok")}`,
    preferredModel: "qwen", maxTokens: 1100,
    outputDefaults: { platform: "tiktok", post_type: "foryou" },
  },
];

export const TT_60S_ORCHESTRA: Record<string, OrchestraConfig> = {
  "tt-60-foryou-full": {
    variants: 5, images: 5, runImageGen: true, imageDirectorId: TT_IMG,
    aspectRatio: "9:16", fluxSize: "portrait_9_16", imageQualitySteps: 4,
    variantLabels: ["教學版", "反差版", "揭密版", "節奏版", "懸念版"],
    captionMinChars: 300, captionMaxChars: 500,
    extras: { replyTemplates: 5, postingTime: true, followupPost: true },
  },
  "tt-60-series-3": {
    variants: 3, images: 3, runImageGen: true, imageDirectorId: TT_IMG2,
    aspectRatio: "9:16", fluxSize: "portrait_9_16", imageQualitySteps: 4,
    variantLabels: ["第 1 集", "第 2 集", "第 3 集"],
    captionMinChars: 300, captionMaxChars: 450,
    strategistAgentId: 30007, postLabels: ["第 1 集", "第 2 集", "第 3 集"], // Chloe Chen — Short Video Strategy PM (2036 char)
    extras: { postsCount: 3, narrativeArc: true, replyTemplates: 5, postingTime: true, followupPost: true },
  },
  "tt-60-viral-rewrite": {
    variants: 5, images: 5, runImageGen: true, imageDirectorId: TT_IMG3,
    aspectRatio: "9:16", fluxSize: "portrait_9_16", imageQualitySteps: 4,
    variantLabels: ["保結構式", "情感放大式", "反差式", "數據式", "故事式"],
    captionMinChars: 300, captionMaxChars: 500,
    strategistAgentId: 180151, specialtyAgentId: 180643, // Lisa Chang — Social Media Analyst (1715) + Amanda Adams — Chief Legal
    extras: { compareTable: true, replyTemplates: 5, postingTime: true, followupPost: true },
  },
};

// ─── LinkedIn 60s ───────────────────────────────────────────────────────
const LI_IMG  = 60071;  // Zeyu Yang (主場 thought-leader)
const LI_IMG2 = 220892; // Justin Chen — Digital Experience Designer
const LI_IMG3 = 220893; // Vera Chen — Digital Experience Designer
export const LI_60S_TASKS: FBTaskTemplate[] = [
  {
    id: "li-60-thought-leader",
    tier: "60s", postType: "feed",
    label: "LI Thought Leadership 完整貼文",
    description: "Strategist 設計觀點 + 800 字深度文 + 配圖",
    agent_id: 224167, skill_slug: "linkedin-b2b", // Budi Santoso — Meta Ads Specialist B2B SaaS ID (1172 char)
    primary_question: "想分享什麼 B2B 觀點？",
    primary_input: { key: "topic", placeholder: "例：AI 工具用 6 個月的 3 個體悟", type: "textarea" },
    inputs: [{ key: "topic", label: "觀點主題", type: "textarea", required: true }],
    systemPrompt: `產出 LI 深度觀點貼文（500-1000 字）。
結構：反共識鉤子 → 3 段論述（含真實案例 / 數據）→ 提問引留言。${TONE("LinkedIn")}`,
    preferredModel: "qwen", maxTokens: 1500,
    outputDefaults: { platform: "linkedin", post_type: "feed" },
  },
  {
    id: "li-60-newsletter",
    tier: "60s", postType: "newsletter",
    label: "LI Newsletter 一期",
    description: "Strategist 設計目錄 + 完整 newsletter（標題 + 引言 + 3 段 + CTA）",
    agent_id: 180491, skill_slug: "linkedin-b2b", // Penny Lee — LinkedIn Authority Builder
    primary_question: "本期主題？",
    primary_input: { key: "topic", placeholder: "本期 newsletter 想講什麼", type: "textarea" },
    inputs: [{ key: "topic", label: "Newsletter 主題", type: "textarea", required: true }],
    systemPrompt: `產出 LI Newsletter 一期（800-1500 字）。${TONE("LinkedIn")}`,
    preferredModel: "qwen", maxTokens: 1800,
    outputDefaults: { platform: "linkedin", post_type: "newsletter" },
  },
  {
    id: "li-60-case-study",
    tier: "60s", postType: "feed",
    label: "LI 客戶案例改寫",
    description: "Strategist 找見證結構 + 改寫敘事 + 法務檢核",
    agent_id: 60011, skill_slug: "linkedin-b2b", // Vincent Chu — PR Strategist (Tech Brand)
    primary_question: "貼上客戶案例 / 訪談",
    primary_input: { key: "testimonial_source", placeholder: "原始案例 / 訪談內容", type: "textarea" },
    inputs: [
      { key: "testimonial_source", label: "客戶案例", type: "textarea", required: true },
      { key: "consent_status", label: "同意狀態", type: "text", required: false },
    ],
    systemPrompt: `產出 LI B2B 案例改寫（500-800 字）。
結構：客戶情境 → 挑戰 → 我們的解法 → 結果（含數據）→ 學到什麼。${TONE("LinkedIn")}`,
    preferredModel: "qwen", maxTokens: 1300,
    outputDefaults: { platform: "linkedin", post_type: "feed" },
  },
];

export const LI_60S_ORCHESTRA: Record<string, OrchestraConfig> = {
  "li-60-thought-leader": {
    variants: 5, images: 5, runImageGen: true, imageDirectorId: LI_IMG,
    aspectRatio: "1.91:1", fluxSize: "landscape_4_3", imageQualitySteps: 4,
    variantLabels: ["反共識版", "案例版", "數據版", "故事版", "預測版"],
    captionMinChars: 250, captionMaxChars: 500,
    extras: { replyTemplates: 5, postingTime: true, followupPost: true },
  },
  "li-60-newsletter": {
    variants: 3, images: 3, runImageGen: true, imageDirectorId: LI_IMG2,
    aspectRatio: "1.91:1", fluxSize: "landscape_4_3", imageQualitySteps: 4,
    variantLabels: ["教學版", "觀點版", "趨勢版"],
    captionMinChars: 400, captionMaxChars: 700,
    extras: { replyTemplates: 5, postingTime: true, followupPost: true },
  },
  "li-60-case-study": {
    variants: 5, images: 5, runImageGen: true, imageDirectorId: LI_IMG3,
    aspectRatio: "1.91:1", fluxSize: "landscape_4_3", imageQualitySteps: 4,
    variantLabels: ["故事式", "對比式", "數據式", "情感式", "簡短式"],
    captionMinChars: 250, captionMaxChars: 500,
    specialtyAgentId: 180657, // Michael Adams — EVP & Chief Legal Officer
    extras: { legalAssistant: true, replyTemplates: 5, postingTime: true, followupPost: true },
  },
};

// ─── Email 60s ──────────────────────────────────────────────────────────
const EM_IMG  = 60062;  // Nathan Lu (主場 newsletter-full)
const EM_IMG2 = 220894; // David Chen — Digital Experience Designer
const EM_IMG3 = 220895; // Winnie Chen — Digital Experience Designer
export const EMAIL_60S_TASKS: FBTaskTemplate[] = [
  {
    id: "em-60-newsletter-full",
    tier: "60s", postType: "edm",
    label: "Email Newsletter 完整一期",
    description: "Strategist 設計結構 + 主旨 + 引言 + 3 段內容 + CTA + 預覽文字",
    agent_id: 224101, skill_slug: "email-marketing", // Faisal Rahman — Email & CRM Strategist F&B MY (1230 char)
    primary_question: "本期 newsletter 主題？",
    primary_input: { key: "topic", placeholder: "本期想跟訂閱者說什麼", type: "textarea" },
    inputs: [{ key: "topic", label: "Newsletter 主題", type: "textarea", required: true }],
    systemPrompt: `產出 Email Newsletter 完整內容（500-1000 字 body + subject 30 字）。
避免 spam 詞（FREE / urgent / !!!）。${TONE("Email")}`,
    preferredModel: "qwen", maxTokens: 1500,
    outputDefaults: { platform: "email", post_type: "edm" },
  },
  {
    id: "em-60-promo-sequence",
    tier: "60s", postType: "edm",
    label: "Email 促銷序列 (3 封)",
    description: "Strategist 設計促銷弧 + 3 封郵件（預告 / 開賣 / 最後機會）",
    agent_id: 210261, skill_slug: "email-marketing", // Sophie Ho — Email CRM
    primary_question: "促銷活動？",
    primary_input: { key: "campaign", placeholder: "活動名稱 + 優惠", type: "textarea" },
    inputs: [{ key: "campaign", label: "活動", type: "textarea", required: true }],
    systemPrompt: `產出 Email 促銷序列其中 1 封（300-500 字）。本封是「{label}」。
${TONE("Email")}`,
    preferredModel: "qwen", maxTokens: 1100,
    outputDefaults: { platform: "email", post_type: "edm" },
  },
  {
    id: "em-60-onboarding-3",
    tier: "60s", postType: "edm",
    label: "Email Onboarding 3 封",
    description: "新訂閱者前 3 封歡迎序列（D0 / D3 / D7）",
    agent_id: 180567, skill_slug: "email-marketing", // Zeyu Hsu — B2B Newsletter Copywriter
    primary_question: "你的服務 / 產品給新訂閱者的價值？",
    primary_input: { key: "value_prop", placeholder: "新訂閱者最該知道什麼", type: "textarea" },
    inputs: [{ key: "value_prop", label: "核心價值", type: "textarea", required: true }],
    systemPrompt: `產出 Email Onboarding 3 封序列其中 1 封（300-500 字）。本封是「{label}」（D0 歡迎 / D3 教學 / D7 邀請）。
${TONE("Email")}`,
    preferredModel: "qwen", maxTokens: 1100,
    outputDefaults: { platform: "email", post_type: "edm" },
  },
];

export const EMAIL_60S_ORCHESTRA: Record<string, OrchestraConfig> = {
  "em-60-newsletter-full": {
    variants: 5, images: 5, runImageGen: true, imageDirectorId: EM_IMG,
    aspectRatio: "1.91:1", fluxSize: "landscape_4_3", imageQualitySteps: 4,
    variantLabels: ["教學版", "故事版", "數據版", "趨勢版", "懸念版"],
    captionMinChars: 300, captionMaxChars: 600,
    extras: { replyTemplates: 5, postingTime: true, followupPost: true },
  },
  "em-60-promo-sequence": {
    variants: 3, images: 3, runImageGen: true, imageDirectorId: EM_IMG2,
    aspectRatio: "1.91:1", fluxSize: "landscape_4_3", imageQualitySteps: 4,
    variantLabels: ["預告", "開賣", "最後機會"],
    captionMinChars: 300, captionMaxChars: 500,
    strategistAgentId: 222209, postLabels: ["預告", "開賣", "最後機會"], // Chang Hui-Wen — Email Automation Strategist (1324 char)
    extras: { postsCount: 3, narrativeArc: true, replyTemplates: 5, postingTime: true, followupPost: true },
  },
  "em-60-onboarding-3": {
    variants: 3, images: 3, runImageGen: true, imageDirectorId: EM_IMG3,
    aspectRatio: "1.91:1", fluxSize: "landscape_4_3", imageQualitySteps: 4,
    variantLabels: ["D0 歡迎", "D3 教學", "D7 邀請"],
    captionMinChars: 300, captionMaxChars: 500,
    strategistAgentId: 180005, postLabels: ["D0 歡迎", "D3 教學", "D7 邀請"], // David Lee — Content Strategy Director
    extras: { postsCount: 3, narrativeArc: true, replyTemplates: 5, postingTime: true, followupPost: true },
  },
};

// ─── Press Release 60s ──────────────────────────────────────────────────
const PR_IMG = 60035;
export const PR_60S_TASKS: FBTaskTemplate[] = [
  {
    id: "pr-60-news-release-full",
    tier: "60s", postType: "press-release",
    label: "新聞稿完整版",
    description: "標題 + 副標 + 5W1H 導語 + 3 段內文 + 公司簡介 + 媒體聯絡",
    agent_id: 222504, skill_slug: "pr-writing", // Hsin-Jung Chiang — PR Strategist 醫材 (482 char)
    primary_question: "新聞主題？",
    primary_input: { key: "topic", placeholder: "新品發表 / 募資成功 / 重大合作", type: "textarea" },
    inputs: [{ key: "topic", label: "新聞主題", type: "textarea", required: true }],
    systemPrompt: `產出新聞稿完整版（800-1200 字）。
結構：標題 → 副標 → 導語（5W1H）→ 3 段內文 → 引言 → 公司簡介 → 聯絡資訊。
語氣中性、第三人稱、不要行銷感。${TONE("Press")}`,
    preferredModel: "qwen", maxTokens: 1800,
    outputDefaults: { platform: "press", post_type: "press-release" },
  },
  // pr-60-crisis-statement removed per CJ direction 2026-05-06.
];

export const PR_60S_ORCHESTRA: Record<string, OrchestraConfig> = {
  "pr-60-news-release-full": {
    variants: 5, images: 5, runImageGen: true, imageDirectorId: PR_IMG,
    aspectRatio: "1.91:1", fluxSize: "landscape_4_3", imageQualitySteps: 4,
    variantLabels: ["標準版", "成就版", "里程碑版", "事件版", "宣言版"],
    captionMinChars: 400, captionMaxChars: 700,
    extras: { replyTemplates: 5, postingTime: true, followupPost: true },
  },
  // pr-60-crisis-statement orchestra config removed.
};

// ─── Brand Positioning 60s ──────────────────────────────────────────────
const BR_IMG  = 60030;  // Boyu Hsu (主場 tagline)
const BR_IMG2 = 210015; // Tina Shih — AI SaaS Landing Page Designer (Webflow)
const BR_IMG3 = 210017; // Jessica Chiu — AI UI/UX Designer (Figma)
export const BRAND_60S_TASKS: FBTaskTemplate[] = [
  {
    id: "br-60-tagline-suite",
    tier: "60s", postType: "generic",
    label: "品牌 Tagline 5 種版本",
    description: "Strategist 定原型 + 5 個 tagline 候選 + 應用情境",
    agent_id: 223253, skill_slug: "brand-strategy", // Hsin-Jung Wang — PR Strategist 醫材 (483 char)
    primary_question: "品牌精神 / 核心差異？",
    primary_input: { key: "spirit", placeholder: "品牌精神、信念、做什麼", type: "textarea" },
    inputs: [{ key: "spirit", label: "品牌精神", type: "textarea", required: true }],
    // 2026-05-09 (CJ audit): 強制兩段格式 — tagline 嚴格 12 字內 + 應用情境
    // 50 字解釋。原 prompt 太鬆 → LLM 直接寫整段貼文，看不到 tagline。
    systemPrompt: `每變體必須輸出兩段，用 \`||\` 分隔：
第一段：tagline 本身，**6-12 個字**，可朗讀有節奏（不超過 14 字）
第二段：應用情境 50 字內，說明這 tagline 用在哪裡 / 給誰看
範例：
  "科學不在實驗室，在你家餐桌||給家裡有小孩、重視食安的媽媽，IG 限動或實體傳單"
禁止：寫整篇文案、業界領先這種空話、超過 14 字的句子。${TONE("Brand")}`,
    preferredModel: "qwen", maxTokens: 700,
    outputDefaults: { platform: "generic", post_type: "generic" },
  },
  {
    id: "br-60-value-prop",
    tier: "60s", postType: "generic",
    label: "Value Proposition 完整改寫",
    description: "Strategist 找競品差異 + 5 種 value prop 版本",
    agent_id: 60035, skill_slug: "brand-strategy", // Yizhen Lin — Tech Brand PR Writer
    primary_question: "品牌 / 產品做什麼？",
    primary_input: { key: "product", placeholder: "產品 / 服務描述", type: "textarea" },
    inputs: [{ key: "product", label: "產品 / 服務", type: "textarea", required: true }],
    systemPrompt: `產出 value proposition（每變體 100-200 字）。
結構：For [target] who [problem], we are [category] that [benefit].${TONE("Brand")}`,
    preferredModel: "qwen", maxTokens: 800,
    outputDefaults: { platform: "generic", post_type: "generic" },
  },
  {
    id: "br-60-brand-voice",
    tier: "60s", postType: "generic",
    label: "Brand Voice Guideline",
    description: "5 種品牌語氣樣本 + Do / Don't 對照",
    agent_id: 32, skill_slug: "brand-strategy", // Fiona Hsu — Copywriter (deep specialty)
    primary_question: "想塑造什麼樣的品牌語氣？",
    primary_input: { key: "voice_direction", placeholder: "例：專業但親切、年輕但不浮誇", type: "textarea" },
    inputs: [{ key: "voice_direction", label: "語氣方向", type: "textarea", required: true }],
    systemPrompt: `產出品牌 voice 樣本（每變體 100-200 字 sample + 50 字 Do/Don't）。${TONE("Brand")}`,
    preferredModel: "qwen", maxTokens: 800,
    outputDefaults: { platform: "generic", post_type: "generic" },
  },
];

export const BRAND_60S_ORCHESTRA: Record<string, OrchestraConfig> = {
  "br-60-tagline-suite": {
    variants: 5, images: 5, runImageGen: true, imageDirectorId: BR_IMG,
    aspectRatio: "1:1", fluxSize: "square_hd", imageQualitySteps: 4,
    variantLabels: ["英雄式", "智者式", "創造者式", "照顧者式", "反叛者式"],
    captionMinChars: 50, captionMaxChars: 200,
    strategistAgentId: 60001, // Vivian Shen — Omnichannel Marketing Strategist
    extras: { replyTemplates: 3, postingTime: true, followupPost: true },
  },
  "br-60-value-prop": {
    variants: 5, images: 5, runImageGen: true, imageDirectorId: BR_IMG2,
    aspectRatio: "1:1", fluxSize: "square_hd", imageQualitySteps: 4,
    variantLabels: ["問題導向", "解法導向", "結果導向", "對比導向", "情感導向"],
    captionMinChars: 100, captionMaxChars: 200,
    strategistAgentId: 60003, // Marcus Han — Media & Brand Integration Strategist
    extras: { replyTemplates: 3, postingTime: true, followupPost: true },
  },
  "br-60-brand-voice": {
    variants: 5, images: 5, runImageGen: true, imageDirectorId: BR_IMG3,
    aspectRatio: "1:1", fluxSize: "square_hd", imageQualitySteps: 4,
    variantLabels: ["專業版", "親切版", "簡潔版", "故事版", "幽默版"],
    captionMinChars: 100, captionMaxChars: 200,
    extras: { replyTemplates: 3, postingTime: true, followupPost: true },
  },
};

// ─── User Research 60s ──────────────────────────────────────────────────
const RS_IMG  = 24;     // Janet Chang (主場 interview-guide)
const RS_IMG2 = 210004; // Hannah Wu — AI Customer Service Bot Designer
const RS_IMG3 = 210005; // Jenny Huang — AI Digital Platform Customer Service Manager
export const RESEARCH_60S_TASKS: FBTaskTemplate[] = [
  {
    id: "rs-60-interview-guide",
    tier: "60s", postType: "generic",
    label: "用戶訪談大綱完整版",
    description: "Strategist 設計研究問題 + 開放式問題 + 探查 prompt",
    agent_id: 223755, skill_slug: "user-research", // Chih-Hao Hsieh — PR Strategist 電商/DTC (476 char)
    primary_question: "想了解用戶什麼？",
    primary_input: { key: "research_goal", placeholder: "研究目標 / 想驗證的假設", type: "textarea" },
    inputs: [{ key: "research_goal", label: "研究目標", type: "textarea", required: true }],
    systemPrompt: `產出用戶訪談大綱（500-800 字）。
結構：暖身（5 分鐘）→ 背景（10 分鐘）→ 主題探查（30 分鐘）→ 收尾。
每個問題後標時間 + 後續 prompt。${TONE("Research")}`,
    preferredModel: "qwen", maxTokens: 1300,
    outputDefaults: { platform: "generic", post_type: "generic" },
  },
  {
    id: "rs-60-persona-suite",
    tier: "60s", postType: "generic",
    label: "用戶 Persona 5 張組",
    description: "5 種主要 persona 名片（demo + psycho + 痛點 + 渠道）",
    agent_id: 90004, skill_slug: "user-research", // Darren Chiu — Research Director, Consumer Insights
    primary_question: "你的產品 / 服務？",
    primary_input: { key: "product", placeholder: "產品 / 服務描述", type: "textarea" },
    inputs: [{ key: "product", label: "產品 / 服務", type: "textarea", required: true }],
    systemPrompt: `產出 1 張 persona 名片（300-500 字）。
結構：姓名 + 一句話 + demo (年齡/職業/收入) + 價值觀×3 + 痛點×3 + 媒體渠道×3 + hook line。${TONE("Research")}`,
    preferredModel: "qwen", maxTokens: 1100,
    outputDefaults: { platform: "generic", post_type: "generic" },
  },
  {
    id: "rs-60-jtbd-suite",
    tier: "60s", postType: "generic",
    label: "Jobs-to-be-Done 5 種",
    description: "5 個 JTBD 陳述 + 觸發情境 + 競爭對手",
    agent_id: 90005, skill_slug: "user-research", // Christine Hung — Senior Research Manager
    primary_question: "用戶在什麼情境會用到你？",
    primary_input: { key: "context", placeholder: "用戶情境描述", type: "textarea" },
    inputs: [{ key: "context", label: "用戶情境", type: "textarea", required: true }],
    systemPrompt: `產出 JTBD 陳述（每變體 80-150 字）。
格式：When [situation], I want to [motivation], so I can [expected outcome]。${TONE("Research")}`,
    preferredModel: "qwen", maxTokens: 700,
    outputDefaults: { platform: "generic", post_type: "generic" },
  },
];

export const RESEARCH_60S_ORCHESTRA: Record<string, OrchestraConfig> = {
  "rs-60-interview-guide": {
    variants: 3, images: 3, runImageGen: true, imageDirectorId: RS_IMG,
    aspectRatio: "1:1", fluxSize: "square_hd", imageQualitySteps: 4,
    variantLabels: ["探索式", "驗證式", "發散式"],
    captionMinChars: 300, captionMaxChars: 500,
    extras: { replyTemplates: 3, postingTime: false, followupPost: false },
  },
  "rs-60-persona-suite": {
    variants: 5, images: 5, runImageGen: true, imageDirectorId: RS_IMG2,
    aspectRatio: "1:1", fluxSize: "square_hd", imageQualitySteps: 4,
    variantLabels: ["主要使用者", "次要使用者", "決策者", "影響者", "邊緣使用者"],
    captionMinChars: 300, captionMaxChars: 500,
    extras: { replyTemplates: 3, postingTime: false, followupPost: false },
  },
  "rs-60-jtbd-suite": {
    variants: 5, images: 5, runImageGen: true, imageDirectorId: RS_IMG3,
    aspectRatio: "1:1", fluxSize: "square_hd", imageQualitySteps: 4,
    variantLabels: ["功能性 Job", "情感性 Job", "社交性 Job", "替代性 Job", "意外性 Job"],
    captionMinChars: 80, captionMaxChars: 150,
    extras: { replyTemplates: 3, postingTime: false, followupPost: false },
  },
};

// ─── 2026-05-12 (CJ「跨平台 / A/B / KOL 都加進 60s」) ──────────────
// Cross-post, A/B test, and KOL pitch — three power-user 60s tasks.
// All use 2-input intake (primary + 1 secondary) which the modal
// already supports via `inputs[1]`.
const CW_IMG = 60030;   // re-use BR_IMG slot for now
export const CROSS_60S_TASKS: FBTaskTemplate[] = [
  {
    id: "cw-60-crosspost-4platform",
    tier: "60s", postType: "feed",
    label: { en: "Cross-Post 4 Platforms", zh: "跨平台一稿四發（FB/IG/Threads/LinkedIn）" },
    description: "同一主題 → 4 個平台的適配版本（tone / 長度 / hashtag 都不同）",
    agent_id: 180360, skill_slug: "cross-platform-copy",
    primary_question: "今天要分享什麼？",
    primary_input: {
      key: "topic", placeholder: "主題 / 訊息 / 原文 URL", type: "textarea",
    },
    inputs: [
      { key: "topic", label: "主題 / 訊息", type: "textarea", required: true },
      { key: "platforms", label: "要哪幾個平台？（選填，預設全選）", type: "text", required: false,
        placeholder: "FB, IG, Threads, LinkedIn（用逗號分隔，留空 = 全部）" },
    ],
    contextSources: [
      "brand.positioning.voice",
      "brand.positioning.audience.primary",
    ],
    systemPrompt: `產出跨平台 4 版貼文中的 1 版。本次你寫的是「{label}」。

平台適配規則（每個 variant 對應一個平台）：
- **FB**     中長文（150-250 字），人話、有 hook、CTA 自然，最多 3 hashtags
- **IG**     短文（80-150 字），情感先行、多斷行、5-8 hashtags
- **Threads** 口語短文（60-100 字），對話感、最多 1-2 hashtag
- **LinkedIn** 專業中長（200-400 字），有觀點 / 數據 / 結論，0-2 hashtag

同主題、不同切角 — 不要 4 篇講一樣的話。語氣全部貼合品牌 voice。${TONE("Cross")}`,
    preferredModel: "qwen", maxTokens: 1100,
    outputDefaults: { platform: "facebook", post_type: "feed" },
  },
  {
    id: "cw-60-ab-variants",
    tier: "60s", postType: "feed",
    label: { en: "A/B Test Variants", zh: "A/B 雙版本對比測試" },
    description: "從不同 angle 寫兩版 + 「哪版會贏」分析 + 建議測試設定",
    agent_id: 210019, skill_slug: "ab-testing",
    primary_question: "要測什麼主題？",
    primary_input: { key: "topic", placeholder: "主題 / 原文 / URL", type: "textarea" },
    inputs: [
      { key: "topic", label: "主題 / 訊息", type: "textarea", required: true },
      { key: "test_axis", label: "想測什麼面向？（選填）", type: "text", required: false,
        placeholder: "情感 vs 理性 / 短 vs 長 / 故事 vs 數據 / 直球 vs 暗示" },
    ],
    contextSources: [
      "brand.positioning.voice",
      "brand.positioning.audience.primary",
    ],
    systemPrompt: `產出 A/B 雙版本對比，本次你寫的是「{label}」變體之一（A 版或 B 版）。

每個 variant 必須三段，用 \`||\` 分隔：
1. 完整貼文（150-250 字）
2. 「為什麼這版可能贏」（30-60 字假設）
3. 建議測試設定（50/50 分流 N 天，觀察互動率 / 留言質量 / 點擊率）

兩版必須真正不同：不只是換詞，是換 angle（情感 vs 理性 / 短 vs 長 / 等）。${TONE("AB")}`,
    preferredModel: "qwen", maxTokens: 900,
    outputDefaults: { platform: "facebook", post_type: "feed" },
  },
];

const KOL_IMG = 60030;
export const KOL_60S_TASKS: FBTaskTemplate[] = [
  {
    id: "kl-60-pitch-pack",
    tier: "60s", postType: "generic",
    label: { en: "KOL Pitch Pack", zh: "KOL 完整邀約話術包" },
    description: "邀請開場 + 後續追蹤 + brand brief + 報價回應 + 收尾感謝（5 變體）",
    agent_id: 210279, skill_slug: "kol-outreach",
    primary_question: "想找什麼類型的 KOL？合作主題？",
    primary_input: {
      key: "kol_profile", type: "textarea",
      placeholder: "例：找媽媽育兒類 1-5 萬粉絲的 KOL 聊母親節活動",
    },
    inputs: [
      { key: "kol_profile", label: "KOL 類型 + 合作主題", type: "textarea", required: true },
      { key: "deal_terms", label: "合作條件（選填）", type: "textarea", required: false,
        placeholder: "預算範圍 / 產品試用 / 互惠 / 想要的內容形式" },
    ],
    contextSources: [
      "brand.positioning.voice",
      "brand.positioning.goldenCircle.why",
    ],
    systemPrompt: `產出 KOL pitch pack 一個段落（200-400 字）。
本次你寫的是「{label}」（邀請開場 / 後續追蹤 / brand brief 模板 / 報價回應 / 收尾感謝）。

語氣準則：
- 尊重對方，不卑不亢
- 像個人 vs 像業配機器：用品牌語氣，不是模板
- 不要過度推銷自家品牌，先 frame why this 合作
- 報價回應段：守住但不傷關係

我們**不**提供 KOL 名單，只提供「怎麼說」。${TONE("KOL")}`,
    preferredModel: "qwen", maxTokens: 900,
    outputDefaults: { platform: "generic", post_type: "generic" },
  },
];

export const CROSS_60S_ORCHESTRA: Record<string, OrchestraConfig> = {
  "cw-60-crosspost-4platform": {
    variants: 4, images: 4, runImageGen: true, imageDirectorId: CW_IMG,
    aspectRatio: "1:1", fluxSize: "square_hd", imageQualitySteps: 4,
    variantLabels: ["FB 版", "IG 版", "Threads 版", "LinkedIn 版"],
    captionMinChars: 60, captionMaxChars: 400,
    extras: { replyTemplates: 0, postingTime: true, followupPost: false },
  },
  "cw-60-ab-variants": {
    variants: 2, images: 2, runImageGen: true, imageDirectorId: CW_IMG,
    aspectRatio: "1:1", fluxSize: "square_hd", imageQualitySteps: 4,
    variantLabels: ["A 版", "B 版"],
    captionMinChars: 150, captionMaxChars: 350,
    extras: { replyTemplates: 0, postingTime: true, followupPost: false },
  },
};
export const KOL_60S_ORCHESTRA: Record<string, OrchestraConfig> = {
  "kl-60-pitch-pack": {
    variants: 5, images: 0, runImageGen: false, imageDirectorId: KOL_IMG,
    aspectRatio: "1:1", fluxSize: "square_hd", imageQualitySteps: 4,
    variantLabels: ["邀請開場", "後續追蹤", "Brand Brief", "報價回應", "收尾感謝"],
    captionMinChars: 200, captionMaxChars: 400,
    extras: { replyTemplates: 0, postingTime: false, followupPost: false },
  },
};

// ─── Unified lookup helpers ──────────────────────────────────────────────
const ALL_TASKS = [
  ...TT_60S_TASKS, ...LI_60S_TASKS, ...EMAIL_60S_TASKS,
  ...PR_60S_TASKS, ...BRAND_60S_TASKS, ...RESEARCH_60S_TASKS,
  ...CROSS_60S_TASKS, ...KOL_60S_TASKS,
];
const ALL_ORCH: Record<string, OrchestraConfig> = {
  ...TT_60S_ORCHESTRA, ...LI_60S_ORCHESTRA, ...EMAIL_60S_ORCHESTRA,
  ...PR_60S_ORCHESTRA, ...BRAND_60S_ORCHESTRA, ...RESEARCH_60S_ORCHESTRA,
  ...CROSS_60S_ORCHESTRA, ...KOL_60S_ORCHESTRA,
};

export const MULTI_60S_TASKS = ALL_TASKS;
export const MULTI_60S_ORCHESTRA = ALL_ORCH;

export function getMulti60Template(taskId: string): FBTaskTemplate | null {
  return ALL_TASKS.find((t) => t.id === taskId) ?? null;
}
export function getMulti60OrchestraConfig(taskId: string): OrchestraConfig | null {
  return ALL_ORCH[taskId] ?? null;
}
