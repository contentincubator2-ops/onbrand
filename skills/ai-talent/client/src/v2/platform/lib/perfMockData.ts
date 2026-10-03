/**
 * perfMockData.ts — simulated performance data for the 成效 workspace.
 *
 * 2026-08-11 (CJ「六頁用假資料實作到 DEV，每頁都要能篩選視角，重點是知道
 * 哪一個 TA 搭配哪一個訴求會最強勁」).
 *
 * WHY A CELL MODEL INSTEAD OF HARD-CODED TOTALS
 * Every page can be sliced by 目標族群 × 產品功能訴求 × 產品別, and the funnel
 * has to stay arithmetically true under *any* combination of those filters.
 * Hand-written totals per view would drift the moment two filters are combined
 * — the funnel would stop multiplying out to the order count and the whole
 * dashboard would quietly lie.
 *
 * So the atom here is a CELL: one (TA, appeal, product) triple with its own
 * spend and funnel. Every number shown anywhere is a sum over the cells that
 * match the current filter. Consistency is then structural rather than
 * maintained by hand.
 *
 * The interesting variance lives in AFFINITY — how well an appeal lands on an
 * audience. That is the whole question CJ wants answered, so it is modelled
 * explicitly rather than being an accident of random noise.
 *
 * Deterministic: no Math.random(), so the dashboard shows the same story on
 * every render and screenshots stay reproducible.
 */

import { tr } from "../../../lib/i18n";

export type Dimension = "ta" | "appeal" | "product";

export const TAS = [
  { id: "office",  get label() { return tr("Busy office workers", "忙碌上班族"); },   share: 0.34 },
  { id: "family",  get label() { return tr("Dual-income families", "雙薪育兒家庭"); }, share: 0.28 },
  { id: "host",    get label() { return tr("Dinner hosts", "宴客主人"); },     share: 0.22 },
  { id: "single",  get label() { return tr("Solo diners", "單身外食族"); },   share: 0.16 },
] as const;

export const APPEALS = [
  { id: "fast",    get label() { return tr("On the table in 5 min", "5 分鐘上桌"); },    share: 0.30 },
  { id: "chef",    get label() { return tr("Chef-grade quality", "主廚級品質"); },    share: 0.24 },
  { id: "nomess",  get label() { return tr("No smoke, no pans to wash", "免油煙免洗鍋"); },  share: 0.20 },
  { id: "social",  get label() { return tr("Impress your guests", "宴客體面"); },      share: 0.14 },
  { id: "stock",   get label() { return tr("Stock up in one go", "一次囤好"); },      share: 0.12 },
] as const;

/** `price` is the headline SKU price (the NT$240–800 band on the real site). */
export const PRODUCTS = [
  { id: "tongue", get label() { return tr("Wagyu beef tongue", "和牛牛舌"); },       share: 0.24, price: 800 },
  { id: "combo",  get label() { return tr("Easy-meal combo pack", "懶人料理組合包"); }, share: 0.26, price: 550 },
  { id: "chicken",get label() { return tr("Boneless chicken thigh", "去骨雞腿排"); },     share: 0.20, price: 350 },
  { id: "rib",    get label() { return tr("Beef short rib", "牛小排"); },         share: 0.14, price: 750 },
  { id: "soup",   get label() { return tr("Hot pot broth", "火鍋湯底"); },       share: 0.10, price: 300 },
  { id: "pork",   get label() { return tr("Salted pork", "鹹豬肉"); },         share: 0.06, price: 290 },
] as const;

/**
 * Orders are baskets, not single SKUs — frozen shipping pushes people to
 * combine items to clear the free-shipping threshold. Without this the model
 * priced every order as one SKU, which put blended ROAS at 1.98 (below the
 * 2.22 breakeven) and told a "losing money" story that isn't the one the
 * funnel is meant to illustrate.
 */
const BASKET_MULTIPLIER = 1.164;

/**
 * How strongly each appeal lands on each audience. 1.0 = market average.
 * This is the signal the whole 成效 layer exists to surface: the strongest
 * cell should be discoverable, not buried under aggregate averages.
 */
const AFFINITY: Record<string, Record<string, number>> = {
  //          fast  chef  nomess social stock
  office:  { fast: 1.34, chef: 0.92, nomess: 1.12, social: 0.62, stock: 0.88 },
  family:  { fast: 1.18, chef: 0.86, nomess: 1.42, social: 0.58, stock: 1.24 },
  host:    { fast: 0.74, chef: 1.46, nomess: 0.80, social: 1.72, stock: 0.70 },
  single:  { fast: 1.22, chef: 0.78, nomess: 1.06, social: 0.54, stock: 1.10 },
};

