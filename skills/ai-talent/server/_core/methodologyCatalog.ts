/**
 * Methodology catalog for the Strategy Deck.
 *
 * Each entry is a named strategy framework the user can apply to a brand.
 * The diagnostic wizard (2 questions) maps user answers → recommended methodologies.
 *
 * Layer taxonomy (aligned with the master spec):
 *   L1 = brand-level positioning
 *   L2 = product-line strategy
 *   L3 = audience strategy
 *
 * Phase 1 ships the L1 ten. L2/L3 entries are scaffolded but not yet surfaced.
 */

export type DiagnosticSituation =
  | "new-launch"        // 新品上市
  | "pricing-stuck"     // 定價卡住
  | "audience-unclear"  // 受眾模糊
  | "competitor-pressure" // 競品逼近
  | "rebranding"        // 品牌重塑
  | "new-market";       // 擴張新市場

export type DiagnosticStage =
  | "early"     // 早期創業 (0–2y)
  | "growth"   // 成長期
  | "mature";  // 成熟期

export interface MethodologyDef {
  slug: string;
  name: string;            // zh-TW display name
  nameEn: string;          // English
  author: string;
  year?: number;
  layer: "L1" | "L2" | "L3";
  summary: string;         // one-liner (zh-TW)
  summaryEn: string;
  // Which diagnostic answers make this a strong match (used for wizard ranking)
  situations: DiagnosticSituation[];
  stages: DiagnosticStage[];
  // Config schema hint — fields the user fills in when creating a strategy from this
  fields: { key: string; label: string; labelEn: string; type: "text" | "textarea" | "list" }[];
}

// ─── L1 Brand-Level (the 10) ─────────────────────────────────────────────────

