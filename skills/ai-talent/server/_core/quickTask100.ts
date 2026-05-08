/**
 * 100s tier — campaign-level deliverables with REAL-TIME DATA (2026-05-06).
 *
 * Distinct from 60s: 100s tasks output WHOLE CAMPAIGNS / SERIES / MONTHLY
 * CALENDARS, not single posts. Each task ships 8-30 assets per run, with
 * scout-fetched REAL-TIME DATA (upcoming festivals for calendars, current
 * trending events for trend rewrites, industry news for thought leadership).
 *
 * 60s = 1 post production package (5 variants of 1 caption + extras).
 * 100s = 1 campaign production package (N posts + real-time scout data).
 *
 * Many 100s tasks correspond to existing legacy squads (fb-monthly-calendar,
 * fb-event-launch-kit, fb-crisis-comms, etc.) — these squads already had
 * full agent rosters and methodology; 100s tasks reuse the SHAPE of those
 * deliverables but ship via the orchestra runner for unified UX.
 *
 * Wall budget 100s. Scout stage runs upfront to inject real data into
 * caption_writer prompts.
 */
import type { FBTaskTemplate, OrchestraConfig } from "./quickTaskFB";

const TONE_100 = `
語氣要求：自然、有 hook、不官腔。
本任務輸出 campaign 級別內容，每篇/每節都要扣回主敘事弧。
**即時資料**：scout 階段已抓回即時節慶 / 時事 / 趨勢資料，請扣回這些真實 context，不要寫得通用。`;

// ─── FB 100s (5 tasks) ────────────────────────────────────────────────
export const FB_100S_TASKS: FBTaskTemplate[] = [
  {
    id: "fb-100-30day-calendar",
    tier: "100s", postType: "feed",
    label: "FB 30 天內容月曆",
    description: "30 天每日貼文大綱 + 內容支柱配比 + 真實爆款參考 + scout 抓即時節慶",
    agent_id: 224089, // Kevin Tan — Social Media Strategist eCommerce MY (1147 char)
    skill_slug: "content-calendar",
    primary_question: "本月主推 / 主題？",
    primary_input: { key: "monthly_focus", placeholder: "例：母親節檔 / 新品上市 / 品牌週年", type: "textarea" },
    inputs: [
      { key: "monthly_focus", label: "本月主題", type: "textarea", required: true },
      { key: "pillar_mix", label: "內容支柱配比（可選）", type: "text", required: false, placeholder: "例：60% 教學 / 20% 故事 / 20% 促銷" },
    ],
    systemPrompt: `產出 FB 30 天內容月曆其中 1 週（7 篇貼文，每篇 80-150 字大綱）。
本次你寫的是「{label}」這週。
每篇格式：[第 N 天] [Pillar 標籤] hook + 1 句要點 + 配圖風格。
扣回月主題敘事弧。${TONE_100}`,
    preferredModel: "qwen", maxTokens: 1800,
    outputDefaults: { platform: "facebook", post_type: "feed" },
  },
  {
    id: "fb-100-14day-countdown",
    tier: "100s", postType: "feed",
    label: "FB 14 天倒數活動",
    description: "14 天倒數 + 每天獨立 hook + 中段轉折 + 高潮收束 + scout 抓節慶/時事",
    agent_id: 224116, // Hoàng Thị Mai — Email & CRM Strategist eCommerce VN (1251 char)
    skill_slug: "fb-countdown-series",
    primary_question: "活動名稱 + 主要 hook？",
    primary_input: { key: "event_name", placeholder: "例：母親節限時優惠 / 新品上市", type: "text" },
    inputs: [
      { key: "event_name", label: "活動名稱", type: "text", required: true },
      { key: "key_offer", label: "主要 hook / 優惠", type: "textarea", required: true },
    ],
    systemPrompt: `產出 FB 14 天倒數系列其中 1 篇（80-130 字）。
本次你寫的是「{label}」這天。注意三幕結構：
- Day 14-10: 預熱、埋懸念
- Day 9-5: 揭曉細節、加溫
- Day 4-1: 緊迫感、最後機會
${TONE_100}`,
    preferredModel: "qwen", maxTokens: 700,
    outputDefaults: { platform: "facebook", post_type: "feed" },
  },
  {
    id: "fb-100-launch-toolkit",
    tier: "100s", postType: "event",
    label: "FB 完整 Launch Toolkit (8 篇)",
    description: "預告 ×3 / 當日 / 即時 ×2 / 事後 / 跨平台 IG 改寫 + scout 抓節慶/時事",
    agent_id: 30015, // Tom Chang — KOL Word-of-Mouth Marketing Exec (2274 char)
    skill_slug: "fb-copywriting",
    primary_question: "活動名稱 + 日期 + 重點？",
    primary_input: { key: "event_name", placeholder: "例：5/20 線上發表會", type: "text" },
    inputs: [
      { key: "event_name", label: "活動名稱", type: "text", required: true },
      { key: "event_when", label: "日期 / 時間", type: "text", required: true },
      { key: "event_why", label: "為什麼參加 / 重點", type: "textarea", required: true },
    ],
    systemPrompt: `產出 FB launch toolkit 其中 1 篇（150-300 字）。
本次你寫的是「{label}」（預告 1 / 預告 2 / 預告 3 / 當日 / 即時 1 / 即時 2 / 事後 / IG 跨平台改寫）。
每篇要扣回整個 launch arc，前一篇結尾鉤子帶到下一篇。${TONE_100}`,
    preferredModel: "qwen", maxTokens: 1100,
    outputDefaults: { platform: "facebook", post_type: "event" },
  },
  {
    id: "fb-100-livestream-9seg",
    tier: "100s", postType: "feed",
    label: "FB 直播完整 9 段配套",
    description: "預告 + 開場 + 5 爆點 + 結尾 + 精華回顧 + reel 剪輯指南",
    agent_id: 224154, // Dewi Rahayu — Social Media Strategist Health ID (1135 char)
    skill_slug: "social-copy",
    primary_question: "直播主題 + 重點？",
    primary_input: { key: "live_topic", placeholder: "Q&A / 新品試用 / 直播試吃", type: "text" },
    inputs: [
      { key: "live_topic", label: "直播主題", type: "text", required: true },
      { key: "key_points", label: "預計 3-5 個重點", type: "textarea", required: true },
    ],
    systemPrompt: `產出 FB 直播完整套組其中 1 段（80-200 字依段而異）。
本次你寫的是「{label}」（預告 / 開場宣告 / 爆點 1-5 / 結尾 / 精華回顧 / Reel 剪輯）。
${TONE_100}`,
    preferredModel: "qwen", maxTokens: 900,
    outputDefaults: { platform: "facebook", post_type: "feed" },
  },
  {
    id: "fb-100-crisis-playbook",
    tier: "100s", postType: "comment",
    label: "FB 完整危機公關劇本",
    description: "偵測 + 第一份聲明 + 中期更新 ×3 + 後期 follow-up + 內部 talking points",
    agent_id: 222204, // Chen Jing-Yi — Senior Press Release Writer (1040 char)
    skill_slug: "crisis-communication",
    primary_question: "事件 / 危機內容？",
    primary_input: { key: "incident", placeholder: "完整描述事件 + 已知事實", type: "textarea" },
    inputs: [
      { key: "incident", label: "事件內容", type: "textarea", required: true },
      { key: "facts", label: "已知事實 / 已處理項", type: "textarea", required: false },
      { key: "commitment", label: "可承諾行動", type: "textarea", required: false },
    ],
    systemPrompt: `產出 FB 危機公關完整劇本其中 1 段（200-400 字）。
本次你寫的是「{label}」（偵測警示 / 第一份聲明 / 24h 更新 / 48h 更新 / 72h 更新 / 1 週後 follow-up / 媒體 talking points）。
語氣專業有人味、不推託、扣回 Lagadec 4 段。${TONE_100}`,
    preferredModel: "qwen", maxTokens: 1300,
    outputDefaults: { platform: "facebook", post_type: "comment" },
  },
];

