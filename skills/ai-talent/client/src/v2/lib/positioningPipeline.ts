/**
 * positioningPipeline — 14-step brand positioning research flow.
 *
 * Each step targets one segment in the editor (via setSection). The runner
 * streams a "thinking" payload, then writes a structured conclusion to the
 * targeted segment's fields. UI auto-jumps the sub-nav as the pipeline
 * advances — there's no separate wizard modal.
 *
 * Each step's promptTemplate is the EXACT prompt CJ specified
 * (5 Whys / 競品識別 / TA 定義 / 差異化矩陣 / 標語 / 個性 / etc.).
 * Placeholders {brand_name} / {industry} / {description} are substituted
 * by the server from DB before the LLM call. The mockConclusion is also
 * pinned to the system prompt as the canonical JSON shape so the model
 * returns exactly the right structure.
 */

export type PipelineStatus = "idle" | "running" | "paused" | "done" | "error";

export interface ResearchBudget {
  minUrls: number;
  minChars: number;
}

export interface PipelineStepSpec {
  id: number;
  title: string;
  segmentTarget: string;
  segmentId: string;
  agent: string;
  researchBudget: ResearchBudget;
  promptTemplate: string;
  mockThinking: string;
  mockConclusion: any;
}

// ── Brand pipeline (14 steps) ────────────────────────────────────────────
export const BRAND_PIPELINE: PipelineStepSpec[] = [
  {
    id: 1,
    title: "Step 1 — 深層動機分析（5 Whys + 情緒展開）",
    segmentTarget: "seg:origin",
    segmentId: "origin",
    agent: "brand-storyteller",
    researchBudget: { minUrls: 3, minChars: 5000 },
    promptTemplate: `分析品牌「{brand_name}」的深層創立動機。

輸入：
- 品牌描述：{description}
- 產業：{industry}

第一部分：5 Whys 分析
請使用 5 Whys 方法逐層追問品牌創立動機（每一層需比上一層更深入、更貼近情緒本質）：
- 第一層：為什麼創立這個品牌？（表面動機） → 精簡描述，約 20-50 字
- 第二層：為什麼這個問題很重要？（問題意識） → 約 20-50 字
- 第三層：為什麼選擇這個解決方式？（方法選擇） → 約 20-50 字
- 第四層：為什麼相信這件事能成功？（信念基礎）→ 約 20-50 字
- 第五層：最深層的情緒動機是什麼？（核心動機） → 僅輸出「1 個」最本質的情緒動機（一句話，具抽象性與普世性）

第二部分：情緒價值展開
根據核心情緒動機，延伸 5 個情緒價值元素：
- 純粹情感導向：不得出現功能性描述（如賺錢、簡化流程等）
- 每一項代表不同情緒維度（懷舊、減少焦慮、設計美學等）
- 不可重複或換句話說

輸出 conclusion 必須符合範例結構（story = 整體敘事段、belief5Layers = 5 層深挖陣列）。`,
    mockThinking: `讀入品牌描述、產業，準備 5 Whys 推理…
第一層：為什麼創立？→ 表面動機
第二層：問題為何重要？→ 問題意識
第三層：為何選此解法？→ 方法選擇
第四層：相信能成功的理由？→ 信念基礎
第五層：最深層情緒動機 → 蒸餾 1 句普世情感
最後展開 5 個情緒價值元素。`,
    mockConclusion: {
      story: "（mock）整段品牌敘事：在 X 領域為了 Y 的人，提供 Z 的價值。",
      belief5Layers: [
        { layer: "1 表面動機", body: "（mock）為新世代解決 X 痛點。" },
        { layer: "2 問題意識", body: "（mock）X 為何重要。" },
        { layer: "3 方法選擇", body: "（mock）以 Y 取代 Z。" },
        { layer: "4 信念基礎", body: "（mock）相信 W 是普世真理。" },
        { layer: "5 核心情緒動機", body: "（mock）讓每個人都有資格擁有 V。" },
      ],
    },
  },
  {
    id: 2,
    title: "Step 2 — 價值元素分析（功能 + 情緒）",
    segmentTarget: "seg:origin",
    segmentId: "_valueElements",
    agent: "value-architect",
    researchBudget: { minUrls: 0, minChars: 0 },
    promptTemplate: `分析品牌「{brand_name}」的價值元素，包括功能價值和情緒價值。

輸入：
- Bain 30 個功能價值元素清單：節省時間 / 簡化流程 / 降低成本 / 降低風險 / 連結 / 整合 / 提供品質 / 提供多樣性 / 提供洞察 / 訊息 / 提供品牌價值 / 設計與美學 / 治療價值 / 健康 / 提供希望 / 自我實現 / 賺錢 / 減少擔憂 / 獎勵 / 隸屬與歸屬 / 教育 / 自由與彈性 / 重要性 / 自我超越 ...
- 情緒價值元素：信任 / 歸屬感 / 安心 / 成就感 / 賦能 / 自由感 / 希望 / 驕傲 / 喜悅 / 共鳴 ...

請從上述元素中識別品牌「{brand_name}」最相關的：
- 5 個功能價值（按重要性排序，1-10 分）
- 5 個情緒價值（按重要性排序，1-10 分）

請依範例結構輸出 conclusion。`,
    mockThinking: "盤點 Bain 30 + 情緒價值，挑出最相關 5+5 並評分。",
    mockConclusion: {
      functionalValues: ["節省時間", "簡化流程", "降低風險", "提供洞察", "可整合"],
      emotionalValues: ["安心", "歸屬", "成就感", "自由感", "希望"],
    },
  },
  {
    id: 28,
    title: "Step 2.5 — 品牌核心價值觀（從信念蒸餾 4 條）",
    segmentTarget: "seg:values",
    segmentId: "values",
    agent: "brand-values-coach",
    researchBudget: { minUrls: 0, minChars: 0 },
    promptTemplate: `從 Step 1 的 5 Whys 信念基礎 + Step 2 的價值元素，蒸餾出品牌「{brand_name}」最不可複製的 4 條核心價值觀。

要求：
- 每一條都是「品牌做事方式」的本質宣言，不是行銷話術
- 4 條彼此互補、不重複
- 每條 label = 2-4 字標籤，body = 50-80 字說明

依範例結構輸出 conclusion (items 陣列，4 個 entries)。`,
    mockThinking: "從信念基礎 + 價值元素推 4 條核心價值觀。",
    mockConclusion: {
      items: [
        { label: "（mock）真實",   body: "拒絕過度包裝，展示真實的汗水與掙扎。" },
        { label: "（mock）歸屬",   body: "兄弟社群 — 找到認同硬漢價值的同類。" },
        { label: "（mock）賦能",   body: "讓你變得更強的環境與系統。" },
        { label: "（mock）專業",   body: "教練回歸專業指導，禁止強迫推銷。" },
      ],
    },
  },
  {
    id: 3,
    title: "Step 3 — 競品識別（直接 / 間接 / 潛在）",
    segmentTarget: "seg:competition",
    segmentId: "competition",
    agent: "competitive-intel",
    researchBudget: { minUrls: 5, minChars: 15000 },
    promptTemplate: `分析品牌「{brand_name}」的競爭環境。

品牌信息：
- 品牌名稱：{brand_name}
- 產業類別：{industry}
- 品牌描述：{description}

要求：
請選擇 3-5 個最重要的直接競爭對手（同類型產品/服務）。

請根據品牌的產業類別和業務描述，識別：
1. 直接競爭對手 (同產業、同類型產品/服務)
2. 間接競爭對手 (不同產業但提供替代方案)
3. 潛在競爭對手 (新興威脅)

重要：請確保競爭對手與品牌的產業類別一致：
- 教育服務 → 其他教育機構
- 餐飲服務 → 其他餐廳
- 電商平台 → 其他電商平台

每個競品必須填寫 tagline、positioning、strengths（≥2 項）、weaknesses（≥2 項）。
JSON key 保持英文（如 directCompetitors、name、type、tagline、positioning、strengths、weaknesses），value 使用繁體中文。

依範例結構輸出 conclusion。`,
    mockThinking: `搜尋同產業 3-5 個直接競爭對手…
分析它們的標語、定位、強項、弱項…
歸納間接替代方案 + 新興威脅…`,
    mockConclusion: {
      intensity: "（mock）競爭強度：高 / 中 / 低 — 一句說明。",
      direct: [
        { name: "（mock）競品 A", position: "市場第一", tone: "標準化大眾", weakness: "客製能力弱", ourEdge: "我們提供 X" },
        { name: "（mock）競品 B", position: "細分龍頭", tone: "專業導向",   weakness: "服務深度不足", ourEdge: "我們提供 Y" },
      ],
      indirect: [
        { name: "（mock）替代方案", threat: "中", response: "強調 X 不可替代性" },
      ],
    },
  },
  {
    id: 5,
    title: "Step 5 — 競品評分（功能 × 情緒）",
    segmentTarget: "seg:competition",
    segmentId: "competition",
    agent: "competitive-intel",
    researchBudget: { minUrls: 3, minChars: 8000 },
    promptTemplate: `評估「{brand_name}」競爭對手在功能價值和情緒價值上的表現。

對 Step 3 識別的每個競爭對手，在 Step 2 的功能價值 + 情緒價值元素上進行 1-10 分評分。
- 列出每個競品在每個元素的分數
- 算 overallFunctionalScore / overallEmotionalScore（平均）
- 識別 marketGapAnalysis：哪些功能 / 情緒空白沒人佔據？這個空白帶來的機會描述

依範例結構輸出 conclusion（合併進 competition.map 等欄位）。`,
    mockThinking: "對每個競品在功能 + 情緒元素打 1-10 分，找市場空白…",
    mockConclusion: {
      map: "（mock）象限分析：高情感 × 硬派專業 此象限目前無對手，是我們的戰略要塞。",
    },
  },
  {
    id: 6,
    title: "Step 6 — 目標族群定義",
    segmentTarget: "seg:audience",
    segmentId: "audience",
    agent: "persona-architect",
    researchBudget: { minUrls: 4, minChars: 12000 },
    promptTemplate: `定義品牌「{brand_name}」的目標族群。

要求：
請選擇 3 個最核心的目標族群，深度聚焦於他們的需求。

請識別：
1. 人口統計特徵 (年齡、性別、收入、教育、職業)
2. 心理特徵 (價值觀、生活方式、興趣)
3. 行為模式 (購買習慣、媒體使用、決策過程)
4. painPoints / coreEmotionalNeeds / preferredChannels

注意：demographics、psychographics、behaviors 必須是字符串，不能是對象。

conclusion 結構：primary 主受眾敘事 + secondary 次受眾敘事。請把 3 個族群整合敘述，主受眾 = 第一優先 + 完整 demographics/psychographics/behaviors/痛點/情緒需求/渠道，次受眾 = 第二與第三族群摘要。`,
    mockThinking: "從候選族群中聚焦 3 個核心 TA，分析人口/心理/行為…",
    mockConclusion: {
      primary: "（mock）主受眾：25-44 歲、月收 X-Y 萬、職業 Z；重視 W；活躍 在 IG / FB；痛點 1, 2, 3；情緒需求：成就感、歸屬感。",
      secondary: "（mock）次受眾：35-50 歲、家庭主婦或自由工作者；尋求 W；偏好渠道 LINE 群組。",
    },
  },
  {
    id: 7,
    title: "Step 7 — TA 痛點與需求（Gain / Pain）",
    segmentTarget: "seg:audience",
    segmentId: "audience",
    agent: "persona-architect",
    researchBudget: { minUrls: 3, minChars: 10000 },
    promptTemplate: `深入研究「{brand_name}」目標族群（Step 6 的 audiences）的需求和痛點。

請分析：
1. Gain Points (期望獲得的好處)
2. Pain Points (面臨的痛點問題)
3. 5 Whys (深層動機分析)
4. 核心價值元素需求（FunctionalNeeds + emotionalNeeds，從 Step 2 的價值元素中挑）

把分析結果合併進 audience.primary 與 audience.secondary 文字敘述，補足痛點 / 需求 / 動機段落（覆蓋 Step 6 的內容、不要刪除原資料）。`,
    mockThinking: "深挖每個 TA 的 painPoints / gainPoints / 5 Whys / 功能需求 / 情緒需求…",
    mockConclusion: {
      primary: "（mock）主受眾：25-44 歲、月收 X-Y 萬、職業 Z。痛點：1) 找不到專業環境；2) 對品牌真實性渴望。Gains：成就感、歸屬感、身份認同。5 Whys 揭示核心動機 = 對抗生活無力感。",
      secondary: "（mock）次受眾：尋求安全自在訓練空間。痛點：被注視壓力、缺乏夥伴。Gains：身心放鬆、賦能感。",
    },
  },
  {
    id: 8,
    title: "Step 8 — TA 情感需求評分矩陣",
    segmentTarget: "seg:audience",
    segmentId: "audience",
    agent: "audience-emotion-mapper",
    researchBudget: { minUrls: 0, minChars: 0 },
    promptTemplate: `評估「{brand_name}」目標族群對功能價值和情緒價值的需求強度（1-10 分）。

對每個 audience（從 Step 6 / 7 取得），對 Step 2 的每個情緒元素打分：
- functionalNeeds 對每個功能元素 1-10
- emotionalNeeds 對每個情緒元素 1-10
- overallFunctionalNeed / overallEmotionalNeed = 該族群的平均
- marketSize / purchasingPower / growthPotential 1-10

用 audience.matrix 陣列結構輸出（dim, primary 主受眾分數, fan 第二族群分數, weight 重要性 ★）。請至少列出 5-8 個關鍵情緒維度。`,
    mockThinking: "為每個 TA 對情緒元素的需求強度打分（1-10）…",
    mockConclusion: {
      matrix: [
        { dim: "（mock）真實",     primary: 10, fan: 10, weight: "★★★★★" },
        { dim: "（mock）歸屬感",   primary: 10, fan: 10, weight: "★★★★★" },
        { dim: "（mock）成就感",   primary: 10, fan:  7, weight: "★★★★★" },
        { dim: "（mock）賦能",     primary: 10, fan:  9, weight: "★★★★★" },
        { dim: "（mock）身份認同", primary: 10, fan: 10, weight: "★★★★★" },
      ],
    },
  },
  {
    id: 9,
    title: "Step 9 — 定位矩陣（找差異化元素）",
    segmentTarget: "seg:differentiation",
    segmentId: "differentiation",
    agent: "differentiation-strategist",
    researchBudget: { minUrls: 0, minChars: 0 },
    promptTemplate: `為品牌「{brand_name}」進行定位分析。

基於三方資料：
- 目標族群（Step 6/7/8）
- 競爭對手（Step 3/5）
- 價值元素（Step 2 功能 + 情緒）

任務：比對「消費者需求 × 競爭者佔據 × 品牌能力」，找出最具差異化潛力的 1-3 個情緒價值元素 + 1-3 個功能價值元素。

篩選邏輯（必須同時滿足）：
- 消費者對該價值有高度需求（Step 8 分數高）
- 多數競爭者未有效佔據或表現弱（Step 5 分數低）
- 品牌在該價值上具備明確優勢

每個差異化元素需輸出：
- valueElement（價值元素名稱）
- type（functional / emotional）
- consumerDemand (1-100)
- brandStrength (1-100)
- competitorSaturation (1-100)
- differentiationScore（綜合）
- insight (50-100 字，為什麼是機會)
- strategicImplication (50-100 字，怎麼用在定位)

把分析整合到 differentiation.emotional / functional / summary 三個欄位（emotional / functional 各 100-200 字描述差異化主軸，summary 是品牌定位總結句）。`,
    mockThinking: "比對 TA 需求 × 競品佔據 × 品牌能力，找 1-3 個高差異化元素…",
    mockConclusion: {
      emotional:  "（mock）情感差異化：歸屬認同 — 兄弟社群 + 領袖 IP，連鎖品牌無法複製。",
      functional: "（mock）功能差異化：頂級自由重量 + 專業格鬥 + 24 小時，融合式硬派生態系。",
      summary:    "（mock）我們販賣「成為征服者的入場券」與「找到兄弟的歸屬」，不是「健身服務」。",
    },
  },
  {
    id: 10,
    title: "Step 10 — 標語開發（情感 / 功能各 5 句）",
    segmentTarget: "seg:tagline",
    segmentId: "tagline",
    agent: "brand-tagline-writer",
    researchBudget: { minUrls: 2, minChars: 3000 },
    promptTemplate: `為品牌「{brand_name}」生成標語。

任務：請生成 2 組策略方向（A / B），每組各 5 個標語選項。每一組方案只能對應「1 個價值元素」，不可混用。

從 Step 9 結果中，分別取出：
- 情緒差異化元素清單（N_emotional 個）
- 功能差異化元素清單（N_functional 個）

方案 A（情緒導向）：
- 生成 5 個標語
- 必須涵蓋全部 N_emotional 個元素
- 每個標語標注對應的元素名稱

方案 B（功能導向）：
- 生成 5 個標語
- 必須涵蓋全部 N_functional 個元素

每個標語都會經過六步驟驗證：獨特性 / 相關性 / 清晰度 / 記憶度 / 情緒共鳴 / 一致性。

把最終選定的「主標語」寫入 tagline 結構：
- zhTagline / enTagline = 主標語中 / 英
- type = 標語類型（如「四字單句、直擊核心」）
- scenes = 應用場景陣列（3-5 個）
- competitorDiff = 與競品的標語差異
- story = 標語背後的品牌故事（150-300 字）`,
    mockThinking: "依差異化元素生成 2 組（A 情感 / B 功能）共 10 個標語選項…",
    mockConclusion: {
      zhTagline: "（mock）主標語",
      enTagline: "（mock）Main Tagline",
      type: "（mock）四字單句、直擊核心",
      scenes: ["（mock）門面燈箱", "（mock）品牌影片開場", "（mock）社群封面"],
      competitorDiff: "（mock）競品強調 X；唯有我們強調 Y。",
      story: "（mock）標語背後的場景與情緒：在 X 時刻，當 Y 發生，我們選擇 Z…",
    },
  },
  {
    id: 105,
    title: "Step 10.5 — 標語評分（6 維度驗證）",
    segmentTarget: "seg:taglineScore",
    segmentId: "taglineScore",
    agent: "brand-tagline-scorer",
    researchBudget: { minUrls: 0, minChars: 0 },
    promptTemplate: `對 Step 10 選定的「{brand_name}」主標語進行 6 維度評分（1-100 分）：
1. 清晰度 (Clarity) — 是否一目了然
2. 相關性 (Relevance) — 是否扣準目標族群
3. 獨特性 (Uniqueness) — 是否難以替換
4. 一致性 (Consistency) — 與品牌名稱 / 調性是否吻合
5. 記憶度 (Memorability) — 是否朗朗上口
6. 情緒共鳴 (Emotional Resonance) — 是否觸發內在反應

每維度給分 + 30-60 字評析，最後加總得 total（0-100）。

依範例結構輸出 conclusion（rows 陣列 + total）。`,
    mockThinking: "對主標語在 6 維度（清晰度/相關性/獨特性/一致性/記憶度/情緒共鳴）打 1-100 分。",
    mockConclusion: {
      rows: [
        { dim: "清晰度",     code: "Clarity",            score: 90, comment: "（mock）直接傳達核心價值。" },
        { dim: "相關性",     code: "Relevance",          score: 85, comment: "（mock）扣準目標族群痛點。" },
        { dim: "獨特性",     code: "Uniqueness",         score: 85, comment: "（mock）難以被競品替換。" },
        { dim: "一致性",     code: "Consistency",        score: 90, comment: "（mock）與品牌名稱意象一致。" },
        { dim: "記憶度",     code: "Memorability",       score: 80, comment: "（mock）簡短有力，傳播潛力高。" },
        { dim: "情緒共鳴",   code: "Emotional Resonance", score: 88, comment: "（mock）觸發內在反應。" },
      ],
      total: 86,
    },
  },
  {
    id: 11,
    title: "Step 11 — 品牌個性（原型 + 聲音）",
    segmentTarget: "seg:voice",
    segmentId: "voice",
    agent: "brand-voice-coach",
    researchBudget: { minUrls: 0, minChars: 0 },
    promptTemplate: `分析品牌「{brand_name}」的品牌個性與溝通態度。

請識別：
1. 品牌原型：從 12 個經典原型中選擇主 + 次（英雄 / 智者 / 創造者 / 照顧者 / 探險家 / 反叛者 / 魔法師 / 一般人 / 戀人 / 弄臣 / 統治者 / 純真者）
2. 品牌特質：3-5 個核心特質（如：創新、可靠、溫暖等）
3. 溝通語調：4-6 個關鍵詞（如：直接、有力、真實、挑釁）
4. 溝通禁區：3-5 個應避免的語氣
5. 溝通範例對比：3-4 組「一般說法 vs 我們的說法」

依範例結構輸出 conclusion（archetypes 陣列 + tone 陣列 + forbidden 陣列 + samples 對照陣列）。`,
    mockThinking: "從 12 經典原型挑主 + 次原型，定義特質 / 語調 / 態度…",
    mockConclusion: {
      archetypes: ["（mock）英雄（主）", "（mock）反叛者（次）"],
      tone: ["直接", "有力", "真實", "挑釁"],
      forbidden: ["過度溫柔", "商業促銷語", "舒適化敘事", "完美身材廣告"],
      samples: [
        { generic: "（mock）歡迎來體驗舒適的環境", ours: "（mock）你來這裡是為了變強，不是為了舒服。" },
        { generic: "（mock）讓你更健康快樂",       ours: "（mock）征服今天的重量，才能征服明天的生活。" },
      ],
    },
  },
];

