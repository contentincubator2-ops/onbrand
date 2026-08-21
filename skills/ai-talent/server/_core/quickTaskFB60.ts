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
    label: { en: "FB Full Single Post", zh: "FB 單篇完整貼文" },
    description: { en: "5 variants + 5 real images + reply templates + posting time + 24h follow-up", zh: "5 variants + 5 真生圖 + 留言模板 + 發文時段 + 24h 跟進" },
    agent_id: 60021, // Tina Ji | Facebook/Instagram Social Copywriter
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
    label: { en: "FB Link Post (Full Version)", zh: "FB 連結貼文（完整版）" },
    description: { en: "OG copy + thumbnail style + intro + reply templates + posting time", zh: "OG 文案 + 縮圖風格 + 引言 + 留言模板 + 發文時段" },
    agent_id: 60025, // Fiona Fei | F&B Brand Social Copywriter
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
    label: { en: "FB Album 4-Photo Set", zh: "FB 相簿 4 張組合" },
    description: { en: "Strategist plans the narrative arc + 4 style-consistent photos + unifying caption", zh: "Strategist 規劃敘事弧 + 4 張一致風格 + caption 統合敘事" },
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

  // 4. Carousel 5 卡 — 2026-05-18 (CJ): moved to the 99s tier as
  //    fb-99-carousel-5 (real 5-card multi-image deliverable needs the
  //    99s budget). normalizeTaskId maps the old id forward.

  // 5. 5 天倒數系列 — Strategist: Ryan Yu, Writer: Claire Hsu  (multi-post)
  {
    id: "fb-60-countdown-5day",
    tier: "60s",
    postType: "feed",
    label: { en: "FB 5-Day Countdown Series", zh: "FB 5 天倒數系列" },
    description: { en: "Strategist designs the countdown arc + 5 posts written in parallel + own image each", zh: "Strategist 設計倒數弧 + 5 天 5 篇平行寫作 + 各自配圖" },
    agent_id: 180159, // Claire Hsu | Social Media Brand Strategist
    skill_slug: "social-media-manager",
    primary_question: "活動名稱是？",
    primary_input: { key: "event_name", placeholder: "例：週年慶 / 新品上市 / 限時優惠", type: "text" },
    inputs: [
      { key: "event_name", label: "活動名稱", type: "text", required: true },
      { key: "event_date", label: "活動日期", type: "text", required: false, placeholder: "例：5/15" },
      { key: "key_offer", label: "主要優惠 / 鉤子", type: "textarea", required: true },
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
    label: { en: "FB Event Launch Kit (4 Posts)", zh: "FB 活動上線包（4 篇）" },
    description: { en: "Eric Lin designs the launch arc + teasers ×2 / launch day / post-mortem, 4 posts in parallel", zh: "Eric Lin 設計 launch arc + 預告×2 / 當日 / 事後 4 篇平行" },
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
    label: { en: "FB Livestream Kit (6 Segments)", zh: "FB 直播完整配套 (6 段)" },
    description: { en: "Teaser / opener / 3 peaks / highlight recap — 6 posts in parallel", zh: "預告 / 開場 / 3 爆點 / 精華回顧 6 篇平行" },
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
    label: { en: "FB Pinned Post + 3 Companions", zh: "FB 釘選 + 3 配套" },
    description: { en: "Pinned main post + 3 companions (FAQ / about / case)", zh: "釘選主貼文 + 3 種補充配套（FAQ / about / 案例）" },
    agent_id: 224059, // Rui Xuan Teo — Social Media Strategist Beauty SG (1149 char)
    skill_slug: "fb-copywriting",
    primary_question: "想讓新訪客 3 秒內知道你做什麼？",
    primary_input: { key: "brand_focus", placeholder: "我們是誰、做什麼、為什麼追蹤", type: "textarea" },
    inputs: [
      { key: "brand_focus", label: "品牌重點", type: "textarea", required: true },
    ],
    systemPrompt: `產出 FB 釘選 + 配套貼文其中 1 篇。
本次你寫的是「{label}」（釘選主文 / 常見問答 FAQ / 關於我們 About / 代表案例＝挑一個最有代表性的客戶成功故事當門面）。
釘選主文 300-500 字；配套各 200-300 字。
釘選會留很久，不要寫時效性內容（"最新"、"本月" 都不要）。
${FB60_TONE}`,
    preferredModel: "qwen",
    maxTokens: 1100,
    outputDefaults: { platform: "facebook", post_type: "pinned" },
  },

  // 9. 3 篇連載 — 2026-05-18 (CJ): moved to 99s as fb-99-serial-3
  //    (strategist + 3 episodes + 3 images + extras too heavy for 60s,
  //    hit the 5-min stale guard). normalizeTaskId maps the old id fwd.

  // 10. 爆款改寫 — 2026-05-18 (CJ): moved to 99s as fb-99-viral-rewrite
  //     (strategist + specialty too heavy for 60s, 502 risk).
  //     normalizeTaskId maps the old id forward.

  // 11. 時事改寫文 — 2026-05-18 (CJ「502」): moved to 99s as
  //     fb-99-trend-rewrite (strategist + specialty + scout too heavy
  //     for 60s — synchronous part hit nginx 60s → 502). normalizeTaskId
  //     maps the old id forward.

  // 12. 客戶見證改寫文 — 2026-05-18 (CJ): moved to 99s as
  //     fb-99-testimonial-rewrite (strategist + legal specialty too
  //     heavy for 60s). normalizeTaskId maps the old id forward.

  // 13. FB 廣告完整包 A/B/C — 3 個獨立廣告，每個含 caption + 3 張視覺
  // 替代危機回覆任務，per CJ direction 2026-05-06
  {
    id: "fb-60-ad-pack-3",
    tier: "60s", postType: "ad",
    label: { en: "FB Full Ad Pack A/B/C", zh: "FB 廣告完整包 A/B/C" },
    description: { en: "3 standalone ads (emotional / rational / contrast), each with full caption + 3 image styles", zh: "3 個獨立廣告（情感 / 理性 / 反差切角），每個含完整 caption + 3 張配圖風格" },
    agent_id: 224179, // Lorenzo Dela Rosa — Social Media Strategist Health PH (1145 char)
    skill_slug: "fb-ad-copy",
    primary_question: "這檔廣告的主推產品 / 受眾 / 賣點？",
    primary_input: { key: "campaign", placeholder: "例：母親節健力餐高蛋白組合，職業媽媽 35-50 歲", type: "textarea" },
    inputs: [
      { key: "campaign", label: "活動主題", type: "textarea", required: true },
    ],
    // 2026-08-21 (CJ「要求每篇加 CTA 網址，有的版本有、有的沒有」): the
    // old「CTA (10 字)」cap forced the model to choose between the URL and
    // the button text; the URL now lives at the end of [Primary] and [CTA]
    // is button text only. Enforced by adCopyContract (prompt rule →
    // validate/retry → deterministic repair).
    systemPrompt: `產出 FB 廣告完整包其中 1 支廣告（150-300 字）。
本次你寫的是「{label}」這個切角的完整廣告。
結構：headline (25 字內) + primary text (80-150 字) + CTA 按鈕文字 (2–8 字)。
caption 欄位整合輸出格式（三個標記缺一不可、順序固定）：
[Headline] xxx
[Primary] xxxxx
[CTA] xxx
若使用者在需求裡給了網址：把該網址**逐字**放在 [Primary] 的最後一行（每一個切角都要），[CTA] 只放按鈕文字、不放網址。沒給網址就不要捏造任何連結。
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
  // 2026-05-18 (CJ「承諾是完整貼文，圖完成才展示；60s 來不及 5 個就 2 個」):
  // 此任務交付的是「完整貼文」(文+圖)，不該先給沒圖的半成品。降到 2 版
  // 讓文+圖能在 60s 內都完成；holdForImages 讓前端在圖好之前不顯示 mockup。
  "fb-60-single-full": {
    variants: 2,
    images: 2,
    runImageGen: true,
    imageDirectorId: MANDY,
    aspectRatio: "1:1",
    fluxSize: "square_hd",
    imageQualitySteps: 4,
    variantLabels: ["情感版", "理性版", "故事版", "數據版", "懸念版"],
    captionMinChars: 200,
    captionMaxChars: 400,
    holdForImages: true,
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

  // 4. Carousel 5 卡 — 2026-05-18 (CJ): moved to 99s as fb-99-carousel-5
  //    (real 5-card multi-image deliverable). Config now in FB_99S_ORCHESTRA.

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
    variantLabels: ["釘選主文", "常見問答 FAQ", "關於我們 About", "代表案例（客戶成功故事）"],
    captionMinChars: 200,
    captionMaxChars: 500,
    postLabels: ["釘選主文", "常見問答 FAQ", "關於我們 About", "代表案例（客戶成功故事）"],
    extras: {
      postsCount: 4,
      replyTemplates: 5, postingTime: true, followupPost: true,
    },
  },

  // 9. 3 篇連載 — 2026-05-18 (CJ): moved to 99s as fb-99-serial-3.
  //    Config now in FB_99S_ORCHESTRA.

  // 10. 爆款改寫 — 2026-05-18 (CJ): moved to 99s as fb-99-viral-rewrite.

  // 11. 時事改寫文 — 2026-05-18 (CJ): moved to 99s as fb-99-trend-rewrite.
  //     Config now in FB_99S_ORCHESTRA.

  // 12. 客戶見證改寫文 — 2026-05-18 (CJ): moved to 99s as
  //     fb-99-testimonial-rewrite.

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
