/**
 * perfAsk — 成效層「用一句話問過去的成效」。
 *
 * 2026-10-11（CJ：成效層對照 Claude Dashboards，用戶能用對話取得自己過去的成效）。
 *
 * 分工是這支檔案的核心：
 *   模型只做一件事 —— 把問題翻成「視角設定」（維度、判讀指標、篩選、期間）。
 *   數字全部由 perfPivot 算，回答的句子由前端用算出來的結果組。
 *   所以模型沒有任何機會編出一個數字；翻錯了頂多是問錯維度，而且「怎麼算」
 *   會把用了哪些資料、排除了幾筆攤開來，用戶看得出來。
 *
 * 模型輸出一律當不可信：維度鍵、值代碼、指標鍵、來源都要在允許清單內，其餘丟掉。
 * 純函式（sanitizePlan / periodRange / buildAnswer / buildExplain）不碰 DB，可測。
 */
import { callModel } from "../../platform/core/llm/multiModelRouter";
import { parseJsonLoose } from "./perfAI";
import {
  resolveTag, UNTAGGED, BUILTIN_DIMS, METRIC_LABELS, JUDGE_LABELS, SOURCE_LABELS, FORMAT_LABELS, ORIGIN_LABELS,
  type Fact, type Dimension, type TagRule, type LensConfig, type PivotResult, type DimValue,
} from "./perfPivot";

export const ASK_DAYS = [30, 90, 180, 365] as const;
/** 少於這個筆數的格子不參與排名（跟前端矩陣的標準一致）。 */
export const MIN_CELL_COUNT = 2;

export interface AskFilter { dimKey: string; code: string }
export type AskPeriod = { kind: "days"; days: number } | { kind: "month"; month: string };
export interface AskPlan {
  title: string;
  config: LensConfig;
  filters: AskFilter[];
  period: AskPeriod;
}
export type PlanResult = { ok: true; plan: AskPlan } | { ok: false; reason: string };

const METRIC_KEYS = Object.keys(METRIC_LABELS);
const JUDGE_KEYS = [...Object.keys(JUDGE_LABELS), ...METRIC_KEYS];
const YMD = (d: Date) => d.toISOString().slice(0, 10);

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

// ─── 期間 ─────────────────────────────────────────────────────────────

/** days → 今天往回推；month → 該月 1 日到月底（當月則到今天）。 */
export function periodRange(period: AskPeriod, today: Date): { from: string; to: string } {
  if (period.kind === "days") {
    return { from: YMD(new Date(today.getTime() - period.days * 86400_000)), to: YMD(today) };
  }
  const [y, m] = period.month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));
  return { from: YMD(first), to: YMD(last.getTime() > today.getTime() ? today : last) };
}

function sanitizePeriod(raw: any, today: Date, fallbackDays: number): AskPeriod {
  if (raw && typeof raw === "object") {
    const month = str(raw.month, 7);
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      const [y, m] = month.split("-").map(Number) as [number, number];
      const startsAfterToday = Date.UTC(y, m - 1, 1) > today.getTime();
      const tooOld = today.getTime() - Date.UTC(y, m, 0) > 800 * 86400_000;
      if (!startsAfterToday && !tooOld) return { kind: "month", month };
    }
    const days = Number(raw.days);
    if (Number.isFinite(days) && days > 0) {
      // 只認 30/90/180/365：其他值靠近哪個就算哪個，不讓期間變成沒人看得懂的 47 天。
      const near = [...ASK_DAYS].sort((a, b) => Math.abs(a - days) - Math.abs(b - days))[0]!;
      return { kind: "days", days: near };
    }
  }
  return { kind: "days", days: fallbackDays };
}

// ─── 問題 → 視角設定 ──────────────────────────────────────────────────

