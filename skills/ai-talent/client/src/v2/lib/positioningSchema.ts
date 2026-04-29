/**
 * positioningSchema — typed config for the brand / product / event
 * positioning books.
 *
 * Each scope has an ordered list of segments. Each segment lists its
 * fields, a recommended agent slug for auto-fill, and a label.
 *
 * Field types supported:
 *   text       — single-line input
 *   textarea   — multi-line textarea
 *   array      — string[] (each item rendered as removable chip-input row)
 *   tableRows  — array of objects with named columns
 *   number     — numeric input (used for scores)
 *
 * Stored in DB as JSON keyed by segment.id under
 *   brands.positioning / products.positioning / events.positioning.
 */

export type FieldType = "text" | "textarea" | "array" | "tableRows" | "number";

export interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
  /** For tableRows: list of column keys. */
  columns?: { key: string; label: string; type: "text" | "textarea" | "number" }[];
  /** Optional placeholder / hint shown below input. */
  hint?: string;
}

export interface SegmentSpec {
  id: string;
  /** Section number in the printed doc, e.g., "1.1". */
  num: string;
  title: string;
  /** Recommended agent slug — used by the "🤖 由 X 幫我填寫" button. */
  agent: string;
  fields: FieldSpec[];
}

// ── Brand (8 segments) ───────────────────────────────────────────────────
export const BRAND_SEGMENTS: SegmentSpec[] = [
  {
    id: "goldenCircle",
    num: "1.1",
    title: "品牌黃金圈",
    agent: "brand-archetype-positioning",
    fields: [
      { key: "why",  label: "WHY — 品牌願景",        type: "textarea" },
      { key: "how",  label: "HOW — 品牌使命",        type: "textarea" },
      { key: "what", label: "WHAT — 品牌產品 / 服務", type: "textarea" },
    ],
  },
  {
    id: "tagline",
    num: "1.2",
    title: "品牌核心標語",
    agent: "brand-tagline-writer",
    fields: [
      { key: "zhTagline",      label: "中文標語",      type: "text" },
      { key: "enTagline",      label: "英文標語",      type: "text" },
      { key: "type",           label: "標語類型",      type: "text" },
      { key: "scenes",         label: "應用場景",      type: "array" },
      { key: "competitorDiff", label: "競品差異",      type: "textarea" },
      { key: "story",          label: "標語品牌故事",  type: "textarea" },
    ],
  },
  {
    id: "taglineScore",
    num: "1.3",
    title: "標語評分摘要",
    agent: "brand-tagline-scorer",
    fields: [
      { key: "rows", label: "評分", type: "tableRows", columns: [
        { key: "dim",     label: "維度",   type: "text" },
        { key: "code",    label: "英文",   type: "text" },
        { key: "score",   label: "分數",   type: "number" },
        { key: "comment", label: "評析",   type: "text" },
      ]},
      { key: "total", label: "總分 / 100", type: "number" },
    ],
  },
  {
    id: "origin",
    num: "2.1",
    title: "品牌起源故事",
    agent: "brand-storyteller",
    fields: [
      { key: "story",         label: "起源故事",       type: "textarea" },
      { key: "belief5Layers", label: "信念五層深挖",   type: "tableRows", columns: [
        { key: "layer", label: "層", type: "text" },
        { key: "body",  label: "內容", type: "textarea" },
      ]},
    ],
  },
  {
    id: "values",
    num: "2.2",
    title: "品牌核心價值觀",
    agent: "brand-values-coach",
    fields: [
      { key: "items", label: "核心價值觀", type: "tableRows", columns: [
        { key: "label", label: "核心",   type: "text" },
        { key: "body",  label: "說明",   type: "textarea" },
      ]},
    ],
  },
  {
    id: "audience",
    num: "3",
    title: "目標受眾",
    agent: "persona-architect",
    fields: [
      { key: "primary",   label: "主受眾（人口統計 / 心理 / 情感需求 / 痛點 / 偏好渠道）", type: "textarea" },
      { key: "secondary", label: "次受眾",                                                  type: "textarea" },
      { key: "matrix",    label: "情感需求評分矩陣", type: "tableRows", columns: [
        { key: "dim",     label: "需求維度",      type: "text" },
        { key: "primary", label: "主受眾分數",    type: "number" },
        { key: "fan",     label: "粉絲分數",      type: "number" },
        { key: "weight",  label: "重要性 (★)",    type: "text" },
      ]},
    ],
  },
  {
    id: "competition",
    num: "4",
    title: "競爭格局分析",
    agent: "competitive-intel",
    fields: [
      { key: "intensity",  label: "競爭強度評估",  type: "textarea" },
      { key: "direct",     label: "直接競爭對手",  type: "tableRows", columns: [
        { key: "name",     label: "名稱",   type: "text" },
        { key: "position", label: "市場地位", type: "text" },
        { key: "tone",     label: "品牌調性", type: "text" },
        { key: "weakness", label: "弱點",     type: "textarea" },
        { key: "ourEdge",  label: "我方差異點", type: "textarea" },
      ]},
      { key: "indirect",   label: "間接競爭對手",  type: "tableRows", columns: [
        { key: "name",     label: "名稱",      type: "text" },
        { key: "threat",   label: "威脅程度",  type: "text" },
        { key: "response", label: "應對策略",  type: "textarea" },
      ]},
      { key: "map",        label: "競爭定位地圖（描述）", type: "textarea" },
    ],
  },
  {
    id: "differentiation",
    num: "5",
    title: "品牌差異化戰略",
    agent: "differentiation-strategist",
    fields: [
      { key: "emotional",  label: "情感差異化",  type: "textarea" },
      { key: "functional", label: "功能差異化",  type: "textarea" },
      { key: "summary",    label: "差異化總結",  type: "textarea" },
    ],
  },
  {
    id: "trends",
    num: "7",
    title: "市場趨勢與機會",
    agent: "trend-radar",
    fields: [
      { key: "favorable", label: "有利趨勢", type: "tableRows", columns: [
        { key: "name", label: "趨勢", type: "text" },
        { key: "body", label: "說明", type: "textarea" },
      ]},
      { key: "risks", label: "需關注的風險", type: "tableRows", columns: [
        { key: "name", label: "風險", type: "text" },
        { key: "body", label: "說明", type: "textarea" },
      ]},
    ],
  },
  {
    id: "voice",
    num: "8",
    title: "品牌個性與溝通風格",
    agent: "brand-voice-coach",
    fields: [
      { key: "archetypes", label: "人格原型（主 / 次）",   type: "array" },
      { key: "tone",       label: "核心語調關鍵詞",         type: "array" },
      { key: "forbidden",  label: "溝通禁區",               type: "array" },
      { key: "samples",    label: "溝通範例對比",            type: "tableRows", columns: [
        { key: "generic", label: "一般說法", type: "textarea" },
        { key: "ours",    label: "我們的說法", type: "textarea" },
      ]},
    ],
  },
];

