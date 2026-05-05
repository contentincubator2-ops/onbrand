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
  tier: "30s" | "60s" | "90s";
  postType: string;                        // matches mockup format key
  label: string;                           // user-facing chip label
  description: string;                     // 1-line UI hint
  inputs: Array<{ key: string; label: string; type: "text" | "textarea"; required: boolean; placeholder?: string }>;
  systemPrompt: string;                    // LLM system message; output spec appended by runQuick
  preferredModel: "qwen" | "zhipu" | "azure-foundry" | "azure-position" | "hermes" | "any";
  /** maxTokens cap — 30s aim ~400, 60s ~900, 90s ~1800 */
  maxTokens: number;
  /** Default platform & post_type the quickTask output should embed */
  outputDefaults: { platform: "facebook"; post_type: string };
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
    inputs: [
      { key: "topic", label: "今天要講什麼？", type: "textarea", required: true, placeholder: "例：春季新品上市 / 母親節活動 / 客戶感謝" },
    ],
    systemPrompt: `你是 FB 社群編輯。產出單張圖文 FB 貼文 caption，100-200 字。
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
    label: "FB 純文字 hook 5 種",
    description: "5 個不同口吻的開場 hook（無圖）",
    inputs: [
      { key: "topic", label: "貼文主題", type: "textarea", required: true },
    ],
    systemPrompt: `產出 5 個不同口吻的 FB 純文字貼文 hook（每個獨立可用）。
口吻分別：① 反問式 ② 數字式 ③ 反差式 ④ 故事開頭式 ⑤ 直接挑釁式。
每個 hook 30-60 字，緊接著一句 follow-up（共 60-100 字）。
放進 variants[]，label 寫口吻名。caption 主欄位放最強那一版。`,
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

// ─── 60s tier (13 tasks — 2-3 step or richer single-call) ──────────────────

export const FB_60S_TASKS: FBTaskTemplate[] = [
  {
    id: "fb-60-single-image-full",
    tier: "60s",
    postType: "feed",
    label: "FB 單圖文完整貼文",
    description: "Caption + 完整 image_style_direction（給 MediaGenFlow 串接） + hashtag",
    inputs: [
      { key: "topic", label: "貼文主題", type: "textarea", required: true },
      { key: "feeling", label: "想讓觀眾有什麼感覺", type: "text", required: false, placeholder: "例：被理解、想嘗試、有趣" },
    ],
    systemPrompt: `產出 FB 完整單圖文貼文（caption 200-400 字）+ 圖片風格方向（image_style_direction 全欄位填）+ 5 個 hashtag。
caption 結構：hook → 故事 / 細節 → 共鳴 → CTA。可用 markdown bold 強調 1-2 處。
image_style_direction：
  summary（1 句總結）/ tone[]（3-5 個關鍵字）/ subject（圖中主體）/
  composition（角度框景）/ lighting / color_palette / aspect_ratio="1:1" / model_suggestion="gpt-image-1".
另外 variants[] 給 2 個替代 caption（情感版 vs 理性版）。`,
    preferredModel: "azure-position", // Claude better for nuanced copy
    maxTokens: 1100,
    outputDefaults: { platform: "facebook", post_type: "feed" },
  },
  {
    id: "fb-60-album-4photo",
    tier: "60s",
    postType: "album",
    label: "FB Album 4 張照片貼文",
    description: "Caption + 4 張一致風格的 image_style_direction",
    inputs: [
      { key: "occasion", label: "什麼場合 / 主題（如：公司活動、產品 lifestyle）", type: "textarea", required: true },
    ],
    systemPrompt: `產出 FB 4 張相片貼文。
caption 200-300 字統合敘事。
image_style_direction.summary 寫整組 4 張的「共同視覺風格」基調（aspect_ratio="1:1"）。
extra.frame_descriptions 給 4 條 array，每張圖各自 1 句具體 subject 描述（注意敘事弧：開場 / 細節 / 高潮 / 收尾）。`,
    preferredModel: "azure-position",
    maxTokens: 900,
    outputDefaults: { platform: "facebook", post_type: "album" },
  },
  {
    id: "fb-60-carousel-5card",
    tier: "60s",
    postType: "carousel",
    label: "FB Carousel 5 卡輪播",
    description: "Hook-Build-Turn-Payoff-CTA 5 卡敘事",
    inputs: [
      { key: "topic", label: "輪播主題", type: "textarea", required: true },
    ],
    systemPrompt: `產出 FB Carousel 5 卡（敘事弧：Hook → Build → Turn → Payoff → CTA）。
caption 是輪播主貼文文（150-250 字 tease 整組要看完）。
extra.cards 給 5 張，每張：{ headline, body, image_style_summary, link_preview }。
image_style_direction.summary 寫整組「共同視覺基調」aspect_ratio="1:1"。`,
    preferredModel: "azure-position",
    maxTokens: 1400,
    outputDefaults: { platform: "facebook", post_type: "carousel" },
  },
  {
    id: "fb-60-story-full",
    tier: "60s",
    postType: "story",
    label: "FB Story 完整一則",
    description: "9:16 文 + overlay + sticker 建議 + 風格",
    inputs: [
      { key: "topic", label: "Story 主題", type: "textarea", required: true },
    ],
    systemPrompt: `產出 FB Story 完整內容（9:16 直式）。
