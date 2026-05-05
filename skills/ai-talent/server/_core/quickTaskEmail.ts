/**
 * Email (電子報) quick-task templates (2026-05-05).
 * 10 Email 30s tasks. All caption_writer agents distinct from prior pools.
 * image_director = Nathan Lu (60062, Media Newsletter Copywriter — repurposed for hero banner direction).
 */
import type { FBTaskTemplate, OrchestraConfig } from "./quickTaskFB";

const EMAIL_TONE = `
電子報 / Email 受眾：訂閱者本來就有一定信任。語氣要像朋友寫信，不要過度行銷感。
避免促銷觸發詞（FREE / urgent / 100%）會被 spam filter 抓。`;

export const EMAIL_30S_TASKS: FBTaskTemplate[] = [
  {
    id: "em-30-subject-line",
    tier: "30s", postType: "edm",
    label: "Email 主旨（subject line）",
    description: "決定開信率的關鍵 30 字內",
    agent_id: 30017, skill_slug: "email-marketing",
    primary_question: "這封 email 想讓人打開做什麼？",
    primary_input: { key: "context", placeholder: "例：通知新品上市 / 提醒未完成訂單 / 月報 / 邀請活動", type: "textarea" },
    inputs: [{ key: "context", label: "Email 目的 + 內容", type: "textarea", required: true }],
    systemPrompt: `產出 Email 主旨。每變體 1 種策略（好奇心 / 數字 / 個人化）。
規則：30 字內、避免 ALL CAPS、避免 ! 連發、避免 "FREE" "urgent" 等 spam 詞。
${EMAIL_TONE}`,
    preferredModel: "qwen", maxTokens: 250,
    outputDefaults: { platform: "email", post_type: "edm" },
  },
  {
    id: "em-30-preview-text",
    tier: "30s", postType: "edm",
    label: "Email preview text（信箱預覽）",
    description: "subject 旁邊那行小字，補強開信誘因",
    agent_id: 60012, skill_slug: "email-crm",
    primary_question: "subject 主旨是？",
    primary_input: { key: "subject", placeholder: "貼上你的 subject line", type: "textarea" },
    inputs: [{ key: "subject", label: "Subject + 內文摘要", type: "textarea", required: true }],
    systemPrompt: `產出 Email preview text（80 字內）。每變體 1 種策略（懸念延伸 / 補充資訊 / 個人化）。
preview 不要重複 subject 內容 — 要補強開信誘因。${EMAIL_TONE}`,
    preferredModel: "qwen", maxTokens: 200,
    outputDefaults: { platform: "email", post_type: "edm" },
  },
  {
    id: "em-30-welcome",
    tier: "30s", postType: "edm",
    label: "歡迎信（welcome email）",
    description: "新訂閱者的第一封信",
    agent_id: 60060, skill_slug: "newsletter",
    primary_question: "你的品牌是什麼？訂閱者會獲得什麼？",
    primary_input: { key: "context", placeholder: "品牌簡介 + 訂閱 value", type: "textarea" },
    inputs: [{ key: "context", label: "品牌 + value", type: "textarea", required: true }],
    systemPrompt: `產出 Welcome Email（200-400 字）。
結構：1 句熱情開場 → 你會在這裡看到什麼（3 個重點）→ 下一步可以做什麼（讀什麼 / 點什麼）→ 簽名。
${EMAIL_TONE}`,
    preferredModel: "qwen", maxTokens: 700,
    outputDefaults: { platform: "email", post_type: "edm" },
  },
  {
    id: "em-30-promo",
    tier: "30s", postType: "edm",
    label: "促銷 email（限時優惠）",
    description: "活動 / 折扣 / 限時 promo email",
    agent_id: 60061, skill_slug: "newsletter",
    primary_question: "活動 / 優惠內容是？",
    primary_input: { key: "promo", placeholder: "例：週年慶全館 8 折 / 新會員首單 9 折 / 限量商品", type: "textarea" },
    inputs: [{ key: "promo", label: "促銷內容", type: "textarea", required: true }],
    systemPrompt: `產出促銷 Email（200-350 字）。
結構：1 句具體誘因（含數字）→ 為什麼這次特別（1-2 句故事）→ 商品 / 活動細節 → 1 個 CTA 按鈕文字 → 緊迫性（時限 / 名額）。
不要全大寫、不要 ! 連發。${EMAIL_TONE}`,
    preferredModel: "qwen", maxTokens: 700,
    outputDefaults: { platform: "email", post_type: "edm" },
  },
  {
    id: "em-30-drip",
    tier: "30s", postType: "edm",
    label: "Drip 系列第 N 封",
    description: "自動化 drip campaign 中的 1 封",
    agent_id: 180039, skill_slug: "email-marketing",
    primary_question: "這是 drip 第幾封？前一封寫了什麼？",
    primary_input: { key: "context", placeholder: "drip 序列脈絡 + 本封想傳達什麼", type: "textarea" },
    inputs: [{ key: "context", label: "Drip 脈絡 + 本封內容", type: "textarea", required: true }],
    systemPrompt: `產出 Drip 系列其中一封（200-400 字）。
結構：1 句承上啟下 → 1 個有用的洞察 / 故事 → 連結到產品的 1 個小 CTA → P.S. 多 1 個小亮點。
不要每封都硬推銷。${EMAIL_TONE}`,
    preferredModel: "qwen", maxTokens: 700,
    outputDefaults: { platform: "email", post_type: "edm" },
  },
  {
    id: "em-30-abandoned-cart",
    tier: "30s", postType: "edm",
    label: "棄單挽回 email",
    description: "提醒用戶完成購買",
    agent_id: 180054, skill_slug: "churn-prevention",
    primary_question: "用戶丟在購物車的是什麼？",
    primary_input: { key: "product", placeholder: "商品名 + 價格 + 任何特色", type: "textarea" },
    inputs: [{ key: "product", label: "棄購商品", type: "textarea", required: true }],
    systemPrompt: `產出棄單挽回 Email（150-250 字）。每變體 1 種口吻（提醒式 / 限時誘因式 / 解惑式）。
結構：1 句個人化開場（你看了 X）→ 為什麼這個值得買 → 1 個小好處（運費 / 折扣 / 客服）→ CTA。
${EMAIL_TONE}`,
    preferredModel: "qwen", maxTokens: 500,
    outputDefaults: { platform: "email", post_type: "edm" },
  },
  {
    id: "em-30-re-engagement",
    tier: "30s", postType: "edm",
    label: "重啟休眠用戶（re-engagement）",
    description: "30/60/90 天沒打開的訂閱者",
    agent_id: 180062, skill_slug: "churn-prevention",
    primary_question: "這群休眠用戶是？最後一次互動是？",
    primary_input: { key: "context", placeholder: "用戶背景 + 休眠多久", type: "textarea" },
    inputs: [{ key: "context", label: "休眠用戶背景", type: "textarea", required: true }],
    systemPrompt: `產出 Re-engagement Email（200-300 字）。
結構：1 句承認久沒見 → 你最近有什麼新進展 → 給對方一個回來的理由（內容 / 優惠）→ 1 個簡單 CTA。
語氣要像朋友，不要怪罪用戶。${EMAIL_TONE}`,
    preferredModel: "qwen", maxTokens: 500,
    outputDefaults: { platform: "email", post_type: "edm" },
  },
  {
    id: "em-30-event-invite",
    tier: "30s", postType: "edm",
    label: "活動邀請 email",
    description: "webinar / 線下活動 / 開幕邀請",
    agent_id: 180068, skill_slug: "newsletter",
    primary_question: "活動主題 / 時間 / 對象 / 報名連結？",
    primary_input: { key: "event", placeholder: "活動所有資訊", type: "textarea" },
    inputs: [{ key: "event", label: "活動資訊", type: "textarea", required: true }],
    systemPrompt: `產出活動邀請 Email（250-400 字）。
結構：subject hook → 活動 hook（為何值得 1-2 句）→ 主題 / 講者 / 時間（清楚列） → 報名 CTA → 為何現在報名（限額 / 早鳥）。
${EMAIL_TONE}`,
    preferredModel: "qwen", maxTokens: 700,
    outputDefaults: { platform: "email", post_type: "edm" },
  },
  {
    id: "em-30-cold-email",
    tier: "30s", postType: "edm",
    label: "Cold Email（陌生開發）",
    description: "B2B 陌生 outreach 第一封",
    agent_id: 221080, skill_slug: "cold-email",
    primary_question: "對方是誰？你想做什麼？",
    primary_input: { key: "context", placeholder: "對方角色 / 公司 + 你想提的事", type: "textarea" },
    inputs: [{ key: "context", label: "對方 + 目的", type: "textarea", required: true }],
    systemPrompt: `產出 Cold Email（80-150 字）。
規則：第一句 personalize（提到對方公司 / 文章 / 事件）→ 你是誰 1 句 → 為什麼是他（具體理由）→ 一個小請求（15 分鐘聊聊 / 看一下這個）。
不要直接推銷。${EMAIL_TONE}`,
    preferredModel: "qwen", maxTokens: 400,
    outputDefaults: { platform: "email", post_type: "edm" },
  },
  {
    id: "em-30-transactional",
    tier: "30s", postType: "edm",
    label: "交易型通知（confirmation / receipt）",
    description: "下單確認 / 出貨通知 / 帳單",
    agent_id: 60063, skill_slug: "newsletter",
    primary_question: "什麼交易事件？訂單號 / 商品 / 金額？",
    primary_input: { key: "transaction", placeholder: "事件 + 細節", type: "textarea" },
    inputs: [{ key: "transaction", label: "交易事件", type: "textarea", required: true }],
    systemPrompt: `產出交易型 Email（150-250 字）。
結構：1 句確認事件 → 完整交易細節（清楚列）→ 下一步預期（出貨時間 / 客服連結）→ 1 個小 cross-sell 連結（不硬推）。
語氣專業可信，不要過度行銷。${EMAIL_TONE}`,
    preferredModel: "qwen", maxTokens: 500,
    outputDefaults: { platform: "email", post_type: "edm" },
  },
];

