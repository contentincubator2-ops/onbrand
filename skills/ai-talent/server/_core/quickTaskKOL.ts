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
    systemPrompt: `產出 1 份**專業、完整、可直接交付**的「KOL／網紅合作 Brief」文件（不是貼文、不是信、不是一句話）。
這要達到行銷代理商交給網紅的正式 brief 水準 — 每一節都要寫滿、具體、可執行，不是條列關鍵字。
使用者貼的長文 / 輸入只是**素材**，你要從中萃取並補完成 brief，不是照抄或改寫成文章。
**用 Markdown（# 為文件標題，## 為章節），嚴格照以下 14 節結構與順序輸出**：

# [活動名稱] KOL 合作 Brief

## 1. 專案總覽
一句話總結這次合作 + 專案期間。

## 2. 品牌簡介
品牌是誰、使命、為什麼這件事重要（2-3 句，建立 KOL 的情感連結）。

## 3. 合作目標與 KPI
具體且可量化：主目標 + 2-3 個衡量指標（觸及 / 互動率 / 連結點擊 / 轉換或認養數等）。

## 4. 目標受眾
這支內容要打到誰：年齡、身分、在意什麼、平台習慣。

## 5. 活動核心概念 / Hook
這次內容的中心故事或切角（讓 KOL 一看就知道怎麼發揮）。

## 6. 核心訊息
- 必須傳達（2-3 點）
- 加分可帶（1-2 點）

## 7. 內容產出規格（Deliverables）
逐項列：平台 / 形式（貼文・限動・Reels・影片）/ 則數 / 長度或秒數 / 建議參考範例方向。

## 8. 內容方向與調性
建議切角與語氣，保留創作空間（不要寫死逐字稿），並點出可用的個人故事連結方式。

## 9. 必提 / 必避（Mandatories）
- 必提：指定 hashtag、@官方帳號、連結 / UTM、CTA
- 必避：不可出現的說法、競品、敏感或誇大用語
- 揭露：依台灣規範清楚標註合作關係（如 #合作 #廣告 #贊助）

## 10. 品牌素材與連結
可提供的 logo / 主視覺 / 產品資訊 / 官方連結（未知用 [待補：連結]）。

## 11. 時程與里程碑
Brief 確認 → 初稿交付 → 修改 → 上稿 → 成效回報（每項給日期，未知用 [待補：日期]）。

## 12. 審稿與修改流程
誰審、幾輪修改、回覆時效。

## 13. 報酬與條款
合作形式與報酬、付款節點、內容授權（品牌可否轉貼 / 投放付費廣告 / 期限）。未知用 [待補：…]。

## 14. 窗口與成效回報
對接窗口 + 需回報的數據與截圖、回報時間。

**規則**：繁體中文、台灣用語、具體可執行。缺的具體資訊一律用「[待補：例如 上稿日期]」當場標出，**絕不反問使用者、絕不省略任何一節**。只輸出 brief 文件本身，不要前言或結語。
${KOL_TONE}`,
    preferredModel: "anthropic", maxTokens: 3000,
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
    captionMinChars: 700, captionMaxChars: 3200,
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
