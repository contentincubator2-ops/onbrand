/**
 * Brand Positioning quick-task templates (2026-05-05).
 * 10 Brand 30s tasks. All caption_writer agents distinct from prior pools.
 * Output uses GenericMockup (document-style, no platform-specific render).
 */
import type { FBTaskTemplate, OrchestraConfig } from "./quickTaskFB";

const BRAND_TONE = `
品牌文案要 distinctive — 不要像競品。
避免 buzzword（"創新" / "領先" / "極致"），用具體事實 / 動詞。`;

export const BRAND_30S_TASKS: FBTaskTemplate[] = [
  {
    id: "br-30-tagline",
    tier: "30s", postType: "generic",
    label: "Tagline 5 種候選",
    description: "品牌核心一句話",
    agent_id: 220869, skill_slug: "tagline-creative",
    primary_question: "你的品牌做什麼？想被誰記得？",
    primary_input: { key: "context", placeholder: "業務 + 受眾 + 想傳達的核心感受", type: "textarea" },
    inputs: [{ key: "context", label: "品牌 + 感受", type: "textarea", required: true }],
    systemPrompt: `產出 tagline 候選。每變體 1 種角度（功能 / 情感 / 反差）。
規則：5-10 字、有節奏、不抽象、避免"領先"/"極致"等空話。${BRAND_TONE}`,
    preferredModel: "qwen", maxTokens: 350,
    outputDefaults: { platform: "press", post_type: "generic" },
  },
  {
    id: "br-30-value-prop",
    tier: "30s", postType: "generic",
    label: "Value Proposition 改寫",
    description: "「我們是 X，幫 Y，達成 Z」結構句",
    agent_id: 238853, skill_slug: "value-proposition",
    primary_question: "目前的價值主張 + 想優化的方向？",
    primary_input: { key: "context", placeholder: "現有 value prop + 痛點", type: "textarea" },
    inputs: [{ key: "context", label: "現有 value prop", type: "textarea", required: true }],
    systemPrompt: `產出 value proposition 句。每變體 1 種結構（We help X do Y by Z / X 不再 Y / 唯一 X 做 Y）。
規則：80 字內、有具體動詞、不要"提供解決方案"這種模糊。${BRAND_TONE}`,
    preferredModel: "qwen", maxTokens: 400,
    outputDefaults: { platform: "press", post_type: "generic" },
  },
  {
    id: "br-30-brand-voice",
    tier: "30s", postType: "generic",
    label: "Brand voice 描述（給寫手用）",
    description: "5 個形容詞 + 3 個 do / 3 個 don't",
    agent_id: 60002, skill_slug: "brand-strategy",
    primary_question: "品牌人格像誰？想避免像誰？",
    primary_input: { key: "context", placeholder: "品牌 + 想要的個性 + 想避免的調性", type: "textarea" },
    inputs: [{ key: "context", label: "品牌個性線索", type: "textarea", required: true }],
    systemPrompt: `產出 brand voice 描述。每變體 1 種人格傾向（專業 / 親民 / 玩味）。
結構：5 個形容詞 → 「我們會這樣寫」(3 個 do 範例) → 「我們不會這樣寫」(3 個 don't 範例)。${BRAND_TONE}`,
    preferredModel: "qwen", maxTokens: 600,
    outputDefaults: { platform: "press", post_type: "generic" },
  },
  {
    id: "br-30-archetype",
    tier: "30s", postType: "generic",
    label: "Brand archetype 定位",
    description: "12 種原型中你最像哪 1-2 個 + 為什麼",
    agent_id: 180797, skill_slug: "archetype-positioning",
    primary_question: "品牌核心信念 / 與顧客關係",
    primary_input: { key: "context", placeholder: "品牌信念 + 跟顧客的關係", type: "textarea" },
    inputs: [{ key: "context", label: "品牌信念 + 關係", type: "textarea", required: true }],
    systemPrompt: `從 12 種 archetype（Hero/Sage/Outlaw/Magician/Innocent/Explorer/Lover/Caregiver/Ruler/Creator/Jester/Everyman）中選 1-2 個，說明：
- 為什麼這個 archetype 符合品牌
- 該 archetype 的「典型動作」「典型語言」「典型敵人」
- 你的競品偏哪個 archetype，你怎麼跟他們不同
每變體用 1 個不同 archetype。${BRAND_TONE}`,
    preferredModel: "qwen", maxTokens: 800,
    outputDefaults: { platform: "press", post_type: "generic" },
  },
  {
    id: "br-30-positioning",
    tier: "30s", postType: "generic",
    label: "定位敘述（positioning statement）",
    description: "「For X who Y, our Z is the one A that B」結構",
    agent_id: 210173, skill_slug: "brand-strategy",
    primary_question: "目標客戶 + 競爭場域 + 唯一差異化",
    primary_input: { key: "context", placeholder: "TA + 競爭領域 + 你獨特的事", type: "textarea" },
    inputs: [{ key: "context", label: "定位三要素", type: "textarea", required: true }],
    systemPrompt: `產出 positioning statement。每變體用稍微不同的 framing。
結構：For [target] / who [need] / our [brand] is the [category] that [differentiator] / because [reason to believe]。
要 specific（不要"行銷人"，要"50 人以下 SaaS 行銷主管"）。${BRAND_TONE}`,
    preferredModel: "qwen", maxTokens: 500,
    outputDefaults: { platform: "press", post_type: "generic" },
  },
  {
    id: "br-30-elevator-pitch",
    tier: "30s", postType: "generic",
    label: "電梯簡報（30 秒）",
    description: "30 秒內讓人懂你做什麼 + 為何重要",
    agent_id: 220915, skill_slug: "creative-director",
    primary_question: "你的品牌 + 對誰最有用 + 為何現在重要",
    primary_input: { key: "context", placeholder: "簡介 + 受眾 + 當下時機", type: "textarea" },
    inputs: [{ key: "context", label: "電梯簡報素材", type: "textarea", required: true }],
    systemPrompt: `產出 30 秒電梯簡報（150-250 字，講出來剛好 30 秒）。每變體 1 種角度（問題切入 / 故事切入 / 數據切入）。
結構：Hook → 我們解決什麼 → 不同在哪 → 想做什麼下一步。${BRAND_TONE}`,
    preferredModel: "qwen", maxTokens: 600,
    outputDefaults: { platform: "press", post_type: "generic" },
  },
  {
    id: "br-30-manifesto",
    tier: "30s", postType: "generic",
    label: "Brand manifesto（品牌宣言）",
    description: "100-200 字立場宣言（網站首頁 / 內部牆上）",
    agent_id: 220870, skill_slug: "creative-director",
    primary_question: "你品牌相信什麼？反對什麼？",
    primary_input: { key: "context", placeholder: "品牌信念 + 反對的常見做法", type: "textarea" },
    inputs: [{ key: "context", label: "信念 + 反對", type: "textarea", required: true }],
    systemPrompt: `產出 brand manifesto（100-200 字）。
結構：開場 1 句強烈立場 → 我們相信 X / 我們不相信 Y → 因此我們做 Z。
要有節奏感、適合念出來、避免管理顧問語言。${BRAND_TONE}`,
    preferredModel: "qwen", maxTokens: 600,
    outputDefaults: { platform: "press", post_type: "generic" },
  },
  {
    id: "br-30-forbidden-words",
    tier: "30s", postType: "generic",
    label: "禁用詞清單（forbidden words）",
    description: "品牌絕對不講的詞 + 替代說法",
    agent_id: 60066, skill_slug: "consumer-insights",
    primary_question: "品牌個性 + 競品常用什麼詞？",
    primary_input: { key: "context", placeholder: "品牌 + 競品語言觀察", type: "textarea" },
    inputs: [{ key: "context", label: "品牌 + 競品", type: "textarea", required: true }],
    systemPrompt: `產出禁用詞清單（10-15 個）+ 替代用法。每變體 1 種篩選角度（過時 buzzword / 競品用語 / 業界陳腔）。
格式：❌ 「禁用詞」 → ✅ 「替代用法」（1 句範例）
${BRAND_TONE}`,
    preferredModel: "qwen", maxTokens: 700,
    outputDefaults: { platform: "press", post_type: "generic" },
  },
  {
    id: "br-30-naming",
    tier: "30s", postType: "generic",
    label: "品牌命名候選 10 個",
    description: "新品 / 服務 / 子品牌的命名候選",
    agent_id: 220871, skill_slug: "naming",
    primary_question: "品名要傳達什麼 + 偏好風格？",
    primary_input: { key: "context", placeholder: "產品本質 + 想要的感覺 + 受眾", type: "textarea" },
    inputs: [{ key: "context", label: "命名 brief", type: "textarea", required: true }],
    systemPrompt: `產出品牌命名候選（10 個）。每變體 1 種策略（描述型 / 暗喻型 / 創造詞 / 人名地名）。
每個候選後加 1 句說明（為何這名字，可能的好 / 壞處）。${BRAND_TONE}`,
    preferredModel: "qwen", maxTokens: 800,
    outputDefaults: { platform: "press", post_type: "generic" },
  },
  {
    id: "br-30-competitor-map",
    tier: "30s", postType: "generic",
    label: "競品定位地圖",
    description: "2x2 軸 + 競品落點 + 你的最佳象限",
    agent_id: 220001, skill_slug: "brand-strategy",
    primary_question: "你的競品有誰？想用什麼軸區隔？",
    primary_input: { key: "context", placeholder: "競品名單 + 候選軸（價格 / 功能 / 受眾 / 美感）", type: "textarea" },
    inputs: [{ key: "context", label: "競品 + 軸", type: "textarea", required: true }],
    systemPrompt: `產出競品定位地圖。每變體 1 組軸（價格 vs 功能 / 大眾 vs 利基 / 工具 vs 文化）。
格式：軸定義 → 每家競品落點（含 1 句說明） → 你的最佳定位象限 + 為什麼。${BRAND_TONE}`,
    preferredModel: "qwen", maxTokens: 900,
    outputDefaults: { platform: "press", post_type: "generic" },
  },
];