function validCode(dimKey: string, code: string, dims: Dimension[]): boolean {
  if (!code) return false;
  if (dimKey === "month") return /^\d{4}-(0[1-9]|1[0-2])$/.test(code);
  if (dimKey === "source") return code in SOURCE_LABELS;
  if (dimKey === "format") return code in FORMAT_LABELS;
  if (dimKey === "origin") return code in ORIGIN_LABELS;
  return !!dims.find((d) => d.key === dimKey)?.values.some((v) => v.code === code);
}

/**
 * 模型回傳 → 合法的 AskPlan。維度只能用既有的（自訂＋內建），不像 proposeLens
 * 那樣能發明新維度：問問題不該有寫入副作用。
 */
export function sanitizePlan(
  parsed: any, dims: Dimension[], traySources: string[], today: Date, fallbackDays: number,
): PlanResult {
  if (!parsed || typeof parsed !== "object") return { ok: false, reason: "" };
  if (parsed.answerable === false) return { ok: false, reason: str(parsed.reason, 200) };

  const dimKeys = new Set<string>([...dims.map((d) => d.key), ...Object.keys(BUILTIN_DIMS)]);
  const rowDim = str(parsed.rowDim, 40);
  if (!dimKeys.has(rowDim)) return { ok: false, reason: "" };
  const colRaw = str(parsed.colDim, 40);
  const colDim = colRaw && colRaw !== rowDim && dimKeys.has(colRaw) ? colRaw : null;

  const judge = JUDGE_KEYS.includes(str(parsed.judge, 30)) ? str(parsed.judge, 30) : "";
  if (!judge) return { ok: false, reason: "" };

  const stages = (Array.isArray(parsed.stages) ? parsed.stages : [])
    .map((s: any) => ({ metric: str(typeof s === "string" ? s : s?.metric, 30) }))
    .filter((s: { metric: string }) => METRIC_KEYS.includes(s.metric))
    .slice(0, 8);

  const allowedSources = traySources.length ? traySources : Object.keys(SOURCE_LABELS);
  const picked = (Array.isArray(parsed.sources) ? parsed.sources : [])
    .map((s: unknown) => str(s, 20)).filter((s: string) => allowedSources.includes(s));
  // 沒指定來源 → 照 tray 的來源範圍（空＝全部）。
  const sources: string[] | undefined = picked.length ? picked : (traySources.length ? traySources : undefined);

  const filters: AskFilter[] = [];
  for (const f of Array.isArray(parsed.filters) ? parsed.filters : []) {
    const dimKey = str(f?.dimKey, 40);
    const code = str(f?.code, 40);
    if (dimKeys.has(dimKey) && validCode(dimKey, code, dims) && !filters.some((x) => x.dimKey === dimKey)) {
      filters.push({ dimKey, code });
    }
    if (filters.length >= 3) break;
  }

  return {
    ok: true,
    plan: {
      title: str(parsed.title, 40) || "",
      config: {
        rowDim, colDim, judge, sources,
        stages: stages.length ? stages : [{ metric: "impressions" }, { metric: "clicks" }, { metric: "orders" }],
      },
      filters,
      period: sanitizePeriod(parsed.period, today, fallbackDays),
    },
  };
}