export const BRAND_PIPELINE_TRENDS: PipelineStepSpec = {
  id: 115,
  title: "Step 11.5 — 市場趨勢與機會",
  segmentTarget: "seg:trends",
  segmentId: "trends",
  agent: "trend-radar",
  researchBudget: { minUrls: 4, minChars: 12000 },
  promptTemplate: `分析「{brand_name}」（產業：{industry}）所處的市場趨勢與機會。

請輸出：
- favorable: 3-4 個有利趨勢（每個含 name + body 60-120 字說明，可引用近期報告 / 數據）
- risks: 2-3 個需關注的風險（每個含 name + body 60-120 字應對方向）

優先用 web_search 找最新（2025-2026）的產業報告 / 消費者行為 / 競爭動態。`,
  mockThinking: "搜尋產業近期報告 + 觀察社群論壇 + 分析消費者行為轉變…",
  mockConclusion: {
    favorable: [
      { name: "（mock）有利趨勢 1", body: "（mock）50% 規律健身者把「健身」視為核心身份，本品牌的征服者敘事完美承接。" },
      { name: "（mock）有利趨勢 2", body: "（mock）真實性信任危機，消費者對過度包裝品牌信任度下滑。" },
      { name: "（mock）有利趨勢 3", body: "（mock）力量訓練主流化，全球場館重訓區佔比升至 42%。" },
    ],
    risks: [
      { name: "（mock）風險 1", body: "（mock）IP 依賴 — 需逐步建立去人格化的品牌資產。" },
      { name: "（mock）風險 2", body: "（mock）女性市場開拓難度 — 調性以男性為主，擴張需平衡核心精神。" },
    ],
  },
};

