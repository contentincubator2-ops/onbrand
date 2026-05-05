/**
 * LinkedIn quick-task templates (2026-05-05).
 * 10 LI 30s tasks. All caption_writer agents distinct from FB+IG+YT+TT pools.
 * image_director = Zeyu Yang (60071, Brand Visual Copy Integration).
 */
import type { FBTaskTemplate, OrchestraConfig } from "./quickTaskFB";

const LI_TONE = `
LinkedIn 受眾偏 B2B 專業人士。語氣要有專業洞察、不要 IG 那種口語。
偏好「真實案例 + 數據 + 觀點」格式，不要硬推銷。`;

export const LI_30S_TASKS: FBTaskTemplate[] = [
  {
    id: "li-30-insight-post",
    tier: "30s", postType: "feed",
    label: "LI 短貼文（insight 觀點）",
    description: "150-300 字的專業觀點貼文",
    agent_id: 30018, skill_slug: "linkedin-b2b",
    primary_question: "今天想分享什麼專業洞察？",
    primary_input: { key: "topic", placeholder: "例：AI 工具用了 6 個月後的 3 個體悟", type: "textarea" },
    inputs: [{ key: "topic", label: "主題 / 觀點", type: "textarea", required: true }],
    systemPrompt: `產出 LI 觀點貼文（150-300 字）。
結構：1 句鉤子（拋一個反共識觀點）→ 2-3 段論述（含 1 個數據 / 案例）→ 收尾（提問引留言）。
${LI_TONE}`,
    preferredModel: "azure-position", maxTokens: 700,
    outputDefaults: { platform: "linkedin", post_type: "feed" },
  },
  {
    id: "li-30-hook-3",
    tier: "30s", postType: "feed",
    label: "LI hook 3 種（吸引滑停）",
    description: "前 1-2 句鉤子（決定看不看下去）",
    agent_id: 229905, skill_slug: "hook-copywriter",
    primary_question: "貼文主題？",
    primary_input: { key: "topic", placeholder: "例：B2B SaaS 行銷成本優化", type: "textarea" },
    inputs: [{ key: "topic", label: "主題", type: "textarea", required: true }],
    systemPrompt: `產出 LI 開場 hook（30-60 字）。每變體 1 種策略（反共識 / 數據反差 / 個人故事）。
LI 演算法看頭 2 行決定要不要展開（"see more"），鉤子要強。${LI_TONE}`,
    preferredModel: "qwen", maxTokens: 350,
    outputDefaults: { platform: "linkedin", post_type: "feed" },
  },
  {
    id: "li-30-article-opener",
    tier: "30s", postType: "article",
    label: "LI 長文 opener（前 200 字）",
    description: "LinkedIn Article 開頭 200 字（決定讀者要不要繼續）",
    agent_id: 180172, skill_slug: "thought-leadership",
    primary_question: "這篇 Article 想討論什麼？",
    primary_input: { key: "topic", placeholder: "例：為何 70% 的數位轉型會失敗", type: "textarea" },
    inputs: [{ key: "topic", label: "Article 主題", type: "textarea", required: true }],
    systemPrompt: `產出 LinkedIn Article 開頭（150-250 字）。
結構：1 段強烈場景或 1 個事實 → 1 段個人連結 / 為何寫這篇 → 1 段這篇會談的 3 個重點。
不要 "在這篇文章中我會分享..." 這種範本式起手。${LI_TONE}`,
    preferredModel: "azure-position", maxTokens: 600,
    outputDefaults: { platform: "linkedin", post_type: "article" },
  },
  {
    id: "li-30-poll",
    tier: "30s", postType: "poll",
    label: "LI poll（問題 + 4 選項）",
    description: "LI poll 的問題 + 4 個選項",
    agent_id: 180173, skill_slug: "linkedin-engagement",
    primary_question: "想問你產業的什麼？",
    primary_input: { key: "topic", placeholder: "例：B2B 行銷 KPI / 遠端工作效率", type: "textarea" },
    inputs: [{ key: "topic", label: "想問的問題領域", type: "textarea", required: true }],
    systemPrompt: `產出 LI poll。每變體 1 種角度。
結構：問題（30 字內）+ 4 個選項（10 字內）+ 1 句「為什麼問」說明（在 caption 中）。
選項要互斥且涵蓋常見答案，不要全部讓人選同一個。${LI_TONE}`,
    preferredModel: "qwen", maxTokens: 350,
    outputDefaults: { platform: "linkedin", post_type: "poll" },
  },
  {
    id: "li-30-event-invite",
    tier: "30s", postType: "feed",
    label: "LI 活動邀請貼文",
    description: "邀請別人參加 webinar / meetup / 工作坊",
    agent_id: 180176, skill_slug: "linkedin-events",
    primary_question: "活動主題 / 時間 / 對象？",
    primary_input: { key: "event", placeholder: "例：「B2B SaaS 增長」線上分享，6/15 19:00", type: "textarea" },
    inputs: [{ key: "event", label: "活動資訊", type: "textarea", required: true }],
    systemPrompt: `產出 LI 活動邀請貼文（150-250 字）。
結構：1 句鉤子（為何這場有價值）→ 講者 / 主題簡介 → 3 個重點 → 報名連結 + CTA。
${LI_TONE}`,
    preferredModel: "qwen", maxTokens: 500,
    outputDefaults: { platform: "linkedin", post_type: "feed" },
  },
  {
    id: "li-30-dm-intro",
    tier: "30s", postType: "feed",
    label: "LI DM 開場訊息（陌生 connect）",
    description: "Connect 後的第一封 DM",
    agent_id: 180197, skill_slug: "linkedin-outreach",
    primary_question: "你想 connect 的對象是誰？目的？",
    primary_input: { key: "context", placeholder: "對象身份 + 你想做什麼（合作 / 請教 / 自我介紹）", type: "textarea" },
    inputs: [{ key: "context", label: "對象 + 目的", type: "textarea", required: true }],
    systemPrompt: `產出 LI DM 開場訊息（80-150 字）。每變體 1 種角度（求教式 / 共同點式 / 直接價值交換）。
規則：絕對不要直接賣東西。先給點價值或共鳴，再提具體小請求（不是大忙）。${LI_TONE}`,
    preferredModel: "qwen", maxTokens: 400,
    outputDefaults: { platform: "linkedin", post_type: "feed" },
  },
  {
    id: "li-30-comment",
    tier: "30s", postType: "feed",
    label: "LI 留言互動（給別人貼文）",
    description: "在別人 LI 貼文下留有價值的 comment",
    agent_id: 180203, skill_slug: "linkedin-engagement",
    primary_question: "貼上原貼文 / 描述貼文內容",
    primary_input: { key: "context", placeholder: "別人的貼文內容", type: "textarea" },
    inputs: [{ key: "context", label: "原貼文", type: "textarea", required: true }],
    systemPrompt: `產出 LI 留言（50-150 字）。每變體 1 種策略（補充經驗 / 不同觀點 / 提問擴展）。
LI 留言能帶曝光 — 要寫得讓原 PO 想回覆你（給連結機會）。${LI_TONE}`,
    preferredModel: "qwen", maxTokens: 400,
    outputDefaults: { platform: "linkedin", post_type: "feed" },
  },
  {
    id: "li-30-headline",
    tier: "30s", postType: "feed",
    label: "LI profile headline（個人簡介標）",
    description: "你的 LinkedIn profile 頁眉那行標題（120 字內）",
    agent_id: 180199, skill_slug: "personal-branding",
    primary_question: "你做什麼？想吸引誰？",
    primary_input: { key: "context", placeholder: "你的角色 + 想吸引的對象（潛在合作 / 客戶 / 同行）", type: "textarea" },
    inputs: [{ key: "context", label: "角色 + 受眾", type: "textarea", required: true }],
    systemPrompt: `產出 LI profile headline（120 字內）。每變體 1 種角度（職稱+價值 / 結果型 / 個性型）。
結構：你做什麼 + 為誰 + 結果。可用 | 分隔符（LI headline 慣例）。${LI_TONE}`,
    preferredModel: "qwen", maxTokens: 250,
    outputDefaults: { platform: "linkedin", post_type: "feed" },
  },
  {
    id: "li-30-newsletter",
    tier: "30s", postType: "newsletter",
    label: "LI Newsletter 標題 + 開頭",
    description: "LI Newsletter 標題 + 第一段（決定要不要訂閱）",
    agent_id: 180009, skill_slug: "newsletter-editor",
    primary_question: "本期 Newsletter 要講什麼？",
    primary_input: { key: "topic", placeholder: "本期主題", type: "textarea" },
    inputs: [{ key: "topic", label: "本期主題", type: "textarea", required: true }],
    systemPrompt: `產出 LI Newsletter 標題（30 字內）+ 第一段開頭（150-250 字）。
標題：要 specific（含具體數字 / 反差 / 問題），不要 "Weekly Digest" 這種。
開頭：1 句鉤子 + 為什麼這期值得讀完。${LI_TONE}`,
    preferredModel: "azure-position", maxTokens: 500,
    outputDefaults: { platform: "linkedin", post_type: "newsletter" },
  },
  {
    id: "li-30-document",
    tier: "30s", postType: "document",
    label: "LI Document（PDF carousel）8 頁結構",
    description: "8 頁的 LI document post 結構 + 每頁文字",
    agent_id: 220862, skill_slug: "narrative-editor",
    primary_question: "Document 想教 / 解釋什麼？",
    primary_input: { key: "topic", placeholder: "例：B2B 漏斗的 5 個常見錯誤", type: "textarea" },
    inputs: [{ key: "topic", label: "Document 主題", type: "textarea", required: true }],
    systemPrompt: `產出 LI Document 8 頁結構。
caption 用 "---" 分隔每一頁：
頁 1（封面）：5-8 字大標 + 副標 1 句
頁 2-7（內容 6 頁）：每頁 1 個重點 + 30-50 字補充（標號 #1-#6）
頁 8（CTA）：總結 1 句 + 邀請動作（追蹤 / 留言 / 連結）
${LI_TONE}`,
    preferredModel: "azure-position", maxTokens: 1200,
    outputDefaults: { platform: "linkedin", post_type: "document" },
  },
];

