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

conclusion 結構：primary 主受眾敘事 + secondary 次受眾敘事。請把 3 個族群整合敘述，主受眾 = 第一優先 + 完整 demographics/psychographics/behaviors/痛點/情緒需求/管道，次受眾 = 第二與第三族群摘要。`,
    mockThinking: "從候選族群中聚焦 3 個核心 TA，分析人口/心理/行為…",
    mockConclusion: {
      primary: "（mock）主受眾：25-44 歲、月收 X-Y 萬、職業 Z；重視 W；活躍 在 IG / FB；痛點 1, 2, 3；情緒需求：成就感、歸屬感。",
      secondary: "（mock）次受眾：35-50 歲、家庭主婦或自由工作者；尋求 W；偏好管道 LINE 群組。",
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

用 audience.matrix 陣列結構輸出——每個族群一個物件（name 族群名稱, needs 該族群的需求列表，每項含 dim / score 1-10 / weight 重要性 ★）。族群數量對應 Step 6/7 實際列出的 TA 數量（不限 2 個），每個族群的 needs 至少列出 5-8 個關鍵情緒與功能維度。`,
    mockThinking: "為每個 TA 對情緒元素的需求強度打分（1-10）…",
    mockConclusion: {
      matrix: [
        {
          name: "（mock）主受眾",
          needs: [
            { dim: "（mock）真實",     score: 10, weight: "★★★★★" },
            { dim: "（mock）歸屬感",   score: 10, weight: "★★★★★" },
            { dim: "（mock）成就感",   score: 10, weight: "★★★★★" },
            { dim: "（mock）賦能",     score: 10, weight: "★★★★★" },
            { dim: "（mock）身份認同", score: 10, weight: "★★★★★" },
          ],
        },
        {
          name: "（mock）次受眾",
          needs: [
            { dim: "（mock）真實",     score: 10, weight: "★★★★★" },
            { dim: "（mock）歸屬感",   score: 10, weight: "★★★★★" },
            { dim: "（mock）成就感",   score:  7, weight: "★★★★★" },
            { dim: "（mock）賦能",     score:  9, weight: "★★★★★" },
            { dim: "（mock）身份認同", score: 10, weight: "★★★★★" },
          ],
        },
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
  {
    id: 6,
    title: "Step 6 — 行銷語氣指引（品牌聲音 × 產品個性 → 文字規範）",
    segmentTarget: "seg:marketing",
    segmentId: "marketing",
    agent: "brand-voice-coach",
    researchBudget: { minUrls: 0, minChars: 0 },
    promptTemplate: `整合 Step 1-5 分析，為產品「{brand_name}」生成行銷文字指引。

從已有的：
- Step 1 產品核心（zhTagline / coreStatement）
- Step 3 目標受眾（心理特徵 + 行為模式）
- Step 4 功能 / 情緒價值（personality / primaryEmotion）
- 品牌 voice 語氣規範（若有注入）

生成：
1. tone（品牌語氣）：100-150 字，描述與目標受眾溝通時的情緒溫度與說話方式
2. style（溝通風格）：100-150 字，描述文字排版 / 句式 / 長短 / 開頭常用語氣詞
3. keywords（關鍵詞彙）：8-12 個品牌專屬用詞（名詞 / 動詞 / 形容詞均可）
4. visualStyle（視覺文字搭配）：50-80 字，文案搭配的視覺方向
5. colorStrategy（色彩與情緒聯想）：50-80 字，文字說話時配合的色感
6. imageStyle（圖像語言）：50-80 字，圖像與文字的整體風格定調

依範例結構輸出 conclusion。`,
    mockThinking: "整合產品定位 + 目標受眾 + 品牌 voice，生成文字指引…",
    mockConclusion: {
      tone: "（mock）直接、務實、有說服力。說話時像一位熟悉市場的朋友，不賣弄術語。",
      style: "（mock）簡短有力，每段不超過 2 句。開頭用動詞。避免被動語態。",
      keywords: ["（mock）精準", "（mock）主動", "（mock）前瞻", "（mock）掌握", "（mock）策略"],
      visualStyle: "（mock）文字置中，搭配數字圖表，強調數據驅動感。",
      colorStrategy: "（mock）深藍 + 白，傳遞專業穩健感。CTA 用橙色增加行動感。",
      imageStyle: "（mock）都市專業人士的工作場景，有溫度但不過度。",
    },
  },
];

// ── Event pipeline (11 steps — CJ direction 2026-04-29) ─────────────────
// 1:1 with EVENT_SEGMENTS. Architecture:
//   - Step 1 (brief)      : intake reads brand + product positioning;
//                           server-side injects them as system context.
//   - Step 5 (awards)     : DB-RAG (award_frameworks + creative_cases).
//   - Step 6 (smp)        : checkpoint — UI gates auto-advance, user must
//                           explicitly confirm before step 7-11 fire.
//   - Step 8 (creative)   : DB-RAG (Grand Prix / Gold benchmark cases).
//   - Step 9 (guidelines) : server injects brand visual + voice + website
//                           tone signals; warns if brand positioning sparse.
//   - All steps           : researchBudget parity with BRAND_FULL_PIPELINE
//                           (heavy strategy 4-5 URLs / 12000-15000 chars;
//                           internal distillation 0/0).
export const EVENT_FULL_PIPELINE: PipelineStepSpec[] = [
  {
    id: 1,
    title: "Step 1 — 戰略 Brief（intake 自動產出活動類型 + 角色 + 摘要）",
    segmentTarget: "seg:brief",
    segmentId: "brief",
    agent: "intake-agent",
    researchBudget: { minUrls: 3, minChars: 5000 },
    promptTemplate: `你是資深整合行銷策略 intake agent。基於下方注入的【品牌定位】+【產品定位】+【活動名稱/期間】，自動填寫活動戰略 brief。

判斷依據：
- eventType（brand / growth / conversion / hybrid）：依品牌目前所處階段（初創期重 brand、產品成熟期重 growth、急需訂單重 conversion、跨年度活動 hybrid）
- roleThisRound：根據品牌當前最大挑戰，挑「品牌升維 / 新市場切入 / 認知建立 / 轉換衝刺」之一
- briefSummary（200 字）：活動為什麼存在、面對誰、要做到什麼、跟品牌長期定位的銜接點
- relatedProducts：對應的產品名稱陣列（從 scope 已選的 productIds 帶入；若分析發現需擴充再補充）

參考 web 上該品牌近 6 個月的活動 / 媒體聲量做 sanity check。依範例結構輸出 conclusion。`,
    mockThinking: "讀入品牌 + 產品定位，分析活動類型與角色...",
    mockConclusion: {
      eventType: "（mock）brand",
      roleThisRound: "（mock）品牌升維",
      briefSummary: "（mock）此活動旨在...",
      relatedProducts: ["（mock）產品 A"],
    },
  },
  {
    id: 2,
    title: "Step 2 — 背景與問題（商業背景 / 行銷現況 / 核心問題 / 根本原因）",
    segmentTarget: "seg:context",
    segmentId: "context",
    agent: "business-diagnostician",
    researchBudget: { minUrls: 5, minChars: 10000 },
    promptTemplate: `你是資深品牌策略顧問。基於 Step 1 brief + 品牌/產品定位，深入診斷此活動面對的市場 context 與核心問題。

請輸出：
- businessBackground: 公司 / 品牌目前處於什麼狀態（產業位置、營收結構、最近動向）
- marketingStatus: 在市場上被怎麼認知（媒體聲量 / 競爭對位 / 心理佔位）
- coreProblem: 1 句話講清楚這次活動要解的核心問題
- rootCause: 為什麼會發生（深層原因，不是表象）

可 web_search 該品牌 / 產業近 3 個月新聞 + 競品動態。依範例結構輸出 conclusion。`,
    mockThinking: "分析品牌 / 產業現況，挖掘核心問題...",
    mockConclusion: {
      businessBackground: "（mock）品牌目前處於成長期...",
      marketingStatus: "（mock）市場認知偏理性 / 工具導向...",
      coreProblem: "（mock）品牌訊息與情感共鳴斷層。",
      rootCause: "（mock）長期以數據邏輯為主，缺感性連結。",
    },
  },
  {
    id: 3,
    title: "Step 3 — 目標受眾（核心 / 次要 / 關鍵洞察）",
    segmentTarget: "seg:audience",
    segmentId: "audience",
    agent: "audience-strategist",
    researchBudget: { minUrls: 5, minChars: 12000 },
    promptTemplate: `你是 TA 研究員。基於 Step 1-2 + 品牌定位中的 audience 段落，拆解此活動的目標受眾三層。

每層需含：
- 人群輪廓（產業 / 階段 / 身份）
- 行為特徵（怎麼決策 / 看什麼內容 / 在哪些平台）
- 心理洞察（最關鍵 — 他們真正在意什麼）

輸出：
- primaryAudience: 核心受眾（含三層描述）
- secondaryAudience: 次要受眾（含三層描述）
- keyInsight: 關鍵洞察（一句話，要有「不是缺 X，而是缺 Y」這種 reframe）

參考社群討論 / 論壇貼文 / 同類活動受眾數據。依範例結構輸出 conclusion。`,
    mockThinking: "拆解三層受眾，找出心理 reframe...",
    mockConclusion: {
      primaryAudience: "（mock）核心：30-45 都會專業者...",
      secondaryAudience: "（mock）次要：學生與初入職場者...",
      keyInsight: "（mock）他們不是缺工具，而是缺「敢做決定的確定感」。",
    },
  },
  {
    id: 4,
    title: "Step 4 — 活動目標（商業 / 行銷 / 用戶行為三層）",
    segmentTarget: "seg:objectives",
    segmentId: "objectives",
    agent: "campaign-objectives",
    researchBudget: { minUrls: 0, minChars: 0 },
    promptTemplate: `你是行銷負責人。基於 Step 1-3，拆解此活動三層目標 — 不能模糊。

- businessGoal: 商業目標（營收 / 訂單 / 開拓市場 — 連結到 P&L）
- marketingGoal: 行銷目標（建立什麼品牌認知 / 改變什麼市場印象）
- userActionGoal: 用戶行為目標（要他們具體做什麼 — 註冊 / 留下名單 / 完成體驗 / 分享）
- kpis: 3-5 個可量化 KPI（依目標選對應指標）

依範例結構輸出 conclusion。`,
    mockThinking: "從三層拆解避免目標模糊與團隊誤解...",
    mockConclusion: {
      businessGoal: "（mock）帶動 SoWork 摘星服務需求，9 週內新增 30 件詢問。",
      marketingGoal: "（mock）建立「摘星 = 陪伴型數據顧問」認知。",
      userActionGoal: "（mock）完成星圖生成 + 留下聯絡資料。",
      kpis: ["（mock）詢問轉換率 8%", "（mock）品牌情緒共鳴度 +25%", "（mock）UGC 100 篇"],
    },
  },
  {
    id: 5,
    title: "Step 5 — 獎項匹配（DB-RAG 注入近期得獎案例）",
    segmentTarget: "seg:awards",
    segmentId: "awards",
    agent: "award-matcher",
    researchBudget: { minUrls: 0, minChars: 0 },
    promptTemplate: `你是頂尖廣告創意策略師，精通主要國際 / 大中華區廣告獎項的子類別與評審標準。

任務：根據 Step 1-4（特別注意 eventType — brand / growth / conversion / hybrid 對應不同獎項偏好）+ 注入的近期案例，推薦 3 個最適合的「子獎項」。

eventType 對應的獎項偏好：
- brand: 偏 PR Lions / Brand Experience & Activation Lions / D&AD Impact
- growth: 偏 Direct Lions / Digital Craft Lions / Effie Crisis Response
- conversion: 偏 Effie / Creative Effectiveness Lions（強調 ROI）
- hybrid: 3 個獎項分散在不同類型，平衡 brand + 短期成效

重要：必須具體到子獎項層級，不可只說大獎名（例：要說「坎城創意節 - PR Lions」，不要只說「坎城創意節」）。

依範例結構輸出 conclusion (selectedAwards 陣列，3 個 entries)。每個 matchReason 必須引用注入的近期案例精神。`,
    mockThinking: "依 eventType 匹配獎項偏好，從注入案例中找對應...",
    mockConclusion: {
      selectedAwards: [
        { name: "（mock）坎城 - PR Lions", parentAward: "坎城", subCategory: "PR Lions", matchScore: 92, matchReason: "（mock）依 brand-type 偏 PR..." },
        { name: "（mock）D&AD - Impact", parentAward: "D&AD", subCategory: "Impact", matchScore: 85, matchReason: "（mock）..." },
        { name: "（mock）金鼠標 - 整合行銷類", parentAward: "金鼠標", subCategory: "整合行銷類", matchScore: 80, matchReason: "（mock）..." },
      ],
    },
  },
  {
    id: 6,
    title: "Step 6 — 單一核心命題 SMP（整個活動唯一一句）",
    segmentTarget: "seg:smp",
    segmentId: "smp",
    agent: "smp-architect",
    researchBudget: { minUrls: 0, minChars: 0 },
    promptTemplate: `你是頂尖戰略顧問。基於 Step 1-5（含獎項偏好），萃取出此活動的【唯一單一核心命題】。

SMP 規則：
- 一句話，不能超過 18 字
- 必須是品牌可長期擁有的命題（不是 tagline，是命題）
- 同時涵蓋：問題 + 受眾期待 + 品牌可給的轉化
- 不能用空泛詞（「致力於」「讓世界更好」這類絕對禁用）
- 例：「SoWork 幫助你把不確定，變成可以前進的方向」

輸出：
- singleMindedProposition: SMP（一句話）
- rationale: 為什麼是這句（200 字內 — 連結到 Step 1-5）

⚠ 此 step 完成後 UI 會強制 user 確認 — 不可 auto-advance。`,
    mockThinking: "從問題 / 受眾 / 品牌交集找出 18 字以內的命題...",
    mockConclusion: {
      singleMindedProposition: "（mock）SoWork 幫你把不確定，變成可以前進的方向。",
      rationale: "（mock）對應 audience 的「敢做決定的確定感」洞察 + 品牌「陪伴型顧問」定位...",
    },
  },
  {
    id: 7,
    title: "Step 7 — 訊息架構（核心 + 支撐 + 證據）",
    segmentTarget: "seg:messaging",
    segmentId: "messaging",
    agent: "messaging-architect",
    researchBudget: { minUrls: 3, minChars: 6000 },
    promptTemplate: `你是文案戰略架構師。基於 Step 6 SMP，建立支撐 SMP 的訊息架構。

輸出：
- coreMessage: 核心訊息（活動主視覺 / 開場文案的最高指導）
- supportingPoints: 3-5 條支撐訊息（每條 1 句話，環繞 SMP 不同切角）
- proofs: 證據陣列（案例 / 數據 / 使用者故事 — 每條要可被 fact-check）

可 web_search 找品牌過往可用的證據素材。依範例結構輸出 conclusion。`,
    mockThinking: "從 SMP 推導三層訊息結構...",
    mockConclusion: {
      coreMessage: "（mock）數據不是答案，是導航。",
      supportingPoints: ["（mock）每個決策都有路徑", "（mock）成長可以被看見", "（mock）你不孤單，有摘星陪你"],
      proofs: ["（mock）2025 客戶 X 的星圖案例", "（mock）平台累計生成 5000 張星圖", "（mock）User story Y"],
    },
  },
  {
    id: 8,
    title: "Step 8 — 創意概念（DB-RAG 注入 Grand Prix / Gold 標竿案例）",
    segmentTarget: "seg:creative",
    segmentId: "creative",
    agent: "creative-architect",
    researchBudget: { minUrls: 0, minChars: 0 },
    promptTemplate: `你是頂尖創意總監。基於 Step 5 推薦的 3 個獎項（已注入 Grand Prix / Gold 標竿案例）+ Step 6 SMP，產出活動創意概念。

每個創意必須圍繞 SMP，不能脫離。

輸出：
- creativeTheme: 創意主題（活動 big idea，例：摘星者的星際航圖）
- coreMetaphor: 核心比喻（市場/事件對應為何 metaphor，例：市場 = 宇宙）
- coreTranslation: 核心轉譯（一句話 hook，連結 SMP 與 creativeTheme）
- referenceCases: 引用注入的 Grand Prix / Gold 案例（含 brand / awardLevel / year / description）— 用來 ground 創意，不抄案例

依範例結構輸出 conclusion。`,
    mockThinking: "從 SMP + Grand Prix 案例精神中萃取活動 big idea...",
    mockConclusion: {
      creativeTheme: "（mock）摘星者的星際航圖",
      coreMetaphor: "（mock）市場 = 宇宙；數據 = 星圖；品牌 = 導航員",
      coreTranslation: "（mock）每一次決定，都是一次摘星。",
      referenceCases: [
        { brand: "（mock）品牌 X", awardLevel: "Grand Prix", year: "2024", description: "（mock）案例描述..." },
      ],
    },
  },
  {
    id: 9,
    title: "Step 9 — 創意與內容規範（從品牌視覺 + 聲音 + 官網 tone 萃取）",
    segmentTarget: "seg:guidelines",
    segmentId: "guidelines",
    agent: "guideline-architect",
    researchBudget: { minUrls: 3, minChars: 4000 },
    promptTemplate: `你是品牌規範架構師。基於以下注入的品牌資產（已由系統前端 / 後端拉取）：
- 品牌視覺（logo / 色彩 / 字型 / 攝影風格）
- 品牌聲音語氣（tone-of-voice 段落）
- 品牌官網 tone signals（首頁 hero copy / about / blog 三篇 — 由系統爬取）
- Step 8 創意概念

產出此活動的創意與內容規範：
- visualLanguage: 視覺語言（基於品牌視覺擴展，加入活動 metaphor 的視覺方向）
- toneOfVoice: 語氣（基於品牌聲音，根據 audience 心理洞察微調）
- mustHaveElements: 必須出現元素（5-8 條，含品牌標誌 / 必用色 / 必用字 / metaphor 元素）
- forbiddenElements: 禁用元素（5-8 條，例：不可像顧問報告 / 不用 KPI/ROI 語言 / 要有陪伴感）

⚠ 若注入的品牌視覺 / 聲音資料稀疏（不到 1500 字），sourceWarning 欄位必須警告 user 先完成品牌定位再 rerun 此 step。

依範例結構輸出 conclusion。`,
    mockThinking: "從品牌資產 + 創意概念萃取規範與禁用清單...",
    mockConclusion: {
      visualLanguage: "（mock）基於品牌深藍 + 暖橘色系，加入星空 metaphor 的點狀構圖...",
      toneOfVoice: "（mock）陪伴 + 引導，不訓誡、不販售焦慮...",
      mustHaveElements: ["（mock）品牌標誌", "（mock）星圖元素", "（mock）暖色 CTA", "（mock）親近第二人稱"],
      forbiddenElements: ["（mock）顧問報告排版", "（mock）KPI/ROI 商業詞彙", "（mock）冷色 / 銳利幾何"],
      sourceWarning: "",
    },
  },
  {
    id: 10,
    title: "Step 10 — 內容與管道策略（階段 × 管道 × 內容型態）",
    segmentTarget: "seg:channels",
    segmentId: "channels",
    agent: "channel-architect",
    researchBudget: { minUrls: 3, minChars: 4000 },
    promptTemplate: `你是整合行銷管道規劃師。基於 Step 1-9，產出活動的階段 × 管道 × 內容型態策略表。

輸出 phases 陣列，至少 3 個階段（如 認知 → 引路 → 閃耀），每個階段：
- stage: 階段名稱（含時間 anchor，如「W1-W3 認知期」）
- channels: 該階段使用的管道（IG / FB / YT / TikTok / EDM / LP / KOL …）
- contentTypes: 該階段的內容型態（短影音 / Carousel / 長文 / Reels / Email …）
- rationale: 為什麼這配置（連結 audience 行為特徵 + funnel 階段）

可 web_search 同類活動的管道組合作為參考。依範例結構輸出 conclusion。

⚠ 用詞：台灣稱「管道」不稱「管道」。`,
    mockThinking: "依 funnel 階段拆分管道組合...",
    mockConclusion: {
      phases: [
        { stage: "W1-W3 迷航期（認知）", channels: ["IG", "TikTok"], contentTypes: ["情緒短影音"], rationale: "（mock）TA 在這兩個平台...", },
        { stage: "W4-W6 引路期（共鳴）", channels: ["IG Carousel", "Medium 長文"], contentTypes: ["案例拆解", "決策故事"], rationale: "（mock）..." },
        { stage: "W7-W9 閃耀期（轉換）", channels: ["LP", "社群活動"], contentTypes: ["星圖生成", "UGC 召集"], rationale: "（mock）..." },
      ],
    },
  },
  {
    id: 11,
    title: "Step 11 — 用戶旅程（5 step：情緒 / 接觸點 / 期望反應）",
    segmentTarget: "seg:journey",
    segmentId: "journey",
    agent: "journey-architect",
    researchBudget: { minUrls: 0, minChars: 0 },
    promptTemplate: `你是 UX 旅程設計師。基於 Step 3 audience + Step 10 channels，產出 5 步驟用戶旅程。

每一步含：
- step: 旅程節點名稱（看到內容 → 共鳴 → 互動 → 進入工具 → 轉換）
- emotion: 此刻的情緒狀態（好奇 / 動搖 / 認同 / 行動）
- touchpoint: 接觸點（哪個 channel + 什麼 content）
- outcome: 期望反應（具體可觀察的行為）

依範例結構輸出 conclusion。`,
    mockThinking: "從接觸點到轉換綁起 5 步驟旅程...",
    mockConclusion: {
      journey: [
        { step: "看到內容", emotion: "好奇", touchpoint: "IG Reels - 情緒短影音", outcome: "停留 3 秒以上" },
        { step: "共鳴", emotion: "認同", touchpoint: "IG Carousel - 案例", outcome: "留言或分享" },
        { step: "互動", emotion: "好奇升級", touchpoint: "活動 LP", outcome: "點擊 CTA" },
        { step: "進入工具", emotion: "投入", touchpoint: "星圖生成器", outcome: "完成生成" },
        { step: "轉換", emotion: "信任", touchpoint: "註冊 / 留資 / 詢問", outcome: "完成 lead form" },
      ],
    },
  },
];

// ── Old 3-step pipeline kept as deprecated reference ────────────────────
// Retired 2026-04-29 in favor of 11-step expansion above. Kept for one
// release in case rollback is needed; remove on next cleanup.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _RETIRED_EVENT_3STEP_PIPELINE: PipelineStepSpec[] = [
  {
    id: 1,
    title: "Step 1 — 業務診斷（核心問題 / 根本原因 / 機會點 / 策略方向）",
    segmentTarget: "seg:diagnosis",
    segmentId: "diagnosis",
    agent: "campaign-diagnostic",
    researchBudget: { minUrls: 0, minChars: 0 },
    promptTemplate: `你是資深品牌策略顧問。基於下方品牌/產品定位資料 + 活動需求，分析「{brand_name}」這個活動面臨的核心挑戰。

請輸出 4 個欄位：
- coreProblem: 核心問題（1 句話描述當前主要挑戰）
- rootCause: 根本原因（造成此問題的深層原因，2-3 句）
- opportunity: 機會點（基於分析找出可突破的機會，2-3 句）
- strategyDirection: 策略方向（建議的整體策略方向，2-3 句）

依範例結構輸出 conclusion。`,
    mockThinking: "讀入品牌/產品 positioning + 活動需求，逐層挖掘核心挑戰與機會...",
    mockConclusion: {
      coreProblem: "（mock）品牌面臨「理性專業感強但感性共鳴度低」的品牌斷層。",
      rootCause: "（mock）長期以數據與邏輯為核心溝通，忽略了情感支持。",
      opportunity: "（mock）市場偏好從「工具」轉向「意義導向夥伴關係」。",
      strategyDirection: "（mock）實施「導航員」策略 — 從「數據之準」轉向「賦能之溫」。",
    },
  },
  {
    id: 2,
    title: "Step 2 — 獎項匹配（推薦 3 個子獎項 + 注入歷年得獎案例）",
    segmentTarget: "seg:awards",
    segmentId: "awards",
    agent: "award-matcher",
    researchBudget: { minUrls: 0, minChars: 0 },
    promptTemplate: `你是頂尖廣告創意策略師，精通主要國際 / 大中華區廣告獎項的子類別與評審標準。

任務：根據業務診斷 + 活動需求，從可選獎項清單中（已注入近期得獎案例供你判斷）推薦 3 個最適合的「子獎項」。
重要：必須具體到子獎項層級，不可只說大獎名（例：要說「坎城創意節 - PR Lions」，不要只說「坎城創意節」）。

常見子獎項：
- 坎城：Film Lions / Film Craft Lions / PR Lions / Direct Lions / Media Lions / Digital Craft Lions / Creative Effectiveness Lions / Brand Experience & Activation Lions / Creative Strategy Lions / Entertainment Lions / Social & Influencer Lions
- D&AD：Crafts (Film/Photography/Typography...) / Impact (Diversity & Inclusion / Sustainable Development...)
- Effie：產業類別 + Crisis Response / Social Good 等特殊類別
- One Show / Clio：Film / Digital / Direct / PR / Health / Music / Entertainment

依範例結構輸出 conclusion (selectedAwards 陣列，3 個 entries)：
[
  { name: "坎城創意節 - PR Lions", parentAward: "坎城創意節", subCategory: "PR Lions", matchScore: 90, matchReason: "..." },
  ...
]

每個 matchReason 必須引用注入的「近期得獎案例」精神來說明為何此子獎項勝過其他選擇。`,
    mockThinking: "讀取可選獎項 + 近期案例，匹配業務挑戰，選 3 個子獎項...",
    mockConclusion: {
      selectedAwards: [
        { name: "（mock）坎城創意節 - PR Lions", parentAward: "坎城創意節", subCategory: "PR Lions", matchScore: 90, matchReason: "從近期案例看，此子獎項著重 X，正好對應本活動的 Y 挑戰..." },
        { name: "（mock）Effie - Crisis Response", parentAward: "艾菲獎", subCategory: "Crisis Response", matchScore: 85, matchReason: "..." },
        { name: "（mock）D&AD - Impact: Sustainable Development", parentAward: "D&AD", subCategory: "Impact", matchScore: 78, matchReason: "..." },
      ],
    },
  },
  {
    id: 3,
    title: "Step 3 — 方案生成（每獎項一個方案 + 注入 Grand Prix / Gold 標竿案例）",
    segmentTarget: "seg:solution",
    segmentId: "solution",
    agent: "campaign-architect",
    researchBudget: { minUrls: 0, minChars: 0 },
    promptTemplate: `你是頂尖整合行銷策略師。基於 Step 2 推薦的 3 個子獎項（已注入 Grand Prix / Gold 等標竿案例），為每個獎項設計一個對應的策略方案。

每個方案必須圍繞該獎項的核心精神，並引用注入案例的成功要素。

每個 proposal 含：
- name: 方案名稱（體現該獎項精神）
- awardName: 對應的子獎項名稱
- coreConcept: 核心創意概念（1-2 句靈魂）
- strategy: 執行策略（含週期規劃）
- highlights: 3-5 條方案亮點
- taglines: [{chinese, english}] 多組
- positioningStatement: 活動定位陳述
- contentAngles: 4-6 個內容切角
- influencerFit: 適合的 KOL 輪廓
- channels: 管道清單
- kpiFramework: KPI 框架敘述
- referenceCases: 引用注入的標竿案例（含 brand / awardLevel / year / description / sourceUrl）

依範例結構輸出 conclusion (proposals 陣列，3 個 entries)。`,
    mockThinking: "整合業務診斷 + 推薦獎項 + Grand Prix 標竿案例，為每個獎項設計創意方案...",
    mockConclusion: {
      proposals: [
        {
          id: "proposal_a",
          name: "（mock）方案 A — 圍繞 PR Lions 精神",
          awardName: "坎城創意節 - PR Lions",
          awardMatchReason: "（mock）參考 X 品牌 Grand Prix 案例的 PR 精神...",
          coreConcept: "（mock）核心創意：把數據敘事化成英雄旅程。",
          strategy: "（mock）9 週執行策略：迷航 → 引路 → 閃耀 三階段。",
          highlights: ["（mock）亮點 1", "（mock）亮點 2", "（mock）亮點 3"],
          taglines: [
            { chinese: "（mock）中文標語 1", english: "(mock) Tagline 1" },
            { chinese: "（mock）中文標語 2", english: "(mock) Tagline 2" },
          ],
          positioningStatement: "（mock）活動定位陳述。",
          contentAngles: ["（mock）切角 1", "（mock）切角 2", "（mock）切角 3", "（mock）切角 4"],
          influencerFit: "（mock）KOL 輪廓：具國際視野的微型創業者...",
          channels: ["IG Reels", "LinkedIn", "TikTok", "概念官網"],
          kpiFramework: "（mock）品牌情緒共鳴度 + 關鍵字搜索增長 + 海外諮詢轉化率",
          referenceCases: [
            { brand: "（mock）品牌", awardName: "PR Lions", year: 2024, awardLevel: "Grand Prix", description: "（mock）案例描述", sourceUrl: "https://..." },
          ],
        },
      ],
    },
  },
];

/** Pick the right pipeline for a scope mode. */
export function pipelineFor(scopeMode: "brand" | "product" | "event" | "none"): PipelineStepSpec[] {
  if (scopeMode === "brand")   return BRAND_FULL_PIPELINE;
  if (scopeMode === "product") return PRODUCT_FULL_PIPELINE;
  if (scopeMode === "event")   return EVENT_FULL_PIPELINE;
  return [];
}