const NATHAN_ID = 60062;
export const EMAIL_30S_ORCHESTRA: Record<string, OrchestraConfig> = {
  "em-30-subject-line":   { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["好奇心", "數字反差", "個人化"], captionMinChars: 10, captionMaxChars: 30 },
  "em-30-preview-text":   { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["懸念延伸", "補充資訊", "個人化"], captionMinChars: 30, captionMaxChars: 80 },
  "em-30-welcome":        { variants: 3, images: 3, runImageGen: false, imageDirectorId: NATHAN_ID, aspectRatio: "1.91:1", fluxSize: "landscape_4_3", imageQualitySteps: 4, variantLabels: ["熱情擁抱", "理性說明", "故事開場"], captionMinChars: 200, captionMaxChars: 500 },
  "em-30-promo":          { variants: 3, images: 3, runImageGen: false, imageDirectorId: NATHAN_ID, aspectRatio: "1.91:1", fluxSize: "landscape_4_3", imageQualitySteps: 4, variantLabels: ["稀缺感", "價值論證", "故事感"], captionMinChars: 200, captionMaxChars: 400 },
  "em-30-drip":           { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["教學式", "故事式", "提問式"], captionMinChars: 200, captionMaxChars: 500 },
  "em-30-abandoned-cart": { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["提醒式", "限時誘因", "解惑式"], captionMinChars: 150, captionMaxChars: 300 },
  "em-30-re-engagement":  { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["朋友召喚", "新進展", "好處導向"], captionMinChars: 200, captionMaxChars: 350 },
  "em-30-event-invite":   { variants: 3, images: 3, runImageGen: false, imageDirectorId: NATHAN_ID, aspectRatio: "1.91:1", fluxSize: "landscape_4_3", imageQualitySteps: 4, variantLabels: ["專業敘述", "故事感", "稀缺感"], captionMinChars: 200, captionMaxChars: 450 },
  "em-30-cold-email":     { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["共同點切入", "問題切入", "價值交換"], captionMinChars: 80, captionMaxChars: 200 },
  "em-30-transactional":  { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["精簡型", "完整型", "貼心型"], captionMinChars: 150, captionMaxChars: 300 },
};

export function getEmailOrchestraConfig(taskId: string): OrchestraConfig | null {
  return EMAIL_30S_ORCHESTRA[taskId] ?? null;
}