export const BRAND_PIPELINE_FINAL: PipelineStepSpec = {
  id: 12,
  title: "最後 — 蒸餾品牌黃金圈",
  segmentTarget: "seg:goldenCircle",
  segmentId: "goldenCircle",
  agent: "brand-archetype-positioning",
  researchBudget: { minUrls: 0, minChars: 0 },
  promptTemplate: `從前面所有步驟（Step 1 5 Whys / Step 9 差異化 / Step 11 個性）蒸餾出「{brand_name}」的品牌黃金圈：

- WHY (品牌願景) = 我們相信什麼？為什麼存在？50-100 字
- HOW (品牌使命) = 我們怎麼做？方法 / 過程 50-100 字
- WHAT (品牌產品 / 服務) = 我們提供什麼具體東西 50-100 字

WHY 應呼應 Step 1 第五層核心情緒動機。HOW 應呼應 Step 9 差異化方法。WHAT 應描述具體 offerings。

依範例結構輸出 conclusion（why / how / what 三段）。`,
  mockThinking: "從 5 Whys 核心動機 + 差異化 + 聲音蒸餾出 Why / How / What…",
  mockConclusion: {
    why:  "（mock）相信每個人骨子裡都藏著未被看見的潛力。",
    how:  "（mock）透過 X 文化 + Y 系統 + Z 社群，把潛力鍛造成具體成就。",
    what: "（mock）提供 A / B / C 三個產品線 + D 社群空間。",
  },
};

