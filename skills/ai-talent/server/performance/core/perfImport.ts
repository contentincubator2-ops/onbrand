/**
 * perfImport — 後台報表匯入（Meta 廣告／Google 廣告／GA4／SHOPLINE／91APP／Shopify 匯出檔）。
 *
 * 2026-09-29（CJ 選「匯入檔先上，API 逐家補」）：任何品牌當天就能用，不必等 API 審核。
 *
 * 流程：
 *   1. parseTable      CSV／TSV 文字 → 表頭＋列（xlsx 先由 scripts/perf/extract.py 轉 CSV）
 *   2. guessSource     看表頭猜是哪個平台的匯出檔（只是預選，用戶可改）
 *   3. guessMapping    表頭 → 標準欄位（日期、名稱、各漏斗指標、標籤欄）；上次同來源的對應優先
 *   4. buildFacts      依對應把列轉成事實，同一天同一個名稱的列加總
 *
 * 訂單型匯出（每列一張訂單）：orders 對到 "__rowcount" → 每列算一筆訂單。
 * UTM：名稱或任何標籤欄裡出現 `ta.family~usp.nomess` 這種格式，自動解成標籤 ——
 * 這是 OnBrand 產出連結時寫進 utm_content 的格式（perfUtm）。
 */
import { METRIC_LABELS } from "./perfPivot";
import type { FactInput } from "./perfStore";

export const ROWCOUNT = "__rowcount";

export interface ParsedTable { headers: string[]; rows: string[][] }

/** RFC4180 等級的 CSV 解析（引號、跳脫引號、換行在引號內）；自動判斷逗號或 Tab。 */
export function parseTable(raw: string): ParsedTable {
  let text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  // GA4 匯出檔開頭有一段 # 註解行；只剝開頭那段，資料列裡的 #（訂單號碼 #1001）不能動
  const lines = text.split("\n");
  while (lines.length && (/^#/.test(lines[0]!) || !lines[0]!.trim())) lines.shift();
  text = lines.join("\n");
  const firstLine = text.split("\n").find((l) => l.trim()) ?? "";
  const delim = (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim()));
  const headers = (nonEmpty.shift() ?? []).map((h) => h.trim());
  return { headers, rows: nonEmpty };
}

const norm = (h: string) => h.toLowerCase().replace(/\s*\((twd|ntd|usd|nt\$|\$)\)\s*/g, "").replace(/[\s_]+/g, " ").trim();

/** 標準欄位 ← 常見表頭（中英、各平台）。比對時先完全相符，再比開頭。 */
export const HEADER_ALIASES: Record<string, string[]> = {
  date: ["date", "day", "日期", "天", "reporting starts", "分析報告開始", "報告開始", "訂單日期", "order date", "created at", "建立時間", "下單時間", "訂單建立時間", "date created"],
  entity: [
    "ad name", "廣告名稱", "ad set name", "廣告組合名稱", "campaign name", "行銷活動名稱", "campaign", "廣告活動",
    "session manual ad content", "工作階段手動廣告內容", "session campaign", "工作階段廣告活動", "utm content", "utm_content", "utm campaign",
    "utm 內容", "utm內容", "utm 活動", "廣告內容", "來源活動",
    "landing page", "到達網頁", "product name", "商品名稱", "lineitem name",
  ],
  impressions: ["impressions", "曝光次數", "曝光", "impr."],
  reach: ["reach", "觸及人數", "觸及"],
  clicks: ["link clicks", "連結點擊次數", "clicks", "點擊次數", "點擊", "outbound clicks", "連外點擊次數"],
  spend: ["amount spent", "花費金額", "cost", "費用", "花費", "支出金額"],
  sessions: ["sessions", "工作階段", "工作階段數", "landing page views", "連結頁面瀏覽次數"],
  productViews: ["items viewed", "商品瀏覽", "view content", "瀏覽內容", "content views", "內容瀏覽次數"],
  atc: ["adds to cart", "加到購物車", "add to carts", "加入購物車次數", "加入購物車", "add to cart"],
  checkout: ["checkouts initiated", "開始結帳次數", "checkouts", "結帳", "開始結帳"],
  orders: ["purchases", "購買次數", "ecommerce purchases", "電子商務購買", "transactions", "交易次數", "conversions", "轉換", "購買"],
  revenue: [
    "purchases conversion value", "購買轉換值", "conv. value", "轉換價值", "purchase revenue", "購買收益", "total revenue", "總收益",
    "訂單合計", "訂單金額", "總金額", "total", "subtotal", "付款金額",
  ],
  engagement: ["post engagements", "貼文互動次數", "engagements", "互動次數"],
  leads: ["leads", "潛在顧客", "名單"],
};

export const IMPORT_SOURCES = ["meta_ads", "google_ads", "ga4", "shopline", "91app", "shopify", "csv"] as const;

export function guessSource(headers: string[]): string {
  const h = headers.map(norm).join("|");
  if (/amount spent|花費金額|廣告組合|ad set name|reporting starts|分析報告開始/.test(h)) return "meta_ads";
  if (/conv\. value|impr\.|avg\. cpc|轉換價值|平均單次點擊出價/.test(h)) return "google_ads";
  if (/sessions|工作階段|session source|使用者/.test(h)) return "ga4";
  if (/financial status|lineitem/.test(h)) return "shopify";
  if (/訂單號碼|order number/.test(h)) return "shopline";
  if (/訂單編號/.test(h)) return "91app";
  return "csv";
}

export function isOrderExport(source: string) {
  return source === "shopline" || source === "91app" || source === "shopify";
}

/** 表頭 → 對應（值是標準欄位名、"tag:<dimKey>"、或空＝略過）。 */
export function guessMapping(headers: string[], source: string, previous?: Record<string, string> | null): Record<string, string> {
  const out: Record<string, string> = {};
  const used = new Set<string>();
  for (const h of headers) {
    if (previous && previous[h] !== undefined) { out[h] = previous[h]; if (previous[h]) used.add(previous[h]); continue; }
    const n = norm(h);
    let hit = "";
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (field !== "entity" && used.has(field)) continue;
      if (aliases.some((a) => n === a)) { hit = field; break; }
    }
    // 比值欄（每次成果成本、點擊率、ROAS…）不能靠「開頭相符」被當成總量欄
    const isRatio = /per |每|率|rate|ctr|cpc|cpm|cpa|roas|average|平均|%/.test(n);
    if (!hit && !isRatio) {
      for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
        if (field !== "entity" && used.has(field)) continue;
        if (aliases.some((a) => a.length >= 3 && n.startsWith(a))) { hit = field; break; }
      }
    }
    if (hit) used.add(hit);
    out[h] = hit;
  }
  if (isOrderExport(source) && !Object.values(out).includes("orders")) out[ROWCOUNT] = "orders";
  return out;
}