// ─── IG 100s (3 tasks) ────────────────────────────────────────────────
export const IG_100S_TASKS: FBTaskTemplate[] = [
  {
    id: "ig-100-30day-calendar",
    tier: "100s", postType: "feed",
    label: "IG 30 天內容月曆",
    description: "30 天 feed/reel/story 配比 + 每篇 hook + hashtag 策略 + 真實爆款參考",
    agent_id: 224067, // Yong Qi Chua — Meta Ads Specialist B2B SaaS SG (1199 char)
    skill_slug: "instagram-strategy",
    primary_question: "本月主題？",
    primary_input: { key: "monthly_focus", placeholder: "本月主推", type: "textarea" },
    inputs: [{ key: "monthly_focus", label: "本月主題", type: "textarea", required: true }],
    systemPrompt: `產出 IG 30 天月曆其中 1 週（7 天大綱，每天 60-100 字）。
本次你寫的是「{label}」這週。標明每天類型（feed / reel / story / carousel）。${TONE_100}`,
    preferredModel: "qwen", maxTokens: 1400,
    outputDefaults: { platform: "instagram", post_type: "feed" },
  },
  {
    id: "ig-100-reel-series-6",
    tier: "100s", postType: "reel",
    label: "IG Reel 6 集系列",
    description: "Strategist 設計 6 集弧 + 每集完整腳本（hook + hold + payoff）+ 縮圖 brief",
    agent_id: 224121, // Dinh Van Nam — Email & CRM Strategist B2B SaaS VN (1157 char)
    skill_slug: "short-video-scriptwriter",
    primary_question: "6 集系列主題？",
    primary_input: { key: "series_topic", placeholder: "教學系列 / 故事系列", type: "textarea" },
    inputs: [{ key: "series_topic", label: "系列主題", type: "textarea", required: true }],
    systemPrompt: `產出 IG Reel 6 集系列其中 1 集（300-500 字腳本）。
本次你寫的是「{label}」。每集要有勾連，最後集收束。${TONE_100}`,
    preferredModel: "qwen", maxTokens: 1100,
    outputDefaults: { platform: "instagram", post_type: "reel" },
  },
  {
    id: "ig-100-account-reposition",
    tier: "100s", postType: "profile",
    label: "IG 帳號重新定位完整套組",
    description: "新 bio + 9 個 highlight 主題 + 9 篇 launch posts + visual direction",
    agent_id: 180003, // David Lin — Google Ads Specialist (1745 char)
    skill_slug: "instagram-strategy",
    primary_question: "想重新定位的方向？",
    primary_input: { key: "new_direction", placeholder: "想轉成什麼方向 / 受眾", type: "textarea" },
    inputs: [{ key: "new_direction", label: "新方向", type: "textarea", required: true }],
    systemPrompt: `產出 IG 帳號重新定位套組其中 1 部分。
本次你寫的是「{label}」（新 bio / Highlight 1-9 / Launch post 1-9）。
重新定位需要明確、一致、不能跟舊 IG 衝突。${TONE_100}`,
    preferredModel: "qwen", maxTokens: 1100,
    outputDefaults: { platform: "instagram", post_type: "profile" },
  },
];

