/**
 * aiObsMockData.ts — the 純 AI 觀測 mode's simulated data.
 *
 * 2026-08-11 (CJ「市場數據做兩個版本：付費數據庫版 / 純 AI 版，兩個介面應該
 * 會不一樣」).
 *
 * WHY THE SHAPE IS DIFFERENT FROM marketMockData
 * The paid-database mode's atom is a countable mention, so its UI is counts,
 * SOV and trends. AI has no population — it cannot tell you "18,400 mentions"
 * without inventing the number. So the atom here is a FINDING: something a
 * model asserted, which models asserted it, and whether we could verify it
 * against a real source.
 *
 * That difference is the product. Asking ChatGPT yourself gets you an
 * unattributed paragraph; the two things we add are:
 *   1. 核實 — every claim carries a verification state and a source link,
 *      so an unverifiable assertion is visibly marked rather than blended in.
 *   2. 限定範圍 — the observation window is pinned (today / 7d / a date), so
 *      "今日熱點" means today, not whatever the model happens to recall.
 *
 * Consequently this file exposes NO absolute volume figures. Strength is
 * ordinal (高/中/低) and agreement is "how many models said it", which are
 * things AI output can actually support.
 */

export type VerifyState = "verified" | "partial" | "unverified";

export const AI_MODELS = [
  { id: "gemini",     label: "Gemini",     short: "G" },
  { id: "chatgpt",    label: "ChatGPT",    short: "C" },
  { id: "perplexity", label: "Perplexity", short: "P" },
  { id: "claude",     label: "Claude",     short: "A" },
  { id: "copilot",    label: "Copilot",    short: "M" },
] as const;

export const SCOPES = [
  { id: "today", label: "今日熱點", note: "2026-08-11 06:00–18:00" },
  { id: "7d",    label: "近 7 天",  note: "2026-08-05 – 08-11" },
  { id: "30d",   label: "近 30 天", note: "2026-07-13 – 08-11" },
] as const;

export interface Finding {
  id: string;
  topic: string;
  claim: string;
  /** Which models surfaced this. Cross-model agreement is our confidence proxy. */
  models: string[];
  verify: VerifyState;
  source?: string;
  sourceNote?: string;
  strength: "high" | "mid" | "low";
  brands: string[];
  scopes: string[];
}

export const FINDINGS: Finding[] = [
  {
    id: "f1", topic: "配送 / 運費",
    claim: "冷凍宅配的運費門檻被反覆抱怨，消費者普遍認為「湊免運」比商品本身更花心力。",
    models: ["gemini", "chatgpt", "perplexity", "claude", "copilot"],
    verify: "verified", source: "https://www.dcard.tw/f/food", sourceNote: "Dcard 食品版多則討論，已比對到原文",
    strength: "high", brands: ["懶得煮的Tom老闆", "瓦城任意門"], scopes: ["today", "7d", "30d"],
  },
  {
    id: "f2", topic: "免開火",
    claim: "「小家庭免開火」成為近期主要討論情境，尤其是雙薪家庭的平日晚餐。",
    models: ["gemini", "chatgpt", "perplexity", "claude"],
    verify: "verified", source: "https://www.ptt.cc/bbs/cook", sourceNote: "PTT cook 板 + FB 社團貼文，已比對",
    strength: "high", brands: ["懶得煮的Tom老闆", "桂冠"], scopes: ["today", "7d", "30d"],
  },
  {
    id: "f3", topic: "和牛 / 高單價",
    claim: "在家吃和牛的討論在假日前明顯升高，且多與「宴客」而非「日常」綁在一起。",
    models: ["gemini", "perplexity", "claude"],
    verify: "partial", source: "https://www.google.com/search?q=在家+和牛",
    sourceNote: "找得到相關討論，但「假日前升高」的時間趨勢無法從單次查詢證實",
    strength: "mid", brands: ["懶得煮的Tom老闆"], scopes: ["today", "7d", "30d"],
  },
  {
    id: "f4", topic: "價格感受",
    claim: "中高價冷凍品被認為「偶爾犒賞可以，天天吃太貴」，價格敏感集中在單價 600 元以上。",
    models: ["chatgpt", "claude", "copilot"],
    verify: "partial", sourceNote: "說法一致但沒有可指認的單一原文，屬模型歸納",
    strength: "mid", brands: ["懶得煮的Tom老闆", "瓦城任意門", "開飯川食堂"], scopes: ["7d", "30d"],
  },
  {
    id: "f5", topic: "露營 / 野炊",
    claim: "露營野炊帶冷凍即食的討論成長最快，主打「不用備料、到現場加熱」。",
    models: ["gemini", "perplexity"],
    verify: "verified", source: "https://www.youtube.com/results?search_query=露營+冷凍",
    sourceNote: "YouTube 近期影片與留言，已比對",
    strength: "mid", brands: [], scopes: ["today", "7d"],
  },
  {
    id: "f6", topic: "品牌認知",
    claim: "「懶得煮的Tom老闆」在多數模型中被歸類為「小眾 / 網路品牌」，而非主流冷凍食品品牌。",
    models: ["gemini", "chatgpt", "perplexity", "claude"],
    verify: "verified", source: "https://www.heytom-market.com/", sourceNote: "模型引用官網，描述與官網一致",
    strength: "high", brands: ["懶得煮的Tom老闆"], scopes: ["today", "7d", "30d"],
  },
  {
    id: "f7", topic: "食安 / 保存",
    claim: "有零星討論質疑冷凍調理包的添加物與保存期限，但未指向特定品牌。",
    models: ["claude"],
    verify: "unverified", sourceNote: "只有單一模型提出，查不到可指認的討論來源",
    strength: "low", brands: [], scopes: ["30d"],
  },
  {
    id: "f8", topic: "競品動態",
    claim: "桂冠近期在社群主打「家常菜復刻」路線，與本品牌的「懶得煮」定位訴求不同。",
    models: ["gemini", "chatgpt", "copilot"],
    verify: "partial", sourceNote: "方向一致，但各模型描述的檔期與內容細節不一致",
    strength: "mid", brands: ["桂冠"], scopes: ["7d", "30d"],
  },
];

