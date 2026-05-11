/**
 * TrialCountdownBar — top-of-app banner showing remaining trial days
 * + upgrade CTA. Hides when user is on active paid plan.
 *
 * 2026-05-10. Trial = 7 days from register. After expiry shows "已到期" red bar.
 */
import React from "react";
import { Link } from "react-router-dom";
import { trpc } from "../../lib/trpc";

export default function TrialCountdownBar() {
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

  // Trial active — show day countdown + achievements progress
  if (status.planStatus === "trial" && !status.expired) {
    const days = status.daysLeft ?? 0;
    const urgency = days <= 1 ? "high" : days <= 3 ? "medium" : "low";
    return <TrialBarWithProgress days={days} urgency={urgency} />;
  }

  // Expired — red bar, blocks usage with paywall
  if (status.expired) {
    return (
      <div className="px-4 py-2 text-xs flex items-center justify-center gap-3 border-b bg-red-50 border-red-200 text-red-900">
        <span>
          <strong>
            {status.planStatus === "canceled" ? "訂閱已取消" :
             status.planStatus === "expired" ? "訂閱已到期" :
             status.planStatus === "past_due" ? "付款失敗" :
             "免費試用已到期"}
          </strong> — 可繼續查看歷史紀錄，但無法產出新內容
        </span>
        <Link
          to="/pricing"
          className="px-3 py-1 rounded-md bg-red-600 text-white font-semibold hover:bg-red-700 transition"
        >
          立即續訂
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
  urgency,
}: {
  days: number;
  urgency: "high" | "medium" | "low";
}) {
  const achQuery = (trpc as any).achievements?.getProgress?.useQuery
    ? (trpc as any).achievements.getProgress.useQuery(undefined, {
        refetchInterval: 60_000,
        refetchOnWindowFocus: true,
      })
    : { data: null };
  const ach = achQuery?.data;

  return (
    <div className={`px-4 py-2 text-xs flex items-center justify-center gap-4 border-b flex-wrap ${
      urgency === "high" ? "bg-amber-50 border-amber-200 text-amber-900" :
      urgency === "medium" ? "bg-blue-50 border-blue-200 text-blue-900" :
      "bg-neutral-50 border-neutral-200 text-neutral-700"
    }`}>
      <span>
        {days > 0
          ? <>免費試用剩 <strong>{days} 天</strong>{urgency === "high" && " — 別讓你的內容企劃中斷"}</>
          : <>試用今天到期</>
        }
      </span>
      {ach && (
        <Link to="/achievements" className="flex items-center gap-2 hover:underline">
          <span>
            成就 <strong>{ach.unlockedCount} / {ach.totalCount}</strong>
          </span>
          <span className="w-20 h-1.5 bg-neutral-300/50 rounded-full overflow-hidden">
            <span
              className="block h-full bg-neutral-900"
              style={{ width: `${(ach.unlockedCount / ach.totalCount) * 100}%` }}
            />
          </span>
        </Link>
      )}
      <Link
        to="/pricing"
        className="px-3 py-1 rounded-md bg-neutral-900 text-white font-semibold hover:bg-neutral-800 transition"
      >
        升級 OnBrand Pro
      </Link>
    </div>
  );
}