// ── Product (6 segments) ─────────────────────────────────────────────────
export const PRODUCT_SEGMENTS: SegmentSpec[] = [
  {
    id: "core",
    num: "1.1",
    title: "產品核心定位",
    agent: "product-strategist",
    fields: [
      { key: "name",          label: "產品名稱",       type: "text" },
      { key: "zhTagline",     label: "中文標語",       type: "text" },
      { key: "enTagline",     label: "英文標語",       type: "text" },
      { key: "coreStatement", label: "核心定位",       type: "textarea" },
      { key: "oneLineValueProp", label: "一句話價值主張（速查卡用）", type: "textarea" },
    ],
  },
  {
    id: "audience",
    num: "1.2",
    title: "目標族群",
    agent: "persona-architect",
    fields: [
      { key: "primary",   label: "主目標族群",  type: "textarea" },
      { key: "secondary", label: "次目標族群",  type: "textarea" },
      { key: "pains",     label: "族群痛點",    type: "array" },
      { key: "needs",     label: "族群需求",    type: "array" },
      { key: "mots",      label: "MOT（每受眾關鍵時刻）", type: "tableRows", columns: [
        { key: "audience", label: "受眾",   type: "text" },
        { key: "mot",      label: "MOT",   type: "textarea" },
      ]},
    ],
  },
  {
    id: "value",
    num: "2",
    title: "產品價值主張",
    agent: "product-value-mapper",
    fields: [
      { key: "coreFunctions", label: "核心功能",   type: "array" },
      { key: "features",      label: "產品特色",   type: "array" },
      { key: "advantages",    label: "產品優勢",   type: "array" },
      { key: "primaryEmotion", label: "主要情緒價值", type: "textarea" },
      { key: "personality",    label: "品牌個性",     type: "textarea" },
      { key: "userFeeling",    label: "使用者感受",   type: "textarea" },
    ],
  },
  {
    id: "competition",
    num: "3",
    title: "競爭定位",
    agent: "competitive-intel",
    fields: [
      { key: "competitors", label: "競品", type: "tableRows", columns: [
        { key: "name",     label: "名稱",   type: "text" },
        { key: "position", label: "定位",   type: "text" },
      ]},
      { key: "uniqueUsp",   label: "獨家賣點",         type: "textarea" },
      { key: "rareUsp",     label: "少數競品也說的賣點", type: "textarea" },
      { key: "commonUsp",   label: "多數競爭者都說的賣點", type: "textarea" },
    ],
  },
  {
    id: "strategy",
    num: "4",
    title: "產品策略",
    agent: "gtm-architect",
    fields: [
      { key: "positioning",         label: "產品定位策略", type: "textarea" },
      { key: "pricing",             label: "定價策略",      type: "textarea" },
      { key: "channel",             label: "通路策略",      type: "textarea" },
      { key: "promotion",           label: "推廣策略",      type: "array" },
      { key: "lifecycleStage",      label: "生命週期階段",  type: "text" },
      { key: "developmentStrategy", label: "發展策略",      type: "textarea" },
      { key: "marketGap",           label: "市場受眾缺口",  type: "textarea" },
      { key: "channelGap",          label: "銷售通路缺口",  type: "textarea" },
      { key: "priceGap",            label: "價格區間缺口",  type: "textarea" },
      { key: "promotionGap",        label: "推廣策略缺口",  type: "textarea" },
    ],
  },
  {
    id: "marketing",
    num: "5",
    title: "行銷指引",
    agent: "brand-voice-coach",
    fields: [
      { key: "tone",          label: "品牌語氣",      type: "textarea" },
      { key: "style",          label: "溝通風格",      type: "textarea" },
      { key: "keywords",       label: "關鍵詞彙",       type: "array" },
      { key: "visualStyle",    label: "視覺風格",       type: "textarea" },
      { key: "colorStrategy",  label: "色彩策略",       type: "textarea" },
      { key: "imageStyle",     label: "圖像風格",       type: "textarea" },
    ],
  },
];

