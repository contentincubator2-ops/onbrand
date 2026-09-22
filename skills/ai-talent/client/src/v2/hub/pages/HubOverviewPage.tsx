import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { trpc } from "../../../lib/trpc";
import { DailyBars } from "../charts";
import { Card, ErrorNote, Loading, PageHeader, SectionTitle, Stat, fmt } from "../ui";
import { BarList } from "../components/ov-BarList";
import { LiveTag } from "../components/ov-LiveTag";
import BoothQrCard from "../components/ov-BoothQrCard";
import LiveFeed from "../components/ov-LiveFeed";
import FunctionCards from "../components/ov-FunctionCards";

const RULE_LABELS: Record<string, string> = {
  disclosure: "Missing employee disclosure",
  price: "Unapproved price",
  claims: "Absolute / guaranteed claims",
  evidence: "Unsourced statistic",
  competitors: "Competitor comparison",
  link: "Untracked link",
};

export default function HubOverviewPage() {
  const q = trpc.hub.admin.overview.useQuery();
  const o = q.data?.overview;
  const days = o?.windowDays ?? 21;

  const rules = o
    ? Array.from(new Set([...Object.keys(RULE_LABELS), ...Object.keys(o.compliance.caughtByRule)]))
        .map((id) => ({ key: id, label: RULE_LABELS[id] ?? id, value: Number(o.compliance.caughtByRule[id] ?? 0) }))
        .sort((a, b) => b.value - a.value)
    : [];

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

          <FunctionCards overview={o} />

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="min-w-0 lg:col-span-2">
              <SectionTitle title="Posting activity" hint={`Daily, last ${days} days. Hover a bar for the exact count.`} />
              <div className="grid gap-6 sm:grid-cols-2">
                <DailyBars label="Posts per day" color="#2a78d6" height={180} data={o.series.map((d) => ({ date: d.date, value: d.posts }))} />
                <DailyBars label="Tracked clicks per day" color="#52514e" height={180} data={o.series.map((d) => ({ date: d.date, value: d.clicks }))} />
              </div>
            </Card>

            <Card className="min-w-0">
              <SectionTitle title="Caught before posting" hint="Policy rules a first draft tripped — fixed or held before anything went live." />
              <BarList items={rules} unit="catches" />
              <Link
                to="/hub/content/policies"
                className="mt-4 inline-flex items-center gap-1 text-[12px] font-medium text-stone-600 hover:text-stone-900"
              >
                See the policy packs <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </Card>
          </div>
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