/* ── GEO: same question asked to every model, right now ─────────────── */

export interface GeoCell {
  model: string;
  hit: boolean;
  rank: number | null;
  sentiment: "pos" | "neu" | "neg" | null;
  cited: string | null;
}
export interface GeoQuery { q: string; cells: GeoCell[] }

export const GEO_MATRIX: GeoQuery[] = [
  {
    q: "台灣 冷凍即食 推薦",
    cells: [
      { model: "gemini",     hit: false, rank: null, sentiment: null,  cited: null },
      { model: "chatgpt",    hit: false, rank: null, sentiment: null,  cited: null },
      { model: "perplexity", hit: true,  rank: 7,    sentiment: "neu", cited: "部落格評比文" },
      { model: "claude",     hit: false, rank: null, sentiment: null,  cited: null },
      { model: "copilot",    hit: false, rank: null, sentiment: null,  cited: null },
    ],
  },
  {
    q: "宴客 冷凍 菜色",
    cells: [
      { model: "gemini",     hit: true,  rank: 1, sentiment: "pos", cited: "官網" },
      { model: "chatgpt",    hit: true,  rank: 2, sentiment: "pos", cited: "官網" },
      { model: "perplexity", hit: true,  rank: 1, sentiment: "pos", cited: "官網 + Dcard" },
      { model: "claude",     hit: true,  rank: 3, sentiment: "pos", cited: "官網" },
      { model: "copilot",    hit: false, rank: null, sentiment: null, cited: null },
    ],
  },
  {
    q: "在家吃和牛 宅配",
    cells: [
      { model: "gemini",     hit: true,  rank: 2, sentiment: "pos", cited: "官網" },
      { model: "chatgpt",    hit: true,  rank: 4, sentiment: "neu", cited: "電商平台" },
      { model: "perplexity", hit: true,  rank: 3, sentiment: "pos", cited: "官網" },
      { model: "claude",     hit: false, rank: null, sentiment: null, cited: null },
      { model: "copilot",    hit: true,  rank: 6, sentiment: "neu", cited: "比價網" },
    ],
  },
  {
    q: "懶人料理 宅配 推薦",
    cells: [
      { model: "gemini",     hit: true,  rank: 5, sentiment: "neu", cited: "官網" },
      { model: "chatgpt",    hit: true,  rank: 6, sentiment: "neu", cited: "部落格" },
      { model: "perplexity", hit: true,  rank: 4, sentiment: "pos", cited: "官網 + PTT" },
      { model: "claude",     hit: true,  rank: 8, sentiment: "neu", cited: "官網" },
      { model: "copilot",    hit: false, rank: null, sentiment: null, cited: null },
    ],
  },
  {
    q: "冷凍調理包 哪個好吃",
    cells: [
      { model: "gemini",     hit: false, rank: null, sentiment: null, cited: null },
      { model: "chatgpt",    hit: false, rank: null, sentiment: null, cited: null },
      { model: "perplexity", hit: false, rank: null, sentiment: null, cited: null },
      { model: "claude",     hit: false, rank: null, sentiment: null, cited: null },
      { model: "copilot",    hit: false, rank: null, sentiment: null, cited: null },
    ],
  },
];

export const modelLabel = (id: string) => AI_MODELS.find((m) => m.id === id)?.label ?? id;

/** Hit rate for one model across all probed questions. */
export function modelHitRate(model: string) {
  const cells = GEO_MATRIX.map((q) => q.cells.find((c) => c.model === model)!);
  const hits = cells.filter((c) => c.hit).length;
  return { hits, total: cells.length, rate: hits / cells.length };
}

/** Average rank where the brand appears at all (lower is better). */
export function modelAvgRank(model: string) {
  const rs = GEO_MATRIX.map((q) => q.cells.find((c) => c.model === model)!)
    .filter((c) => c.hit && c.rank != null).map((c) => c.rank!);
  return rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
}

export const VERIFY_LABEL: Record<VerifyState, string> = {
  verified: "已核實", partial: "部分核實", unverified: "無法核實",
};
