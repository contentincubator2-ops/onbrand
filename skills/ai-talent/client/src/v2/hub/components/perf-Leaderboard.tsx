import React from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../../server/routers";
import { Avatar, Card, DemoTag, GradeSwatch, SectionTitle, cx, fmt } from "../ui";
import { LiveTag } from "./ov-LiveTag";

export type LeaderRow = inferRouterOutputs<AppRouter>["hub"]["admin"]["performance"]["leaderboard"][number];

const th = "px-3 py-2 font-medium whitespace-nowrap";
const num = "px-3 py-2.5 text-right tabular-nums whitespace-nowrap";

export default function Leaderboard({ rows, days }: { rows: LeaderRow[]; days: number }) {
  return (
    <Card pad={false} className="min-w-0">
      <div className="px-5 pt-5">
        <SectionTitle
          title="Leaderboard"
          hint={`Ranked by tracked clicks, last ${days} days. Impressions are split by data grade — never blended.`}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-[13px]">
          <thead className="border-y border-stone-200 bg-stone-50 text-[12px] text-stone-500">
            <tr>
              <th className={cx(th, "w-10 pl-5")}>#</th>
              <th className={th}>Rep</th>
              <th className={th}>Market</th>
              <th className={cx(th, "text-right")}>Posts</th>
              <th className={cx(th, "text-right")} title="Posts that passed or were auto-fixed before sharing">Compliant</th>
              <th className={cx(th, "text-right")}>
                <span className="inline-flex items-center gap-1.5"><GradeSwatch grade="tracked" />Tracked clicks</span>
              </th>
              <th className={cx(th, "text-right")}>
                <span className="inline-flex items-center gap-1.5"><GradeSwatch grade="verified" />Verified impr.</span>
              </th>
              <th className={cx(th, "text-right")} title="Estimated and self-reported impressions">
                <span className="inline-flex items-center gap-1.5">
                  <GradeSwatch grade="estimated" />
                  <GradeSwatch grade="self_reported" />
                  Other impr.
                </span>
              </th>
              <th className={cx(th, "text-right")}>Engagements</th>
              <th className={cx(th, "pr-5 text-right")}>Diagnosis leads</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const pct = r.posts ? Math.round((r.compliantPosts / r.posts) * 100) : null;
              return (
                <tr key={r.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50/60">
                  <td className="py-2.5 pl-5 pr-3 tabular-nums text-stone-400">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={String(r.name)} seed={r.avatarSeed ? String(r.avatarSeed) : undefined} size={28} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 whitespace-nowrap font-medium text-stone-900">
                          {r.name}
                          {r.isDemo ? <DemoTag /> : null}
                        </div>
                        <div className="whitespace-nowrap text-[12px] text-stone-500">{r.team}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="rounded border border-stone-200 px-1.5 py-0.5 text-[11px] font-medium text-stone-600">{r.market}</span>
                  </td>
                  <td className={num}>{fmt(r.posts)}</td>
                  <td className={num}>
                    {pct == null ? (
                      <span className="text-stone-400">—</span>
                    ) : (
                      <>
                        <span className="text-stone-900">{pct}%</span>
                        <span className="ml-1.5 text-[11px] text-stone-400">{r.compliantPosts}/{r.posts}</span>
                      </>
                    )}
                  </td>
                  <td className={num}>
                    <span className="inline-flex items-center justify-end gap-2">
                      {r.liveClicks > 0 ? <LiveTag count={r.liveClicks} title="Clicks from real visitors" /> : null}
                      <span className="text-stone-900">{fmt(r.clicks)}</span>
                    </span>
                  </td>
                  <td className={num}>{fmt(r.verifiedImpressions)}</td>
                  <td className={cx(num, "text-stone-600")}>{fmt(r.otherImpressions)}</td>
                  <td className={num}>{fmt(r.engagements)}</td>
                  <td className={cx(num, "pr-5")}>{fmt(r.leads)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