// ─── YT 100s (3 tasks) ────────────────────────────────────────────────
export const YT_100S_TASKS: FBTaskTemplate[] = [
  {
    id: "yt-100-series-6ep",
    tier: "100s", postType: "video",
    label: "YT 6 集系列完整製作包",
    description: "6 集 title + description 800-1200 字 + 縮圖 brief 各 3 種 + community 配套",
    agent_id: 224005, // Pin-Chen Lin — YouTube Marketing Strategist 金融科技 (~1000 char)
    skill_slug: "youtube-content",
    primary_question: "6 集系列主題？",
    primary_input: { key: "series_topic", placeholder: "教學/故事/評測 系列主題", type: "textarea" },
    inputs: [{ key: "series_topic", label: "系列主題", type: "textarea", required: true }],
    systemPrompt: `產出 YT 6 集系列其中 1 集（title + description 600-1000 字）。
本次你寫的是「{label}」。每集 SEO 各自最佳化但跟系列扣連。${TONE_100}`,
    preferredModel: "qwen", maxTokens: 1300,
    outputDefaults: { platform: "youtube", post_type: "video" },
  },
  {
    id: "yt-100-quarterly-strategy",
    tier: "100s", postType: "video",
    label: "YT 季度頻道策略",
    description: "12 個 video title + 內容支柱 + community 月曆 + competitor 分析",
    agent_id: 224001, // Yun-Hsuan Chen — YouTube Marketing Strategist 服飾時尚 (~1019 char)
    skill_slug: "youtube-strategy",
    primary_question: "頻道方向 / 受眾？",
    primary_input: { key: "channel_focus", placeholder: "頻道主題與目標受眾", type: "textarea" },
    inputs: [{ key: "channel_focus", label: "頻道焦點", type: "textarea", required: true }],
    systemPrompt: `產出 YT 季度策略其中 1 部分（300-600 字）。
本次你寫的是「{label}」（內容支柱規劃 / 12 個影片 title / community 月曆 / competitor 分析 / 即時趨勢報告）。
${TONE_100}`,
    preferredModel: "qwen", maxTokens: 1200,
    outputDefaults: { platform: "youtube", post_type: "video" },
  },
  {
    id: "yt-100-premiere-kit",
    tier: "100s", postType: "premiere",
    label: "YT Premiere 完整 kit",
    description: "預告影片 + 倒數 community 貼文 + 直播配套 + 精華剪輯指南",
    agent_id: 223995, // Pei-Hsuan Liu — YouTube Marketing Strategist 電商/DTC (1025 char)
    skill_slug: "shorts-scriptwriter",
    primary_question: "Premiere 主題？",
    primary_input: { key: "premiere_topic", placeholder: "首播主題", type: "textarea" },
    inputs: [{ key: "premiere_topic", label: "首播主題", type: "textarea", required: true }],
    systemPrompt: `產出 YT Premiere kit 其中 1 部分（150-400 字）。
本次你寫的是「{label}」（預告 trailer 腳本 / Community 倒數 ×5 / 直播配套 / 精華剪輯指南）。${TONE_100}`,
    preferredModel: "qwen", maxTokens: 1100,
    outputDefaults: { platform: "youtube", post_type: "premiere" },
  },
];