export const BRAND_FULL_PIPELINE = [
  ...BRAND_PIPELINE,
  BRAND_PIPELINE_TRENDS,
  BRAND_PIPELINE_FINAL,
];

// ── Product pipeline (5 steps per CJ 2026-04-29 spec) ────────────────────
export const PRODUCT_FULL_PIPELINE: PipelineStepSpec[] = [
  {
    id: 1,
    title: "Step 1 — 產品深度調研（4P + JTBD + Design Principles）",
    segmentTarget: "seg:core",
    segmentId: "core",
    agent: "product-strategist",
    researchBudget: { minUrls: 4, minChars: 12000 },
    promptTemplate: `分析產品「{brand_name}」（產業：{industry}）的深度資訊。

輸入：
- 產品名稱：{brand_name}
- 描述：{description}
- 若有官網或文件可 web_search 抓取最新資料

請使用三個方法論交叉分析：
1. 4P 分析（Product / Price / Place / Promotion）— 各 50-80 字
2. Jobs to be Done — 從「使用情境」推「期望成果」推「深層需求」
3. Design Principles — 列 3-5 條設計原則

最後蒸餾出：
- name（產品名）
- zhTagline / enTagline（中英文標語）
- coreStatement（核心定位 100-150 字）
- oneLineValueProp（一句話價值主張，模板：「為 [audience] 提供基於 [USP] 的解決方案」）

依範例結構輸出 conclusion，包含 4P / JTBD / Design Principles 巢狀資訊供後續步驟使用。`,
    mockThinking: "從產品名 + 描述 + 官網爬取，跑 4P + JTBD + 設計原則三方交叉分析…",
    mockConclusion: {
      name: "（mock）產品名稱",
      zhTagline: "（mock）中文標語",
      enTagline: "（mock）English Tagline",
      coreStatement: "（mock）這個產品為 X 用戶提供 Y 解決方案。",
      oneLineValueProp: "（mock）為 [新世代專業人士] 提供基於 [主動選股] 的產品解決方案。",
      fourPAnalysis: "Product / Price / Place / Promotion 四項各一段。",
      jtbd: "用戶在 X 情境下，想完成 Y 工作，最終獲得 Z 成果。",
      designPrinciples: ["原則 1", "原則 2", "原則 3"],
    },
  },
  {
    id: 2,
    title: "Step 2 — 競爭對手分析（直接 + 替代 + 市場空白）",
    segmentTarget: "seg:competition",
    segmentId: "competition",
    agent: "competitive-intel",
    researchBudget: { minUrls: 5, minChars: 15000 },
    promptTemplate: `分析產品「{brand_name}」的競爭環境。

請識別：
1. 直接競爭者（同類型產品 / 服務）3-5 個 — 每個含 name + position
2. 替代方案（不同產品但解決同問題）2-3 個
3. 市場空白點（受眾 / 通路 / 價格 / 推廣 — 4 個面向）— 每個 60-100 字描述空白與機會

從前面的 4P / JTBD 結果，找出競爭差異化角度。

依範例結構輸出 conclusion：
- competitors: [{name, position}]
- uniqueUsp（獨家賣點）
- rareUsp（少數競品也說的賣點）
- commonUsp（多數競爭者都說的賣點）
- marketGaps: {customer, channel, price, promotion} — 四個面向的空白`,
    mockThinking: "搜尋同類型產品 + 替代方案，識別 3-5 個直接競爭者，找出市場空白…",
    mockConclusion: {
      competitors: [
        { name: "（mock）競品 A", position: "產業領導者" },
        { name: "（mock）競品 B", position: "細分市場龍頭" },
      ],
      uniqueUsp: "（mock）獨家賣點：X 是只有我們有的能力。",
      rareUsp: "（mock）少數競品也有 Y。",
      commonUsp: "（mock）多數人都做的 Z。",
      marketGaps: {
        customer: "（mock）某類客群尚未被覆蓋。",
        channel:  "（mock）某通路尚無競品深耕。",
        price:    "（mock）中間價位有空白。",
        promotion: "（mock）某傳播角度無人佔據。",
      },
    },
  },
  {
    id: 3,
    title: "Step 3 — 目標客群分析（Persona + MOT）",
    segmentTarget: "seg:audience",
    segmentId: "audience",
    agent: "persona-architect",
    researchBudget: { minUrls: 3, minChars: 10000 },
    promptTemplate: `為產品「{brand_name}」識別目標客群。

請聚焦 2-3 個最核心受眾。每個受眾需含：
- 人口統計（年齡、性別、收入、教育、職業）— 字串敘述
- 心理特徵（價值觀、生活方式、興趣）— 字串敘述
- 行為模式（購買習慣、媒體使用、決策過程）— 字串敘述
- 痛點（pains）3-5 條
- 期望獲得（needs）3-5 條
- 消費者關鍵時刻（MOT - Moment of Truth）— 該受眾「決定買 / 不買」的瞬間 + 我們可以介入的點

依範例結構輸出 conclusion：
- primary: 主受眾敘事（含完整 demographics/psychographics/behaviors）
- secondary: 次受眾敘事
- pains: 共通痛點陣列
- needs: 共通期望陣列
- mots: [{audience: 受眾名, mot: 關鍵時刻描述}] 陣列`,
    mockThinking: "推論 2-3 個核心受眾，建構 Persona 並識別 MOT 關鍵時刻…",
    mockConclusion: {
      primary: "（mock）25-44 歲、月收 X-Y 萬、職業 Z；重視 W；活躍 在 IG / FB；痛點 1, 2, 3。",
      secondary: "（mock）35-50 歲、家庭主婦或自由工作者；尋求 W。",
      pains: ["（mock）痛點 1", "（mock）痛點 2", "（mock）痛點 3"],
      needs: ["（mock）需求 1", "（mock）需求 2", "（mock）需求 3"],
      mots: [
        { audience: "（mock）主受眾", mot: "（mock）在某一刻，他們決定 X，我們可以在這時介入。" },
        { audience: "（mock）次受眾", mot: "（mock）某情境出現 Y 訊號時，他們會搜尋產品。" },
      ],
    },
  },
  {
    id: 4,
    title: "Step 4 — 功能價值分析（USP 精煉 + 三層差異化）",
    segmentTarget: "seg:value",
    segmentId: "value",
    agent: "product-value-mapper",
    researchBudget: { minUrls: 0, minChars: 0 },
    promptTemplate: `為產品「{brand_name}」精煉功能與情緒價值。

從 Step 1（4P/JTBD）+ Step 2（競品）+ Step 3（受眾痛點）整合：
1. 功能價值 vs 情緒價值分類
2. USP 精煉 — 3-5 條核心差異化
3. 差異化服務線分層：
   - 獨家：只有我們有的
   - 少數競品也說的
   - 多數競爭者都說的

依範例結構輸出 conclusion：
- coreFunctions: 核心功能陣列（3-5 條）
- features: 產品特色陣列（3-5 條）
- advantages: 產品優勢陣列（3-5 條）
- primaryEmotion: 主要情緒價值（一段敘述）
- personality: 品牌個性
- userFeeling: 使用者使用後的感受`,
    mockThinking: "整合 Step 1-3 結果，分類功能 / 情緒價值，精煉 3-5 條 USP，三層差異化…",
    mockConclusion: {
      coreFunctions: ["（mock）核心功能 1", "（mock）核心功能 2", "（mock）核心功能 3"],
      features: ["（mock）特色 1", "（mock）特色 2", "（mock）特色 3"],
      advantages: ["（mock）優勢 1", "（mock）優勢 2", "（mock）優勢 3"],
      primaryEmotion: "（mock）主要情緒價值：使用者感受到 X 與 Y。",
      personality: "（mock）產品個性：敏捷、前瞻、可靠。",
      userFeeling: "（mock）使用後感受：聰明的策略家、主動掌握。",
    },
  },
  {
    id: 5,
    title: "Step 5 — 定位方案生成（情感 + 功能雙方向）",
    segmentTarget: "seg:strategy",
    segmentId: "strategy",
    agent: "gtm-architect",
    researchBudget: { minUrls: 0, minChars: 0 },
    promptTemplate: `為產品「{brand_name}」生成最終定位方案。

整合 Step 1-4 的所有結果，輸出：
1. 產品定位策略（positioning）100-150 字
2. 定價策略（pricing）— 中價位 / 高端 / 滲透 等的選擇與理由
3. 通路策略（channel）— 證券 / 數位 / 實體 / 多元
4. 推廣策略（promotion）— 列 3-5 條
5. 生命週期階段（lifecycleStage）— 引入 / 成長 / 成熟 / 衰退
6. 發展策略（developmentStrategy）— 此階段該做的事
7. 市場空白缺口（marketGap / channelGap / priceGap / promotionGap）— 從 Step 2 的市場空白展開

最後生成 2 個定位方案（情緒導向 / 功能導向）+ 各 5 個標語選項，
但本步驟只 commit 「主要選定方案」到 strategy.positioning 欄位，標語選項列在 strategy.taglineOptions 供使用者挑選。`,
    mockThinking: "整合 Step 1-4 全部分析，生成 2 個定位方案（情感 / 功能）+ 各 5 個標語選項…",
    mockConclusion: {
      positioning: "（mock）採取「升級選擇」策略 — 不比低價，比績效。建立「領先者」品牌形象。",
      pricing: "（mock）中價位策略 — 反映主動管理成本，但透過結構優化 TER。",
      channel: "（mock）證券通路為主 + 數位理財平台。",
      promotion: ["（mock）KOL 實測", "（mock）社群口碑", "（mock）專業論壇"],
      lifecycleStage: "（mock）成長期",
      developmentStrategy: "（mock）持續展現績效穩定度，將短期 Alpha 轉化為長期穩健獲利的品牌認可。",
      marketGap: "（mock）受眾缺口描述",
      channelGap: "（mock）通路缺口描述",
      priceGap: "（mock）價格缺口描述",
      promotionGap: "（mock）推廣缺口描述",
      taglineOptions: {
        emotional: ["（mock）情緒標語 1", "（mock）情緒標語 2", "（mock）情緒標語 3"],
        functional: ["（mock）功能標語 1", "（mock）功能標語 2", "（mock）功能標語 3"],
      },
    },
  },
];

// ── Event pipeline placeholder (build when CJ shares spec) ───────────────
export const EVENT_FULL_PIPELINE: PipelineStepSpec[] = [];

/** Pick the right pipeline for a scope mode. */
export function pipelineFor(scopeMode: "brand" | "product" | "event" | "none"): PipelineStepSpec[] {
  if (scopeMode === "brand")   return BRAND_FULL_PIPELINE;
  if (scopeMode === "product") return PRODUCT_FULL_PIPELINE;
  if (scopeMode === "event")   return EVENT_FULL_PIPELINE;
  return [];
}