export const METHODOLOGY_CATALOG: MethodologyDef[] = [
  {
    slug: "brand-archetype-positioning",
    name: "品牌原型定位",
    nameEn: "Brand Archetype Positioning",
    author: "Carol Pearson & Margaret Mark",
    year: 2001,
    layer: "L1",
    summary: "用 12 種原型（英雄/魔法師/照顧者…）鎖定品牌的情感人格。",
    summaryEn: "Use 12 Jungian archetypes to lock down your brand's emotional persona.",
    situations: ["new-launch", "rebranding", "audience-unclear"],
    stages: ["early", "growth"],
    fields: [
      { key: "primaryArchetype", label: "主原型", labelEn: "Primary archetype", type: "text" },
      { key: "shadow", label: "陰影面", labelEn: "Shadow", type: "text" },
      { key: "coreDesire", label: "核心渴望", labelEn: "Core desire", type: "textarea" },
    ],
  },
  {
    slug: "mind-positioning",
    name: "心智定位",
    nameEn: "Mind Positioning",
    author: "Al Ries & Jack Trout",
    year: 1981,
    layer: "L1",
    summary: "在顧客心智中搶下一個具體字眼或類別的第一位。",
    summaryEn: "Own a single word or category slot in the customer's mind.",
    situations: ["competitor-pressure", "new-launch", "pricing-stuck"],
    stages: ["early", "growth", "mature"],
    fields: [
      { key: "ownedWord", label: "要佔的字眼", labelEn: "Owned word", type: "text" },
      { key: "enemy", label: "要對打的對手", labelEn: "Enemy", type: "text" },
      { key: "rationale", label: "為什麼我們能贏", labelEn: "Why we win", type: "textarea" },
    ],
  },
  {
    slug: "category-design-positioning",
    name: "類別設計",
    nameEn: "Category Design",
    author: "Play Bigger (Ramadan, Peterson, Lochhead)",
    year: 2016,
    layer: "L1",
    summary: "不搶既有類別，直接設計一個新類別並當 king。",
    summaryEn: "Don't compete in an existing category — design a new one and be king.",
    situations: ["new-launch", "new-market", "competitor-pressure"],
    stages: ["early", "growth"],
    fields: [
      { key: "newCategory", label: "新類別名稱", labelEn: "New category", type: "text" },
      { key: "problemFraming", label: "要重新框架的問題", labelEn: "Problem reframe", type: "textarea" },
    ],
  },
  {
    slug: "differentiation-positioning",
    name: "差異化定位",
    nameEn: "Differentiation Positioning",
    author: "Jack Trout",
    year: 2000,
    layer: "L1",
    summary: "找到一個顧客在意、你能贏、對手做不到的差異點。",
    summaryEn: "Find a difference customers care about, you can own, competitors can't copy.",
    situations: ["competitor-pressure", "pricing-stuck"],
    stages: ["growth", "mature"],
    fields: [
      { key: "diffPoint", label: "核心差異點", labelEn: "Key difference", type: "text" },
      { key: "proof", label: "可證據點", labelEn: "Proof points", type: "list" },
    ],
  },
  {
    slug: "competitive-perceptual-mapping",
    name: "競品感知地圖",
    nameEn: "Competitive Perceptual Map",
    author: "Philip Kotler",
    layer: "L1",
    summary: "用兩軸畫出顧客眼中所有對手的位置，找空缺。",
    summaryEn: "Plot all competitors on two axes to find positioning gaps.",
    situations: ["competitor-pressure", "new-market"],
    stages: ["growth", "mature"],
    fields: [
      { key: "axisX", label: "X 軸（例：平價 ↔ 高端）", labelEn: "X axis", type: "text" },
      { key: "axisY", label: "Y 軸（例：傳統 ↔ 創新）", labelEn: "Y axis", type: "text" },
      { key: "targetCell", label: "我們要佔的象限", labelEn: "Target quadrant", type: "text" },
    ],
  },
  {
    slug: "purpose-driven-positioning",
    name: "使命驅動定位",
    nameEn: "Purpose-Driven (Golden Circle)",
    author: "Simon Sinek",
    year: 2009,
    layer: "L1",
    summary: "從 Why 出發，讓顧客相信你的信念而不是你的功能。",
    summaryEn: "Start with Why — get customers to buy your belief, not your features.",
    situations: ["rebranding", "audience-unclear", "new-launch"],
    stages: ["early", "growth", "mature"],
    fields: [
      { key: "why", label: "Why（為什麼存在）", labelEn: "Why", type: "textarea" },
      { key: "how", label: "How（怎麼做到）", labelEn: "How", type: "textarea" },
      { key: "what", label: "What（產品/服務）", labelEn: "What", type: "textarea" },
    ],
  },
  {
    slug: "blue-ocean-positioning",
    name: "藍海策略",
    nameEn: "Blue Ocean Strategy",
    author: "W. Chan Kim & Renée Mauborgne",
    year: 2005,
    layer: "L1",
    summary: "用消除-降低-提升-創造四格，脫離紅海競爭。",
    summaryEn: "Use ERRC grid to leave the red ocean of bloody competition.",
    situations: ["new-market", "competitor-pressure", "pricing-stuck"],
    stages: ["growth", "mature"],
    fields: [
      { key: "eliminate", label: "消除什麼業界慣例", labelEn: "Eliminate", type: "list" },
      { key: "reduce", label: "降低什麼", labelEn: "Reduce", type: "list" },
      { key: "raise", label: "提升什麼", labelEn: "Raise", type: "list" },
      { key: "create", label: "創造什麼", labelEn: "Create", type: "list" },
    ],
  },
  {
    slug: "brand-equity-cbbe",
    name: "顧客品牌權益 (CBBE)",
    nameEn: "Customer-Based Brand Equity",
    author: "Kevin Lane Keller",
    year: 2001,
    layer: "L1",
    summary: "從認知→績效→感受→共鳴，建六層品牌金字塔。",
    summaryEn: "Build a 6-level brand pyramid from salience to resonance.",
    situations: ["rebranding", "pricing-stuck"],
    stages: ["mature"],
    fields: [
      { key: "salience", label: "品牌認知（誰是你？）", labelEn: "Salience", type: "textarea" },
      { key: "performance", label: "功能績效", labelEn: "Performance", type: "textarea" },
      { key: "resonance", label: "共鳴（死忠點）", labelEn: "Resonance", type: "textarea" },
    ],
  },
  {
    slug: "brand-story-positioning",
    name: "StoryBrand 7 框架",
    nameEn: "StoryBrand 7-Part Framework",
    author: "Donald Miller",
    year: 2017,
    layer: "L1",
    summary: "顧客是英雄、品牌是引導者，用 7 段結構講清你的故事。",
    summaryEn: "Customer = hero, brand = guide. 7-part narrative to clarify your message.",
    situations: ["new-launch", "audience-unclear", "rebranding"],
    stages: ["early", "growth"],
    fields: [
      { key: "hero", label: "顧客（英雄）要什麼", labelEn: "Hero wants", type: "textarea" },
      { key: "problem", label: "面對的問題", labelEn: "Problem", type: "textarea" },
      { key: "guidePlan", label: "你（引導者）的計畫", labelEn: "Guide's plan", type: "textarea" },
      { key: "stakes", label: "成功/失敗的後果", labelEn: "Stakes", type: "textarea" },
    ],
  },
  {
    slug: "brand-narrative-cultural",
    name: "文化品牌敘事",
    nameEn: "Cultural Branding",
    author: "Douglas Holt",
    year: 2004,
    layer: "L1",
    summary: "用文化矛盾當燃料，把品牌做成時代符號。",
    summaryEn: "Use cultural tensions as fuel to turn the brand into a cultural icon.",
    situations: ["rebranding", "new-market"],
    stages: ["growth", "mature"],
    fields: [
      { key: "culturalTension", label: "要對話的文化矛盾", labelEn: "Cultural tension", type: "textarea" },
      { key: "myth", label: "要說的神話", labelEn: "Brand myth", type: "textarea" },
    ],
  },
];