// ─── Multi-channel 100s (TT/LI/Email/PR/Brand/Research) ───────────────
export const MULTI_100S_TASKS: FBTaskTemplate[] = [
  {
    id: "tt-100-30day-foryou",
    tier: "100s", postType: "foryou",
    label: "TikTok 30 天 ForYou 配方",
    description: "30 天每天 1 支腳本 + trend 對應 + sound 建議 + scout 抓節慶/時事",
    agent_id: 210011, skill_slug: "short-video-script", // Wendy Lu — AI Email List Nurturing (1926 char)
    primary_question: "本月想衝什麼方向？",
    primary_input: { key: "monthly_theme", placeholder: "教學 / 反差 / 開箱 為主", type: "textarea" },
    inputs: [{ key: "monthly_theme", label: "本月方向", type: "textarea", required: true }],
    systemPrompt: `產出 TikTok 30 天計畫其中 1 週（7 支短腳本，每支 100-150 字）。
本次你寫的是「{label}」這週。${TONE_100}`,
    preferredModel: "qwen", maxTokens: 1500,
    outputDefaults: { platform: "tiktok", post_type: "foryou" },
  },
  {
    id: "tt-100-trend-week",
    tier: "100s", postType: "foryou",
    label: "TikTok 1 週追熱點完整套組",
    description: "7 天每天 1 個 trend + 品牌 hook + 3 種 hook 變化 + sound 建議",
    agent_id: 220507, skill_slug: "short-video-script", // Pin-Yen Liu — Short-form Video Producer Beauty
    primary_question: "想搭哪類熱點？",
    primary_input: { key: "trend_focus", placeholder: "節日 / meme / 新聞", type: "textarea" },
    inputs: [{ key: "trend_focus", label: "熱點類型", type: "textarea", required: true }],
    systemPrompt: `產出 TikTok 追熱點 1 天的腳本（200-400 字）。
本次你寫的是「{label}」這天。${TONE_100}`,
    preferredModel: "qwen", maxTokens: 1000,
    outputDefaults: { platform: "tiktok", post_type: "foryou" },
  },
  {
    id: "li-100-30day-thought-leadership",
    tier: "100s", postType: "feed",
    label: "LI 30 天 Thought-Leadership 月曆",
    description: "30 天 = 10 觀點 / 10 案例 / 10 趨勢預測 + scout 抓即時節慶",
    agent_id: 224171, skill_slug: "linkedin-b2b", // Purnama Sari — Email & CRM Strategist B2B SaaS ID (1184 char)
    primary_question: "這個月想立什麼專業 image？",
    primary_input: { key: "expertise_area", placeholder: "AI / 領導力 / SaaS 等", type: "textarea" },
    inputs: [{ key: "expertise_area", label: "專業領域", type: "textarea", required: true }],
    systemPrompt: `產出 LI thought-leadership 月曆其中 1 週（5-7 篇大綱）。
本次你寫的是「{label}」這週。${TONE_100}`,
    preferredModel: "qwen", maxTokens: 1300,
    outputDefaults: { platform: "linkedin", post_type: "feed" },
  },
  {
    id: "li-100-newsletter-quarterly",
    tier: "100s", postType: "newsletter",
    label: "LI 季度 Newsletter 4 期",
    description: "季度 4 期 newsletter 完整內容 + 訂閱成長策略",
    agent_id: 220164, skill_slug: "linkedin-b2b", // Sophia Hsu — Digital Transformation Consultant
    primary_question: "newsletter 季度大主題？",
    primary_input: { key: "quarter_topic", placeholder: "本季想串什麼主題", type: "textarea" },
    inputs: [{ key: "quarter_topic", label: "季度主題", type: "textarea", required: true }],
    systemPrompt: `產出 LI quarterly newsletter 其中 1 期（500-800 字）。
本次你寫的是「{label}」（第 1 期 / 第 2 期 / 第 3 期 / 第 4 期）。期與期要連貫。${TONE_100}`,
    preferredModel: "qwen", maxTokens: 1200,
    outputDefaults: { platform: "linkedin", post_type: "newsletter" },
  },
  {
    id: "em-100-4week-nurture",
    tier: "100s", postType: "edm",
    label: "Email 4 週 Onboarding Nurture",
    description: "4 週 8-12 封 emails + 行為觸發分支 + scout 抓即時節慶",
    agent_id: 224161, skill_slug: "email-marketing", // Xenia Anggraini — Email & CRM Strategist Beauty ID (1229 char)
    primary_question: "新訂閱者最該知道什麼？",
    primary_input: { key: "value_prop", placeholder: "核心價值 + onboarding 目標", type: "textarea" },
    inputs: [{ key: "value_prop", label: "核心價值", type: "textarea", required: true }],
    systemPrompt: `產出 Email 4 週 nurture 其中 1 封（200-400 字）。
本次你寫的是「{label}」。每封要扣回核心價值，逐步深入。${TONE_100}`,
    preferredModel: "qwen", maxTokens: 1000,
    outputDefaults: { platform: "email", post_type: "edm" },
  },
  {
    id: "em-100-launch-sequence",
    tier: "100s", postType: "edm",
    label: "Email 產品上線完整自動化 Sequence",
    description: "預告 ×2 / 上線 / 提醒 ×2 / 最後機會 / 後續 follow-up = 7 封",
    agent_id: 60061, skill_slug: "email-marketing", // Yahan Tsai — Retail E-commerce Newsletter Copywriter
    primary_question: "產品名稱 + 賣點？",
    primary_input: { key: "product", placeholder: "產品名 + 主要賣點", type: "textarea" },
    inputs: [{ key: "product", label: "產品", type: "textarea", required: true }],
    systemPrompt: `產出 Email launch 序列其中 1 封（200-400 字）。
本次你寫的是「{label}」。${TONE_100}`,
    preferredModel: "qwen", maxTokens: 1000,
    outputDefaults: { platform: "email", post_type: "edm" },
  },
  {
    id: "pr-100-launch-toolkit",
    tier: "100s", postType: "press",
    label: "PR 完整 Launch 媒體 Toolkit",
    description: "新聞稿 + Q&A + 媒體聯絡話術 + 後續追蹤 + spokesperson talking points",
    agent_id: 223197, skill_slug: "pr-writing", // Yi-Wen Wu — PR Strategist B2B SaaS (476 char)
    primary_question: "Launch 主題？",
    primary_input: { key: "launch_topic", placeholder: "新品 / 募資 / 重大合作", type: "textarea" },
    inputs: [{ key: "launch_topic", label: "Launch 主題", type: "textarea", required: true }],
    systemPrompt: `產出 PR launch toolkit 其中 1 部分（300-700 字）。
本次你寫的是「{label}」（新聞稿 / Q&A / 媒體聯絡 / 後續追蹤 / Spokesperson talking points）。${TONE_100}`,
    preferredModel: "qwen", maxTokens: 1300,
    outputDefaults: { platform: "press", post_type: "press" },
  },
  // pr-100-crisis-toolkit removed per CJ direction 2026-05-06 — risky.
  {
    id: "br-100-reposition-toolkit",
    tier: "100s", postType: "press",
    label: "Brand 完整重新定位 Toolkit",
    description: "Positioning + Tagline 套 + Voice guide + Visual direction + 應用範例",
    agent_id: 222665, skill_slug: "brand-strategy", // Chih-Ming Yang — PR Strategist 電商/DTC (477 char)
    primary_question: "想轉到什麼定位？",
    primary_input: { key: "new_position", placeholder: "新定位方向", type: "textarea" },
    inputs: [{ key: "new_position", label: "新定位", type: "textarea", required: true }],
    systemPrompt: `產出 Brand reposition toolkit 其中 1 部分（300-600 字）。
本次你寫的是「{label}」（Positioning statement / Tagline 5 套 / Voice guide / Visual direction / 5 個應用範例）。${TONE_100}`,
    preferredModel: "qwen", maxTokens: 1200,
    outputDefaults: { platform: "press", post_type: "press" },
  },
  {
    id: "br-100-voice-playbook",
    tier: "100s", postType: "press",
    label: "Brand Voice 完整 Playbook",
    description: "8 個應用情境 + Do/Don't 詳細 + 5 個範例 + 跨平台 voice 適配",
    agent_id: 26, skill_slug: "brand-strategy", // Emma Wu — Meta Ads Strategist (specialty 4338 chars)
    primary_question: "想塑造什麼語氣？",
    primary_input: { key: "voice_direction", placeholder: "語氣方向", type: "textarea" },
    inputs: [{ key: "voice_direction", label: "語氣方向", type: "textarea", required: true }],
    systemPrompt: `產出 Brand voice playbook 其中 1 部分（400-700 字）。
本次你寫的是「{label}」。${TONE_100}`,
    preferredModel: "qwen", maxTokens: 1300,
    outputDefaults: { platform: "press", post_type: "press" },
  },
  {
    id: "rs-100-discovery-sprint",
    tier: "100s", postType: "press",
    label: "User Research 5 天 Discovery Sprint",
    description: "訪綱 + 5 personas + JTBD map + insights synthesis + 行動建議",
    agent_id: 222638, skill_slug: "user-research", // Chun-Chieh Hung — PR Strategist 製藥/醫藥 (470 char)
    primary_question: "想了解用戶什麼？",
    primary_input: { key: "research_goal", placeholder: "研究目標 / 假設", type: "textarea" },
    inputs: [{ key: "research_goal", label: "研究目標", type: "textarea", required: true }],
    systemPrompt: `產出 Discovery sprint 其中 1 部分（400-700 字）。
本次你寫的是「{label}」（Day 1 訪綱 / Day 2-3 訪談 + 5 personas / Day 4 JTBD map / Day 5 synthesis + 行動）。${TONE_100}`,
    preferredModel: "qwen", maxTokens: 1300,
    outputDefaults: { platform: "press", post_type: "press" },
  },
  {
    id: "rs-100-competitor-mapping",
    tier: "100s", postType: "press",
    label: "User Research 競品研究完整地圖",
    description: "5-10 競品分析 + 定位 map + opportunity gaps + 推薦策略",
    agent_id: 90006, skill_slug: "user-research", // Steven Chen — Research Manager, Consumer Insights
    primary_question: "你的領域？",
    primary_input: { key: "category", placeholder: "產品類別 / 市場", type: "textarea" },
    inputs: [{ key: "category", label: "領域", type: "textarea", required: true }],
    systemPrompt: `產出競品 mapping 其中 1 部分（300-600 字）。
本次你寫的是「{label}」（市場 overview / 競品 1-5 deep dive / 定位 map / opportunity gaps / 推薦策略）。${TONE_100}`,
    preferredModel: "qwen", maxTokens: 1200,
    outputDefaults: { platform: "press", post_type: "press" },
  },
];

