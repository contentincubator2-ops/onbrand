/**
 * listingBatch — 商品頁的批次產出：一張卡、N 個商品，各寫一份，逐筆核准後匯出。
 *
 * 2026-10-05（CJ「蝦皮和 momo 等電商平台…整批修改」→「第一版只做批次產出＋匯出檔」）。
 * 一張卡 = 一種寫法；產品是資料。批次把「同一張卡」套到一串商品上，每個商品各自走一次
 * 正常的單篇執行（同一條扣點、方案閘門、必填檢查、產出落地，見 runSingleTask），
 * 所以每一份成品都在 /projects 看得到，批次只是把它們串成一張可以逐筆審的清單。
 *
 * ── 為什麼逐筆核准是必須的 ──────────────────────────────────────────
 * 整批改線上商品是高風險動作：標題寫錯影響曝光、違規宣稱可能被平台下架。
 * 所以匯出預設只含「已核准」的列；沒看過的不會自己流出去。
 *
 * 存在 `brands.positioning._listingBatches[]`，零 migration（同 _taskCards／_customChannels）。
 * 每個批次最多 50 筆、每個品牌最多留 10 個批次（舊的先丟），整包 JSON 不會長到失控。
 */
import localPool from "../../../localDb";
import { parseListing, type ListingSpec, type ParsedListing, TODO_FIELD_KEY, bulletItems } from "../engine/listingContract";
import type { BrandTaskCardField } from "./brandTaskCards";

export const MAX_BATCH_ITEMS = 50;
export const MAX_BATCHES_PER_BRAND = 10;
export const BATCH_ID_RE = /^b[a-z0-9]{6,20}$/;
const MAX_LABEL = 120;
const MAX_VALUE = 2000;

export type BatchItemState = "queued" | "running" | "done" | "failed" | "cancelled";
export type Approval = "pending" | "approved" | "rejected";
export type BatchStatus = "running" | "paused" | "done" | "cancelled";

export interface BatchItem {
  id: string;
  /** 從品牌的產品清單選的才有；貼上來的商品名稱是 null。 */
  productId: number | null;
  /** 商品名稱（也是這一筆的主題）。 */
  label: string;
  /** 送進任務的輸入：topic ＋ 對得上卡片額外欄位的值。 */
  inputs: Record<string, string>;
  state: BatchItemState;
  outputId: number | null;
  error: string | null;
  approval: Approval;
  startedAt?: string;
  finishedAt?: string;
}

export interface ListingBatch {
  id: string;
  brandId: number;
  cardId: string;
  channelId: string;
  name: string;
  createdAt: string;
  createdBy: number;
  status: BatchStatus;
  /** 暫停原因（例如點數不足）。有值時 worker 不會再領新的項目。 */
  pausedReason: string | null;
  items: BatchItem[];
}

// ─────────────────────────────────────────────────────────────────────
// 貼上來的表格 → 商品清單
// ─────────────────────────────────────────────────────────────────────
export interface ParsedTable {
  rows: Array<{ label: string; inputs: Record<string, string> }>;
  /** 對不上這張卡任何欄位的欄名（會被忽略，要告訴用戶）。 */
  ignoredColumns: string[];
  truncated: boolean;
  /** 給用戶看的一句說明（例如「第一列不是欄位名，整份當商品名稱」）。 */
  note: string | null;
}

const TOPIC_HEADER_RE = /^(商品|商品名稱|商品名|名稱|品名|產品|產品名稱|topic|product|name)$/i;

/** 簡單的 CSV 切欄：支援雙引號與跳脫。 */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function cleanCell(s: string): string {
  return s.trim().replace(/^"(.*)"$/s, "$1").trim();
}

/**
 * 解析用戶貼的內容。
 *   - 一行一個商品名稱（沒有分隔符號）→ 每行一筆；
 *   - 從 Excel／Google 試算表複製（用 Tab 分欄）→ 第一列是欄位名，「商品」欄必填，
 *     其他欄名對得上這張卡的額外欄位（規格、價格…）就帶入；
 *   - 逗號分隔只有在第一列看得出是欄位名時才當表格（商品名稱本身常有逗號，不能亂切）。
 * 第一列不是欄位名（直接是商品資料）時，整份當作「第一欄是商品名稱」，並在 note 說明。
 */