// ─── Lookup helpers ──────────────────────────────────────────────────────────

export function getMethodology(slug: string): MethodologyDef | undefined {
  return METHODOLOGY_CATALOG.find((m) => m.slug === slug);
}

export function listMethodologies(layer?: "L1" | "L2" | "L3"): MethodologyDef[] {
  if (!layer) return METHODOLOGY_CATALOG;
  return METHODOLOGY_CATALOG.filter((m) => m.layer === layer);
}

// ─── Diagnostic wizard ───────────────────────────────────────────────────────

export interface DiagnosticInput {
  situation: DiagnosticSituation;
  stage: DiagnosticStage;
}

export interface Recommendation {
  methodology: MethodologyDef;
  score: number;
  reason: string;
}

/**
 * Rank methodologies by how well they match the user's situation + stage.
 * Returns top 3, each with a short human-readable reason.
 */
export function recommendMethodologies(input: DiagnosticInput): Recommendation[] {
  const situationLabels: Record<DiagnosticSituation, string> = {
    "new-launch": "新品上市",
    "pricing-stuck": "定價卡住",
    "audience-unclear": "受眾模糊",
    "competitor-pressure": "競品逼近",
    "rebranding": "品牌重塑",
    "new-market": "擴張新市場",
  };
  const stageLabels: Record<DiagnosticStage, string> = {
    early: "早期創業",
    growth: "成長期",
    mature: "成熟期",
  };

  const scored = METHODOLOGY_CATALOG.map((m) => {
    let score = 0;
    const sitMatch = m.situations.includes(input.situation);
    const stageMatch = m.stages.includes(input.stage);
    if (sitMatch) score += 10;
    if (stageMatch) score += 3;
    // Bonus if situation is first in methodology's situations array (primary use case)
    if (m.situations[0] === input.situation) score += 2;

    let reason = "";
    if (sitMatch && stageMatch) {
      reason = `針對「${situationLabels[input.situation]}」且適合${stageLabels[input.stage]}品牌`;
    } else if (sitMatch) {
      reason = `針對「${situationLabels[input.situation]}」場景`;
    } else if (stageMatch) {
      reason = `適合${stageLabels[input.stage]}品牌`;
    } else {
      reason = "通用方法論";
    }

    return { methodology: m, score, reason };
  });

  return scored
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
