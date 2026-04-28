/**
 * positioningPipeline — 11-step research flow for brand positioning.
 *
 * Each step targets one segment in the editor (via setSection). The runner
 * streams a "thinking" payload, then writes a structured conclusion to the
 * targeted segment's fields. UI auto-jumps the sub-nav as the pipeline
 * advances — there's no separate wizard modal.
 *
 * Phase 5e uses mock streams + canned conclusions so we can validate the
 * UX. Phase 6 will wire each step's `runner` to a real squad / LLM agent.
 */

export type PipelineStatus = "idle" | "running" | "paused" | "done" | "error";

/**
 * Per-step research budget. OR semantics — runner stops scraping once
 * EITHER threshold is satisfied. Set both to 0 to skip web research
 * entirely (purely internal analysis steps like differentiation).
 */
export interface ResearchBudget {
  minUrls: number;
  minChars: number;
}

export interface PipelineStepSpec {
  id: number;
  /** Display title shown in the runner control. */
  title: string;
  /** Sub-nav id this step writes to (e.g., "seg:origin"). */
  segmentTarget: string;
  /** Schema segment id the conclusion belongs to (e.g., "origin"). */
  segmentId: string;
  /** Recommended agent slug (Phase 6 will use this to dispatch). */
  agent: string;
  /**
   * Phase 6 runner uses this to scrape web until OR threshold met. All
   * sources stored under positioning._research[segmentId] scoped to
   * the active brand/product/event id.
   */
  researchBudget: ResearchBudget;
  /** Mock streaming text shown during analysis (Phase 5e only). */
  mockThinking: string;
  /** Mock conclusion written into the segment (Phase 5e only). */
  mockConclusion: any;
}