/** Some products only make sense for some appeals — zero-ish weight elsewhere. */
const PRODUCT_FIT: Record<string, Record<string, number>> = {
  tongue:  { fast: 0.7, chef: 1.6, nomess: 0.7, social: 1.7, stock: 0.6 },
  combo:   { fast: 1.5, chef: 0.8, nomess: 1.4, social: 0.7, stock: 1.6 },
  chicken: { fast: 1.4, chef: 0.8, nomess: 1.3, social: 0.6, stock: 1.3 },
  rib:     { fast: 0.8, chef: 1.5, nomess: 0.8, social: 1.6, stock: 0.7 },
  soup:    { fast: 1.1, chef: 0.9, nomess: 1.2, social: 1.0, stock: 1.2 },
  pork:    { fast: 1.0, chef: 1.0, nomess: 0.9, social: 0.8, stock: 1.1 },
};

const TOTAL_SPEND = 450_000;

// Baseline funnel rates (market-average cell). Stage names match the UI.
const BASE = {
  cpm: 141,
  ctr: 0.0150,
  clickToSession: 0.854,
  sessionToPv: 0.600,
  pvToAtc: 0.250,
  atcToCheckout: 0.472,
  checkoutToOrder: 0.524,
};

export interface Cell {
  ta: string; appeal: string; product: string;
  spend: number;
  impressions: number; clicks: number; sessions: number;
  productViews: number; atc: number; checkout: number; orders: number;
  revenue: number;
}

function buildCells(periodFactor: number): Cell[] {
  const cells: Cell[] = [];
  // Raw weights first so spend can be normalised to exactly TOTAL_SPEND —
  // otherwise the KPI row wouldn't match the media plan.
  const raw: Array<{ ta: string; appeal: string; product: string; w: number; aff: number; aov: number }> = [];
  let wSum = 0;
  for (const t of TAS) {
    for (const a of APPEALS) {
      for (const p of PRODUCTS) {
        const fit = PRODUCT_FIT[p.id]![a.id]!;
        const w = t.share * a.share * p.share * fit;
        wSum += w;
        raw.push({ ta: t.id, appeal: a.id, product: p.id, w, aff: AFFINITY[t.id]![a.id]!, aov: p.price * BASKET_MULTIPLIER });
      }
    }
  }

  for (const r of raw) {
    const spend = (TOTAL_SPEND * r.w) / wSum * periodFactor;
    const impressions = (spend / BASE.cpm) * 1000;
    // Affinity shows up as creative resonance (CTR) and as intent quality
    // deeper in the funnel — a well-matched appeal is clicked more AND
    // abandons less. Split across stages so no single rate looks implausible.
    const ctr = BASE.ctr * (0.55 + 0.45 * r.aff);
    const clicks = impressions * ctr;
    const sessions = clicks * BASE.clickToSession;
    const productViews = sessions * BASE.sessionToPv;
    const atc = productViews * (BASE.pvToAtc * (0.7 + 0.3 * r.aff));
    const checkout = atc * BASE.atcToCheckout;
    const orders = checkout * (BASE.checkoutToOrder * (0.85 + 0.15 * r.aff));
    cells.push({
      ta: r.ta, appeal: r.appeal, product: r.product,
      spend, impressions, clicks, sessions, productViews, atc, checkout, orders,
      revenue: orders * r.aov,
    });
  }
  return cells;
}

const CURRENT = buildCells(1);
// Previous period: slightly less spend, slightly worse efficiency — gives the
// comparison column something real to say instead of flat zeroes.
const PREVIOUS = buildCells(0.889).map((c) => ({
  ...c,
  orders: c.orders * 1.035,
  revenue: c.revenue * 1.041,
}));

export interface Filter {
  ta?: string | null;
  appeal?: string | null;
  product?: string | null;
}

export interface Totals {
  spend: number; impressions: number; clicks: number; sessions: number;
  productViews: number; atc: number; checkout: number; orders: number; revenue: number;
}

const ZERO: Totals = {
  spend: 0, impressions: 0, clicks: 0, sessions: 0,
  productViews: 0, atc: 0, checkout: 0, orders: 0, revenue: 0,
};

