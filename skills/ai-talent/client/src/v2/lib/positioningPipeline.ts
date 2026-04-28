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
    mockThinking: "盤點 Bain 30 個功能價值 + 情緒價值，挑出最相關 5+5。",
    mockConclusion: {
      functionalValues: ["節省時間", "簡化流程", "降低風險", "提供洞察", "可整合"],
      emotionalValues: ["安心", "歸屬", "成就感", "自由感", "希望"],
    },
  },
  {
    id: 3,
    title: "Step 3 — 競品識別（直接 / 間接 / 潛在）",
    segmentTarget: "seg:competition",
    segmentId: "competition",
    agent: "competitive-intel",
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
    id: 11,
    title: "Step 11 — 品牌個性（原型 + 聲音）",
    segmentTarget: "seg:voice",
    segmentId: "voice",
    agent: "brand-voice-coach",
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
 * Distillation step — derives goldenCircle (Why/How/What) from the
 * already-collected origin + differentiation + voice. Final write.
 */
export const BRAND_PIPELINE_FINAL: PipelineStepSpec = {
  id: 12,
  title: "最後 — 蒸餾品牌黃金圈",
  segmentTarget: "seg:goldenCircle",
  segmentId: "goldenCircle",
  agent: "brand-archetype-positioning",
  mockThinking: "從 5 Whys 核心動機 + 差異化 + 聲音蒸餾出 Why / How / What…",
  mockConclusion: {
    why:  "（mock）相信每個人骨子裡都藏著不服輸的狠勁。",
    how:  "（mock）透過高強度訓練、格鬥文化與兄弟社群，鍛造個人意志。",
    what: "（mock）全台頂級自由重量區、格鬥擂台、24 小時訓練空間、戰士社群。",
  },
};

export const BRAND_FULL_PIPELINE = [...BRAND_PIPELINE, BRAND_PIPELINE_FINAL];
