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
    label: "Email 主旨行",
    description: "決定開信率的關鍵 30 字內",
    agent_id: 30017, skill_slug: "email-marketing",
    primary_question: "這封 email 想讓人打開做什麼？",
    primary_input: { key: "context", placeholder: "例：通知新品上市 / 提醒未完成訂單 / 月報 / 邀請活動", type: "textarea" },
    inputs: [{ key: "context", label: "Email 目的 + 內容", type: "textarea", required: true }],
    systemPrompt: `產出 1 個 Email 主旨，策略**固定為「{label}」這一種**：
- 好奇心：製造資訊缺口/懸念，不把答案講白，讓人想點開。
- 數字反差：用具體數字或對比張力（如「3 分鐘」「省 47%」「1 件事」）。
- 個人化：針對收件人情境/身分/行為說話（如「給還在猶豫的你」）。
**只能用「{label}」這個角度，必須與其他變體明顯不同，嚴禁混用或寫成通用主旨。**
規則：30 字內、避免 ALL CAPS、避免 ! 連發、避免 "FREE"/"urgent" 等 spam 詞。只輸出主旨本身。
${EMAIL_TONE}`,
    preferredModel: "qwen", maxTokens: 250,
    outputDefaults: { platform: "email", post_type: "edm" },
  },
  {
    id: "em-30-preview-text",
    tier: "30s", postType: "edm",
    label: "Email 預覽文字（信箱預覽）",
    description: "主旨旁邊那行小字，補強開信誘因",
    agent_id: 60012, skill_slug: "email-crm",
    primary_question: "subject 主旨是？",
    primary_input: { key: "subject", placeholder: "貼上你的 subject line", type: "textarea" },
    inputs: [{ key: "subject", label: "主旨 + 內文摘要", type: "textarea", required: true }],
    systemPrompt: `產出 1 個 Email preview text（80 字內），策略**固定為「{label}」這一種**：
- 懸念延伸：延續主旨的懸念、再勾一下，不解答。
- 補充資訊：補上主旨沒講的具體誘因（時間/數字/好處）。
- 個人化：針對收件人情境/身分說話。
**只能用「{label}」這個角度，必須與其他變體明顯不同。** preview 不要重複 subject 內容——要補強開信誘因。只輸出 preview 本身。${EMAIL_TONE}`,
    preferredModel: "qwen", maxTokens: 200,
    outputDefaults: { platform: "email", post_type: "edm" },
  },
  {
    id: "em-30-welcome",
    tier: "30s", postType: "edm",
    label: "歡迎信（新訂閱者）",
    description: "新訂閱者的第一封信",
    agent_id: 60060, skill_slug: "newsletter",
    primary_question: "你的品牌是什麼？訂閱者會獲得什麼？",
    primary_input: { key: "context", placeholder: "品牌簡介 + 訂閱 value", type: "textarea" },
    inputs: [{ key: "context", label: "品牌 + 價值", type: "textarea", required: true }],
    systemPrompt: `產出 1 封 Welcome Email（200-400 字）。**本封口吻固定走「{label}」這一種（熱情擁抱＝高情緒溫度；理性說明＝清楚條理；故事開場＝以一個畫面/故事切入），必須與其他變體明顯不同，嚴禁混用或寫成通用版。**
結構：1 句開場（依此口吻）→ 你會在這裡看到什麼（3 個重點）→ 下一步可以做什麼（讀什麼 / 點什麼）→ 簽名。
${EMAIL_TONE}`,
    preferredModel: "qwen", maxTokens: 700,
    outputDefaults: { platform: "email", post_type: "edm" },
  },
  {
    id: "em-30-promo",
    tier: "30s", postType: "edm",
    label: "促銷信（限時優惠）",
    description: "活動 / 折扣 / 限時 promo email",
    agent_id: 60046, skill_slug: "newsletter",
    primary_question: "活動 / 優惠內容是？",
    primary_input: { key: "promo", placeholder: "例：週年慶全館 8 折 / 新會員首單 9 折 / 限量商品", type: "textarea" },
    inputs: [{ key: "promo", label: "促銷內容", type: "textarea", required: true }],
    systemPrompt: `產出 1 封促銷 Email（200-350 字）。**本封策略固定走「{label}」這一種（稀缺感＝限量/限時張力；價值論證＝為何值得這個價；故事感＝用情境/人物帶出），必須與其他變體明顯不同，嚴禁混用或寫成通用版。**
結構：1 句具體誘因（含數字，依此策略）→ 為什麼這次特別 → 商品 / 活動細節 → 1 個 CTA 按鈕文字 → 緊迫性（時限 / 名額）。
不要全大寫、不要 ! 連發。${EMAIL_TONE}`,
    preferredModel: "qwen", maxTokens: 700,
    outputDefaults: { platform: "email", post_type: "edm" },
  },
  {
    id: "em-30-drip",
    tier: "30s", postType: "edm",
    label: "培育序列第 N 封",
    description: "自動化培育序列中的 1 封",
    agent_id: 180039, skill_slug: "email-marketing",
    primary_question: "這是 drip 第幾封？前一封寫了什麼？",
    primary_input: { key: "context", placeholder: "drip 序列脈絡 + 本封想傳達什麼", type: "textarea" },
    inputs: [{ key: "context", label: "滴灌序列脈絡 + 本封內容", type: "textarea", required: true }],
    systemPrompt: `產出 1 封 Drip 系列 Email（200-400 字）。**本封手法固定走「{label}」這一種（教學式＝給可操作知識；故事式＝用敘事帶出；提問式＝以問題勾起好奇），必須與其他變體明顯不同，嚴禁混用或寫成通用版。**
結構：1 句承上啟下 → 1 個有用的洞察 / 故事（依此手法）→ 連結到產品的 1 個小 CTA → P.S. 多 1 個小亮點。
不要每封都硬推銷。${EMAIL_TONE}`,
    preferredModel: "qwen", maxTokens: 700,
    outputDefaults: { platform: "email", post_type: "edm" },
  },
  {
    id: "em-30-abandoned-cart",
    tier: "30s", postType: "edm",
    label: "棄單挽回信",
    description: "提醒用戶完成購買",
    agent_id: 180054, skill_slug: "churn-prevention",
    primary_question: "用戶丟在購物車的是什麼？",
    primary_input: { key: "product", placeholder: "商品名 + 價格 + 任何特色", type: "textarea" },
    inputs: [{ key: "product", label: "棄購商品", type: "textarea", required: true }],
    systemPrompt: `產出 1 封棄單挽回 Email（150-250 字）。**本封口吻固定走「{label}」這一種（提醒式＝輕推不施壓；限時誘因＝給急迫好處；解惑式＝拆除購買疑慮），必須與其他變體明顯不同，嚴禁混用或寫成通用版。**
結構：1 句個人化開場（你看了 X）→ 為什麼這個值得買 → 1 個小好處（運費 / 折扣 / 客服）→ CTA。
${EMAIL_TONE}`,
    preferredModel: "qwen", maxTokens: 500,
    outputDefaults: { platform: "email", post_type: "edm" },
  },
  {
    id: "em-30-re-engagement",
    tier: "30s", postType: "edm",
    label: "重啟休眠用戶",
    description: "30/60/90 天沒打開的訂閱者",
    agent_id: 180062, skill_slug: "churn-prevention",
    primary_question: "這群休眠用戶是？最後一次互動是？",
    primary_input: { key: "context", placeholder: "用戶背景 + 休眠多久", type: "textarea" },
    inputs: [{ key: "context", label: "休眠用戶背景", type: "textarea", required: true }],
    systemPrompt: `產出 1 封 Re-engagement Email（200-300 字）。**本封角度固定走「{label}」這一種（朋友召喚＝情感連結式問候；新進展＝用更新勾回；好處導向＝給明確回來理由），必須與其他變體明顯不同，嚴禁混用或寫成通用版。**
結構：1 句承認久沒見 → 你最近有什麼新進展 / 回來理由（依此角度）→ 1 個簡單 CTA。
語氣要像朋友，不要怪罪用戶。${EMAIL_TONE}`,
    preferredModel: "qwen", maxTokens: 500,
    outputDefaults: { platform: "email", post_type: "edm" },
  },
  {
    id: "em-30-event-invite",
    tier: "30s", postType: "edm",
    label: "活動邀請信",
    description: "webinar / 線下活動 / 開幕邀請",
    agent_id: 180068, skill_slug: "newsletter",
    primary_question: "活動主題 / 時間 / 對象 / 報名連結？",
    primary_input: { key: "event", placeholder: "活動所有資訊", type: "textarea" },
    inputs: [{ key: "event", label: "活動資訊", type: "textarea", required: true }],
    systemPrompt: `產出 1 封活動邀請 Email（250-400 字）。**本封風格固定走「{label}」這一種（專業敘述＝清楚正式；故事感＝用情境帶出價值；稀缺感＝限額/早鳥急迫），必須與其他變體明顯不同，嚴禁混用或寫成通用版。**
結構：活動 hook（依此風格 1-2 句）→ 主題 / 講者 / 時間（清楚列）→ 報名 CTA → 為何現在報名（限額 / 早鳥）。
${EMAIL_TONE}`,
    preferredModel: "qwen", maxTokens: 700,
    outputDefaults: { platform: "email", post_type: "edm" },
  },
  {
    id: "em-30-cold-email",
    tier: "30s", postType: "edm",
    label: "陌生開發信",
    description: "B2B 第一封陌生開發信",
    agent_id: 221080, skill_slug: "cold-email",
    primary_question: "對方是誰？你想做什麼？",
    primary_input: { key: "context", placeholder: "對方角色 / 公司 + 你想提的事", type: "textarea" },
    inputs: [{ key: "context", label: "對方 + 目的", type: "textarea", required: true }],
    systemPrompt: `產出 1 封 Cold Email（80-150 字）。**本封切入固定走「{label}」這一種（共同點切入＝先建立連結；問題切入＝點出對方痛點；價值交換＝直接給對方好處），必須與其他變體明顯不同，嚴禁混用或寫成通用版。**
規則：第一句 personalize（依此切入，提到對方公司 / 文章 / 事件）→ 你是誰 1 句 → 為什麼是他（具體理由）→ 一個小請求（15 分鐘聊聊 / 看一下這個）。
不要直接推銷。${EMAIL_TONE}`,
    preferredModel: "qwen", maxTokens: 400,
    outputDefaults: { platform: "email", post_type: "edm" },
  },
  {
    id: "em-30-transactional",
    tier: "30s", postType: "edm",
    label: "交易確認通知",
    description: "下單確認 / 出貨通知 / 收據",
    agent_id: 60063, skill_slug: "newsletter",
    primary_question: "什麼交易事件？訂單號 / 商品 / 金額？",
    primary_input: { key: "transaction", placeholder: "事件 + 細節", type: "textarea" },
    inputs: [{ key: "transaction", label: "交易事件", type: "textarea", required: true }],
    systemPrompt: `產出 1 封交易型 Email（150-250 字）。**本封型態固定走「{label}」這一種（精簡型＝最短可用、只給必要資訊；完整型＝資訊齊全條列清楚；貼心型＝專業中帶人情溫度），必須與其他變體明顯不同，嚴禁混用或寫成通用版。**
結構：1 句確認事件 → 交易細節（依此型態詳略）→ 下一步預期（出貨時間 / 客服連結）→ 1 個小 cross-sell 連結（不硬推）。
語氣專業可信，不要過度行銷。${EMAIL_TONE}`,
    preferredModel: "qwen", maxTokens: 500,
    outputDefaults: { platform: "email", post_type: "edm" },
  },
];

