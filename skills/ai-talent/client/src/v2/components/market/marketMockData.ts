/**
 * marketMockData.ts — simulated market-intelligence data for 懶得煮的Tom老闆.
 *
 * 2026-08-11 (CJ「接下去，模擬市場數據」), following the same discipline as
 * perfMockData: the atom is a cell, every displayed figure is a sum over the
 * cells matching the current filter, so slicing can't make the totals lie.
 *
 * Cell = (brand, source, topic) with a sentiment split.
 *
 * NOTE ON THE STORY: the sentiment weights deliberately reproduce, from the
 * listening side, the same finding the 成效 funnel produces from the ad side —
 * shipping cost is this brand's weak point. 配送與冷凍 is the one topic where
 * the own brand goes net-negative, which is exactly where the checkout
 * abandonment in the funnel comes from. Two independent layers agreeing is
 * what makes a dashboard trustworthy; inventing unrelated numbers per page is
 * what makes it feel fake.
 *
 * Deterministic — no Math.random(), so the story is stable across renders.
 */

export const OWN_BRAND = "懶得煮的Tom老闆";

export const BRANDS = [
  { id: "own",    label: OWN_BRAND, own: true,  weight: 0.118 },
  { id: "kuei",   label: "桂冠",     own: false, weight: 0.268 },
  { id: "dachan", label: "大成食品", own: false, weight: 0.204 },
  { id: "charoen",label: "卜蜂",     own: false, weight: 0.186 },
  { id: "wacity", label: "瓦城任意門", own: false, weight: 0.132 },
  { id: "kaifan", label: "開飯川食堂", own: false, weight: 0.092 },
] as const;

export const SOURCES = [
  { id: "fb",    label: "Facebook 社團", weight: 0.312 },
  { id: "dcard", label: "Dcard",         weight: 0.184 },
  { id: "ptt",   label: "PTT",           weight: 0.146 },
  { id: "ig",    label: "Instagram",     weight: 0.152 },
  { id: "yt",    label: "YouTube",       weight: 0.098 },
  { id: "blog",  label: "部落格",         weight: 0.062 },
  { id: "news",  label: "新聞媒體",       weight: 0.046 },
] as const;

export const TOPICS = [
  { id: "taste",   label: "口味表現",   weight: 0.264 },
  { id: "price",   label: "價格 / CP值", weight: 0.232 },
  { id: "conv",    label: "方便性",     weight: 0.196 },
  { id: "ship",    label: "配送與冷凍", weight: 0.142 },
  { id: "portion", label: "份量",       weight: 0.098 },
  { id: "service", label: "客服 / 退換", weight: 0.068 },
] as const;

/** Net sentiment per brand × topic: +1 all positive, −1 all negative. */
const SENTIMENT: Record<string, Record<string, number>> = {
  //          taste price  conv  ship  portion service
  own:     { taste: 0.62, price: -0.28, conv: 0.71, ship: -0.34, portion: 0.18, service: 0.22 },
  kuei:    { taste: 0.34, price: 0.41,  conv: 0.38, ship: 0.12,  portion: 0.26, service: 0.08 },
  dachan:  { taste: 0.21, price: 0.36,  conv: 0.29, ship: 0.18,  portion: 0.31, service: 0.04 },
  charoen: { taste: 0.18, price: 0.44,  conv: 0.24, ship: 0.14,  portion: 0.28, service: -0.02 },
  wacity:  { taste: 0.58, price: -0.19, conv: 0.42, ship: 0.06,  portion: -0.12, service: 0.11 },
  kaifan:  { taste: 0.49, price: -0.08, conv: 0.36, ship: 0.02,  portion: 0.09, service: 0.06 },
};

/** Total mentions across the whole market in the window. */
const TOTAL_MENTIONS = 18_400;

export interface MCell {
  brand: string; source: string; topic: string;
  mentions: number; pos: number; neu: number; neg: number;
}

function build(factor: number): MCell[] {
  const out: MCell[] = [];
  let wSum = 0;
  const raw: Array<{ b: string; s: string; t: string; w: number; net: number }> = [];
  for (const b of BRANDS) for (const s of SOURCES) for (const t of TOPICS) {
    const w = b.weight * s.weight * t.weight;
    wSum += w;
    raw.push({ b: b.id, s: s.id, t: t.id, w, net: SENTIMENT[b.id]![t.id]! });
  }
  for (const r of raw) {
    const mentions = (TOTAL_MENTIONS * r.w) / wSum * factor;
    // net = pos − neg, with a neutral band that shrinks as opinion polarises.
    const neu = 0.34 - Math.abs(r.net) * 0.12;
    const pos = (1 - neu) * (0.5 + r.net / 2);
    const neg = (1 - neu) - pos;
    out.push({
      brand: r.b, source: r.s, topic: r.t, mentions,
      pos: mentions * pos, neu: mentions * neu, neg: mentions * neg,
    });
  }
  return out;
}

const CURRENT = build(1);
const PREVIOUS = build(0.868);

export interface MFilter { brand?: string | null; source?: string | null; topic?: string | null }
export interface MTotals { mentions: number; pos: number; neu: number; neg: number }

