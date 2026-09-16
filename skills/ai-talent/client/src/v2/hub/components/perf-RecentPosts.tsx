import React, { useState } from "react";
import { ChevronDown, MousePointerClick } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../../server/routers";
import CompliancePanel, { type ComplianceReport } from "../CompliancePanel";
import { Avatar, Card, ChannelLabel, SectionTitle, VerdictBadge, cx, fmt, timeAgo, type Verdict } from "../ui";
import { SourceTag } from "./ov-LiveTag";

export type RecentPost = inferRouterOutputs<AppRouter>["hub"]["admin"]["performance"]["recentPosts"][number];

const STATUS: Record<string, string> = { shared: "Shared", reported: "Shared · URL reported", draft: "Draft, not shared yet" };
const INITIAL = 12;

function asReport(v: unknown): ComplianceReport | null {
  const r = v as ComplianceReport | null;
  return r && Array.isArray(r.checks) && r.verdict ? r : null;
}

export default function RecentPosts({ posts }: { posts: RecentPost[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? posts : posts.slice(0, INITIAL);

  return (
    <Card pad={false} className="min-w-0">
      <div className="px-5 pt-5">
        <SectionTitle title="Recent posts" hint="Open a post to see what it said and every policy check it went through." />
      </div>
      {posts.length === 0 ? (
        <p className="px-5 pb-6 text-[13px] text-stone-500">No posts yet.</p>
      ) : (
        <ul className="divide-y divide-stone-100 border-t border-stone-200">
          {visible.map((p) => {
            const isOpen = open === p.id;
            const report = asReport(p.compliance);
            const caption = String(p.caption ?? "");
            const firstDraft = p.firstDraft ? String(p.firstDraft) : null;
            const hasDiff = Boolean(firstDraft && caption && firstDraft.trim() !== caption.trim());
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : p.id)}
                  aria-expanded={isOpen}
                  className={cx("flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-stone-50 sm:px-5", isOpen && "bg-stone-50")}
                >
                  <Avatar name={String(p.repName ?? "")} seed={p.avatarSeed ? String(p.avatarSeed) : undefined} size={30} />
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <span className="block min-w-0">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-[13px] font-medium text-stone-900">{p.repName}</span>
                        <span className="text-stone-300" aria-hidden>·</span>
                        <ChannelLabel channel={String(p.channel)} />
                      </span>
                      <span className="block truncate text-[12px] text-stone-500">{p.solutionEn ?? "General post"}</span>
                    </span>
                    <span className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 sm:justify-end">
                      <VerdictBadge verdict={p.verdict as Verdict} caught={report?.issuesCaught} />
                      <span className="inline-flex items-center gap-1 text-[12px] tabular-nums text-stone-600" title="Tracked clicks on this post's link">
                        <MousePointerClick className="h-3.5 w-3.5 text-stone-400" aria-hidden />
                        {fmt(p.clicks)}
                      </span>
                      <span className="w-12 text-[12px] tabular-nums text-stone-400 sm:text-right">{timeAgo(p.createdAt)}</span>
                      <SourceTag isDemo={Boolean(p.isDemo)} />
                    </span>
                  </span>
                  <ChevronDown
                    className={cx("mt-1 h-4 w-4 shrink-0 text-stone-400 transition-transform sm:mt-2", isOpen && "rotate-180")}
                    aria-hidden
                  />
                </button>

                {isOpen ? (
                  <div className={cx("grid gap-4 border-t border-stone-100 bg-stone-50/60 px-4 py-4 sm:px-5", !hasDiff && "lg:grid-cols-2")}>
                    {!hasDiff ? (
                      <div className="min-w-0">
                        <div className="mb-2 text-[12px] font-medium text-stone-500">Caption</div>
                        <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-stone-200 bg-white p-3 font-sans text-[13px] leading-relaxed text-stone-800">
                          {caption}
                        </pre>
                      </div>
                    ) : null}
                    <div className="min-w-0">
                      {!hasDiff ? <div className="mb-2 text-[12px] font-medium text-stone-500">Policy checks</div> : null}
                      {report ? (
                        <CompliancePanel report={report} before={firstDraft} after={caption} />
                      ) : (
                        <p className="text-[13px] text-stone-500">No compliance report stored for this post.</p>
                      )}
                    </div>
                    <div className={cx("flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-stone-500", !hasDiff && "lg:col-span-2")}>
                      {p.skillEn ? <span>Skill: {p.skillEn}</span> : null}
                      <span>Market: {p.market}</span>
                      <span>{STATUS[String(p.status)] ?? p.status}</span>
                      {p.shortCode ? <span className="font-mono">/r/{p.shortCode}</span> : null}
                      {p.latencyMs ? <span className="tabular-nums">Written in {(Number(p.latencyMs) / 1000).toFixed(1)}s</span> : null}
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {posts.length > INITIAL ? (
        <div className="border-t border-stone-100 px-5 py-3">
          <button
            type="button"
            onClick={() => setShowAll((s) => !s)}
            className="text-[13px] font-medium text-stone-600 hover:text-stone-900"
          >
            {showAll ? "Show fewer" : `Show all ${posts.length} posts`}
          </button>
        </div>
      ) : null}
    </Card>
  );
}