caption 是配文（30-80 字 overlay）。
title 是大標 5-10 字。
extra.stickers[] 建議 1-2 個互動元素（poll / question / countdown）。
image_style_direction aspect_ratio="9:16"，summary 描述風格基調。`,
    preferredModel: "qwen",
    maxTokens: 600,
    outputDefaults: { platform: "facebook", post_type: "story" },
  },
  {
    id: "fb-60-link-with-preview",
    tier: "60s",
    postType: "feed",
    label: "FB 連結貼文（含 OG 文案 + 縮圖風格）",
    description: "完整版連結貼文，連 OG image 風格都規劃",
    inputs: [
      { key: "url", label: "連結網址", type: "text", required: true },
      { key: "context", label: "為什麼分享 / 內容摘要", type: "textarea", required: true },
    ],
    systemPrompt: `產出 FB 連結貼文。
caption 100-200 字 hook + why-care。
title 寫 OG title（45-65 字以內，被 FB 自動抓的版本）。
description 寫 OG description（150 字內）。
image_style_direction 描述 OG 縮圖風格 aspect_ratio="1200:630"。`,
    preferredModel: "qwen",
    maxTokens: 700,
    outputDefaults: { platform: "facebook", post_type: "feed" },
  },
  {
    id: "fb-60-poll",
    tier: "60s",
    postType: "poll",
    label: "FB 投票 / 問答貼文",
    description: "互動型貼文：caption + 3-4 投票選項",
    inputs: [
      { key: "question_topic", label: "想問粉絲什麼？", type: "textarea", required: true },
    ],
    systemPrompt: `產出 FB 投票貼文。
caption 100-150 字提出問題 + 為什麼想問。
description 是 JSON array 字串： [{"label":"選項一"},{"label":"選項二"},{"label":"選項三"}]（3-4 個）.
options 要互斥、有趣、彼此差異夠大。
extra.followup_action 寫「投票結果出來後品牌會做什麼」。`,
    preferredModel: "qwen",
    maxTokens: 500,
    outputDefaults: { platform: "facebook", post_type: "poll" },
  },
  {
    id: "fb-60-event-poster",
    tier: "60s",
    postType: "event",
    label: "FB 活動 Event 貼文",
    description: "活動發布貼文 + 海報風格 + 報名 CTA",
    inputs: [
      { key: "event_name", label: "活動名稱", type: "text", required: true },
      { key: "event_when", label: "日期 / 時間", type: "text", required: true },
      { key: "event_where", label: "地點 / 線上", type: "text", required: true },
      { key: "event_why", label: "為什麼參加", type: "textarea", required: true },
    ],
    systemPrompt: `產出 FB 活動 Event 貼文。
title 是活動標題（簡潔有 hook，10-20 字）。
caption 200-300 字：第 1 段重點凸顯日期地點與 1 個 hook，第 2 段 3-5 個 bullet 為什麼來，第 3 段報名 CTA + 早鳥福利。
image_style_direction 描述海報風格 aspect_ratio="16:9" 或 "1:1"，重點：日期感、行動感、品牌一致。`,
    preferredModel: "azure-position",
    maxTokens: 900,
    outputDefaults: { platform: "facebook", post_type: "event" },
  },
  {
    id: "fb-60-livestream-prep-pair",
    tier: "60s",
    postType: "feed",
    label: "FB 直播預告 + 摘要（成對）",
    description: "Pre-live 預告 + Post-live 摘要兩篇成對敘事",
    inputs: [
      { key: "live_topic", label: "直播主題", type: "text", required: true },
      { key: "key_points", label: "預計 3-5 個重點", type: "textarea", required: true },
    ],
    systemPrompt: `產出 FB 直播成對貼文（預告 + 摘要）。
caption 是「預告貼文」150-250 字（會講什麼 / 受眾痛點 / 開鈴鐺 CTA）。
extra.recap_post 是「摘要貼文」150-250 字（如果用戶錯過 / 3 個金句重點 / 完整錄播 CTA）— 這篇直播結束後才發。
image_style_direction 描述兩篇可共用的視覺基調 aspect_ratio="1:1"。`,
    preferredModel: "azure-position",
    maxTokens: 1100,
    outputDefaults: { platform: "facebook", post_type: "feed" },
  },
  {
    id: "fb-60-pinned-impact",
    tier: "60s",
    postType: "pinned",
    label: "FB 高衝擊釘選貼文",
    description: "粉專入門必看貼文：完整品牌價值主張 + 視覺",
    inputs: [
      { key: "brand_what", label: "我們做什麼", type: "textarea", required: true },
      { key: "brand_why", label: "為什麼追蹤我們", type: "textarea", required: true },
    ],
    systemPrompt: `產出 FB 釘選貼文（給新訪客看的「about」貼文）。
