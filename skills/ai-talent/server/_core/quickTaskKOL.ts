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
    label: { en: "Brand Brief One-Liner", zh: "一句話 Brand Brief 給 KOL" },
    description: "把品牌定位濃縮成 KOL 可消化的一句話 brief",
    agent_id: 25, skill_slug: "kol-outreach",
    primary_question: "想讓 KOL 抓到的核心訊息？",
    primary_input: {
      key: "core_message",
      placeholder: "例：我們的童書是給害怕讀中文的海外華人小孩用的",
      type: "textarea",
    },
    inputs: [{ key: "core_message", label: "核心訊息", type: "textarea", required: true }],
    contextSources: [
      "brand.positioning.goldenCircle.why",
      "brand.positioning.tagline.zhTagline",
    ],
    systemPrompt: `產出 1 個一句話 brand brief（20-40 字）。
**目標**：KOL 看過一次能記住 + 能在自己的內容裡自然講出來。
**結構**：For [target] who [pain], we [unique solution]. 中文化、口語化。
**輸出**：只寫那一句，不要解釋。
${KOL_TONE}`,
    preferredModel: "anthropic", maxTokens: 80,
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
    variantLabels: ["短版", "情感版", "對比版"],
    captionMinChars: 20, captionMaxChars: 60,
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
