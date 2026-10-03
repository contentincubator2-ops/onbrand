/**
 * BrandConsistencyNote — 成品頁上「這篇有沒有過品牌一致性檢查」的一行說明。
 *
 * 寫完之後，品牌大腦同一份資料（語氣、人設、受眾、禁用說法、事實）會再審一次這篇文案。
 * 資料是 metadata.brandConsistency（server/content/core/engine/brandConsistency.ts），
 * 每個版本一筆；status = consistent / fixed / flagged / skipped。
 * skipped 一律顯示「沒有檢查」，絕不當成通過。
 */
import { Icon } from "../../platform/components/icons";

export interface BrandConsistencyRecord {
  variantIndex: number;
  status: "consistent" | "fixed" | "flagged" | "skipped" | string;
  issues?: Array<{ aspect: string; detail: string }>;
  reason?: string;
  before?: string;
}

export function brandCheckSummary(
  rec: BrandConsistencyRecord,
  en: boolean,
): { tone: "ok" | "warn" | "none"; text: string } {
  const k = Array.isArray(rec.issues) ? rec.issues.length : 0;
  switch (rec.status) {
    case "consistent":
      return { tone: "ok", text: en ? "Brand check passed — matches your Brand Brain." : "品牌一致性檢查通過，符合品牌大腦。" };
    case "fixed":
      return { tone: "ok", text: en ? `Brand check adjusted ${k || 1} passage${k > 1 ? "s" : ""} to match your Brand Brain.` : `品牌一致性檢查已修正 ${k || 1} 處，使其符合品牌大腦。` };
    case "flagged":
      return { tone: "warn", text: en ? `Brand check flagged ${k || 1} possible mismatch${k > 1 ? "es" : ""} it couldn't fix — please review.` : `品牌一致性檢查發現 ${k || 1} 處可能不符、沒能自動修正，請自行確認。` };
    default:
      return { tone: "none", text: en ? "Not checked — the brand check didn't run for this post." : "未檢查——這篇沒有跑品牌一致性檢查。" };
  }
}

/** 取出某個版本的紀錄；沒有紀錄（舊稿、非文字任務）就回 null，不顯示任何標示。 */
export function pickBrandRecord(list: unknown, variantIndex: number): BrandConsistencyRecord | null {
  if (!Array.isArray(list)) return null;
  const r = list.find((x: any) => x && Number(x.variantIndex) === variantIndex);
  return r ? (r as BrandConsistencyRecord) : null;
}

export default function BrandConsistencyNote({ rec, en }: { rec: BrandConsistencyRecord; en: boolean }) {
  const s = brandCheckSummary(rec, en);
  const issues = Array.isArray(rec.issues) ? rec.issues : [];
  return (
    <div className={`rounded-lg px-3 py-2 text-[12px] leading-relaxed ${s.tone === "warn" ? "bg-warning-50 text-warning-800" : "bg-default-50 text-default-700"}`}>
      <p className="flex items-start gap-1.5">
        <Icon name={s.tone === "warn" || s.tone === "none" ? "warning" : "done"} size={12} className="mt-0.5 shrink-0" />
        <span>{s.text}</span>
      </p>
      {issues.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer select-none text-default-600">{en ? "What was checked" : "檢查到哪些地方"}</summary>
          <ul className="mt-1 space-y-1">
            {issues.map((i, n) => (
              <li key={n}><span className="text-default-900">{i.aspect}</span>{i.detail && <span>{en ? " — " : "——"}{i.detail}</span>}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
