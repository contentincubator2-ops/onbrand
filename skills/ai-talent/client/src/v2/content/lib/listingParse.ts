/**
 * listingParse（client）— 商品頁成品的欄位拆解與 CSV。
 *
 * 規則與 server/content/core/engine/listingContract.ts 的 parseListing 同一份
 * （client 不得 value-import server，所以留一份鏡像，由 server 側
 * listingContract.parity.test.ts 用同一批 caption 鎖兩邊結果一致）。
 * 刻意不 import 任何東西，讓那支跨邊界測試載得進來。
 */
export type ListingFieldKind = "text" | "bullets" | "long";

export interface ListingFieldLite {
  key: string;
  label: string;
  kind: ListingFieldKind;
  maxChars?: number;
}

export interface ListingRow {
  key: string;
  label: string;
  kind: ListingFieldKind;
  /** null＝成品裡沒有這個欄位（模型沒寫出來）。 */
  value: string | null;
  length: number;
  maxChars?: number;
  over: boolean;
}

/** 永遠排在最後、列「用戶沒提供、模型不能編」的資訊。 */
export const TODO_FIELD_KEY = "todo";

const HEADING_RE = /^\s*【([^】\n]{1,20})】[ \t　]*(.*)$/u;
const BULLET_RE = /^\s*(?:[・•·●▪▸◆*＊]|-(?!-)|\d{1,2}[.、)）])\s*/u;

export function bulletItems(value: string): string[] {
  return value.split("\n").map((l) => l.replace(BULLET_RE, "").trim()).filter(Boolean);
}

/** 字數：去掉換行與條列符號後的字元數。 */
export function fieldLength(kind: ListingFieldKind, value: string): number {
  const t = kind === "bullets"
    ? value.split("\n").map((l) => l.replace(BULLET_RE, "")).join("")
    : value.replace(/\n/g, "");
  return [...t.trim()].length;
}

export function parseListingCaption(caption: string, fields: ListingFieldLite[]): ListingRow[] {
  const byLabel = new Map(fields.map((f) => [f.label, f]));
  const values = new Map<string, string[]>();
  let current: ListingFieldLite | null = null;
  let skipping = false;
  for (const line of String(caption ?? "").replace(/\r\n?/g, "\n").split("\n")) {
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
  return fields.map((f) => {
    const raw = values.get(f.key);
    const value = raw ? raw.join("\n").trim() : null;
    const length = value == null ? 0 : fieldLength(f.kind, value);
    return { key: f.key, label: f.label, kind: f.kind, value, length, maxChars: f.maxChars, over: !!(f.maxChars && length > f.maxChars) };
  });
}

/** 欄位內容拿去貼進平台時的樣子：條列去掉符號，一條一行。 */
export function plainValue(row: Pick<ListingRow, "kind" | "value">): string {
  if (row.value == null) return "";
  return row.kind === "bullets" ? bulletItems(row.value).join("\n") : row.value;
}

/** 『待補資料』是「無」或空，就是沒有要補的。 */
export function todoItems(row: Pick<ListingRow, "kind" | "value"> | undefined): string[] {
  if (!row || row.value == null) return [];
  const items = bulletItems(row.value).filter((s) => !/^(無|没有|沒有|none|n\/a)$/i.test(s));
  return items;
}

function csvCell(s: string): string {
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * 商品頁 CSV：第一列是欄位名，之後一列一個商品（版本）。
 * 開頭加 BOM，Excel 才會把 UTF-8 的中文當中文開。刻意**不**套任何平台的上架範本欄位名 ——
 * 各平台的批次上架格式我們沒有逐一查證，這份只是「每個欄位一欄」的乾淨資料，方便對欄貼上。
 */
export function listingCsv(rows: { name: string; fields: ListingRow[] }[]): string {
  if (rows.length === 0) return "";
  const head = ["名稱", ...rows[0]!.fields.map((f) => f.label)];
  const lines = [head.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push([r.name, ...r.fields.map((f) => plainValue(f))].map(csvCell).join(","));
  }
  return "﻿" + lines.join("\r\n");
}

export function downloadTextFile(filename: string, text: string, mime = "text/csv;charset=utf-8"): void {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch { /* 下載失敗不影響頁面 */ }
}