export function parseBatchTable(text: string, askFields: Pick<BrandTaskCardField, "key" | "label">[]): ParsedTable {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim());
  const empty: ParsedTable = { rows: [], ignoredColumns: [], truncated: false, note: null };
  if (lines.length === 0) return empty;

  const fieldByLabel = new Map(askFields.map((f) => [f.label.trim().toLowerCase(), f.key]));
  const split = (l: string, tab: boolean) => (tab ? l.split("\t") : splitCsvLine(l)).map(cleanCell);
  const head0 = lines[0]!;
  const tab = head0.includes("\t");
  const looksLikeHeader = (cells: string[]) => cells.some((c) => TOPIC_HEADER_RE.test(c) || fieldByLabel.has(c.toLowerCase()));
  const csv = !tab && head0.includes(",") && looksLikeHeader(split(head0, false));

  let rows: ParsedTable["rows"] = [];
  let ignored: string[] = [];
  let note: string | null = null;

  if (!tab && !csv) {
    rows = lines.map((l) => ({ label: cleanCell(l), inputs: {} }));
  } else {
    const header = split(head0, tab);
    let body = lines.slice(1);
    let topicIdx = header.findIndex((h) => TOPIC_HEADER_RE.test(h));
    const colKeys: Array<string | null> = [];
    if (!looksLikeHeader(header)) {
      // 第一列就是資料：整份當「第一欄是商品名稱」，其他欄忽略。
      body = lines;
      topicIdx = 0;
      note = "第一列看起來不是欄位名，所以整份當作「第一欄是商品名稱」，其他欄沒有帶入。要帶入規格、價格，請在第一列寫欄位名。";
      header.forEach(() => colKeys.push(null));
    } else {
      if (topicIdx < 0) topicIdx = 0;
      header.forEach((h, i) => {
        if (i === topicIdx) { colKeys.push(null); return; }
        const key = fieldByLabel.get(h.toLowerCase());
        if (key) colKeys.push(key);
        else { colKeys.push(null); if (h) ignored.push(h); }
      });
    }
    rows = body.map((l) => {
      const cells = split(l, tab);
      const inputs: Record<string, string> = {};
      cells.forEach((c, i) => { const k = colKeys[i]; if (k && c) inputs[k] = c.slice(0, MAX_VALUE); });
      return { label: cells[topicIdx] ?? "", inputs };
    });
  }

  rows = rows
    .map((r) => ({ label: r.label.slice(0, MAX_LABEL), inputs: r.inputs }))
    .filter((r) => r.label);
  const truncated = rows.length > MAX_BATCH_ITEMS;
  return { rows: rows.slice(0, MAX_BATCH_ITEMS), ignoredColumns: [...new Set(ignored)], truncated, note };
}