const YATING_ID = 220872;
export const BRAND_30S_ORCHESTRA: Record<string, OrchestraConfig> = {
  "br-30-tagline":          { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["功能訴求", "情感訴求", "反差訴求"], captionMinChars: 50, captionMaxChars: 200 },
  "br-30-value-prop":       { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["We help...", "X 不再 Y", "唯一 X"], captionMinChars: 50, captionMaxChars: 200 },
  "br-30-brand-voice":      { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["專業派", "親民派", "玩味派"], captionMinChars: 200, captionMaxChars: 500 },
  "br-30-archetype":        { variants: 3, images: 3, runImageGen: false, imageDirectorId: YATING_ID, aspectRatio: "1:1", fluxSize: "square_hd", imageQualitySteps: 4, variantLabels: ["Hero/Magician 類", "Sage/Caregiver 類", "Outlaw/Jester 類"], captionMinChars: 300, captionMaxChars: 700 },
  "br-30-positioning":      { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["TA 聚焦", "差異化聚焦", "結果聚焦"], captionMinChars: 100, captionMaxChars: 400 },
  "br-30-elevator-pitch":   { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["問題切入", "故事切入", "數據切入"], captionMinChars: 150, captionMaxChars: 300 },
  "br-30-manifesto":        { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["立場式", "對抗式", "邀請式"], captionMinChars: 100, captionMaxChars: 250 },
  "br-30-forbidden-words":  { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["過時 buzzword", "競品用語", "業界陳腔"], captionMinChars: 200, captionMaxChars: 700 },
  "br-30-naming":           { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["描述型", "暗喻型", "創造詞型"], captionMinChars: 200, captionMaxChars: 800 },
  "br-30-competitor-map":   { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null, fluxSize: null, imageQualitySteps: 0, variantLabels: ["價格 vs 功能", "大眾 vs 利基", "工具 vs 文化"], captionMinChars: 300, captionMaxChars: 900 },
};

export function getBrandOrchestraConfig(taskId: string): OrchestraConfig | null {
  return BRAND_30S_ORCHESTRA[taskId] ?? null;
}
