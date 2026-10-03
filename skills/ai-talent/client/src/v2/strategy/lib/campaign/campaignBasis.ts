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