const ZEYU_ID = 60071;
export const LI_30S_ORCHESTRA: Record<string, OrchestraConfig> = {
  "li-30-insight-post":   { variants: 3, images: 3, runImageGen: false, imageDirectorId: ZEYU_ID, aspectRatio: "1.91:1", fluxSize: "landscape_4_3", imageQualitySteps: 4, variantLabels: ["反共識", "數據驅動", "個人故事"], captionMinChars: 150, captionMaxChars: 350 },
  "li-30-hook-3":         { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["反共識", "數據反差", "個人故事"], captionMinChars: 30, captionMaxChars: 80 },
  "li-30-article-opener": { variants: 3, images: 3, runImageGen: false, imageDirectorId: ZEYU_ID, aspectRatio: "1.91:1", fluxSize: "landscape_4_3", imageQualitySteps: 4, variantLabels: ["場景式", "個人連結", "重點預告"], captionMinChars: 150, captionMaxChars: 300 },
  "li-30-poll":           { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["策略選擇", "經驗分歧", "未來預測"], captionMinChars: 80, captionMaxChars: 200 },
  "li-30-event-invite":   { variants: 3, images: 3, runImageGen: false, imageDirectorId: ZEYU_ID, aspectRatio: "1.91:1", fluxSize: "landscape_4_3", imageQualitySteps: 4, variantLabels: ["專業敘述", "故事邀請", "稀缺感"], captionMinChars: 120, captionMaxChars: 300 },
  "li-30-dm-intro":       { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["求教式", "共同點", "價值交換"], captionMinChars: 80, captionMaxChars: 150 },
  "li-30-comment":        { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["補充經驗", "不同觀點", "提問擴展"], captionMinChars: 50, captionMaxChars: 150 },
  "li-30-headline":       { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["職稱+價值", "結果型", "個性型"], captionMinChars: 30, captionMaxChars: 120 },
  "li-30-newsletter":     { variants: 3, images: 3, runImageGen: false, imageDirectorId: ZEYU_ID, aspectRatio: "1.91:1", fluxSize: "landscape_4_3", imageQualitySteps: 4, variantLabels: ["數據驅動", "故事性", "問題式"], captionMinChars: 150, captionMaxChars: 300 },
  "li-30-document":       { variants: 3, images: 3, runImageGen: false, imageDirectorId: ZEYU_ID, aspectRatio: "1:1", fluxSize: "square_hd", imageQualitySteps: 4, variantLabels: ["教學清單型", "故事型", "反差型"], captionMinChars: 400, captionMaxChars: 1500 },
};

export function getLIOrchestraConfig(taskId: string): OrchestraConfig | null {
  return LI_30S_ORCHESTRA[taskId] ?? null;
}