// ─── Orchestra configs ──────────────────────────────────────────────────
// Image directors per channel
const MANDY = 220887, NANCY = 180170, NINA = 180157, ANNA = 180165; // Mandy → Claire Chen (977 char)
const ZEYU = 60071, NATHAN = 60062, BR_IMG = 60030, RS_IMG = 24;
// 2026-05-08: per-task unique image directors for 100s tier
const TT100_IMG2 = 220896; // Brian Chen — Digital Experience Designer
const LI100_IMG2 = 210018; // Zach Ko — AI Design Thinking Consultant (IDEO)
const EM100_IMG2 = 210019; // Sophia Liao — AI Digital Experience Strategist (McKinsey)
const BR100_IMG2 = 39;     // Tom Hsu — Marketing Designer

const fb100Common = {
  runImageGen: true, imageDirectorId: MANDY,
  imageQualitySteps: 4,
  extras: { replyTemplates: 5, postingTime: true, followupPost: true, narrativeArc: true },
};

// ─── FB 100s orchestra configs ──────────────────────────────────────────
// Legacy squad mapping (these 100s tasks reuse the SHAPE of existing
// FB squads — same multi-post deliverable structure; orchestra runner
// instead of stepExecute pipeline for unified UX):
//   fb-100-30day-calendar     ← fb-monthly-calendar squad
//   fb-100-14day-countdown    ← fb-countdown-series squad
//   fb-100-launch-toolkit     ← fb-event-launch-kit squad
//   fb-100-livestream-9seg    ← fb-livestream-prep squad
//   fb-100-crisis-playbook    ← fb-crisis-comms squad
export const FB_100S_ORCHESTRA: Record<string, OrchestraConfig> = {
  "fb-100-30day-calendar": {
    ...fb100Common, variants: 4, images: 4,
    aspectRatio: "1:1", fluxSize: "square_hd",
    variantLabels: ["第 1 週", "第 2 週", "第 3 週", "第 4 週"],
    captionMinChars: 600, captionMaxChars: 1200,
    strategistAgentId: 224094, // Jing Yi Lim — Social Media Strategist B2B SaaS MY (1143 char)
    postLabels: ["第 1 週", "第 2 週", "第 3 週", "第 4 週"],
    scoutKind: "festivals", // 月曆 → 抓即時節慶
    extras: { ...fb100Common.extras, postsCount: 4 },
  },
  "fb-100-14day-countdown": {
    ...fb100Common, variants: 7, images: 7,
    aspectRatio: "1:1", fluxSize: "square_hd",
    variantLabels: ["Day 14", "Day 12", "Day 10", "Day 7", "Day 5", "Day 3", "Day 1"],
    captionMinChars: 80, captionMaxChars: 130,
    strategistAgentId: 60013, // Kevin Kan — SEO Content Strategist
    postLabels: ["Day 14", "Day 12", "Day 10", "Day 7", "Day 5", "Day 3", "Day 1"],
    scoutKind: "festivals", // 倒數活動 → 抓相關節慶 / 行銷檔期
    extras: { ...fb100Common.extras, postsCount: 7 },
  },
  "fb-100-launch-toolkit": {
    ...fb100Common, variants: 8, images: 8,
    aspectRatio: "1:1", fluxSize: "square_hd",
    variantLabels: ["預告 1", "預告 2", "預告 3", "當日", "即時 1", "即時 2", "事後", "IG 跨平台"],
    captionMinChars: 150, captionMaxChars: 300,
    strategistAgentId: 60002, // Ethan Chiang — DTC E-commerce Brand Strategist
    postLabels: ["預告 1", "預告 2", "預告 3", "當日", "即時 1", "即時 2", "事後", "IG 跨平台"],
    scoutKind: "viral", // 看同類 launch 通常用什麼 hook
    extras: { ...fb100Common.extras, postsCount: 8 },
  },
  "fb-100-livestream-9seg": {
    ...fb100Common, variants: 9, images: 9,
    aspectRatio: "16:9", fluxSize: "landscape_16_9",
    variantLabels: ["預告", "開場宣告", "爆點 1", "爆點 2", "爆點 3", "爆點 4", "爆點 5", "結尾", "Reel 剪輯"],
    captionMinChars: 80, captionMaxChars: 200,
    strategistAgentId: 224091, // Nurul Huda — Email & CRM Strategist eCommerce MY (1250 char)
    postLabels: ["預告", "開場宣告", "爆點 1", "爆點 2", "爆點 3", "爆點 4", "爆點 5", "結尾", "Reel 剪輯"],
    scoutKind: "viral",
    extras: { ...fb100Common.extras, postsCount: 9 },
  },
  "fb-100-crisis-playbook": {
    ...fb100Common, variants: 7, images: 0, runImageGen: false, imageDirectorId: null as any,
    aspectRatio: null as any, fluxSize: null as any,
    variantLabels: ["偵測警示", "第一份聲明", "24h 更新", "48h 更新", "72h 更新", "1 週 follow-up", "媒體 talking points"],
    captionMinChars: 200, captionMaxChars: 400,
    strategistAgentId: 90011,
    specialtyAgentId: 180630, // Shirley Sanchez — Global Affairs & General Counsel (2355 char)
    postLabels: ["偵測警示", "第一份聲明", "24h 更新", "48h 更新", "72h 更新", "1 週 follow-up", "媒體 talking points"],
    scoutKind: "trending", // 危機處理 → 抓即時相關新聞
    extras: { ...fb100Common.extras, postsCount: 7, legalAssistant: true, narrativeArc: true },
  },
};

