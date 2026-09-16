import React from "react";
import { trpc } from "../../../lib/trpc";
import { GradeStack } from "../charts";
import { Card, ErrorNote, GradeBadge, Loading, PageHeader, SectionTitle, type GradeKey } from "../ui";
import { BarList } from "../components/ov-BarList";
import Leaderboard from "../components/perf-Leaderboard";
import RecentPosts from "../components/perf-RecentPosts";

const GRADE_NOTES: Array<{ grade: GradeKey; source: string; note: string }> = [
  {
    grade: "verified",
    source: "LinkedIn member post analytics API · Instagram insights",
    note: "Straight from the platform, once the rep connects their account.",
  },
  {
    grade: "tracked",
    source: "Our short-link redirect",
    note: "Counts every click on a rep's link. Works on every channel, including LINE and the booth QR.",
  },
  {
    grade: "self_reported",
    source: "The rep pastes the post URL",
    note: "Facebook personal profiles have no public API, so we can only record what the rep reports.",
  },
  {
    grade: "estimated",
    source: "Network size × typical rate",
    note: "Used only where no API or report exists. Read it as scale, not fact.",
  },
];

const CHANNELS: Array<{ id: string; label: string }> = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "line", label: "LINE" },
];

const STACK_GRADES: GradeKey[] = ["verified", "self_reported", "estimated"];

export default function HubPerformancePage() {
  const q = trpc.hub.admin.performance.useQuery(undefined, { refetchInterval: 15000 });
  const d = q.data;
  const days = 21;

  const impressionRows = CHANNELS.map((c) => {
    const parts: Partial<Record<GradeKey, number>> = {};
    for (const m of d?.channels.metrics ?? []) {
      if (m.channel !== c.id || !STACK_GRADES.includes(m.grade as GradeKey)) continue;
      const g = m.grade as GradeKey;
      parts[g] = (parts[g] ?? 0) + Number(m.impressions ?? 0);
    }
    return { label: c.label, parts };
  });
  const lineImpressions = STACK_GRADES.reduce((a, g) => a + (impressionRows[3].parts[g] ?? 0), 0);

  const clickLabels: Record<string, string> = Object.fromEntries([...CHANNELS.map((c) => [c.id, c.label]), ["booth", "Booth QR"]]);
  const clickOrder = [...CHANNELS.map((c) => c.id), "booth"];
  const clickMap = new Map<string, number>();
  for (const c of d?.channels.clicks ?? []) {
    const id = String(c.channel);
    clickMap.set(id, (clickMap.get(id) ?? 0) + Number(c.clicks ?? 0));
  }
  const clickItems = [...clickOrder, ...[...clickMap.keys()].filter((k) => !clickOrder.includes(k))].map((id) => ({
    key: id,
    label: clickLabels[id] ?? (id === "unknown" ? "Other links" : id),
    value: clickMap.get(id) ?? 0,
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Performance"
        title="What reps' posts earned — and how much to trust each number"
        subtitle={`Last ${days} days. Every figure carries a data grade, so a platform-verified number is never blended with an estimate.`}
      />

      <Card>
        <SectionTitle title="Data grades" hint="Where each number comes from, stated plainly." />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {GRADE_NOTES.map((g) => (
            <div key={g.grade} className="min-w-0 rounded-lg border border-stone-200 p-3">
              <GradeBadge grade={g.grade} />
              <div className="mt-2 text-[13px] font-medium text-stone-800">{g.source}</div>
              <p className="mt-1 text-[12px] leading-relaxed text-stone-500">{g.note}</p>
            </div>
          ))}
        </div>
      </Card>

      <ErrorNote error={q.error} />

      {q.isLoading ? (
        <Loading label="Loading performance…" />
      ) : d ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="min-w-0">
              <SectionTitle title="Impressions by channel" hint="Stacked by data grade. Hover a segment for the exact number." />
              <GradeStack rows={impressionRows} grades={STACK_GRADES} />
              {lineImpressions === 0 ? (
                <p className="mt-1 text-[12px] text-stone-500">LINE doesn't report impressions for personal chats — it's measured by tracked clicks only.</p>
              ) : null}
            </Card>

            <Card className="min-w-0">
              <SectionTitle
                title="Tracked clicks by channel"
                hint="Short-link redirects, including the booth QR."
                right={<GradeBadge grade="tracked" />}
              />
              <BarList items={clickItems} unit="clicks" />
            </Card>
          </div>

          <Leaderboard rows={d.leaderboard} days={days} />
          <RecentPosts posts={d.recentPosts} />
        </>
      ) : null}
    </div>
  );
}
