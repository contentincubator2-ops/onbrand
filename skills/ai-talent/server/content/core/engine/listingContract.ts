// 2026-10-04（CJ「要寫 momoshop 產品介紹、蝦皮賣場」）：商品頁（標題＋賣點＋規格＋描述…）
// 的交付物是「一組欄位」，不是一篇貼文。但每一次 caption 呼叫都會先吃到共用的社群骨架
// （「段落像真人寫的，不要排成結構化卡片」「輸出一篇完整貼文」），而且 captionMaxChars
// ≤ 60 時還會被截成第一行 —— 整份商品頁會被壓成一句話。
//
// 解法沿用分格腳本合約（shotListContract.ts）已經驗證過的四件套：
//   合約接在 system prompt 最後（最新鮮、優先級最高）→ 產出後驗證 → 具名重試 → 確定性修補。
//
// ── 兩個刻意的取捨 ─────────────────────────────────────────────────
// ① 超過字數上限**不截斷**。標題被切在半句話上比超過上限更糟；最後一次照實出貨，
//    由前端把超標的欄位標紅，讓用戶自己改。截斷只會把問題藏起來。
// ② 平台硬限制（蝦皮標題幾字…）**不寫死在程式裡**。那是平台的規定，會變，我們沒有逐一
//    查證；欄位上限由用戶填（留空＝不限），驗證只認用戶填的數字。
//
// 偵測看 template.listingSpec（由 brandTaskCards.cardTemplate 對「商品頁」通路的卡掛上），
// 其他任務完全不受影響。

import type { FBTaskTemplate } from "../catalog/quickTaskFB";

export type ListingFieldKind = "text" | "bullets" | "long";

export interface ListingField {
  key: string;
  label: string;
  kind: ListingFieldKind;
  /** 平台的字數上限（用戶填）。沒填＝不驗。 */
  maxChars?: number;
}

export interface ListingSpec { fields: ListingField[] }

/** 永遠排在最後、不計入「必填」的欄位：模型不知道的事實列在這裡，而不是編出來。 */
export const TODO_FIELD_KEY = "todo";
export const MAX_LISTING_FIELDS = 10;

export const DEFAULT_LISTING_FIELDS: readonly ListingField[] = [
  { key: "title", label: "商品標題", kind: "text" },
  { key: "bullets", label: "賣點條列", kind: "bullets" },
  { key: "specs", label: "規格資訊", kind: "bullets" },
  { key: "description", label: "商品描述", kind: "long" },
  { key: "keywords", label: "搜尋關鍵字", kind: "text" },
  { key: TODO_FIELD_KEY, label: "待補資料", kind: "bullets" },
];

const KINDS: readonly ListingFieldKind[] = ["text", "bullets", "long"];

/**
 * 整理用戶送來的欄位：去掉空標題與重複標題、限制數量、保證「待補資料」在最後一格。
 * label 不能含【】與換行（那是欄位標題的語法）。回傳一定至少有一個內容欄位。
 */
export function sanitizeListingFields(raw: unknown): ListingField[] {
  const out: ListingField[] = [];
  const seenLabels = new Set<string>();
  const seenKeys = new Set<string>();
  const list = Array.isArray(raw) ? raw : [];
  for (const f of list) {
    if (!f || typeof f !== "object") continue;
    const label = String((f as any).label ?? "").replace(/[【】\r\n]/g, "").trim().slice(0, 12);
    if (!label || seenLabels.has(label)) continue;
    let key = String((f as any).key ?? "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
    if (!key || seenKeys.has(key)) key = `f_${out.length + 1}`;
    if (key === TODO_FIELD_KEY) continue;       // 待補資料由我們最後補上，不讓用戶自己加一份
    const kind = KINDS.includes((f as any).kind) ? (f as any).kind as ListingFieldKind : "text";
    const m = Number((f as any).maxChars);
    const maxChars = Number.isFinite(m) && m >= 1 ? Math.min(5000, Math.round(m)) : undefined;
    seenLabels.add(label); seenKeys.add(key);
    out.push({ key, label, kind, ...(maxChars ? { maxChars } : {}) });
    if (out.length >= MAX_LISTING_FIELDS - 1) break;
  }
  if (out.length === 0) out.push(...DEFAULT_LISTING_FIELDS.filter((f) => f.key !== TODO_FIELD_KEY).map((f) => ({ ...f })));
  const todo = DEFAULT_LISTING_FIELDS.find((f) => f.key === TODO_FIELD_KEY)!;
  if (!seenLabels.has(todo.label)) out.push({ ...todo });
  return out;
}

export function isListingTemplate(template: Pick<FBTaskTemplate, "listingSpec">): boolean {
  return !!template.listingSpec?.fields?.length;
}

// ─────────────────────────────────────────────────────────────────────
// 解析
// ─────────────────────────────────────────────────────────────────────
const HEADING_RE = /^\s*【([^】\n]{1,20})】[ \t　]*(.*)$/u;
const BULLET_RE = /^\s*(?:[・•·●▪▸◆*＊]|-(?!-)|\d{1,2}[.、)）])\s*/u;

