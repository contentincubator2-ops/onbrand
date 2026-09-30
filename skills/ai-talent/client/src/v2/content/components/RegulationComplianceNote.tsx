/**
 * RegulationComplianceNote — 成品頁上「這篇有沒有過法規合規檢查」的一行說明。
 *
 * 2026-09-30（CJ「要多加一道寫完後的合規檢查，也寫在任務卡上的顯示進度，表示有進行合規檢查」）：
 * 執行中看任務卡的進度格「合規檢查」；寫完之後在這裡留下結果——通過、自動修正了哪幾句、
 * 或是有沒修成的地方要用戶自己改。檢查沒跑完照實說，不假裝檢查過。
 * 資料是 metadata.regulationCompliance（server/content/core/regulationCompliance.ts）。
 */
import { Icon } from "../../platform/components/icons";

export interface ComplianceRecord {
  variantIndex: number;
  status: "compliant" | "fixed" | "flagged" | "skipped";
  issues: Array<{ regulation: string; quote: string; detail: string }>;
  regulationCount: number;
}

export function complianceSummary(rec: ComplianceRecord, en: boolean): { tone: "ok" | "warn"; text: string } {
  const n = rec.regulationCount;
  const k = rec.issues.length;
  switch (rec.status) {
    case "compliant":
      return { tone: "ok", text: en ? `Checked against ${n} regulation${n > 1 ? "s" : ""} — no issues found.` : `已依 ${n} 條法規完成合規檢查，未發現違規。` };
    case "fixed":
      return { tone: "ok", text: en ? `Checked against ${n} regulation${n > 1 ? "s" : ""} — ${k} passage${k > 1 ? "s" : ""} rewritten to comply.` : `已依 ${n} 條法規完成合規檢查，自動修正 ${k} 處。` };
    case "flagged":
      return { tone: "warn", text: en ? `Compliance check found ${k} possible issue${k > 1 ? "s" : ""} it couldn't fix — please edit before publishing.` : `合規檢查發現 ${k} 處可能違規、沒能自動修正，發布前請手動修改。` };
    default:
      return { tone: "warn", text: en ? "The compliance check didn't finish for this post — please review it against your regulations before publishing." : "這篇的合規檢查沒有完成，發布前請自行對照法規確認。" };
  }
}

export default function RegulationComplianceNote({ rec, en }: { rec: ComplianceRecord; en: boolean }) {
  const s = complianceSummary(rec, en);
  return (
    <div className={`rounded-lg px-3 py-2 text-[12px] leading-relaxed ${s.tone === "warn" ? "bg-warning-50 text-warning-800" : "bg-default-50 text-default-700"}`}>
      <p className="flex items-start gap-1.5">
        <Icon name={s.tone === "warn" ? "warning" : "regulation"} size={12} className="mt-0.5 shrink-0" />
        <span>{s.text}</span>
      </p>
      {rec.issues.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer select-none text-default-500">{en ? "What was flagged" : "檢查到哪些地方"}</summary>
          <ul className="mt-1 space-y-1">
            {rec.issues.map((i, n) => (
              <li key={n}>
                {i.quote && <span className="text-default-900">「{i.quote}」</span>}
                {i.detail && <span>{en ? " — " : "——"}{i.detail}</span>}
                {i.regulation && <span className="text-default-500">（{i.regulation}）</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="mt-1 text-[11px] text-default-400">
        {en ? "For reference only; not legal advice." : "僅供參考，不構成法律意見。"}
      </p>
    </div>
  );
}