export function parseNumber(s: string): number | null {
  const t = String(s ?? "").replace(/NT\$|US\$|\$|,|%|\s|元/g, "").trim();
  if (!t || t === "-" || t === "--") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** 各種日期寫法 → YYYY-MM-DD；Excel 序號也吃。 */
export function parseDate(s: string): string | null {
  const t = String(s ?? "").trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (m) return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
  m = t.match(/^(\d{4})(\d{2})(\d{2})$/); // GA4: 20260901
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  if (/^\d{5}(\.\d+)?$/.test(t)) {
    const serial = Math.floor(Number(t));
    if (serial > 30000 && serial < 70000) {
      const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400_000);
      return d.toISOString().slice(0, 10);
    }
  }
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // 美式 M/D/YYYY
  if (m) return `${m[3]}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
  return null;
}

/** `ta.family~usp.nomess` → { ta: "family", usp: "nomess" }；字串中任何位置都抓。 */
export function parseUtmTags(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(?:^|[~|;&\s?=])([a-z][a-z0-9_]{0,39})\.([a-z0-9][a-z0-9-]{0,39})(?=$|[~|;&\s])/g;
  let m: RegExpExecArray | null;
  const str = String(s ?? "");
  while ((m = re.exec(str))) out[m[1]!] = m[2]!;
  return out;
}

export interface BuildResult { facts: FactInput[]; skipped: number; metricsFound: string[] }

export function buildFacts(table: ParsedTable, mapping: Record<string, string>, source: string, fallbackDate: string): BuildResult {
  const idx = (field: string) => table.headers.map((h, i) => (mapping[h] === field ? i : -1)).filter((i) => i >= 0);
  const dateIdx = idx("date")[0];
  const entityIdx = idx("entity");
  const metricCols = Object.keys(METRIC_LABELS).map((k) => ({ k, cols: idx(k) })).filter((x) => x.cols.length);
  const tagCols = table.headers
    .map((h, i) => ({ i, dim: mapping[h]?.startsWith("tag:") ? mapping[h].slice(4) : "" }))
    .filter((x) => x.dim);
  const rowCountAs = mapping[ROWCOUNT] || "";
  const groups = new Map<string, FactInput>();
  let skipped = 0;

  for (const r of table.rows) {
    const date = dateIdx != null ? parseDate(r[dateIdx] ?? "") : fallbackDate;
    if (!date) { skipped++; continue; }
    const label = entityIdx.map((i) => (r[i] ?? "").trim()).filter(Boolean).join(" / ") || "(未命名)";
    // 總計列（Meta/GA4 匯出檔最後常有一列 Total）不能再加一次
    if (/^(total|總計|合計|results?)$/i.test(label)) { skipped++; continue; }
    const tags: Record<string, string> = { ...parseUtmTags(label) };
    for (const t of tagCols) {
      const v = (r[t.i] ?? "").trim();
      if (!v) continue;
      Object.assign(tags, parseUtmTags(v));
      if (!tags[t.dim]) tags[t.dim] = v.slice(0, 40);
    }
    const metrics: Record<string, number> = {};
    for (const { k, cols } of metricCols) {
      let sum = 0; let any = false;
      for (const c of cols) { const n = parseNumber(r[c] ?? ""); if (n != null) { sum += n; any = true; } }
      if (any) metrics[k] = sum;
    }
    if (rowCountAs) metrics[rowCountAs] = (metrics[rowCountAs] ?? 0) + 1;
    if (!Object.keys(metrics).length) { skipped++; continue; }
    const key = `${date}|${label}`;
    const g = groups.get(key);
    if (g) {
      for (const [k, v] of Object.entries(metrics)) g.metrics[k] = (g.metrics[k] ?? 0) + v;
      Object.assign(g.tags!, tags);
    } else {
      groups.set(key, {
        source, entityType: isOrderExport(source) ? "order_group" : "row",
        entityId: label.slice(0, 180), entityLabel: label, date, tags, metrics,
      });
    }
  }
  return { facts: Array.from(groups.values()), skipped, metricsFound: metricCols.map((m) => m.k).concat(rowCountAs ? [rowCountAs] : []) };
}