const ig100Common = {
  runImageGen: true, imageDirectorId: NANCY,
  imageQualitySteps: 4,
  extras: { replyTemplates: 5, postingTime: true, followupPost: true, narrativeArc: true },
};

// IG 100s — legacy squad mapping:
//   ig-100-30day-calendar     ← (no exact IG squad; reuses fb-monthly-calendar shape)
//   ig-100-reel-series-6      ← (new — adapted from fb-reels-script squad)
//   ig-100-account-reposition ← fb-account-reposition squad shape
export const IG_100S_ORCHESTRA: Record<string, OrchestraConfig> = {
  "ig-100-30day-calendar": {
    ...ig100Common, variants: 4, images: 4,
    aspectRatio: "1:1", fluxSize: "square_hd",
    variantLabels: ["第 1 週", "第 2 週", "第 3 週", "第 4 週"],
    captionMinChars: 400, captionMaxChars: 800,
    strategistAgentId: 60008, // Fiona Hsieh — Social Media Marketing Strategist (Beauty)
    postLabels: ["第 1 週", "第 2 週", "第 3 週", "第 4 週"],
    scoutKind: "festivals",
    extras: { ...ig100Common.extras, postsCount: 4 },
  },
  "ig-100-reel-series-6": {
    ...ig100Common, variants: 6, images: 6,
    aspectRatio: "9:16", fluxSize: "portrait_9_16",
    variantLabels: ["第 1 集", "第 2 集", "第 3 集", "第 4 集", "第 5 集", "第 6 集"],
    captionMinChars: 250, captionMaxChars: 500,
    strategistAgentId: 180162, // Jason Peng — Social Media Copywriter (1440 char)
    postLabels: ["第 1 集", "第 2 集", "第 3 集", "第 4 集", "第 5 集", "第 6 集"],
    scoutKind: "viral",
    extras: { ...ig100Common.extras, postsCount: 6 },
  },
  "ig-100-account-reposition": {
    ...ig100Common, variants: 5, images: 5,
    aspectRatio: "1:1", fluxSize: "square_hd",
    variantLabels: ["新 Bio", "Highlight 套組", "Launch Post 1-3", "Launch Post 4-6", "Launch Post 7-9"],
    captionMinChars: 250, captionMaxChars: 500,
    strategistAgentId: 60005, // Aaron Pei — B2B Tech Brand Marketing (1181 char)
    postLabels: ["新 Bio", "Highlight 套組", "Launch Post 1-3", "Launch Post 4-6", "Launch Post 7-9"],
    scoutKind: "viral",
    extras: { ...ig100Common.extras, postsCount: 5 },
  },
};

const yt100Common = {
  runImageGen: true, imageDirectorId: NINA,
  imageQualitySteps: 8,
  extras: { replyTemplates: 5, postingTime: true, followupPost: true, narrativeArc: true },
};

