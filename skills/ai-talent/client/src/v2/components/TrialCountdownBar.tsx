/**
 * TrialCountdownBar — top-of-app banner showing remaining trial days
 * AND remaining points + upgrade CTA. Hides on active paid plan.
 *
 * 2026-05-10. Trial = 7 days from register. After expiry shows "已到期" red bar.
 * 2026-05-18 (CJ dual-limit): also shows points balance. Trial stops when
 * EITHER the 7 days OR the 1000 points run out (whichever comes first).
 */
import React from "react";
import { Link } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { useLang } from "../../lib/i18n";

export default function TrialCountdownBar() {
  const { lang } = useLang();
  const statusQuery = (trpc as any).billing?.getStatus?.useQuery
    ? (trpc as any).billing.getStatus.useQuery(undefined, {
        refetchInterval: 5 * 60_000,         // every 5 min
        refetchOnWindowFocus: true,
        retry: false,
      })
    : { data: null };
  const status = statusQuery?.data;

  // Hide when active paid plan
  if (!status) return null;
  if (status.planStatus === "active" && !status.expired) return null;

  // Trial active — show day countdown + points balance + achievements progress
  if (status.planStatus === "trial" && !status.expired) {
    const days = status.daysLeft ?? 0;
    const pointsLeft = status.points?.balance ?? 0;
    const pointsTotal = status.points?.perCycle ?? 1000;
    const urgency =
      days <= 1 || pointsLeft <= 100 ? "high" :
      days <= 3 || pointsLeft <= 300 ? "medium" : "low";
    return <TrialBarWithProgress days={days} pointsLeft={pointsLeft} pointsTotal={pointsTotal} urgency={urgency} />;
  }

  // Expired — red bar, blocks usage with paywall
  if (status.expired) {
    return (
      <div className="px-4 py-2 text-xs flex items-center justify-center gap-3 border-b bg-red-50 border-red-200 text-red-900">
        <span>
          <strong>
            {status.planStatus === "canceled" ? (lang === "en" ? "Subscription canceled" : "訂閱已取消") :
             status.planStatus === "expired" ? (lang === "en" ? "Subscription expired" : "訂閱已到期") :
             status.planStatus === "past_due" ? (lang === "en" ? "Payment failed" : "付款失敗") :
             (lang === "en" ? "Free trial ended" : "免費試用已到期")}
          </strong> — {lang === "en" ? "you can still view history, but can't make new content" : "可繼續查看歷史紀錄，但無法產出新內容"}
        </span>
        <Link
          to="/pricing"
          className="px-3 py-1 rounded-md bg-red-600 text-white font-semibold hover:bg-red-700 transition"
        >
          {lang === "en" ? "Renew now" : "立即續訂"}
        </Link>
      </div>
    );
  }

  return null;
}

/**
 * Inner component — split out so we can call the achievements progress
 * hook conditionally (only when trial is active, to save query traffic).
 */
function TrialBarWithProgress({
  days,
  pointsLeft,
  pointsTotal,
  urgency,
}: {
  days: number;
  pointsLeft: number;
  pointsTotal: number;
  urgency: "high" | "medium" | "low";
}) {
  const { lang } = useLang();
  const achQuery = (trpc as any).achievements?.getProgress?.useQuery
    ? (trpc as any).achievements.getProgress.useQuery(undefined, {
        refetchInterval: 60_000,
        refetchOnWindowFocus: true,
      })
    : { data: null };
  const ach = achQuery?.data;

  const pointsPct = pointsTotal > 0 ? Math.max(0, Math.round((pointsLeft / pointsTotal) * 100)) : 0;

  return (
    <div className={`px-4 py-2 text-xs flex items-center justify-center gap-4 border-b flex-wrap ${
      urgency === "high" ? "bg-amber-50 border-amber-200 text-amber-900" :
      urgency === "medium" ? "bg-blue-50 border-blue-200 text-blue-900" :
      "bg-neutral-50 border-neutral-200 text-neutral-700"
    }`}>
      {/* Days remaining */}
      <span>
        {days > 0
          ? lang === "en"
            ? <><strong>{days} {days === 1 ? "day" : "days"} left</strong> in trial</>
            : <>試用剩 <strong>{days} 天</strong></>
          : lang === "en" ? <>Trial ends today</> : <>試用今天到期</>
        }
      </span>
      {/* Points remaining with mini bar */}
      <span className="flex items-center gap-1.5">
        <span className="w-16 h-1.5 bg-neutral-300/50 rounded-full overflow-hidden">
          <span
            className={`block h-full rounded-full ${urgency === "high" ? "bg-amber-500" : urgency === "medium" ? "bg-blue-500" : "bg-neutral-500"}`}
            style={{ width: `${pointsPct}%` }}
          />
        </span>
        <span>
          {lang === "en"
            ? <><strong>{pointsLeft}</strong> pts left</>
            : <><strong>{pointsLeft}</strong> 點剩餘</>}
        </span>
      </span>
      {ach && (
        <Link to="/achievements" className="flex items-center gap-2 hover:underline">
          <span>
            {lang === "en" ? "Achievements" : "成就"} <strong>{ach.unlockedCount} / {ach.totalCount}</strong>
          </span>
        </Link>
      )}
      <Link
        to="/pricing"
        className="px-3 py-1 rounded-md bg-neutral-900 text-white font-semibold hover:bg-neutral-800 transition"
      >
        {lang === "en" ? "Upgrade to OnBrand Pro" : "升級 OnBrand Pro"}
      </Link>
    </div>
  );
}