export async function planQuestion(opts: {
  question: string; dims: Dimension[]; traySources: string[]; today: Date; fallbackDays: number; previous?: AskPlan | null;
}): Promise<PlanResult> {
  const { question, dims, traySources, today, fallbackDays, previous } = opts;
  const dimLines = [
    ...dims.filter((d) => d.values.length).map((d) => `- ${d.key}「${d.label}」值：${d.values.map((v) => `${v.code}=${v.label}`).join("、")}`),
    ...Object.entries(BUILTIN_DIMS).map(([k, v]) => `- ${k}「${v.label}」（內建；值由資料決定${k === "month" ? "，格式 YYYY-MM" : k === "source" ? `，代碼：${Object.keys(SOURCE_LABELS).join("、")}` : k === "format" ? `，代碼：${Object.keys(FORMAT_LABELS).join("、")}` : `，代碼：${Object.keys(ORIGIN_LABELS).join("、")}`}）`),
  ].join("\n");
  const srcList = (traySources.length ? traySources : Object.keys(SOURCE_LABELS)).map((s) => `${s}=${SOURCE_LABELS[s] ?? s}`).join("、");
  const prev = previous
    ? `\n【上一個問題的設定（用戶接著調整時，只改他提到的部分，其餘照舊）】\n${JSON.stringify({
      rowDim: previous.config.rowDim, colDim: previous.config.colDim, judge: previous.config.judge,
      sources: previous.config.sources, filters: previous.filters, period: previous.period,
    })}\n`
    : "";
  const prompt = `你是成效分析助理。用戶用一句話問自己過去的行銷成效。你的工作只是把問題翻成「查詢設定」，數字由系統去算，你不要回答數字，也不要猜。

今天是 ${YMD(today)}。

【可用維度】
${dimLines}

【可用指標鍵】${METRIC_KEYS.map((k) => `${k}（${METRIC_LABELS[k]}）`).join("、")}
【判讀指標 judge】只能是 ${Object.keys(JUDGE_LABELS).join("、")}（${Object.entries(JUDGE_LABELS).map(([k, v]) => `${k}=${v}`).join("、")}）或上面任一個指標鍵。
「轉換最差」「效率」類問題通常用 cvr 或 roas；「花多少錢拿到一筆訂單」用 cpa；「互動好不好」用 engagementRate；問「多少」就直接用該指標鍵（例如 orders、revenue）。
【可用資料來源】${srcList}
${prev}
規則：
- rowDim 是要比較的維度，colDim 是第二個維度（沒有就 null）。只能用上面列的維度鍵，不能發明。
- filters 是「只看某個值」，dimKey 與 code 必須是上面列的。例如問「家庭族群的…」就是 {dimKey:"ta", code:"<家庭的代碼>"}。
- period：問「上個月」「9 月」就給 {"month":"YYYY-MM"}；「近 N 天」給 {"days":N}；沒提就給 null。
- 問題與成效數據無關、或需要的維度／指標不存在，就回 {"answerable":false,"reason":"一句話說明缺什麼"}。

用戶的問題：${question.slice(0, 300)}

只輸出 JSON：{"answerable":true,"title":"10 字內的標題","rowDim":"","colDim":null,"judge":"","stages":[{"metric":""}],"sources":[],"filters":[{"dimKey":"","code":""}],"period":null}`;
  const r = await callModel([{ role: "user", content: prompt }], "general");
  return sanitizePlan(parseJsonLoose(String(r.content ?? "")), dims, traySources, today, fallbackDays);
}

// ─── 篩選 ─────────────────────────────────────────────────────────────

export function applyFilters(facts: Fact[], filters: AskFilter[], rules: TagRule[]): Fact[] {
  if (!filters.length) return facts;
  return facts.filter((f) => filters.every((x) => resolveTag(f, x.dimKey, rules) === x.code));
}

// ─── 結果 → 答案 ──────────────────────────────────────────────────────

export interface RankedCell { row: DimValue; col: DimValue | null; judge: number; count: number }
export interface AskAnswer {
  kind: "ranking" | "thin" | "nodata";
  judge: string;
  total: { judge: number | null; count: number };
  best: RankedCell | null;
  worst: RankedCell | null;
  ranked: RankedCell[];
}

/** cpa 越低越好，其餘越高越好。 */
export function lowerIsBetter(judge: string): boolean {
  return judge === "cpa";
}