/** 字數：去掉換行與條列符號後的字元數（跟用戶貼進平台欄位時數到的差不多）。 */
export function fieldLength(field: Pick<ListingField, "kind">, value: string): number {
  const t = field.kind === "bullets"
    ? value.split("\n").map((l) => l.replace(BULLET_RE, "")).join("")
    : value.replace(/\n/g, "");
  return [...t.trim()].length;
}

/** 條列欄位的每一條（去掉符號與空白）。 */
export function bulletItems(value: string): string[] {
  return value.split("\n").map((l) => l.replace(BULLET_RE, "").trim()).filter(Boolean);
}

export interface ParsedListing {
  /** 依 spec 欄位順序；沒出現的欄位 value 是 null。 */
  fields: Array<{ key: string; label: string; kind: ListingFieldKind; value: string | null; length: number; maxChars?: number; over: boolean }>;
}

/**
 * 把 caption 拆成欄位。標題不在 spec 裡的【…】行當內容（例如描述裡的「【注意】」）。
 * 同一個欄位出現兩次時第二次忽略 —— 模型偶爾會在結尾重複一份。
 */
export function parseListing(caption: string, spec: ListingSpec): ParsedListing {
  const byLabel = new Map(spec.fields.map((f) => [f.label, f]));
  const values = new Map<string, string[]>();
  let current: ListingField | null = null;
  let skipping = false;
  for (const line of caption.replace(/\r\n?/g, "\n").split("\n")) {
    const m = HEADING_RE.exec(line);
    const f = m ? byLabel.get(m[1]!.trim()) : undefined;
    if (m && f) {
      if (values.has(f.key)) { skipping = true; current = null; continue; }
      skipping = false;
      current = f;
      values.set(f.key, []);
      if (m[2]!.trim()) values.get(f.key)!.push(m[2]!.trim());
      continue;
    }
    if (skipping || !current) continue;
    values.get(current.key)!.push(line.trimEnd());
  }
  return {
    fields: spec.fields.map((f) => {
      const raw = values.get(f.key);
      const value = raw ? raw.join("\n").trim() : null;
      const length = value == null ? 0 : fieldLength(f, value);
      return { key: f.key, label: f.label, kind: f.kind, value, length, maxChars: f.maxChars, over: !!(f.maxChars && length > f.maxChars) };
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────
// 合約本文
// ─────────────────────────────────────────────────────────────────────
const KIND_GUIDE: Record<ListingFieldKind, string> = {
  text: "一段文字（單行）",
  bullets: "條列，每條自成一行、以「・」開頭",
  long: "一到數段文字",
};

export function buildListingRule(spec: ListingSpec): string {
  const lines = spec.fields.map((f, i) => {
    const limit = f.maxChars ? `；**上限 ${f.maxChars} 字**` : "";
    const body = f.key === TODO_FIELD_KEY
      ? "條列：把這份商品頁裡「用戶沒提供、你也不能編」的資訊逐條列出（例如「尺寸」「保固期」「成分比例」）；真的都有就只寫「無」"
      : KIND_GUIDE[f.kind];
    return `${i + 1}. 【${f.label}】— ${body}${limit}`;
  });
  return (
    `\n\n【商品頁欄位合約 — 最高優先，蓋過上方所有格式規則】\n` +
    `- 本任務的交付物**不是貼文**，是要貼進電商賣場／官網商品頁的**一組欄位**。` +
    `**例外**於上方「不要排成結構化卡片」「輸出一篇完整貼文」規則：caption 必須是下面這幾個欄位，依序出現。\n` +
    `- 每個欄位以單獨一行的「【欄位名】」開頭（欄位名一字不差），內容寫在下一行起：\n` +
    `${lines.join("\n")}\n` +
    `- 全篇禁止 hashtag（# 開頭的字串一個都不准出現），hashtags 欄位一律回傳空陣列 []。\n` +
    `- 標題欄位不寫行銷口號堆疊；每個欄位只放自己的內容，不要把賣點重複貼進描述。\n` +
    `- **事實只能來自**用戶輸入、品牌資料、系統查到的案例與說法。規格、尺寸、成分、認證、保固、價格、庫存、產地、數量，` +
    `這些來源沒有的一律**不寫、不推測、不編造**，改列在【${spec.fields.find((f) => f.key === TODO_FIELD_KEY)?.label ?? "待補資料"}】。` +
    `這是對上方「禁用佔位符」的**唯一例外**：只有那個欄位可以講「缺什麼」，其他欄位裡不可以出現〔待補〕〔請填〕之類的括號標記。\n` +
    `- 欄位要有上限的，寧可寫短一點，也不要超過；不要用「…」硬收尾。\n` +
    `- 換行要真的輸出換行字元。不要寫任何開場白、結語或「以下是商品頁」之類的引導句，caption 第一個字元就是【。\n`
  );
}

// ─────────────────────────────────────────────────────────────────────
// 正規化／驗證／修補
// ─────────────────────────────────────────────────────────────────────
const FENCE_RE = /^\s*```(?:json)?\s*|\s*```\s*$/gu;
const JSON_HEAD_RE = /^\s*\{?\s*["「']?caption["」']?\s*[：:]\s*\[?\s*["']?/u;
const JSON_TAIL_RE = /["'\]\}，,\s]+$/u;
const HASHTAG_RE = /(?:^|\s)#[^\s#]+/gu;

/**
 * 把「內容對、包裝爛」的回應救回來，再整理成標準排版（每個欄位標題單獨一行、條列用「・」）。
 * 欄位找不齊時只做外殼清理，不硬湊 —— 找不齊是內容問題，交給重試。
 */
export function normalizeListing(caption: string, spec: ListingSpec): string {
  let t = caption.replace(FENCE_RE, "").replace(JSON_HEAD_RE, "");
  t = t.replace(/\\r\\n|\\n/gu, "\n").replace(/\\"/gu, '"');
  const tail = t.match(JSON_TAIL_RE);
  if (tail && /["'\]\}]/u.test(tail[0])) t = t.slice(0, t.length - tail[0].length);
  // 每個欄位標題自成一行（模型愛把兩個欄位擠在同一行）
  for (const f of spec.fields) {
    t = t.replace(new RegExp(`([^\\n])[ \\t　]*(【${f.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}】)`, "gu"), "$1\n$2");
  }
  const parsed = parseListing(t, spec);
  if (parsed.fields.some((f) => f.value == null)) return t.replace(/\n{3,}/gu, "\n\n").trim();
  return parsed.fields.map((f) => {
    const body = f.kind === "bullets"
      ? bulletItems(f.value ?? "").map((s) => `・${s}`).join("\n")
      : (f.value ?? "");
    return `【${f.label}】\n${body}`;
  }).join("\n\n").trim();
}

export interface ListingIssue {
  reason: "missing_field" | "empty_field" | "too_few_items" | "has_hashtags" | "over_limit";
  detail: string;
}

/** 不合格回傳 issue，合格回傳 null。傳入的應該是 normalizeListing 之後的文字。 */
export function validateListing(caption: string, spec: ListingSpec): ListingIssue | null {
  const parsed = parseListing(caption, spec);
  const missing = parsed.fields.filter((f) => f.value == null).map((f) => f.label);
  if (missing.length > 0) {
    return { reason: "missing_field", detail: `缺少欄位「${missing.join("」「")}」；欄位標題要單獨一行、一字不差` };
  }
  for (const f of parsed.fields) {
    if (f.key === TODO_FIELD_KEY) continue;
    if (!f.value) return { reason: "empty_field", detail: `「${f.label}」是空的` };
    if (f.kind === "bullets" && bulletItems(f.value).length < 2) {
      return { reason: "too_few_items", detail: `「${f.label}」至少要 2 條，每條自成一行、以「・」開頭` };
    }
  }
  if (HASHTAG_RE.test(caption)) {
    HASHTAG_RE.lastIndex = 0;
    return { reason: "has_hashtags", detail: "商品頁不能有 hashtag" };
  }
  HASHTAG_RE.lastIndex = 0;
  const over = parsed.fields.filter((f) => f.over);
  if (over.length > 0) {
    return {
      reason: "over_limit",
      detail: over.map((f) => `「${f.label}」${f.length} 字，上限 ${f.maxChars} 字，請縮短到 ${f.maxChars} 字內`).join("；"),
    };
  }
  return null;
}

/**
 * 最後一道防線：只做機械性的事（外殼、排版、hashtag）。**不截斷超長欄位**，
 * 也不補不存在的欄位 —— 那些要用戶看得到、自己決定。
 */
export function repairListing(caption: string, spec: ListingSpec): string {
  return normalizeListing(caption, spec)
    .split("\n")
    .map((line) => line.replace(HASHTAG_RE, "").replace(/[ \t]+$/u, ""))
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

/** 重試時給模型的提醒（具名指出違反了什麼）。 */
export function listingRetryReminder(issueDetail: string): string {
  return `上次回應違反商品頁欄位合約：${issueDetail}。請照【商品頁欄位合約】重寫：欄位標題單獨一行、依序齊全，全篇不要 hashtag，超過上限的欄位要縮短。`;
}
