/**
 * KOL outreach quick-task templates.
 *
 * 2026-05-12 (CJ「KOL 我們提供說法，不提供名單」). Drop does NOT compete
 * with iKala / AspireIQ / KOL Radar (database providers). We provide
 * the talking points — the 「怎麼說」 that converts a cold approach into
 * a real collaboration.
 *
 * Tier breakdown:
 *   30s — single message (DM opener / one-line brief / follow-up)
 *   60s — full pitch pack with 5 stages   (see quickTaskMulti60.KOL_60S_TASKS)
 *   100s — multi-KOL campaign toolkit     (see quickTask100.MULTI_100S_TASKS)
 */
import type { FBTaskTemplate, OrchestraConfig } from "./quickTaskFB";

const KOL_TONE = `
語氣要求：尊重、不卑不亢、像個人不像業配機器。
**禁區：** "親愛的 KOL 您好" / "我們是 XX，希望邀請您合作" 這種模板開頭。
要 frame why this — 為什麼是你（KOL）、為什麼是現在、為什麼是我們。
`;

export const KOL_30S_TASKS: FBTaskTemplate[] = [
  {
    id: "kl-30-invite-opener",
    tier: "30s", postType: "generic",
    label: { en: "KOL Invite DM Opener", zh: "KOL 邀請開場 DM（3 種口吻）" },
    description: "3 種開場口吻，避開「您好我是」業配機器人感",
    agent_id: 30015, skill_slug: "kol-outreach",
    primary_question: "想找什麼 KOL 合作什麼主題？",
    primary_input: {
      key: "context",
      placeholder: "例：找媽媽育兒類 1-5 萬粉絲，聊母親節活動",
      type: "textarea",
    },
    inputs: [{ key: "context", label: "KOL + 合作主題", type: "textarea", required: true }],
    systemPrompt: `產出 1 封 KOL 邀請開場 email（180-300 字，文情並茂）。
這是一封正式但溫度高的邀約信，不是一句話 DM。
**結構**：
1. 開場 hook — 具體提一個對方近期 post／觀點／作品，講出你真的看過、被觸動的點（最關鍵，決定對方要不要往下讀）。
2. 為什麼是你 — 把對方的特質和這次合作的精神連起來，讓對方覺得「這是為我量身找的」。
3. 合作邀請 — 說清楚是什麼樣的合作、想一起達成什麼，描繪畫面但先不丟價碼／硬條件。
4. 收尾 — 一個低壓力、容易回覆的邀請（"想先聽聽你的想法" 而非 "請問願不願意"）。
**文筆要求**：句子有節奏、有真誠的情感溫度，像一個懂對方的人寫的信，不是模板。可適度分段。
**禁區：** 不要寫「您好我是 XX 品牌的行銷專員」這種模板開頭；不要列點式生硬條列。
**輸出**：只寫信件本文（可含簡短稱呼與署名感的收尾），不要 prefix「以下是範例」、不要寫主旨行。
${KOL_TONE}`,
    preferredModel: "anthropic", maxTokens: 600,
    outputDefaults: { platform: "generic", post_type: "generic" },
  },
  {
    id: "kl-30-brief-oneliner",
    tier: "30s", postType: "generic",
    label: { en: "Influencer Brief", zh: "KOL 合作 Brief（可直接給網紅）" },
    description: "一份結構化的網紅合作 brief：背景、目標、核心訊息、必提必避、產出規格、時程",
    agent_id: 25, skill_slug: "kol-outreach",
    primary_question: "這次合作的品牌 / 活動 + 想達成什麼？",
    primary_input: {
      key: "core_message",
      placeholder: "例：家扶基金會母親節認養活動，想讓 KOL 帶動每月 700 元認養，貼一篇有溫度的故事文",
      type: "textarea",
    },
    inputs: [{ key: "core_message", label: "品牌 / 活動 + 目標", type: "textarea", required: true }],
    contextSources: [
      "brand.positioning.goldenCircle.why",
      "brand.positioning.tagline.zhTagline",
    ],
    systemPrompt: `產出 1 份可直接交給網紅的「KOL 合作 Brief」文件（不是貼文、不是信、不是一句話）。
使用者貼的長文 / 輸入只是素材 — 你要**萃取**成 brief，不是照抄或改寫成文章。
**用 Markdown 標題分節，嚴格照以下結構與順序，每節 1-4 句具體可執行內容**：

## 品牌 / 活動一句話
（這次合作是誰、為誰、想推動什麼，一句講清楚）

## 合作目標
（這支內容要達成的具體成效，例如：帶動認養數 / 觸及 / 導流連結）

## 受眾輪廓
（這支內容主要要打到誰）

## 核心訊息（KOL 必須帶到，2-3 點）
- …
- …

## 內容方向與調性
（建議切入角度 + 語氣；給創作空間，不要寫死逐字稿）

## 產出規格
（平台 / 形式 / 則數 / 長度或秒數 / 必附連結）

## 必提 / 必避
- 必提：指定 hashtag、@帳號、優惠或行動呼籲
- 必避：不可出現的說法、競品、敏感詞
- 揭露：依台灣規範標註合作關係（如 #合作 #廣告）

## 時程
（草稿交付 / 修改 / 上稿日；未知用 [待補：日期]）

## 素材與連結
（可用的圖文素材、官方連結；未知用 [待補：連結]）

**規則**：具體、可執行、繁體中文、台灣用語。缺的具體資訊用「[待補：例如 上稿日期]」標出，不要反問使用者。只輸出 brief 本身，不要前言或結語。
${KOL_TONE}`,
    preferredModel: "anthropic", maxTokens: 1400,
    outputDefaults: { platform: "generic", post_type: "generic" },
  },
  {
    id: "kl-30-followup",
    tier: "30s", postType: "generic",
    label: { en: "KOL Follow-Up Message", zh: "KOL 追蹤訊息（沒回 / 已聊 / 已合作後）" },
    description: "3 種情境的後續追蹤訊息，自然不催促",
    agent_id: 60067, skill_slug: "kol-outreach",
    primary_question: "上次溝通到哪裡？",
    primary_input: {
      key: "last_touch",
      placeholder: "例：已寄出邀請 7 天沒回 / 已聊過合作條件但未確認 / 已合作完想收尾",
      type: "textarea",
    },
    inputs: [{ key: "last_touch", label: "上次互動", type: "textarea", required: true }],
    systemPrompt: `產出 1 個 KOL 追蹤訊息（60-120 字）。
**情境**：依照「上次互動」的進度，寫合適的下一步訊息。
- 沒回：給對方一個容易回覆的橋段（"想聽聽你的看法" vs "請問有意願嗎"）
- 已聊未敲定：提供新資訊或新節點推進
- 已合作完：感謝 + 為下次留口（不要立刻問下個合作）
**禁區**：不要寫「想跟您確認一下」這種催促感。
${KOL_TONE}`,
    preferredModel: "anthropic", maxTokens: 250,
    outputDefaults: { platform: "generic", post_type: "generic" },
  },
];

