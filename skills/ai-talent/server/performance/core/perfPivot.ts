/**
 * perfPivot — 成效層「視角」的計算核心（純函式，不碰 DB）。
 *
 * 2026-09-29（CJ「族群 × USP 只是一種選項，用戶都可以按照自己原先報告的視角，
 * 或是已經跟 AI 對話串討論過的範本進行調整」）。
 *
 * 所以系統不寫死任何維度。數據一律存成「帶標籤的漏斗數字」（perf_facts）：
 * 每一筆（一篇貼文、一則廣告、一段 UTM 流量）身上帶多組標籤，
 * 例如 { ta: "family", usp: "nomess" }。一個視角＝挑一個列維度（可再挑一個欄維度）
 * 對這些標籤做分組加總。用戶新增維度時後端不用改。
 *
 * 標籤的來源依序：
 *   1. 事實本身的 tags（產出時打的、AI 補標的、匯入時帶的）
 *   2. 內建維度（month／source／format 由事實本身推得）
 *   3. 補標規則（活動名稱或貼文內容含某字 → 某值），查詢時才套，所以規則是回溯的
 * 都沒命中的歸到「未歸類」，不丟 —— 覆蓋率要看得見。
 */

export const UNTAGGED = "__untagged";

/** 內建維度：不用用戶定義，從事實本身就推得出來。 */
export const BUILTIN_DIMS: Record<string, { label: string; labelEn: string }> = {
  month:  { label: "月份",     labelEn: "Month" },
  source: { label: "資料來源", labelEn: "Source" },
  format: { label: "貼文形式", labelEn: "Post format" },
};

export const SOURCE_LABELS: Record<string, string> = {
  fb_page: "粉專貼文", meta_ads: "Meta 廣告", google_ads: "Google 廣告", ga4: "GA4",
  shopline: "SHOPLINE", "91app": "91APP", shopify: "Shopify", csv: "匯入檔",
};

export const FORMAT_LABELS: Record<string, string> = {
  photo: "圖片", album: "相簿", video: "影片", reel: "Reels", link: "連結", status: "純文字", event: "活動", other: "其他",
};

/**
 * 標準指標鍵。匯入檔對到這些鍵才進得了漏斗；其他欄位照樣存（metrics 是開放的），
 * 但只有用戶在視角裡指定時才會出現。
 */
export const METRIC_LABELS: Record<string, string> = {
  impressions: "曝光", reach: "觸及", engagement: "互動", clicks: "點擊",
  sessions: "工作階段", productViews: "商品瀏覽", atc: "加入購物車", checkout: "開始結帳",
  orders: "訂單", revenue: "營收", spend: "花費", leads: "名單",
};

/** 判讀指標（決定矩陣裡誰贏）。前四個是比值，其餘視為直接加總某一個指標。 */
export const JUDGE_LABELS: Record<string, string> = {
  roas: "ROAS", cpa: "CPA", cvr: "轉換率", engagementRate: "互動率",
};

export interface Fact {
  id: number | string;
  source: string;
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  /** 貼文內文等可被規則比對的文字。 */
  text?: string | null;
  /** YYYY-MM-DD */
  date: string;
  tags: Record<string, string>;
  metrics: Record<string, number>;
}

export interface DimValue { code: string; label: string }
export interface Dimension { key: string; label: string; values: DimValue[] }
export interface TagRule { dimKey: string; valueCode: string; pattern: string }

export interface LensStage { metric: string; label?: string }
export interface LensConfig {
  rowDim: string;
  colDim?: string | null;
  stages: LensStage[];
  judge: string;
  /** 只看某些資料來源；空＝全部。 */
  sources?: string[];
}

export type Totals = Record<string, number>;

export interface PivotCell { totals: Totals; judge: number | null; count: number }
export interface PivotResult {
  rows: DimValue[];
  cols: DimValue[];
  /** key = `${rowCode}|${colCode}`；沒有欄維度時 colCode = "*"。 */
  cells: Record<string, PivotCell>;
  rowTotals: Record<string, PivotCell>;
  colTotals: Record<string, PivotCell>;
  total: PivotCell;
  /** 列維度有標到的比例（以事實筆數計）。 */
  coverage: { tagged: number; total: number };
  factCount: number;
}

/** 規則：pattern 用「|」分隔多個關鍵字，任一命中即算（不分大小寫）。 */
export function ruleMatches(rule: TagRule, haystack: string): boolean {
  const h = haystack.toLowerCase();
  return rule.pattern
    .split("|")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .some((kw) => h.includes(kw));
}

export function resolveTag(fact: Fact, dimKey: string, rules: TagRule[]): string {
  const own = fact.tags?.[dimKey];
  if (own) return own;
  if (dimKey === "month") return fact.date.slice(0, 7);
  if (dimKey === "source") return fact.source;
  if (dimKey === "format") return fact.tags?.format || UNTAGGED;
  const hay = `${fact.entityLabel ?? ""}\n${fact.text ?? ""}`;
  for (const r of rules) {
    if (r.dimKey === dimKey && ruleMatches(r, hay)) return r.valueCode;
  }
  return UNTAGGED;
}

