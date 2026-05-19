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
    agent_id: 30011, skill_slug: "short-video-script", // Jason Huang | Short Video Script Creator
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
    description: "Strategist 設計觀點 + 800 字深度文 + 1:1 引文卡配圖",
    agent_id: 30018, skill_slug: "linkedin-b2b", // Fiona Fang | LinkedIn B2B Marketing Exec
    primary_question: "想分享什麼 B2B 觀點？",
    primary_input: { key: "topic", placeholder: "例：AI 工具用 6 個月的 3 個體悟", type: "textarea" },
    inputs: [{ key: "topic", label: "觀點主題", type: "textarea", required: true }],
    systemPrompt: `你在產出「{label}」版本的 LinkedIn Thought Leadership 深度貼文。

【各版本專屬切角 — 嚴格照自己被指派的版本走，不可寫成通用觀點貼文】
- 「反共識版」：開場就反一個產業慣例或常識（「大家都說 X，但我觀察到的是 Y」），三段用具體案例鞏固。
- 「案例版」：從一個真實或代表性的具體場景出發（你觀察到的客戶 / 你自己的操作），提煉出可複製的觀點。
- 「數據版」：用一個數字 / 比例 / 調查作開場（若用戶輸入無數據，改用「根據我的觀察，___ 類型的人大多 ___」等質化描述，不捏造數字），用數據推論觀點。
- 「故事版」：從一個場景畫面切入（某天我在___，突然意識到___），用故事帶出洞察，最後回扣行動建議。
- 「預測版」：從「接下來 ___ 個月／年，___ 會發生 ___」起手，說清楚為什麼這個預測成立，並給讀者一個立刻能做的應對。

【輸出結構 — 每版本都照這個走，但切角不同】
1. 鉤子（前 1-2 行，40字內）：讓讀者決定要不要按「查看更多」。鉤子必須和版本切角對應。
2. 論述主體（3 段，每段 80-120 字）：每段一個核心論點，段間自然銜接。
3. 觀點收尾（1 段，60-80 字）：用「你的立場 / 建議」收，不是「總結以上」。
4. 互動句（最後 1 行）：一個讓讀者想在留言區分享經驗的問句，不是「大家怎麼看？」這種空泛句。

【LinkedIn 格式硬規則 — 違反即不合格】
- 禁止 Markdown 符號（# / ## / ** / __ / --- 等），純文字，用空行分段。
- emoji 限每篇最多 2 個，只能放在鉤子首句或互動句，禁止每段開頭都放。
- 全篇禁驚嘆號（! / ！）。
- hashtag 若需要放最後一行，3 個以內，不散落在正文中。
- 禁「在這個瞬息萬變的時代」「顛覆傳統」「賦能」「驅動」「創造價值」等空洞 buzzword。

【數字核對】若用戶輸入沒有提供具體數字，禁止自行捏造百分比或調查結果；改用「根據我的觀察」「與多個客戶聊過後」等質化表述。

${TONE("LinkedIn")}`,
    preferredModel: "qwen", maxTokens: 1800,
    outputDefaults: { platform: "linkedin", post_type: "feed" },
  },
  {
    id: "li-60-newsletter",
    tier: "60s", postType: "newsletter",
    label: "LI Newsletter 一期",
    description: "Strategist 設計目錄 + 完整 newsletter（標題 + 引言 + 3 段 + CTA）",
    agent_id: 60060, skill_slug: "linkedin-b2b", // Zeyu Hsu | B2B Newsletter Copywriter
    primary_question: "本期主題？",
    primary_input: { key: "topic", placeholder: "本期 newsletter 想講什麼", type: "textarea" },
    inputs: [{ key: "topic", label: "Newsletter 主題", type: "textarea", required: true }],
    systemPrompt: `你在產出「{label}」版本的 LinkedIn Newsletter 一期完整內容。

【各版本切角 — 嚴格照自己被指派的版本走】
- 「教學版」：以「怎麼做」為主軸，用 3 個具體步驟 / 框架帶讀者完成一件事，適合有操作需求的受眾。
- 「觀點版」：以「我的立場」為主軸，反一個產業慣例或提出一個有爭議但有依據的觀點，3 個段落逐步鞏固論點。
- 「趨勢版」：以「正在發生的事」為主軸，描述一個市場現象 → 分析背後原因 → 給出訂閱者的行動建議。

【輸出結構 — 7 個區塊，全部完整輸出，不可省略或合併】
① 期刊名與期號（1 行）：格式「[品牌] 週報 第 N 期 ｜ YYYY年M月D日」，日期用 {today}。
② 本期目錄（3 行）：列出本期 3 個段落各自的標題，格式「→ 標題」每行一條，不加序號。
③ 標題（≤20字）：吸引點閱的主標，要讓訂閱者知道「這期在講什麼 + 為什麼值得讀」。
④ 引言（80-120字）：從一個具體場景或問題切入，拋出本期要回答的核心問題。不要以「在這個時代」「隨著科技發展」開頭。
⑤ 段落一（100-150字）：主題句 + 2-3 個支撐論點（含具體案例 / 觀察，若無數字則用質化描述，不捏造）。
⑥ 段落二（100-150字）：承接段落一，推進一層（原因 / 反例 / 延伸），段間自然銜接。
⑦ 段落三（100-150字）：收斂，給出「讀者可以立刻採取的 1 個行動 / 視角轉換」。
⑧ CTA（60-80字）：邀讀者回覆或分享觀點（具體問句，不是「喜歡請分享」），加一句「下期預告」。

【LinkedIn Newsletter 格式硬規則 — 違反即不合格】
- 禁止所有 Markdown 符號：# / ## / ** / __ / --- / ``` 全禁。
- 段落之間用空行（一個換行）分隔，不用任何符號作分隔線。
- 標題不加冒號結尾、不加引號包覆。
- 全篇禁驚嘆號（! / ！）。
- 禁「在這個瞬息萬變的時代」「數位浪潮」「賦能」「驅動價值」等空洞詞。
- hashtag 若需要，放在 CTA 之後獨立一行，3 個以內。

【數字核對】用戶輸入若無提供具體數字，禁止捏造百分比或調查結果，改用「根據我的觀察」「多個案例顯示」等質化表述。

${TONE("LinkedIn")}`,
    preferredModel: "qwen", maxTokens: 2200,
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
    aspectRatio: "1:1", fluxSize: "square_hd", imageQualitySteps: 4,
    variantLabels: ["反共識版", "案例版", "數據版", "故事版", "預測版"],
    captionMinChars: 400, captionMaxChars: 900,
    extras: { replyTemplates: 5, postingTime: true, followupPost: true },
  },
  "li-60-newsletter": {
    variants: 3, images: 3, runImageGen: true, imageDirectorId: LI_IMG2,
    aspectRatio: "1.91:1", fluxSize: "landscape_4_3", imageQualitySteps: 4,
    variantLabels: ["教學版", "觀點版", "趨勢版"],
    captionMinChars: 600, captionMaxChars: 1300,
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
    agent_id: 30016, skill_slug: "brand-strategy", // Grace Lin | Brand Copywriter
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
    agent_id: 90060, skill_slug: "user-research", // [AI] Qualitative Researcher | Qualitative Researcher
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
    description: "一封完整可寄出的邀約主信 + 4 份配套：合作 Brief（附件）/ 報價回應 / 追蹤信 / 發布後感謝信",
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
    // 2026-05-19 (CJ「每個頁籤幾乎長得一樣 → 重新思考一封 KOL pitch
    // 該含哪些附件；tab1 = 完整信，後面是附件/追蹤/發布後感謝」):
    // 5 個變體本來共用同一個「寫一段 200-400 字」指令 → 全部變成同款
    // 溫情信。改成每個 {label} 是「形態完全不同」的交付物。
    systemPrompt: `你在產出一份 KOL 合作邀約**完整話術包**中的「{label}」這一份。這 5 份是不同形態的交付物，**不要寫成同一種溫情信**——嚴格照下方該 {label} 專屬的結構與形態輸出。

【各 {label} 專屬規格（只做你被指派的這一份）】
- 「邀約主信」＝一封**完整、可直接寄出**的 email。結構：主旨行（「主旨：…」起手一行）→ 稱呼 → 為什麼是你（具體點出對方某個內容/觀點，非空泛稱讚）→ 我們在做什麼＋為什麼想跟你合作（一句 frame，不推銷）→ 想邀請的合作概念（具體但保留彈性）→ 輕量下一步（一個好回的問句）→ 署名。結尾標一行「附件：合作 Brief（見下一份）」。300-450 字。
- 「合作 Brief（附件）」＝**附件文件，不是信**。用條列/小標，不要書信語氣。需含：品牌一句話定位、這次合作目標、內容方向建議（給方向不綁死，明列「可自由發揮 / 必須提到 / 不要出現」三欄）、可提供素材、時程與里程碑、報酬與形式、聯絡窗口。是 KOL 拿到後能照著走的工作文件。
- 「報價回應」＝**場景：KOL 已看過邀約主信並回覆，信中附上了報價或詢問預算**，你現在要寫品牌方的回信。**這是一封 reply，不是第一封信**——絕對不能重新自我介紹品牌、重複列 USP、重寫合作理由。結構：一句話承接對方的回覆（引用對方報價的具體數字或條件，顯示你有仔細看）→ 兩種情境分支（①報價可接受：確認條件 → 明列下一步，例「我會請合約在三天內準備好，你方便哪天簽？」；②需調整：提一個替代方案，例換合作形式/調整篇數/拆成兩期，不殺價，不傷關係）→ 收尾一句讓對方好回的問題。全信 150-250 字，務實，語氣沉穩。禁止：重新介紹品牌、堆疊 USP、感嘆號、「期待合作愉快」等套語。
- 「追蹤信」＝寄出主信後**對方未回覆**時的 follow-up。短（120-200 字）、不催促、不情勒；提供一個新的小鉤子或彈性（例：換個合作形式、給更多時間），讓對方容易回。
- 「發布後感謝信」＝合作內容上線後寄出。結構：**具體的感謝**（必須點出對方某個具體的創作選擇或執行細節，例「謝謝你把產品使用場景那段拍得那麼自然」，不是「感謝你的配合」「謝謝你的努力」）→ 一句數據/成效分享或詢問（如有初步數據可附，或請對方分享觸及）→ **一個具體的下一步**（例：「合約尾款我這週四處理，你確認一下帳戶資訊」或「我們下次有合適的主題再聯絡你，方便嗎？」），不能只說「期待下次合作」空懸。全信 150-250 字。**硬禁**：「一起創造美好的合作」「非常期待」「非常樂意」「榮幸合作」「感受到你的用心」「感謝你的支持」等副詞堆疊 + 罐頭感性句，每句都要有具體對象或數字撐住。

語氣準則：
- 尊重對方，不卑不亢；像個人寫的，不是業配機器模板
- 不過度推銷自家品牌，先 frame why this 合作
- 5 份語氣一致（沉穩、真誠、務實），但**形態必須各自不同**（信 vs 附件文件 vs 回覆範本 vs 短 follow-up vs 感謝信）

【文字衛生硬規則 — 每個段落都適用，違反即不合格，輸出前逐句自查】
- **全段禁句尾與句中驚嘆號**（! 與 ！都禁，連「期待你的回音！」也不行 → 改成具體問句或平實句號收尾）。
- **禁 emoji**（含 😉 這類俏皮符號，一個都不行）。
- 繁體中文台灣用語：用「管道／平台」不要寫「渠道」；不得簡體字。
- **禁業配套語 / 空洞感性句**：「在這個數位時代」「更加精彩」「期待你的回音」「打造出引人注目的內容」「感受到突破品牌行銷的興奮」「非常契合」「管理品牌形象」「引人注目」等一律不准出現。
- 收尾不要用 PR 套語，改成一個「對方讀完會想回的具體問句」（例：你最近有想嘗試但還沒做的內容形式嗎？）。
- 開場不要輕浮（避免「最近在忙些什麼呢？」這種寒暄），用一個與對方創作有關的具體觀察切入。
- 沉穩守護者語氣：像 Brand Brief / 收尾感謝那段的水準，5 段語氣要一致，不要其中幾段變業配腔。

我們**不**提供 KOL 名單，只提供「怎麼說」。${TONE("KOL")}`,
    preferredModel: "qwen", maxTokens: 1400,
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
    variantLabels: ["邀約主信", "合作 Brief（附件）", "報價回應", "追蹤信", "發布後感謝信"],
    captionMinChars: 120, captionMaxChars: 900,
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