caption 300-500 字：強烈定位 → 3-5 個價值點（emoji 條列）→ 適合誰看 → 3 個內容類型預告 → 追蹤 CTA。
image_style_direction 描述「品牌主視覺基調」aspect_ratio="1:1"，強調可長期掛著不過時。`,
    preferredModel: "azure-position",
    maxTokens: 1100,
    outputDefaults: { platform: "facebook", post_type: "pinned" },
  },
  {
    id: "fb-60-cover-banner",
    tier: "60s",
    postType: "cover",
    label: "FB Cover 封面圖（含主視覺風格）",
    description: "851×315 banner 風格方向 + 配套標語",
    inputs: [
      { key: "season_or_campaign", label: "季節 / 活動主題", type: "text", required: true },
      { key: "brand_promise", label: "品牌承諾 / 主標", type: "textarea", required: true },
    ],
    systemPrompt: `產出 FB Cover 封面內容。
title 是封面主標（5-12 字，會疊在 banner 上）。
caption 80-150 字：封面下方搭配文（更新封面當下會發的小貼文）。
image_style_direction：完整描述 851×315 橫式 banner aspect_ratio="851:315"，強調品牌色 + 構圖視線引導 + 留白給疊字。`,
    preferredModel: "azure-position",
    maxTokens: 700,
    outputDefaults: { platform: "facebook", post_type: "cover" },
  },
  {
    id: "fb-60-crisis-full",
    tier: "60s",
    postType: "comment",
    label: "FB 危機回覆（完整 Lagadec 4 段）",
    description: "客訴 / 食安 / 出貨延遲等情境完整 4 段式",
    inputs: [
      { key: "incident", label: "事件 / 客訴內容", type: "textarea", required: true },
      { key: "facts", label: "已知事實 / 已處理項", type: "textarea", required: true },
      { key: "commitment", label: "承諾的具體行動 + 時程", type: "textarea", required: true },
    ],
    systemPrompt: `產出 FB 客訴 / 危機回覆（完整 Lagadec 4 段）。
caption 結構（每段獨立段落，總 200-350 字）：
1）真誠致歉 — 不推託、具體承認
2）解釋 — 客觀描述發生什麼，不為自己脫罪
3）承諾 — 具體行動 + 時程 + 補償
4）邀請私訊 — 提供 1 對 1 管道
description 放原始客訴內容（mockup 用）。
extra.escalation_path 給 1 條「若用戶不滿意可以怎麼升級」。`,
    preferredModel: "azure-position", // Claude — 危機文案需要高敏感度
    maxTokens: 900,
    outputDefaults: { platform: "facebook", post_type: "comment" },
  },
  {
    id: "fb-60-recommendation-reply",
    tier: "60s",
    postType: "recommendation",
    label: "FB 推薦評價回覆",
    description: "5 星 / 1-2 星都用 — 差別在語氣調性",
    inputs: [
      { key: "rating", label: "幾星（1-5）", type: "text", required: true },
      { key: "review", label: "用戶評價內容", type: "textarea", required: true },
    ],
    systemPrompt: `產出 FB 商家對推薦評價的回覆。
caption（80-150 字）：
- 5 星正評：感謝 + 具體呼應對方提到的細節 + 邀請再次造訪 / 推薦給朋友
- 1-3 星負評：先致歉 + 不卸責 + 具體解釋 / 補救 + 私訊邀請
不要 "感謝您的支持！" 罐頭。
description 放原始評價內容（含星數標記，例：「5 星推薦」mockup 會偵測）。`,
    preferredModel: "azure-position",
    maxTokens: 500,
    outputDefaults: { platform: "facebook", post_type: "recommendation" },
  },
  {
    id: "fb-60-week-7day-sprint",
    tier: "60s",
    postType: "feed",
    label: "FB 一週 7 天月曆 sprint",
    description: "短期 7 天迷你月曆（每天一篇主題 + 風格）",
    inputs: [
      { key: "campaign_focus", label: "本週主題 / 主推", type: "textarea", required: true },
      { key: "pillar_mix", label: "想用什麼 pillar 比例（可選）", type: "text", required: false, placeholder: "例：60% 教學 20% 故事 20% 促銷" },
    ],
    systemPrompt: `產出 FB 7 天迷你月曆。
caption 100-150 字 — 本週整體 narrative。
extra.days[] 給 7 天 array，每天：{ day_n, post_type, hook, body_outline, image_style_summary, post_time_suggestion }。
post_type 從這些挑：feed / album / carousel / story / poll / live。
注意 pillar 配比平衡 — 不要 7 天都是促銷或都是故事。`,
    preferredModel: "azure-position",
    maxTokens: 1700,
    outputDefaults: { platform: "facebook", post_type: "feed" },
  },
];

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

/** Helper: get all FB tasks across tiers in a single list */
export function listAllFBTasks() {
  return [
    ...FB_30S_TASKS.map(t => ({ ...t, kind: "fast" as const })),
    ...FB_60S_TASKS.map(t => ({ ...t, kind: "mid" as const })),
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
