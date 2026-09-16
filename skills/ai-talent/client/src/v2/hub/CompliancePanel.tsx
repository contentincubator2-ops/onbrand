import React, { useState } from "react";
import { CheckIcon, Pill, VerdictBadge, cx, type Verdict } from "./ui";

export interface ComplianceCheck {
  rule: string;
  title: string;
  legalRef: string;
  status: "pass" | "fixed" | "flagged";
  detail: string;
}

export interface ComplianceReport {
  packId: string;
  packName: string;
  market: string;
  verdict: Verdict;
  issuesCaught: number;
  attempts: number;
  checks: ComplianceCheck[];
}

/** Checks list + optional before/after. Used by admin pages, LIFF and the simulator. */
export default function CompliancePanel({
  report,
  before,
  after,
  compact = false,
}: {
  report: ComplianceReport;
  before?: string | null;
  after?: string | null;
  compact?: boolean;
}) {
  const [view, setView] = useState<"after" | "before">("after");
  const showDiff = Boolean(before && after && before.trim() !== after.trim());
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <VerdictBadge verdict={report.verdict} caught={report.issuesCaught} />
          <span className="text-[12px] text-stone-500">{report.packName}</span>
        </div>
        {report.issuesCaught > 0 ? (
          <span className="text-[12px] text-stone-600">
            {report.issuesCaught} issue{report.issuesCaught > 1 ? "s" : ""} caught before posting
          </span>
        ) : null}
      </div>

      <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
        {report.checks.map((c) => (
          <li key={c.rule} className="flex items-start gap-2.5 px-3 py-2">
            <CheckIcon status={c.status} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-[13px] font-medium text-stone-800">{c.title}</span>
                {c.status !== "pass" ? <Pill tone={c.status === "fixed" ? "info" : "warn"}>{c.status === "fixed" ? "Fixed" : "Flagged"}</Pill> : null}
              </div>
              {!compact || c.status !== "pass" ? (
                <div className={cx("mt-0.5 text-[12px]", c.status === "pass" ? "text-stone-500" : "text-stone-700")}>{c.detail}</div>
              ) : null}
              {!compact ? <div className="mt-0.5 text-[11px] text-stone-400">{c.legalRef}</div> : null}
            </div>
          </li>
        ))}
      </ul>

      {showDiff ? (
        <div>
          <div className="mb-2 inline-flex rounded-md border border-stone-200 p-0.5 text-[12px]">
            {(["after", "before"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cx("rounded px-2.5 py-1", view === v ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100")}
              >
                {v === "after" ? "Compliant version" : "Original draft"}
              </button>
            ))}
          </div>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-stone-200 bg-stone-50 p-3 font-sans text-[13px] leading-relaxed text-stone-800">
            {view === "after" ? after : before}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