export const KOL_30S_ORCHESTRA: Record<string, OrchestraConfig> = {
  "kl-30-invite-opener": {
    variants: 3, images: 0, runImageGen: false, imageDirectorId: 60030,
    aspectRatio: "1:1", fluxSize: "square_hd", imageQualitySteps: 4,
    variantLabels: ["真誠版", "互惠版", "新聞點切入版"],
    captionMinChars: 180, captionMaxChars: 320,
    extras: { replyTemplates: 0, postingTime: false, followupPost: false },
  },
  "kl-30-brief-oneliner": {
    variants: 3, images: 0, runImageGen: false, imageDirectorId: 60030,
    aspectRatio: "1:1", fluxSize: "square_hd", imageQualitySteps: 4,
    variantLabels: ["完整正式版", "精簡重點版", "活動主題版"],
    captionMinChars: 350, captionMaxChars: 1400,
    extras: { replyTemplates: 0, postingTime: false, followupPost: false },
  },
  "kl-30-followup": {
    variants: 3, images: 0, runImageGen: false, imageDirectorId: 60030,
    aspectRatio: "1:1", fluxSize: "square_hd", imageQualitySteps: 4,
    variantLabels: ["輕觸版", "推進版", "收尾版"],
    captionMinChars: 60, captionMaxChars: 150,
    extras: { replyTemplates: 0, postingTime: false, followupPost: false },
  },
};