// YT 100s — legacy squad mapping:
//   yt-100-quarterly-strategy ← fb-quarterly-strategy squad shape
//   yt-100-series-6ep         ← (new — extends 60s yt-60-series-3ep)
//   yt-100-premiere-kit       ← (new — adapted from fb-livestream-prep)
export const YT_100S_ORCHESTRA: Record<string, OrchestraConfig> = {
  "yt-100-series-6ep": {
    ...yt100Common, variants: 6, images: 6,
    aspectRatio: "16:9", fluxSize: "landscape_16_9",
    variantLabels: ["EP1", "EP2", "EP3", "EP4", "EP5", "EP6"],
    captionMinChars: 500, captionMaxChars: 1000,
    strategistAgentId: 90002, // Darren Freeman — Creative Excellence Director (2348 char)
    postLabels: ["EP1", "EP2", "EP3", "EP4", "EP5", "EP6"],
    scoutKind: "viral",
    extras: { ...yt100Common.extras, postsCount: 6 },
  },
  "yt-100-quarterly-strategy": {
    ...yt100Common, variants: 5, images: 5,
    aspectRatio: "16:9", fluxSize: "landscape_16_9",
    variantLabels: ["內容支柱", "12 影片 title", "Community 月曆", "Competitor 分析", "即時趨勢報告"],
    captionMinChars: 300, captionMaxChars: 600,
    strategistAgentId: 30001, // Alex Chen — AI Growth Hacker CMO (1831 char)
    postLabels: ["內容支柱", "12 影片 title", "Community 月曆", "Competitor 分析", "即時趨勢報告"],
    scoutKind: "news", // 季度策略 → 抓產業最新
    extras: { ...yt100Common.extras, postsCount: 5 },
  },
  "yt-100-premiere-kit": {
    ...yt100Common, variants: 4, images: 4,
    aspectRatio: "16:9", fluxSize: "landscape_16_9",
    variantLabels: ["Trailer 腳本", "Community 倒數 ×5", "直播配套", "精華剪輯指南"],
    captionMinChars: 200, captionMaxChars: 400,
    strategistAgentId: 90022, // Andy Gallagher — Head of Creative & Media (1464 char)
    postLabels: ["Trailer 腳本", "Community 倒數 ×5", "直播配套", "精華剪輯指南"],
    scoutKind: "viral",
    extras: { ...yt100Common.extras, postsCount: 4 },
  },
};

