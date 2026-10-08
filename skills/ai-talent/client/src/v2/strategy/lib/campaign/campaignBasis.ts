/**
 * 活動頁右邊「策略依據」（舊的 11 段活動定位）的畫面用工具。
 *
 * 哪些格子能改由 server 決定（server/content/core/campaign/campaignBasis.ts BASIS_FIELDS，
 * campaign.get 回的 basis.editable 就是那份清單）；這裡只負責標籤與值的轉換。標籤一律從
 * positioningSchema.ts 的 EVENT_SEGMENTS 讀，不另抄一份。
 */
import { EVENT_SEGMENTS, type FieldSpec, type SegmentSpec } from "../positioningSchema";

export type BasisValue = string | string[];
/** null＝清掉那一格。 */
export type BasisPatch = Record<string, BasisValue | null>;

/** 「戰略 Brief（intake 自動填寫）」→「戰略 Brief」：括號裡是給內部看的說明。 */
export const shortTitle = (s: string) => s.replace(/[（(][^）)]*[）)]/g, "").trim();
const shortLabel = (s: string) => s.replace(/[（(][^）)]*[）)]/g, "").trim() || s;

export function fieldOf(path: string): { seg: SegmentSpec; field: FieldSpec } | null {
  const [segId, key] = path.split(".");
  const seg = EVENT_SEGMENTS.find((s) => s.id === segId);
  const field = seg?.fields.find((f) => f.key === key);
  return seg && field ? { seg, field } : null;
}

/** 給人看的名字：「目標受眾・關鍵洞察」。 */
export function basisLabel(path: string, en: boolean): string {
  const f = fieldOf(path);
  if (!f) return path;
  const seg = en && f.seg.titleEn ? f.seg.titleEn : shortTitle(f.seg.title);
  return `${seg}・${shortLabel(en && f.field.labelEn ? f.field.labelEn : f.field.label)}`;
}

/** 值 → 編輯框裡的文字（清單一行一項）。 */
export const toText = (v: BasisValue | null | undefined) => (v == null ? "" : Array.isArray(v) ? v.join("\n") : v);

/** 編輯框的文字 → 值；空的＝清掉。 */
export function fromText(text: string, list: boolean): BasisValue | null {
  if (list) {
    const items = text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    return items.length ? items : null;
  }
  const t = text.trim();
  return t ? t : null;
}

export const sameValue = (a: BasisValue | null | undefined, b: BasisValue | null | undefined) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * 活動定位 → 排企劃用的那一段話（2026-10-05 CJ「定位完成後，可以直接到左邊對話右邊企劃草稿
 * 的地方嗎」）：定位跑完直接排第一版企劃，不再請使用者把同一件事重寫一次。只抄定位裡寫好的
 * 字，不加任何東西；長度壓在設定欄位的上限（mechanic 600 字）內。定位是空的就回空字串——
 * 那就照舊請使用者自己寫。
 */
export function briefFromBasis(raw: Record<string, any> | null | undefined): string {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const parts = [
    str(raw?.brief?.briefSummary),
    str(raw?.smp?.singleMindedProposition),
    str(raw?.messaging?.coreMessage),
    str(raw?.objectives?.marketingGoal),
  ].filter(Boolean);
  return [...new Set(parts)].join("\n").slice(0, 600).trim();
}

/**
 * 新增活動視窗填的內容 → 排企劃用的那一段話（2026-10-08 CJ「當我跳出視窗輸入後，下一步又要我
 * 輸入一次」）：活動名稱＋當時寫的主題／重點。一樣只抄不加；日期不用抄，伺服器推斷設定與排
 * 企劃時自己讀活動的起訖日，品牌大腦與搭配的產品也是伺服器那邊帶。
 */
export function briefFromEvent(ev: { name?: unknown; note?: unknown } | null | undefined): string {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const name = str(ev?.name);
  const note = str(ev?.note);
  const parts = note.includes(name) ? [note] : [name, note];
  return parts.filter(Boolean).join("\n").slice(0, 600).trim();
}