// ── Event (3 segments) ───────────────────────────────────────────────────
export const EVENT_SEGMENTS: SegmentSpec[] = [
  {
    id: "overview",
    num: "1",
    title: "活動概述",
    agent: "campaign-architect",
    fields: [
      { key: "name",          label: "活動名稱",         type: "text" },
      { key: "startAt",       label: "開始日期",         type: "text" },
      { key: "endAt",         label: "結束日期",         type: "text" },
      { key: "positioningStatement", label: "活動定位陳述（速查卡）", type: "textarea" },
      { key: "zhTagline",     label: "活動標語（中）",     type: "text" },
      { key: "enTagline",     label: "活動標語（英）",     type: "text" },
    ],
  },
  {
    id: "diagnosis",
    num: "2",
    title: "業務診斷",
    agent: "business-diagnostician",
    fields: [
      { key: "coreProblem",       label: "核心問題",       type: "textarea" },
      { key: "rootCause",         label: "根本原因",       type: "textarea" },
      { key: "opportunity",       label: "機會點",         type: "textarea" },
      { key: "strategyDirection", label: "策略方向",       type: "textarea" },
    ],
  },
  {
    id: "awards",
    num: "2.5",
    title: "獎項匹配",
    agent: "award-matcher",
    fields: [
      { key: "selectedAwards", label: "推薦子獎項", type: "tableRows", columns: [
        { key: "name",         label: "完整名稱",     type: "text" },
        { key: "subCategory",  label: "子獎項",       type: "text" },
        { key: "matchScore",   label: "匹配分數",     type: "number" },
        { key: "matchReason",  label: "匹配理由",     type: "textarea" },
      ]},
    ],
  },
  {
    id: "solution",
    num: "3",
    title: "選定方案",
    agent: "campaign-architect",
    fields: [
      { key: "conceptName",     label: "方案名稱",          type: "text" },
      { key: "coreConcept",     label: "核心概念",          type: "textarea" },
      { key: "executionPhases", label: "執行階段",           type: "tableRows", columns: [
        { key: "phase",  label: "階段",   type: "text" },
        { key: "weeks",  label: "週期",   type: "text" },
        { key: "action", label: "動作",   type: "textarea" },
      ]},
      { key: "fitReason",       label: "適合原因",          type: "textarea" },
      { key: "highlights",      label: "方案亮點",          type: "array" },
      { key: "awardFramework",  label: "推薦獎項框架",       type: "textarea" },
      { key: "channels",        label: "渠道策略",          type: "array" },
      { key: "kolFit",          label: "KOL 適配建議",       type: "textarea" },
      { key: "contentAngles",   label: "內容切角",           type: "array" },
      { key: "kpis",            label: "KPI 成效指標",       type: "array" },
      { key: "proposals",       label: "完整提案陣列（含對應獎項 + 標竿案例）", type: "tableRows", columns: [
        { key: "name",         label: "提案名稱",   type: "text" },
        { key: "awardName",    label: "對應獎項",   type: "text" },
        { key: "coreConcept",  label: "核心概念",   type: "textarea" },
        { key: "kpiFramework", label: "KPI 框架",   type: "textarea" },
      ]},
    ],
  },
];

export const SCOPE_SEGMENTS = {
  brand: BRAND_SEGMENTS,
  product: PRODUCT_SEGMENTS,
  event: EVENT_SEGMENTS,
} as const;