/**
 * 2026-09-07 (CJ「用模擬數據，為每個品牌製作成效層」)：按品牌播種。
 *
 * 原本的數據對每個品牌都一模一樣 —— 拿去給兩個客戶看，一眼就穿幫。
 * 用 brandId 導出一個 0.72–1.28 的固定倍率，整組量值一起縮放，
 * 所以 ROAS／CPA／客單價這些比值不變（故事線不變），只有規模不同。
 * 仍然是確定性的：同一個品牌每次看都一樣，不會今天 3 萬明天 5 萬。
 */
let brandScale = 1;
export function setMockBrandSeed(brandId: number | null | undefined): void {
  if (!brandId || brandId <= 0) { brandScale = 1; return; }
  let h = 2166136261;
  for (const ch of String(brandId)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  brandScale = 0.72 + ((h % 5600) / 10000);   // 0.72 … 1.28
}

export function aggregate(f: Filter, period: "current" | "previous" = "current"): Totals {
  const src = period === "current" ? CURRENT : PREVIOUS;
  const t = src.reduce<Totals>((acc, c) => {
    if (f.ta && c.ta !== f.ta) return acc;
    if (f.appeal && c.appeal !== f.appeal) return acc;
    if (f.product && c.product !== f.product) return acc;
    acc.spend += c.spend; acc.impressions += c.impressions; acc.clicks += c.clicks;
    acc.sessions += c.sessions; acc.productViews += c.productViews; acc.atc += c.atc;
    acc.checkout += c.checkout; acc.orders += c.orders; acc.revenue += c.revenue;
    return acc;
  }, { ...ZERO });
  if (brandScale === 1) return t;
  const s = brandScale;
  return {
    spend: Math.round(t.spend * s), impressions: Math.round(t.impressions * s),
    clicks: Math.round(t.clicks * s), sessions: Math.round(t.sessions * s),
    productViews: Math.round(t.productViews * s), atc: Math.round(t.atc * s),
    checkout: Math.round(t.checkout * s), orders: Math.round(t.orders * s),
    revenue: Math.round(t.revenue * s),
  };
}

export const roas = (t: Totals) => (t.spend > 0 ? t.revenue / t.spend : 0);
export const cpa  = (t: Totals) => (t.orders > 0 ? t.spend / t.orders : 0);
export const aov  = (t: Totals) => (t.orders > 0 ? t.revenue / t.orders : 0);
/** Food e-commerce gross margin — the number that decides if ROAS is enough. */
export const GROSS_MARGIN = 0.45;
/** ROAS at which ad spend exactly equals gross profit. */
export const BREAKEVEN_ROAS = 1 / GROSS_MARGIN;

/** TA × appeal grid — the headline question: which pairing is strongest. */
export function taAppealMatrix(product?: string | null) {
  return TAS.map((t) => ({
    ta: t,
    cells: APPEALS.map((a) => {
      const tot = aggregate({ ta: t.id, appeal: a.id, product: product ?? null });
      return { appeal: a, totals: tot, roas: roas(tot), cpa: cpa(tot), orders: tot.orders };
    }),
  }));
}

export function bestPairing(product?: string | null) {
  let best: { ta: string; appeal: string; roas: number; orders: number; spend: number } | null = null;
  for (const row of taAppealMatrix(product)) {
    for (const c of row.cells) {
      // Ignore slivers of spend — a tiny cell can post a freak ROAS and would
      // otherwise win the headline with no money actually behind it.
      if (c.totals.spend < 4000) continue;
      if (!best || c.roas > best.roas) {
        best = { ta: row.ta.label, appeal: c.appeal.label, roas: c.roas, orders: c.orders, spend: c.totals.spend };
      }
    }
  }
  return best;
}

export const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");
export const fmtMoney = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
export const fmtPct = (n: number, d = 1) => (n * 100).toFixed(d) + "%";

export const DATE_RANGES = [
  { id: "7d",  get label() { return tr("Last 7 days", "近 7 天"); } },
  { id: "30d", get label() { return tr("Last 30 days", "近 30 天"); } },
  { id: "90d", get label() { return tr("Last 90 days", "近 90 天"); } },
] as const;

export const COMPARE_MODES = [
  { id: "prev", get label() { return tr("Vs. previous period", "對比前一期"); } },
  { id: "yoy",  get label() { return tr("Vs. same period last year", "對比去年同期"); } },
  { id: "none", get label() { return tr("No comparison", "不比較"); } },
] as const;
