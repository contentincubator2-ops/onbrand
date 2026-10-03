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
    label: { en: "Brand Tagline — 5 Candidates (Functional/Emotional/Contrast/Smart/Action)", zh: "品牌標語 5 種候選（功能/情感/反差/智慧/行動）" },
    description: { en: "Your brand in one line — 5 short tagline candidates", zh: "品牌核心一句話 — 5 個短 tagline 候選" },
    agent_id: 220869, skill_slug: "tagline-creative",
    primary_question: "你的品牌做什麼？想被誰記得？",
    primary_input: { key: "context", placeholder: "業務 + 受眾 + 想傳達的核心感受", type: "textarea" },
    inputs: [{ key: "context", label: "品牌 + 感受", type: "textarea", required: true }],
    // 2026-05-09 (CJ audit): was producing 段落 not 短 tagline. Force
    // strict short output + 5 variants matching the 5 angles in label.
    systemPrompt: `產出 1 個 tagline（不是段落、不是貼文、不要解釋）。
**嚴格字數規則：6-15 個字（含標點），絕對不超過 18 字。**
**禁用詞：領先、極致、卓越、頂尖、唯一、最佳、第一、無與倫比、業界、創新（這些是空話）。**
要有節奏感、可朗讀、能讓人在 2 秒內記住。
輸出範例（這是格式參考，不是內容範本）：
  ✓ "科學有溫度，營養也有味"（11 字）
  ✓ "吃對了，全家都更好"（8 字）
  ✗ "我們致力於提供業界領先的營養解決方案"（廢話 + 太長）
${BRAND_TONE}`,
    preferredModel: "qwen", maxTokens: 60,
    outputDefaults: { platform: "generic", post_type: "generic" },
  },
  {
    id: "br-30-value-prop",
    tier: "30s", postType: "generic",
    label: { en: "Value Proposition Rewrite", zh: "價值主張改寫" },
    description: { en: "The \"We are X, helping Y, achieve Z\" structured statement", zh: "「我們是 X，幫 Y，達成 Z」結構句" },
    agent_id: 238853, skill_slug: "value-proposition",
    primary_question: "目前的價值主張 + 想優化的方向？",
    primary_input: { key: "context", placeholder: "現有價值主張 + 痛點", type: "textarea" },
    inputs: [{ key: "context", label: "現有價值主張", type: "textarea", required: true }],
    systemPrompt: `產出 value proposition 句。每變體 1 種結構（We help X do Y by Z / X 不再 Y / 唯一 X 做 Y）。
規則：80 字內、有具體動詞、不要"提供解決方案"這種模糊。${BRAND_TONE}`,
    preferredModel: "qwen", maxTokens: 400,
    outputDefaults: { platform: "generic", post_type: "generic" },
  },
  {
    id: "br-30-brand-voice",
    tier: "30s", postType: "generic",
    label: { en: "Brand Voice Description (for Writers)", zh: "品牌語氣描述（給寫手用）" },
    description: { en: "5 adjectives + 3 write-like-this / 3 never-like-this", zh: "5 個形容詞 + 3 個要這樣寫 / 3 個不要" },
    agent_id: 60002, skill_slug: "brand-strategy",
    primary_question: "品牌人格像誰？想避免像誰？",
    primary_input: { key: "context", placeholder: "品牌 + 想要的個性 + 想避免的調性", type: "textarea" },
    inputs: [{ key: "context", label: "品牌個性線索", type: "textarea", required: true }],
    systemPrompt: `產出 brand voice 描述。每變體 1 種人格傾向（專業 / 親民 / 玩味）。
結構：5 個形容詞 → 「我們會這樣寫」(3 個 do 範例) → 「我們不會這樣寫」(3 個 don't 範例)。${BRAND_TONE}`,
    preferredModel: "qwen", maxTokens: 600,
    outputDefaults: { platform: "generic", post_type: "generic" },
  },
  {
    id: "br-30-archetype",
    tier: "30s", postType: "generic",
    label: { en: "Brand Archetype Positioning", zh: "品牌原型定位" },
    description: { en: "Which 1-2 of the 12 archetypes you are + why", zh: "12 種原型中你最像哪 1-2 個 + 為什麼" },
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
    outputDefaults: { platform: "generic", post_type: "generic" },
  },
  {
    id: "br-30-positioning",
    tier: "30s", postType: "generic",
    label: { en: "Positioning Statement", zh: "定位敘述" },
    description: { en: "The \"For X who Y, our Z is the one A that B\" structure", zh: "「For X who Y, our Z is the one A that B」結構" },
    agent_id: 210173, skill_slug: "brand-strategy",
    primary_question: "目標客戶 + 競爭場域 + 唯一差異化",
    primary_input: { key: "context", placeholder: "TA + 競爭領域 + 你獨特的事", type: "textarea" },
    inputs: [{ key: "context", label: "定位三要素", type: "textarea", required: true }],
    systemPrompt: `產出 positioning statement。每變體用稍微不同的 framing。
結構：For [target] / who [need] / our [brand] is the [category] that [differentiator] / because [reason to believe]。
要 specific（不要"行銷人"，要"50 人以下 SaaS 行銷主管"）。${BRAND_TONE}`,
    preferredModel: "qwen", maxTokens: 500,
    outputDefaults: { platform: "generic", post_type: "generic" },
  },
  {
    id: "br-30-elevator-pitch",
    tier: "30s", postType: "generic",
    label: { en: "Elevator Pitch (30 Seconds)", zh: "電梯簡報（30 秒）" },
    description: { en: "Make anyone get what you do + why it matters in 30 seconds", zh: "30 秒內讓人懂你做什麼 + 為何重要" },
    agent_id: 220915, skill_slug: "creative-director",
    primary_question: "你的品牌 + 對誰最有用 + 為何現在重要",
    primary_input: { key: "context", placeholder: "簡介 + 受眾 + 當下時機", type: "textarea" },
    inputs: [{ key: "context", label: "電梯簡報素材", type: "textarea", required: true }],
    systemPrompt: `產出 30 秒電梯簡報（150-250 字，講出來剛好 30 秒）。每變體 1 種角度（問題切入 / 故事切入 / 數據切入）。
結構：Hook → 我們解決什麼 → 不同在哪 → 想做什麼下一步。${BRAND_TONE}`,
    preferredModel: "qwen", maxTokens: 600,
    outputDefaults: { platform: "generic", post_type: "generic" },
  },
  {
    id: "br-30-manifesto",
    tier: "30s", postType: "generic",
    label: { en: "Brand Manifesto", zh: "品牌宣言" },
    description: { en: "100-200-word stance statement (homepage / office wall)", zh: "100-200 字立場宣言（網站首頁 / 內部牆上）" },
    agent_id: 220870, skill_slug: "creative-director",
    primary_question: "你品牌相信什麼？反對什麼？",
    primary_input: { key: "context", placeholder: "品牌信念 + 反對的常見做法", type: "textarea" },
    inputs: [{ key: "context", label: "信念 + 反對", type: "textarea", required: true }],
    systemPrompt: `產出 brand manifesto（100-200 字）。
結構：開場 1 句強烈立場 → 我們相信 X / 我們不相信 Y → 因此我們做 Z。
要有節奏感、適合念出來、避免管理顧問語言。${BRAND_TONE}`,
    preferredModel: "qwen", maxTokens: 600,
    outputDefaults: { platform: "generic", post_type: "generic" },
  },
  {
    id: "br-30-forbidden-words",
    tier: "30s", postType: "generic",
    label: { en: "Forbidden-Words List", zh: "禁用詞清單" },
    description: { en: "Words your brand never says + what to say instead", zh: "品牌絕對不講的詞 + 替代說法" },
    agent_id: 60066, skill_slug: "consumer-insights",
    primary_question: "品牌個性 + 競品常用什麼詞？",
    primary_input: { key: "context", placeholder: "品牌 + 競品語言觀察", type: "textarea" },
    inputs: [{ key: "context", label: "品牌 + 競品", type: "textarea", required: true }],
    systemPrompt: `產出禁用詞清單（10-15 個）+ 替代用法。每變體 1 種篩選角度（過時 buzzword / 競品用語 / 業界陳腔）。
格式：❌ 「禁用詞」 → ✅ 「替代用法」（1 句範例）
${BRAND_TONE}`,
    preferredModel: "qwen", maxTokens: 700,
    outputDefaults: { platform: "generic", post_type: "generic" },
  },
  {
    id: "br-30-naming",
    tier: "30s", postType: "generic",
    label: { en: "Brand Name — 10 Candidates", zh: "品牌命名候選 10 個" },
    description: { en: "Name candidates for a new product / service / sub-brand", zh: "新品 / 服務 / 子品牌的命名候選" },
    agent_id: 220871, skill_slug: "naming",
    primary_question: "品名要傳達什麼 + 偏好風格？",
    primary_input: { key: "context", placeholder: "產品本質 + 想要的感覺 + 受眾", type: "textarea" },
    inputs: [{ key: "context", label: "命名需求", type: "textarea", required: true }],
    systemPrompt: `產出品牌命名候選（10 個）。每變體 1 種策略（描述型 / 暗喻型 / 創造詞 / 人名地名）。
每個候選後加 1 句說明（為何這名字，可能的好 / 壞處）。${BRAND_TONE}`,
    preferredModel: "qwen", maxTokens: 800,
    outputDefaults: { platform: "generic", post_type: "generic" },
  },
  {
    id: "br-30-competitor-map",
    tier: "30s", postType: "generic",
    label: { en: "Competitor Positioning Map", zh: "競品定位地圖" },
    description: { en: "2x2 axes + competitor plotting + your best quadrant", zh: "2x2 軸 + 競品落點 + 你的最佳象限" },
    agent_id: 220001, skill_slug: "brand-strategy",
    primary_question: "你的競品有誰？想用什麼軸區隔？",
    primary_input: { key: "context", placeholder: "競品名單 + 候選軸（價格 / 功能 / 受眾 / 美感）", type: "textarea" },
    inputs: [{ key: "context", label: "競品 + 軸", type: "textarea", required: true }],
    systemPrompt: `產出競品定位地圖。每變體 1 組軸（價格 vs 功能 / 大眾 vs 利基 / 工具 vs 文化）。
格式：軸定義 → 每家競品落點（含 1 句說明） → 你的最佳定位象限 + 為什麼。${BRAND_TONE}`,
    preferredModel: "qwen", maxTokens: 900,
    outputDefaults: { platform: "generic", post_type: "generic" },
  },

  // ── 爆款結構卡（2026-09-05）：source 一律帶 metric + asOf ──────────
  {
    id: "br-30-stance-manifesto",
    tier: "30s",
    postType: "generic",
    label: { en: "Stance: Write a Line Some Will Reject", zh: "品牌主張：寫一句會有人不同意的話" },
    description: { en: "If everyone agrees, it isn't a stance", zh: "人人點頭的主張不是主張" },
    agent_id: 220869, // 沿用同 postType 現役卡
    skill_slug: "tagline-creative",
    source: {
      type: "viral",
      short: "Nike × Colin Kaepernick",
      metric: "單日社群聲量 +1,400%、270 萬則品牌提及",
      asOf: "2018-09",
      takeaway:
        "品牌主張的強度等於它會冒犯到的人數——挑一邊站，並且準備好失去另一邊，主張才會被人替你傳。",
    },
    primary_question: "你們願意站在哪一邊，即使會失去一部分客人？",
    primary_input: { key: "topic", placeholder: "例：我們支持修理而不是換新 / 我們不做限時逼單", type: "textarea" },
    inputs: [
      { key: "topic", label: "願意站的那一邊", type: "textarea", required: true },
    ],
    systemPrompt: `你要寫一組品牌主張，條件是「一定會有人不同意」。

要產出：
1. 主張一句話，不超過 25 字。
2. 這句話會冒犯到誰、為什麼——誠實寫出來。
3. 為了這個主張，你們願意放棄什麼（要具體）。
4. 三種不同語氣的改寫版本。

硬規則：
- 如果整組讀起來人人都會點頭，那不是主張，重寫。
- 不能冒犯的對象：弱勢群體、任何身分特徵。要冒犯的是「做法」與「習慣」，不是人。
- 不要點名競爭對手。
- 願意放棄的東西必須是真的。`,
    preferredModel: "qwen",
    maxTokens: 990,
    outputDefaults: { platform: "generic", post_type: "generic" },
  },
  {
    id: "br-30-stance-cost-statement",
    tier: "30s",
    postType: "press",
    label: { en: "Statement: Put the Price in the Statement", zh: "品牌聲明：把代價寫進聲明裡" },
    description: { en: "Attach what you gave up", zh: "對外聲明附上你放棄了什麼" },
    agent_id: 60002, // 沿用同 postType 現役卡
    skill_slug: "brand-strategy",
    source: {
      type: "viral",
      short: "Patagonia「Don't Buy This Jacket」",
      metric: "隔年營收成長約三成至 5.43 億美元",
      asOf: "2011-11",
      takeaway:
        "對外聲明如果只有立場沒有代價，讀起來就是公關稿——把損失寫成數字，聲明才有重量。",
    },
    primary_question: "這份聲明要講什麼？做這件事讓你們損失了什麼？",
    primary_input: { key: "topic", placeholder: "例：宣布不再做某產品線，損失年營收兩成", type: "textarea" },
    inputs: [
      { key: "topic", label: "聲明內容 + 為此付出的代價", type: "textarea", required: true },
    ],
    systemPrompt: `你要寫一份品牌對外聲明，核心是「我們為這個決定付出了什麼」。

結構：
1. 決定是什麼，一句話。
2. 代價：具體數字（營收、人力、時程、客戶數）。
3. 為什麼仍然這樣做，一段，用事實不用理念。
4. 對受影響的人怎麼處理，含時間表。
5. 如何被檢驗——什麼時候公布結果。

硬規則：
- 沒有數字的代價不要寫，回去把數字找出來。
- 不要在聲明裡宣傳其他產品。
- 承諾要有可查核的日期。
- 250-600 字。`,
    preferredModel: "qwen",
    maxTokens: 1320,
    outputDefaults: { platform: "generic", post_type: "press" },
  },
];