export const BRAND_PIPELINE: PipelineStepSpec[] = [
  {
    id: 1,
    title: "Step 1 — 深層動機分析（5 Whys + 情緒展開）",
    segmentTarget: "seg:origin",
    segmentId: "origin",
    agent: "brand-storyteller",
    researchBudget: { minUrls: 3, minChars: 5000 },
    mockThinking: `讀入品牌描述、產業，準備 5 Whys 推理…
第一層：為什麼創立？→ 表面動機。
第二層：問題為何重要？→ 提出問題意識。
第三層：為何選此解法？→ 方法選擇邏輯。
第四層：相信能成功的理由？→ 信念基礎。
第五層：最深層的情緒動機 → 蒸餾 1 句普世情感。
最後展開 5 個情緒價值元素，避開功能性敘述。`,
    mockConclusion: {
      story: "（mock）在資訊噪音裡，幫每位拓荒者找到自己的星——這就是品牌存在的理由。",
      belief5Layers: [
        { layer: "1 表面動機", body: "（mock）為新世代創業者解決決策孤獨感。" },
        { layer: "2 問題意識", body: "（mock）孤獨會耗盡野心；數據能成為夥伴。" },
        { layer: "3 方法選擇", body: "（mock）以陪伴式分析取代冷冰冰報告。" },
        { layer: "4 信念基礎", body: "（mock）每個人骨子裡都有想出走的渴望。" },
        { layer: "5 核心情緒動機", body: "（mock）讓每個人都有資格擁有「值得期待的明天」。" },
      ],
    },
  },
  {
    id: 2,
    title: "Step 2 — 價值元素分析（功能 + 情緒）",
    segmentTarget: "seg:origin", // stays here, internal cache
    segmentId: "_valueElements",
    agent: "value-architect",
    researchBudget: { minUrls: 0, minChars: 0 }, // internal analysis
    mockThinking: "盤點 Bain 30 個功能價值 + 情緒價值，挑出最相關 5+5。",
    mockConclusion: {
      functionalValues: ["節省時間", "簡化流程", "降低風險", "提供洞察", "可整合"],
      emotionalValues: ["安心", "歸屬", "成就感", "自由感", "希望"],
    },
  },
  {
    id: 28, // ← 2.5 (renumbered as 28 to avoid collision)
    title: "Step 2.5 — 品牌核心價值觀（從信念蒸餾 4 條）",
    segmentTarget: "seg:values",
    segmentId: "values",
    agent: "brand-values-coach",
    researchBudget: { minUrls: 0, minChars: 0 }, // distillation
    mockThinking:
      "從 Step 1 的 5 Whys 信念基礎 + Step 2 的價值元素，蒸餾出 4 條最不可複製的品牌核心價值觀。",
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
    mockThinking: `搜尋同產業 3-5 個直接競爭對手…
分析它們的標語、定位、強項、弱項…
歸納間接替代方案 + 新興威脅…`,
    mockConclusion: {
      intensity: "（mock）競爭強度：高 — 市場前兩名合計佔 60%+。",
      direct: [
        { name: "（mock）World Gym", position: "市佔最高", tone: "自由探索", weakness: "強迫推銷負面印象", ourEdge: "我們販賣信仰，不販賣服務" },
        { name: "（mock）健身工廠", position: "上市連鎖", tone: "標準化美式",  weakness: "情感連結薄弱",     ourEdge: "兄弟情誼不可複製" },
      ],
      indirect: [
        { name: "（mock）國民運動中心", threat: "中高", response: "強調文化溢價，非基礎設施" },
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
    mockThinking: "對每個競品在 5 功能 + 5 情緒元素打 1-10 分，找出市場空白…",
    mockConclusion: {
      // Appended to existing competition data
      map: "（mock）情感連結 × 硬派專業 象限目前無對手。",
    },
  },
  {
    id: 6,
    title: "Step 6 — 目標族群定義",
    segmentTarget: "seg:audience",
    segmentId: "audience",
    agent: "persona-architect",
    researchBudget: { minUrls: 4, minChars: 12000 },
    mockThinking: "從候選族群中聚焦 3 個核心 TA，分析人口/心理/行為…",
    mockConclusion: {
      primary: "（mock）25-44 歲進階健身愛好者，月收 4-8 萬，重視紀律與成果，社群活躍。",
      secondary: "（mock）25-40 歲女性自主訓練族，尋求安全自在的訓練空間。",
    },
  },
  {
    id: 7,
    title: "Step 7 — TA 痛點與需求（Gain / Pain）",
    segmentTarget: "seg:audience",
    segmentId: "audience",
    agent: "persona-architect",
    researchBudget: { minUrls: 3, minChars: 10000 },
    mockThinking: "深挖每個 TA 的 painPoints / gainPoints / 5 Whys / 功能需求 / 情緒需求…",
    mockConclusion: {
      // appended; we'll merge — primary text gets stronger detail
    },
  },
  {
    id: 8,
    title: "Step 8 — TA 情感需求評分矩陣",
    segmentTarget: "seg:audience",
    segmentId: "audience",
    agent: "audience-emotion-mapper",
    researchBudget: { minUrls: 0, minChars: 0 }, // internal scoring
    mockThinking: "為每個 TA 對 5 情緒元素的需求強度打分（1-10）…",
    mockConclusion: {
      matrix: [
        { dim: "真實",     primary: 10, fan: 10, weight: "★★★★★" },
        { dim: "歸屬感",   primary: 10, fan: 10, weight: "★★★★★" },
        { dim: "成就感",   primary: 10, fan:  7, weight: "★★★★★" },
        { dim: "賦能",     primary: 10, fan:  9, weight: "★★★★★" },
        { dim: "身份認同", primary: 10, fan: 10, weight: "★★★★★" },
      ],
    },
  },
  {
    id: 9,
    title: "Step 9 — 定位矩陣（找差異化元素）",
    segmentTarget: "seg:differentiation",
    segmentId: "differentiation",
    agent: "differentiation-strategist",
    researchBudget: { minUrls: 0, minChars: 0 }, // internal analysis
    mockThinking: "比對「TA 需求 × 競品佔據 × 品牌能力」，找 1-3 個高差異化元素…",
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
    researchBudget: { minUrls: 2, minChars: 3000 }, // competitor taglines
    mockThinking: "依差異化元素生成 2 組（A 情感 / B 功能）共 10 個標語選項…",
    mockConclusion: {
      zhTagline: "征服軟弱",
      enTagline: "Conquer Your Weakness",
      type: "四字單句、直擊核心",
      scenes: ["健身房正門大型燈箱", "格鬥區牆面", "品牌影片開場"],
      competitorDiff: "競品強調放鬆與環境舒適；唯有我們強調與自我的殘酷對抗。",
      story: "（mock）在深夜的城市邊緣，當世界都在沉睡，你選擇在鐵片碰撞聲中甦醒…",
    },
  },
  {
    id: 105, // 10.5 — score the picked tagline
    title: "Step 10.5 — 標語評分（6 維度驗證）",
    segmentTarget: "seg:taglineScore",
    segmentId: "taglineScore",
    agent: "brand-tagline-scorer",
    researchBudget: { minUrls: 0, minChars: 0 }, // internal scoring
    mockThinking:
      "對 Step 10 選定的主標語在 6 維度（清晰度/相關性/獨特性/一致性/記憶度/情緒共鳴）打 1-100 分，輸出總分。",
    mockConclusion: {
      rows: [
        { dim: "清晰度",     code: "Clarity",            score: 90, comment: "（mock）直接傳達克服自身不足的價值主張。" },
        { dim: "相關性",     code: "Relevance",          score: 85, comment: "（mock）緊扣進階健身愛好者的核心痛點。" },
        { dim: "獨特性",     code: "Uniqueness",         score: 85, comment: "（mock）結合「成吉思汗」征服者形象，難以替換。" },
        { dim: "一致性",     code: "Consistency",        score: 90, comment: "（mock）與品牌名稱征服意象高度一致。" },
        { dim: "記憶度",     code: "Memorability",       score: 80, comment: "（mock）簡短有力，口語傳播潛力高。" },
        { dim: "情緒共鳴",   code: "Emotional Resonance", score: 88, comment: "（mock）激發中壯年男性對生活無力感的反抗。" },
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
    researchBudget: { minUrls: 0, minChars: 0 }, // distillation
    mockThinking: "從 12 經典原型挑主 + 次原型，定義特質 / 語調 / 態度…",
    mockConclusion: {
      archetypes: ["英雄（主）", "反叛者（次）"],
      tone: ["直接", "有力", "真實", "挑釁"],
      forbidden: ["過度溫柔", "商業促銷語", "舒適化敘事", "完美身材廣告"],
      samples: [
        { generic: "歡迎來體驗我們舒適的訓練環境！", ours: "你來這裡不是為了舒服，你來這裡是為了變強。" },
        { generic: "健身讓你更健康快樂！",           ours: "征服今天的重量，才能征服明天的生活。" },
      ],
    },
  },
];

/**
 * Trends step — scans industry / market reports for favorable trends +
 * risks. Inserted before the final goldenCircle distillation.
 */
export const BRAND_PIPELINE_TRENDS: PipelineStepSpec = {
  id: 115, // 11.5
  title: "Step 11.5 — 市場趨勢與機會",
  segmentTarget: "seg:trends",
  segmentId: "trends",
  agent: "trend-radar",
  researchBudget: { minUrls: 4, minChars: 12000 },
  mockThinking:
    "搜尋產業近期報告 + 觀察社群論壇 + 分析消費者行為轉變，盤點 3-4 個有利趨勢與 2-3 個需關注的風險。",
  mockConclusion: {
    favorable: [
      { name: "（mock）健身身份認同化",   body: "約 50% 規律健身者把「健身」視為核心身份。" },
      { name: "（mock）真實性信任危機",   body: "消費者對過度商業包裝品牌信任度持續下滑。" },
      { name: "（mock）力量訓練主流化",   body: "全球健身場館重訓區域佔比已升至 42%。" },
      { name: "（mock）市場分眾化",       body: "從大型連鎖轉向更具品牌特色的場域。" },
    ],
    risks: [
      { name: "（mock）IP 依賴風險",     body: "需逐步建立去人格化的品牌資產，降低單點風險。" },
      { name: "（mock）女性市場開拓",     body: "現有調性以男性為主，擴張時需平衡核心精神。" },
      { name: "（mock）數位健身替代",     body: "AI 個人化訓練普及，需強化實體社群價值。" },
    ],
  },
};

/**
 * Distillation step — derives goldenCircle (Why/How/What) from the
 * already-collected origin + differentiation + voice. Final write.
 */
export const BRAND_PIPELINE_FINAL: PipelineStepSpec = {
  id: 12,
  title: "最後 — 蒸餾品牌黃金圈",
  segmentTarget: "seg:goldenCircle",
  segmentId: "goldenCircle",
  agent: "brand-archetype-positioning",
  researchBudget: { minUrls: 0, minChars: 0 }, // distillation
  mockThinking: "從 5 Whys 核心動機 + 差異化 + 聲音蒸餾出 Why / How / What…",
  mockConclusion: {
    why:  "（mock）相信每個人骨子裡都藏著不服輸的狠勁。",
    how:  "（mock）透過高強度訓練、格鬥文化與兄弟社群，鍛造個人意志。",
    what: "（mock）全台頂級自由重量區、格鬥擂台、24 小時訓練空間、戰士社群。",
  },
};

export const BRAND_FULL_PIPELINE = [
  ...BRAND_PIPELINE,
  BRAND_PIPELINE_TRENDS,
  BRAND_PIPELINE_FINAL,
];