export function buildAnswer(result: PivotResult, judge: string): AskAnswer {
  const total = { judge: result.total.judge, count: result.total.count };
  if (result.factCount === 0) return { kind: "nodata", judge, total, best: null, worst: null, ranked: [] };
  const rowOf = new Map(result.rows.map((r) => [r.code, r]));
  const colOf = new Map(result.cols.map((c) => [c.code, c]));
  const cells: RankedCell[] = [];
  for (const [key, c] of Object.entries(result.cells)) {
    const [rc, cc] = key.split("|") as [string, string];
    if (rc === UNTAGGED || cc === UNTAGGED) continue;
    if (c.judge == null || c.count < MIN_CELL_COUNT) continue;
    const row = rowOf.get(rc);
    if (!row) continue;
    cells.push({ row, col: cc === "*" ? null : (colOf.get(cc) ?? null), judge: c.judge, count: c.count });
  }
  cells.sort((a, b) => (lowerIsBetter(judge) ? a.judge - b.judge : b.judge - a.judge));
  return {
    kind: cells.length ? "ranking" : "thin",
    judge, total,
    best: cells[0] ?? null,
    worst: cells.length > 1 ? cells[cells.length - 1]! : null,
    ranked: cells.slice(0, 8),
  };
}

// ─── 怎麼算 ───────────────────────────────────────────────────────────

export interface AskExplain {
  from: string;
  to: string;
  factCount: number;
  /** 範圍內每個來源用了幾筆、資料最晚到哪天。 */
  sources: Array<{ source: string; label: string; facts: number; latest: string }>;
  filters: AskFilter[];
  judge: string;
  formula: { zh: string; en: string };
  excluded: {
    /** 這個維度沒標到的筆數（歸「未歸類」，不進排名）。 */
    untaggedFacts: number;
    /** 筆數不足 MIN_CELL_COUNT 的格子數。 */
    thinCells: number;
    /** 算不出判讀值（分母為 0）的格子數。 */
    noValueCells: number;
  };
  minCount: number;
}

export function formulaOf(judge: string): { zh: string; en: string } {
  switch (judge) {
    case "roas": return { zh: "營收 ÷ 花費", en: "Revenue ÷ Spend" };
    case "cpa": return { zh: "花費 ÷ 訂單（越低越好）", en: "Spend ÷ Orders (lower is better)" };
    case "cvr": return { zh: "訂單 ÷ 點擊", en: "Orders ÷ Clicks" };
    case "engagementRate": return { zh: "互動 ÷ 觸及（沒有觸及時用曝光）", en: "Engagement ÷ Reach (Impressions if no reach)" };
    default: {
      const l = METRIC_LABELS[judge] ?? judge;
      return { zh: `${l} 加總`, en: `Sum of ${judge}` };
    }
  }
}

export function buildExplain(opts: {
  facts: Fact[]; from: string; to: string; config: LensConfig; filters: AskFilter[]; result: PivotResult;
}): AskExplain {
  const { facts, from, to, config, filters, result } = opts;
  const by = new Map<string, { facts: number; latest: string }>();
  for (const f of facts) {
    const cur = by.get(f.source) ?? { facts: 0, latest: "" };
    cur.facts++;
    if (f.date > cur.latest) cur.latest = f.date;
    by.set(f.source, cur);
  }
  let untaggedFacts = 0;
  let thinCells = 0;
  let noValueCells = 0;
  for (const [key, c] of Object.entries(result.cells)) {
    const [rc, cc] = key.split("|");
    if (rc === UNTAGGED || cc === UNTAGGED) { untaggedFacts += c.count; continue; }
    if (c.judge == null) noValueCells++;
    else if (c.count < MIN_CELL_COUNT) thinCells++;
  }
  return {
    from, to, factCount: facts.length,
    sources: Array.from(by.entries()).map(([source, v]) => ({ source, label: SOURCE_LABELS[source] ?? source, ...v }))
      .sort((a, b) => b.facts - a.facts),
    filters, judge: config.judge, formula: formulaOf(config.judge),
    excluded: { untaggedFacts, thinCells, noValueCells },
    minCount: MIN_CELL_COUNT,
  };
}