const YATING_ID = 220872;
export const BRAND_30S_ORCHESTRA: Record<string, OrchestraConfig> = {
  // 2026-05-09 audit fix: 5 variants (was 3) to match label「5 種候選」, +
  // strict 6-15 char range to force tagline-shape output, not paragraphs.
  "br-30-tagline":          { variants: 5, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null,variantLabels: ["功能訴求", "情感訴求", "反差訴求", "智慧訴求", "行動訴求"], captionMinChars: 6, captionMaxChars: 18 },
  "br-30-value-prop":       { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null,variantLabels: ["We help...", "X 不再 Y", "唯一 X"], captionMinChars: 50, captionMaxChars: 200 },
  "br-30-brand-voice":      { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null,variantLabels: ["專業派", "親民派", "玩味派"], captionMinChars: 200, captionMaxChars: 500 },
  "br-30-archetype":        { variants: 3, images: 3, runImageGen: false, imageDirectorId: YATING_ID, aspectRatio: "1:1",variantLabels: ["Hero/Magician 類", "Sage/Caregiver 類", "Outlaw/Jester 類"], captionMinChars: 300, captionMaxChars: 700 },
  "br-30-positioning":      { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null,variantLabels: ["TA 聚焦", "差異化聚焦", "結果聚焦"], captionMinChars: 100, captionMaxChars: 400 },
  "br-30-elevator-pitch":   { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null,variantLabels: ["問題切入", "故事切入", "數據切入"], captionMinChars: 150, captionMaxChars: 300 },
  "br-30-manifesto":        { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null,variantLabels: ["立場式", "對抗式", "邀請式"], captionMinChars: 100, captionMaxChars: 250 },
  "br-30-forbidden-words":  { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null,variantLabels: ["過時 buzzword", "競品用語", "業界陳腔"], captionMinChars: 200, captionMaxChars: 700 },
  "br-30-naming":           { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null,variantLabels: ["描述型", "暗喻型", "創造詞型"], captionMinChars: 200, captionMaxChars: 800 },
  "br-30-competitor-map":   { variants: 3, images: 0, runImageGen: false, imageDirectorId: null, aspectRatio: null,variantLabels: ["價格 vs 功能", "大眾 vs 利基", "工具 vs 文化"], captionMinChars: 300, captionMaxChars: 900 },

  // ── 爆款結構卡 ────────────────────────────────────────────────────
  "br-30-stance-manifesto": {
    variants: 3, images: 0, runImageGen: false, imageDirectorId: null,
    aspectRatio: null, variantLabels: ["宣言版", "對立版", "承諾版"],
    captionMinChars: 200, captionMaxChars: 450,
  },
  "br-30-stance-cost-statement": {
    variants: 3, images: 0, runImageGen: false, imageDirectorId: null,
    aspectRatio: null, variantLabels: ["數字版", "時間表版", "公開承諾版"],
    captionMinChars: 250, captionMaxChars: 600,
  },
};

export function getBrandOrchestraConfig(taskId: string): OrchestraConfig | null {
  return BRAND_30S_ORCHESTRA[taskId] ?? null;
}