export function mAggregate(f: MFilter, period: "current" | "previous" = "current"): MTotals {
  const src = period === "current" ? CURRENT : PREVIOUS;
  return src.reduce<MTotals>((a, c) => {
    if (f.brand && c.brand !== f.brand) return a;
    if (f.source && c.source !== f.source) return a;
    if (f.topic && c.topic !== f.topic) return a;
    a.mentions += c.mentions; a.pos += c.pos; a.neu += c.neu; a.neg += c.neg;
    return a;
  }, { mentions: 0, pos: 0, neu: 0, neg: 0 });
}

/** −1..+1 */
export const netSentiment = (t: MTotals) => (t.mentions > 0 ? (t.pos - t.neg) / t.mentions : 0);
/** Share of voice against the whole simulated market. */
export const sov = (t: MTotals) => t.mentions / TOTAL_MENTIONS;

/* ── Trending topics (市場熱點) ───────────────────────────────────────── */
export const HOTSPOTS = [
  { id: "solo",   label: "一個人的火鍋",     heat: 92, growth: 0.41, fit: 88, note: "單身外食族討論爆量，與「一次囤好」訴求高度重疊" },
  { id: "camp",   label: "露營野炊快速上菜", heat: 78, growth: 0.63, fit: 74, note: "成長最快；免開火 + 好攜帶是切入點" },
  { id: "nokitch",label: "小家庭免開火",     heat: 85, growth: 0.22, fit: 91, note: "與「免油煙免洗鍋」訴求完全對齊，適配度最高" },
  { id: "wagyu",  label: "在家吃和牛",       heat: 71, growth: 0.18, fit: 83, note: "客單價最高的切角，對應宴客主人" },
  { id: "freezer",label: "冷凍櫃收納術",     heat: 64, growth: 0.35, fit: 52, note: "話題熱但離購買遠，適合經營內容不適合投廣告" },
  { id: "price",  label: "食材漲價怎麼辦",   heat: 88, growth: 0.29, fit: 38, note: "熱度高但與中高價定位衝突，不建議蹭" },
] as const;

/* ── Keywords (關鍵字) ────────────────────────────────────────────────── */
export const KEYWORDS = [
  { kw: "冷凍 即食 料理包", vol: 22400, diff: 62, cpc: 11.2, intent: "high" as const },
  { kw: "和牛 牛舌 宅配",   vol: 8100,  diff: 41, cpc: 14.8, intent: "high" as const },
  { kw: "免開火 料理",      vol: 14800, diff: 34, cpc: 7.6,  intent: "mid"  as const },
  { kw: "一個人 火鍋",      vol: 27300, diff: 48, cpc: 6.4,  intent: "mid"  as const },
  { kw: "宴客 菜色 推薦",   vol: 9600,  diff: 29, cpc: 8.1,  intent: "mid"  as const },
  { kw: "懶人料理",         vol: 40200, diff: 71, cpc: 5.2,  intent: "low"  as const },
  { kw: "冷凍食品 推薦",    vol: 18900, diff: 68, cpc: 9.3,  intent: "mid"  as const },
  { kw: "宵夜 吃什麼",      vol: 61000, diff: 76, cpc: 4.1,  intent: "low"  as const },
] as const;

/** Opportunity = demand × winnability × fit, surfaced instead of raw volume. */
export const kwScore = (k: typeof KEYWORDS[number]) =>
  Math.round((Math.log10(k.vol) / 5) * (1 - k.diff / 100) * (k.intent === "high" ? 1.5 : k.intent === "mid" ? 1.0 : 0.55) * 100);

/* ── GEO / AI visibility (AI 能見度) ─────────────────────────────────── */
export const GEO_ROWS = [
  { brand: OWN_BRAND, appear: 0.34, sovAi: 0.11, sent: 0.58, cited: 3 },
  { brand: "桂冠",     appear: 0.86, sovAi: 0.31, sent: 0.42, cited: 14 },
  { brand: "大成食品", appear: 0.72, sovAi: 0.24, sent: 0.31, cited: 11 },
  { brand: "卜蜂",     appear: 0.68, sovAi: 0.19, sent: 0.28, cited: 9 },
  { brand: "瓦城任意門", appear: 0.41, sovAi: 0.09, sent: 0.51, cited: 5 },
  { brand: "開飯川食堂", appear: 0.29, sovAi: 0.06, sent: 0.47, cited: 4 },
] as const;

export const GEO_QUERIES = [
  { q: "台灣 冷凍即食 推薦",       hit: false, note: "前 10 個品牌都沒提到我們" },
  { q: "在家吃和牛 宅配",         hit: true,  note: "第 2 順位被提及，情緒正面" },
  { q: "懶人料理 宅配 推薦",       hit: true,  note: "第 5 順位，被歸類在「小眾品牌」" },
  { q: "冷凍調理包 哪個好吃",      hit: false, note: "被桂冠/大成佔滿" },
  { q: "宴客 冷凍 菜色",          hit: true,  note: "第 1 順位 — 唯一領先的題目" },
] as const;

export const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");
export const fmtPct = (n: number, d = 1) => (n * 100).toFixed(d) + "%";
export const fmtSigned = (n: number, d = 2) => (n >= 0 ? "+" : "") + n.toFixed(d);