export function judgeValue(judge: string, t: Totals): number | null {
  const g = (k: string) => t[k] ?? 0;
  switch (judge) {
    case "roas": return g("spend") > 0 ? g("revenue") / g("spend") : null;
    case "cpa": return g("orders") > 0 ? g("spend") / g("orders") : null;
    case "cvr": return g("clicks") > 0 ? g("orders") / g("clicks") : null;
    case "engagementRate": {
      const base = g("reach") || g("impressions");
      return base > 0 ? g("engagement") / base : null;
    }
    default: return t[judge] ?? null;
  }
}

/** 判讀指標是不是「越低越好」。 */
export const lowerIsBetter = (judge: string) => judge === "cpa";

function addInto(acc: Totals, m: Record<string, number>) {
  for (const [k, v] of Object.entries(m)) {
    if (typeof v === "number" && Number.isFinite(v)) acc[k] = (acc[k] ?? 0) + v;
  }
}

function labelFor(dimKey: string, code: string, dims: Dimension[]): string {
  if (code === UNTAGGED) return "未歸類";
  if (dimKey === "source") return SOURCE_LABELS[code] ?? code;
  if (dimKey === "format") return FORMAT_LABELS[code] ?? code;
  if (dimKey === "month") return code;
  const d = dims.find((x) => x.key === dimKey);
  return d?.values.find((v) => v.code === code)?.label ?? code;
}

/** 維度的值順序：定義好的值照定義順序，其餘（月份、來源）照字典序，未歸類最後。 */
function orderedValues(dimKey: string, seen: Set<string>, dims: Dimension[]): DimValue[] {
  const d = dims.find((x) => x.key === dimKey);
  const out: DimValue[] = [];
  if (d) {
    for (const v of d.values) out.push(v);
    for (const code of Array.from(seen).sort()) {
      if (code !== UNTAGGED && !d.values.some((v) => v.code === code)) out.push({ code, label: code });
    }
  } else {
    for (const code of Array.from(seen).sort()) {
      if (code !== UNTAGGED) out.push({ code, label: labelFor(dimKey, code, dims) });
    }
  }
  if (seen.has(UNTAGGED)) out.push({ code: UNTAGGED, label: "未歸類" });
  return out;
}

export function pivot(facts: Fact[], lens: LensConfig, dims: Dimension[], rules: TagRule[]): PivotResult {
  const inScope = lens.sources?.length ? facts.filter((f) => lens.sources!.includes(f.source)) : facts;
  const cells: Record<string, PivotCell> = {};
  const rowTotals: Record<string, PivotCell> = {};
  const colTotals: Record<string, PivotCell> = {};
  const total: PivotCell = { totals: {}, judge: null, count: 0 };
  const rowSeen = new Set<string>();
  const colSeen = new Set<string>();
  let tagged = 0;
  const bump = (map: Record<string, PivotCell>, key: string, f: Fact) => {
    const c = (map[key] ??= { totals: {}, judge: null, count: 0 });
    addInto(c.totals, f.metrics);
    c.count++;
  };

  for (const f of inScope) {
    const r = resolveTag(f, lens.rowDim, rules);
    const c = lens.colDim ? resolveTag(f, lens.colDim, rules) : "*";
    rowSeen.add(r);
    if (lens.colDim) colSeen.add(c);
    if (r !== UNTAGGED) tagged++;
    bump(cells, `${r}|${c}`, f);
    bump(rowTotals, r, f);
    if (lens.colDim) bump(colTotals, c, f);
    addInto(total.totals, f.metrics);
    total.count++;
  }
  for (const m of [cells, rowTotals, colTotals]) {
    for (const cell of Object.values(m)) cell.judge = judgeValue(lens.judge, cell.totals);
  }
  total.judge = judgeValue(lens.judge, total.totals);

  return {
    rows: orderedValues(lens.rowDim, rowSeen, dims),
    cols: lens.colDim ? orderedValues(lens.colDim, colSeen, dims) : [],
    cells, rowTotals, colTotals, total,
    coverage: { tagged, total: inScope.length },
    factCount: inScope.length,
  };
}

/** 單一格子的漏斗：把 stages 依序取值，順便算每一步的轉換率。 */
export function funnelOf(t: Totals, stages: LensStage[]) {
  return stages.map((s, i) => {
    const v = t[s.metric] ?? 0;
    const prev = i > 0 ? t[stages[i - 1]!.metric] ?? 0 : 0;
    return {
      metric: s.metric,
      label: s.label || METRIC_LABELS[s.metric] || s.metric,
      value: v,
      stepRate: i > 0 && prev > 0 ? v / prev : null,
    };
  });
}

/** 小工具：把任意字串變成維度值代碼（UTM 也用這個）。 */
export function slugCode(s: string, taken: Set<string>): string {
  let base = s
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^a-z0-9一-鿿]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  if (!base || /[一-鿿]/.test(base)) base = `v${taken.size + 1}`;
  let code = base;
  let i = 2;
  while (taken.has(code)) code = `${base}-${i++}`;
  taken.add(code);
  return code;
}