export function newBatchId(now = Date.now()): string {
  return `b${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** 組批次項目。品牌產品先、貼上的後；同名（不分大小寫）只留一筆，以免同一個商品扣兩次點。 */
export function buildBatchItems(
  products: Array<{ id: number; name: string }>,
  table: ParsedTable["rows"],
): BatchItem[] {
  const seen = new Set<string>();
  const items: BatchItem[] = [];
  const push = (label: string, productId: number | null, extra: Record<string, string>) => {
    const k = label.trim().toLowerCase();
    if (!k || seen.has(k) || items.length >= MAX_BATCH_ITEMS) return;
    seen.add(k);
    items.push({
      id: `i${items.length + 1}`, productId, label: label.trim().slice(0, MAX_LABEL),
      inputs: { topic: label.trim().slice(0, MAX_LABEL), ...extra },
      state: "queued", outputId: null, error: null, approval: "pending",
    });
  };
  for (const p of products) push(p.name, p.id, {});
  for (const r of table) push(r.label, null, r.inputs);
  return items;
}

// ─────────────────────────────────────────────────────────────────────
// 成品 → 審核用摘要
// ─────────────────────────────────────────────────────────────────────
export interface ItemSummary {
  caption: string;
  fields: ParsedListing["fields"];
  /** 沒寫出來的內容欄位數（不含待補資料）。 */
  missing: number;
  /** 超過字數上限的欄位數。 */
  over: number;
  /** 「待補資料」列出的缺項（「無」不算）。 */
  todo: string[];
  /** 這一筆能不能放心核准：沒有缺欄位、沒有超標。待補資料不擋——那是給用戶看的提醒。 */
  clean: boolean;
}

/** 從 mission_outputs.content（variants JSON）取第一個版本的 caption 並拆欄位。 */
export function summarizeOutput(content: unknown, spec: ListingSpec): ItemSummary {
  let caption = "";
  try {
    const parsed = typeof content === "string" ? JSON.parse(content) : content;
    const first = Array.isArray(parsed) ? parsed[0] : null;
    caption = String(first?.caption ?? "").trim();
  } catch { /* 內容壞掉就當沒有，下面會算成全部缺欄位 */ }
  const fields = parseListing(caption, spec).fields;
  const content_ = fields.filter((f) => f.key !== TODO_FIELD_KEY);
  const missing = content_.filter((f) => f.value == null).length;
  const over = content_.filter((f) => f.over).length;
  const todoRow = fields.find((f) => f.key === TODO_FIELD_KEY);
  const todo = todoRow?.value ? bulletItems(todoRow.value).filter((s) => !/^(無|没有|沒有|none|n\/a)$/i.test(s)) : [];
  return { caption, fields, missing, over, todo, clean: caption.length > 0 && missing === 0 && over === 0 };
}

// ─────────────────────────────────────────────────────────────────────
// 讀寫（brands.positioning._listingBatches[]）
// ─────────────────────────────────────────────────────────────────────
/** 同一個品牌的讀-改-寫排隊：兩個 worker 同時寫同一包 JSON 會互相蓋掉。 */
const locks = new Map<number, Promise<unknown>>();
function withLock<T>(brandId: number, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(brandId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(brandId, next.catch(() => {}));
  return next;
}

export async function listBatches(brandId: number): Promise<ListingBatch[]> {
  const [rows]: any = await localPool.execute(`SELECT positioning AS p FROM brands WHERE id = ? LIMIT 1`, [brandId]);
  let pos: any = (rows as any[])[0]?.p;
  if (!pos) return [];
  if (typeof pos === "string") { try { pos = JSON.parse(pos); } catch { return []; } }
  return Array.isArray(pos?._listingBatches) ? (pos._listingBatches as ListingBatch[]) : [];
}

export async function getBatch(brandId: number, batchId: string): Promise<ListingBatch | null> {
  return (await listBatches(brandId)).find((b) => b.id === batchId) ?? null;
}

/** 讀-改-寫（每次重新 SELECT，不蓋掉別處剛改的定位）。patch 回傳新清單；超過上限丟最舊的已結束批次。 */
export function mutateBatches(
  brandId: number,
  ownerUserId: number,
  patch: (list: ListingBatch[]) => ListingBatch[],
): Promise<ListingBatch[]> {
  return withLock(brandId, async () => {
    const [rows]: any = await localPool.execute(
      `SELECT positioning AS p FROM brands WHERE id = ? AND userId = ? LIMIT 1`, [brandId, ownerUserId],
    );
    const row = (rows as any[])[0];
    if (!row) throw new Error(`brand ${brandId} not found`);
    let pos: any = row.p;
    if (typeof pos === "string") { try { pos = JSON.parse(pos); } catch { pos = {}; } }
    pos = pos ?? {};
    let next = patch(Array.isArray(pos._listingBatches) ? pos._listingBatches : []);
    // 超過上限：丟最舊的、已結束的；進行中的不丟。
    while (next.length > MAX_BATCHES_PER_BRAND) {
      const idx = next.findIndex((b) => b.status === "done" || b.status === "cancelled");
      if (idx < 0) break;
      next = next.filter((_, i) => i !== idx);
    }
    await localPool.execute(
      `UPDATE brands SET positioning = ? WHERE id = ? AND userId = ?`,
      [JSON.stringify({ ...pos, _listingBatches: next }), brandId, ownerUserId],
    );
    return next;
  });
}

/** 對單一批次做修改，並回傳修改函式的結果（worker 領項目時要知道領到哪一筆）。 */
export async function updateBatch<R>(
  brandId: number,
  ownerUserId: number,
  batchId: string,
  fn: (b: ListingBatch) => { batch: ListingBatch; result: R },
): Promise<R | undefined> {
  let result: R | undefined;
  await mutateBatches(brandId, ownerUserId, (list) =>
    list.map((b) => {
      if (b.id !== batchId) return b;
      const r = fn(b);
      result = r.result;
      return r.batch;
    }));
  return result;
}

/** 批次的整體狀態：由項目推出來。 */
export function deriveStatus(b: Pick<ListingBatch, "status" | "pausedReason" | "items">): BatchStatus {
  if (b.status === "cancelled") return "cancelled";
  const open = b.items.some((i) => i.state === "queued" || i.state === "running");
  if (!open) return "done";
  if (b.pausedReason && !b.items.some((i) => i.state === "running")) return "paused";
  return b.status === "paused" ? "paused" : "running";
}

export interface BatchCounts {
  total: number; queued: number; running: number; done: number; failed: number; cancelled: number;
  approved: number; rejected: number; pendingReview: number;
}

export function countItems(items: BatchItem[]): BatchCounts {
  const c: BatchCounts = { total: items.length, queued: 0, running: 0, done: 0, failed: 0, cancelled: 0, approved: 0, rejected: 0, pendingReview: 0 };
  for (const i of items) {
    c[i.state]++;
    if (i.state === "done") {
      if (i.approval === "approved") c.approved++;
      else if (i.approval === "rejected") c.rejected++;
      else c.pendingReview++;
    }
  }
  return c;
}

/** 伺服器重啟或 worker 中斷後留下的殭屍「進行中」：超過這段時間沒結束就當失敗。 */
export const RUNNING_STALE_MS = 10 * 60_000;
export function isStaleRunning(i: Pick<BatchItem, "state" | "startedAt">, now = Date.now()): boolean {
  if (i.state !== "running") return false;
  const t = Date.parse(i.startedAt ?? "");
  return !Number.isFinite(t) || now - t > RUNNING_STALE_MS;
}