const NATHAN_ID    = 60062;  // Nathan Lu (主場 welcome email)
const EM_DIR_VERA  = 220738; // Vera Hsieh — Quantitative Research Designer
const EM_DIR_NORA  = 220735; // Nora Yang — Quantitative Research Designer
export const EMAIL_30S_ORCHESTRA: Record<string, OrchestraConfig> = {
  "em-30-subject-line":   { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["好奇心", "數字反差", "個人化"], captionMinChars: 10, captionMaxChars: 30 },
  "em-30-preview-text":   { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["懸念延伸", "補充資訊", "個人化"], captionMinChars: 30, captionMaxChars: 80 },
  "em-30-welcome":        { variants: 3, images: 3, runImageGen: false, imageDirectorId: NATHAN_ID, aspectRatio: "1.91:1", fluxSize: "landscape_4_3", imageQualitySteps: 4, variantLabels: ["熱情擁抱", "理性說明", "故事開場"], captionMinChars: 200, captionMaxChars: 500 },
  "em-30-promo":          { variants: 3, images: 3, runImageGen: false, imageDirectorId: EM_DIR_VERA, aspectRatio: "1.91:1", fluxSize: "landscape_4_3", imageQualitySteps: 4, variantLabels: ["稀缺感", "價值論證", "故事感"], captionMinChars: 200, captionMaxChars: 400 },
  "em-30-drip":           { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["教學式", "故事式", "提問式"], captionMinChars: 200, captionMaxChars: 500 },
  "em-30-abandoned-cart": { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["提醒式", "限時誘因", "解惑式"], captionMinChars: 150, captionMaxChars: 300 },
  "em-30-re-engagement":  { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["朋友召喚", "新進展", "好處導向"], captionMinChars: 200, captionMaxChars: 350 },
  "em-30-event-invite":   { variants: 3, images: 3, runImageGen: false, imageDirectorId: EM_DIR_NORA, aspectRatio: "1.91:1", fluxSize: "landscape_4_3", imageQualitySteps: 4, variantLabels: ["專業敘述", "故事感", "稀缺感"], captionMinChars: 200, captionMaxChars: 450 },
  "em-30-cold-email":     { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["共同點切入", "問題切入", "價值交換"], captionMinChars: 80, captionMaxChars: 200 },
  "em-30-transactional":  { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["精簡型", "完整型", "貼心型"], captionMinChars: 150, captionMaxChars: 300 },
};

export function getEmailOrchestraConfig(taskId: string): OrchestraConfig | null {
  return EMAIL_30S_ORCHESTRA[taskId] ?? null;
}
