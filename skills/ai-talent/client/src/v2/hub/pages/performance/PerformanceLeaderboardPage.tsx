import React from "react";
import { trpc } from "../../../../lib/trpc";
import { ErrorNote, Loading, PageHeader } from "../../ui";
import Leaderboard from "../../components/perf-Leaderboard";
import { useT } from "../../lang";

export default function PerformanceLeaderboardPage() {
  const t = useT();
  const q = trpc.hub.admin.performance.useQuery(undefined, { refetchInterval: 15000 });
  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        eyebrow={t("Results · Leaderboard", "成效 · 業務排行")}
        title={t("Who is growing the pipeline, compliantly", "誰在帶動業績，而且合規")}
        subtitle={t(
          "Last 21 days. Tracked clicks, verified reach and compliance rate per rep.",
          "近 21 天：每位業務的追蹤點擊、已驗證觸及與合規率。",
        )}
      />
      {q.isLoading ? <Loading /> : <ErrorNote error={q.error} />}
      {q.data ? <Leaderboard rows={q.data.leaderboard} days={21} /> : null}
    </div>
  );
}
