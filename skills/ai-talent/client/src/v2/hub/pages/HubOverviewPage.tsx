import React from "react";
import { trpc } from "../../../lib/trpc";
import { ErrorNote, Loading, PageHeader, Stat, fmt } from "../ui";
import { LiveTag } from "../components/ov-LiveTag";
import BoothQrCard from "../components/ov-BoothQrCard";
import LiveFeed from "../components/ov-LiveFeed";
import FunctionCards from "../components/ov-FunctionCards";

const RULE_LABELS: Record<string, [en: string, zh: string]> = {
  disclosure: ["Missing employee disclosure", "缺少任職揭露"],
  price: ["Unapproved price", "未核准價格"],
  claims: ["Absolute / guaranteed claims", "絕對或保證用語"],
  evidence: ["Unsourced statistic", "沒有出處的數據"],
  competitors: ["Competitor comparison", "點名競品比較"],
  link: ["Untracked link", "沒有追蹤的連結"],
};

export default function HubOverviewPage() {
  const q = trpc.hub.admin.overview.useQuery();
  const o = q.data?.overview;
  const days = o?.windowDays ?? 21;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Overview"
        title="Equip every sales rep with a marketing team"
        subtitle={`Growth and compliance across reps' personal LinkedIn, Facebook, Instagram and LINE — last ${days} days.`}
      />

      <ErrorNote error={q.error} />

      {q.isLoading ? (
        <Loading label="Loading overview…" />
      ) : o ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <Stat
              label="Active reps this week"
              value={
                <>
                  {fmt(o.reps.activeThisWeek)}
                  <span className="ml-1 text-[15px] font-medium text-stone-400">of {fmt(o.reps.total)}</span>
                </>
              }
              sub={`${fmt(o.reps.consented)} consented · ${fmt(o.reps.lineBound)} on LINE`}
            />
            <Stat label="Posts published" value={fmt(o.posts.total)} sub={`${fmt(o.posts.shared)} shared`} />
            <Stat
              label="Policy issues caught"
              value={fmt(o.compliance.issuesCaught)}
              sub={`${fmt(o.compliance.autoFixed)} auto-fixed · ${fmt(o.compliance.needsReview)} held for review`}
            />
            <Stat
              label="Tracked clicks"
              value={fmt(o.growth.clicks)}
              badge={o.growth.liveClicks > 0 ? <LiveTag count={o.growth.liveClicks} title="Clicks from real visitors" /> : undefined}
              sub={o.growth.liveClicks > 0 ? `${fmt(o.growth.liveClicks)} from real visitors` : "Short-link redirects, every channel"}
            />
            <Stat
              label="Verified impressions"
              value={fmt(o.growth.byGrade.verified?.impressions)}
              sub="LinkedIn & Instagram APIs"
            />
          </div>

          {/* 2026-09-22 (CJ): 每日活動與規則排行也收進卡片牆了，見 ov-FunctionCards。 */}
          <FunctionCards overview={o} ruleLabels={RULE_LABELS} />
        </>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <BoothQrCard />
        <div className="min-w-0 lg:col-span-2">
          <LiveFeed limit={15} />
        </div>
      </div>

    </div>
  );
}
