/**
 * OUTPUT_TYPE_REGISTRY
 *
 * Standard output types for squad steps.
 * Each step's `outputType` field references one of these keys.
 * The agent system prompt is built using the label.
 * The UI uses the color + icon to render output badges.
 *
 * Extend this list as new output formats are introduced.
 */

export interface OutputTypeMeta {
  label: string;          // display name (zh)
  labelEn: string;        // display name (en) — used in agent prompt
  color: string;          // hex accent color
  format: "doc" | "table" | "canvas" | "list" | "card" | "image" | "data";
  description?: string;   // tooltip / admin hint
}

export const OUTPUT_TYPE_REGISTRY: Record<string, OutputTypeMeta> = {
  // ── Positioning / Brand ──────────────────────────────────────────────
  brand_positioning: {
    label: "品牌定位",
    labelEn: "Brand Positioning Statement",
    color: "#4F46E5",
    format: "canvas",
    description: "品牌核心定位陳述，含差異化主張",
  },
  vp_canvas: {
    label: "VP Canvas",
    labelEn: "Value Proposition Canvas",
    color: "#7C3AED",
    format: "canvas",
    description: "Osterwalder 價值主張畫布：客戶工作、痛點、收益",
  },
  persona_card: {
    label: "Persona 卡",
    labelEn: "Audience Persona Card",
    color: "#EC4899",
    format: "card",
    description: "目標受眾角色卡：姓名、人口統計、痛點、購買觸發",
  },
  swot_table: {
    label: "SWOT 矩陣",
    labelEn: "SWOT Matrix",
    color: "#D97706",
    format: "table",
    description: "優勢、劣勢、機會、威脅分析矩陣",
  },

  // ── Product ──────────────────────────────────────────────────────────
  fab_card: {
    label: "FAB 框架卡",
    labelEn: "FAB Card (Features → Advantages → Benefits)",
    color: "#E11D48",
    format: "card",
    description: "特性→優勢→利益 三層次產品說明框架",
  },
  product_card: {
    label: "產品說明卡",
    labelEn: "Product Description Card",
    color: "#0891B2",
    format: "card",
    description: "結構化單頁產品說明，含核心 USP 與規格",
  },
  pricing_table: {
    label: "定價比較表",
    labelEn: "Pricing Comparison Table",
    color: "#16A34A",
    format: "table",
    description: "本品與競品定價、包裝、折扣結構對比",
  },

  // ── Content / Copy ───────────────────────────────────────────────────
  content_draft: {
    label: "文案草稿",
    labelEn: "Content Draft",
    color: "#4F46E5",
    format: "doc",
    description: "可直接發布或修改的文案初稿",
  },
  social_post: {
    label: "社群貼文",
    labelEn: "Social Media Post",
    color: "#7C3AED",
    format: "doc",
    description: "適合特定平台的貼文文案（含主題標籤）",
  },
  seo_keywords: {
    label: "SEO 關鍵字清單",
    labelEn: "SEO Keyword List",
    color: "#D97706",
    format: "list",
    description: "目標關鍵字、搜尋量、競爭度分析",
  },
  headline_variants: {
    label: "標題變體",
    labelEn: "Headline Variants",
    color: "#0891B2",
    format: "list",
    description: "A/B 測試用多版本標題",
  },

  // ── Research / Analysis ──────────────────────────────────────────────
  audience_profile: {
    label: "受眾分析報告",
    labelEn: "Audience Profile Report",
    color: "#EC4899",
    format: "doc",
    description: "目標族群行為、偏好、媒體習慣分析",
  },
  competitor_report: {
    label: "競品分析",
    labelEn: "Competitor Analysis",
    color: "#57534E",
    format: "doc",
    description: "競爭者定位、訊息、差異化點對比",
  },
  market_research: {
    label: "市場研究",
    labelEn: "Market Research Summary",
    color: "#57534E",
    format: "doc",
    description: "市場規模、趨勢、機會點摘要",
  },
  kpi_dashboard: {
    label: "KPI 儀表板",
    labelEn: "KPI Dashboard",
    color: "#16A34A",
    format: "data",
    description: "關鍵指標定義、目標值、追蹤方式",
  },

  // ── Campaign / Planning ──────────────────────────────────────────────
  campaign_plan: {
    label: "活動企劃",
    labelEn: "Campaign Plan",
    color: "#0891B2",
    format: "doc",
    description: "完整活動策略、時程、分工、預算",
  },
  content_calendar: {
    label: "內容行事曆",
    labelEn: "Content Calendar",
    color: "#16A34A",
    format: "table",
    description: "30/90 天發文計畫，含主題、格式、平台",
  },
  brief_doc: {
    label: "創意簡報",
    labelEn: "Creative Brief",
    color: "#4F46E5",
    format: "doc",
    description: "交給設計師 / 影片製作的創意需求文件",
  },

  // ── Reporting ────────────────────────────────────────────────────────
  analysis_report: {
    label: "分析報告",
    labelEn: "Analysis Report",
    color: "#57534E",
    format: "doc",
    description: "數據洞察、歸因分析、行動建議",
  },
  ab_test_result: {
    label: "A/B 測試結果",
    labelEn: "A/B Test Results",
    color: "#D97706",
    format: "table",
    description: "版本對比數據、統計顯著性、建議採用版",
  },
};

/** Lookup with fallback for unknown types */
export function getOutputTypeMeta(key: string): OutputTypeMeta | null {
  return OUTPUT_TYPE_REGISTRY[key] ?? null;
}

/** All registered keys sorted by format then label */
export const ALL_OUTPUT_TYPES = Object.entries(OUTPUT_TYPE_REGISTRY)
  .sort(([, a], [, b]) => a.format.localeCompare(b.format) || a.label.localeCompare(b.label))
  .map(([key, meta]) => ({ key, ...meta }));