// Multi-channel 100s — legacy squad mapping (where applicable):
//   tt-100-trend-week → (new — TikTok trend chasing)
//   tt-100-30day-foryou → (new — extends fb-monthly-calendar shape)
//   li-100-newsletter-quarterly → (new)
//   em-100-launch-sequence → fb-event-launch-kit shape adapted to email
//   pr-100-crisis-toolkit → fb-crisis-comms shape adapted to PR
//   rs-100-competitor-mapping → fb-account-reposition + competitor-audit shape
export const MULTI_100S_ORCHESTRA: Record<string, OrchestraConfig> = {
  "tt-100-30day-foryou": {
    variants: 4, images: 4, runImageGen: true, imageDirectorId: ANNA,
    aspectRatio: "9:16", fluxSize: "portrait_9_16", imageQualitySteps: 4,
    variantLabels: ["第 1 週", "第 2 週", "第 3 週", "第 4 週"],
    captionMinChars: 300, captionMaxChars: 700,
    strategistAgentId: 90015, // Sonia Belgacem — Global Client Service Manager, Creative Excellence (1547 char)
    postLabels: ["第 1 週", "第 2 週", "第 3 週", "第 4 週"],
    scoutKind: "festivals",
    extras: { postsCount: 4, narrativeArc: true, replyTemplates: 5, postingTime: true, followupPost: true },
  },
  "tt-100-trend-week": {
    variants: 7, images: 7, runImageGen: true, imageDirectorId: TT100_IMG2,
    aspectRatio: "9:16", fluxSize: "portrait_9_16", imageQualitySteps: 4,
    variantLabels: ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7"],
    captionMinChars: 200, captionMaxChars: 400,
    postLabels: ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7"],
    scoutKind: "trending", // 追熱點 → 抓即時時事
    extras: { postsCount: 7, replyTemplates: 5, postingTime: true, followupPost: true },
  },
  "li-100-30day-thought-leadership": {
    variants: 4, images: 4, runImageGen: true, imageDirectorId: ZEYU,
    aspectRatio: "1.91:1", fluxSize: "landscape_4_3", imageQualitySteps: 4,
    variantLabels: ["第 1 週", "第 2 週", "第 3 週", "第 4 週"],
    captionMinChars: 400, captionMaxChars: 800,
    postLabels: ["第 1 週", "第 2 週", "第 3 週", "第 4 週"],
    scoutKind: "news", // thought-leadership → 抓產業最新
    extras: { postsCount: 4, replyTemplates: 5, postingTime: true, followupPost: true },
  },
  "li-100-newsletter-quarterly": {
    variants: 4, images: 4, runImageGen: true, imageDirectorId: LI100_IMG2,
    aspectRatio: "1.91:1", fluxSize: "landscape_4_3", imageQualitySteps: 4,
    variantLabels: ["第 1 期", "第 2 期", "第 3 期", "第 4 期"],
    captionMinChars: 400, captionMaxChars: 800,
    strategistAgentId: 180015, // Kevin Lin — Content Strategy Director
    postLabels: ["第 1 期", "第 2 期", "第 3 期", "第 4 期"],
    scoutKind: "news",
    extras: { postsCount: 4, narrativeArc: true, replyTemplates: 5, postingTime: true, followupPost: true },
  },
  "em-100-4week-nurture": {
    variants: 4, images: 4, runImageGen: true, imageDirectorId: NATHAN,
    aspectRatio: "1.91:1", fluxSize: "landscape_4_3", imageQualitySteps: 4,
    variantLabels: ["第 1 週", "第 2 週", "第 3 週", "第 4 週"],
    captionMinChars: 200, captionMaxChars: 400,
    strategistAgentId: 180141, // Rachel Chen — Social Media Strategy Director
    postLabels: ["第 1 週", "第 2 週", "第 3 週", "第 4 週"],
    scoutKind: "viral",
    extras: { postsCount: 4, narrativeArc: true, replyTemplates: 3, postingTime: true, followupPost: true },
  },
  "em-100-launch-sequence": {
    variants: 7, images: 7, runImageGen: true, imageDirectorId: EM100_IMG2,
    aspectRatio: "1.91:1", fluxSize: "landscape_4_3", imageQualitySteps: 4,
    variantLabels: ["預告 1", "預告 2", "上線", "提醒 1", "提醒 2", "最後機會", "後續"],
    captionMinChars: 200, captionMaxChars: 400,
    strategistAgentId: 60080, // Ethan Yeh — Cross-border Marketing Strategy
    postLabels: ["預告 1", "預告 2", "上線", "提醒 1", "提醒 2", "最後機會", "後續"],
    scoutKind: "viral",
    extras: { postsCount: 7, narrativeArc: true, replyTemplates: 3, postingTime: true, followupPost: true },
  },
  "pr-100-launch-toolkit": {
    variants: 5, images: 0, runImageGen: false, imageDirectorId: null as any,
    aspectRatio: null as any, fluxSize: null as any, imageQualitySteps: 0,
    variantLabels: ["新聞稿", "Q&A", "媒體聯絡", "後續追蹤", "Spokesperson talking"],
    captionMinChars: 300, captionMaxChars: 700,
    postLabels: ["新聞稿", "Q&A", "媒體聯絡", "後續追蹤", "Spokesperson talking"],
    scoutKind: "news",
    extras: { postsCount: 5, replyTemplates: 3 },
  },
  // pr-100-crisis-toolkit orchestra config removed.
  "br-100-reposition-toolkit": {
    variants: 5, images: 5, runImageGen: true, imageDirectorId: BR_IMG,
    aspectRatio: "1:1", fluxSize: "square_hd", imageQualitySteps: 4,
    variantLabels: ["Positioning", "Tagline 5 套", "Voice guide", "Visual direction", "5 應用範例"],
    captionMinChars: 300, captionMaxChars: 600,
    strategistAgentId: 180038, // Daniel Wu — D2C Strategy Manager
    postLabels: ["Positioning", "Tagline 5 套", "Voice guide", "Visual direction", "5 應用範例"],
    scoutKind: "news",
    extras: { postsCount: 5, narrativeArc: true, replyTemplates: 3 },
  },
  "br-100-voice-playbook": {
    variants: 4, images: 4, runImageGen: true, imageDirectorId: BR100_IMG2,
    aspectRatio: "1:1", fluxSize: "square_hd", imageQualitySteps: 4,
    variantLabels: ["8 應用情境", "Do/Don't", "5 範例", "跨平台適配"],
    captionMinChars: 400, captionMaxChars: 700,
    postLabels: ["8 應用情境", "Do/Don't", "5 範例", "跨平台適配"],
    scoutKind: "viral",
    extras: { postsCount: 4, replyTemplates: 3 },
  },
  "rs-100-discovery-sprint": {
    variants: 5, images: 0, runImageGen: false, imageDirectorId: null as any,
    aspectRatio: null as any, fluxSize: null as any, imageQualitySteps: 0,
    variantLabels: ["Day 1 訪綱", "Day 2-3 Personas", "Day 4 JTBD map", "Day 5 Synthesis", "行動建議"],
    captionMinChars: 400, captionMaxChars: 700,
    postLabels: ["Day 1 訪綱", "Day 2-3 Personas", "Day 4 JTBD map", "Day 5 Synthesis", "行動建議"],
    scoutKind: "news",
    extras: { postsCount: 5, replyTemplates: 3 },
  },
  "rs-100-competitor-mapping": {
    variants: 5, images: 0, runImageGen: false, imageDirectorId: null as any,
    aspectRatio: null as any, fluxSize: null as any, imageQualitySteps: 0,
    variantLabels: ["市場 overview", "競品 deep dive ×5", "定位 map", "Opportunity gaps", "推薦策略"],
    captionMinChars: 300, captionMaxChars: 600,
    postLabels: ["市場 overview", "競品 deep dive ×5", "定位 map", "Opportunity gaps", "推薦策略"],
    scoutKind: "news",
    extras: { postsCount: 5, replyTemplates: 3 },
  },
};

// ─── Unified lookup ─────────────────────────────────────────────────────
const ALL_100_TASKS = [...FB_100S_TASKS, ...IG_100S_TASKS, ...YT_100S_TASKS, ...MULTI_100S_TASKS];
const ALL_100_ORCH: Record<string, OrchestraConfig> = {
  ...FB_100S_ORCHESTRA, ...IG_100S_ORCHESTRA, ...YT_100S_ORCHESTRA, ...MULTI_100S_ORCHESTRA,
};

export const ALL_100S_TASKS = ALL_100_TASKS;
export const ALL_100S_ORCHESTRA = ALL_100_ORCH;

export function get100Template(taskId: string): FBTaskTemplate | null {
  return ALL_100_TASKS.find((t) => t.id === taskId) ?? null;
}
export function get100OrchestraConfig(taskId: string): OrchestraConfig | null {
  return ALL_100_ORCH[taskId] ?? null;
}
