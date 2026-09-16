import React, { useEffect, useRef, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../../server/routers";
import { trpc } from "../../../lib/trpc";
import { Avatar, Card, ErrorNote, LiveDot, Loading, SectionTitle, cx, timeAgo } from "../ui";
import { SourceTag } from "./ov-LiveTag";

type FeedItem = inferRouterOutputs<AppRouter>["hub"]["admin"]["feed"][number];

const VERB: Record<string, string> = {
  post_generated: "wrote a post",
  post_shared: "shared a post",
  post_reported: "reported a post URL",
  link_click: "got a click on their tracked link",
  menu_tap: "opened",
  ask_ai: "asked the AI assistant",
  ask_ai_answer: "got an answer from the AI assistant",
  line_bound: "connected LINE",
  draft_checked: "checked a draft",
  skill_approved: "approved a skill",
};

const MENU: Record<string, string> = {
  write: "Write a post",
  featured: "This week's focus",
  lookup: "Solution lookup",
  share: "Share a post",
  stats: "My results",
  ask: "Ask AI",
};

const TOKENS: Record<string, string> = {
  linkedin: "LinkedIn",
  facebook: "Facebook",
  instagram: "Instagram",
  line: "LINE",
  booth: "Booth QR",
  link: "Link",
};

const VERDICTS: Record<string, string> = { clean: "Compliant", auto_fixed: "Auto-fixed", needs_review: "Needs review" };

function describe(e: FeedItem): { who: string; what: string; detail: string | null } {
  const kind = String(e.kind);
  const detail = e.detail ? String(e.detail) : null;
  if (kind === "skill_approved") {
    return { who: "Marketing", what: "approved a skill", detail: detail ? detail.replace(/^skill #/, "Skill #") : null };
  }
  const who = e.repName ? String(e.repName) : "A rep";
  if (kind === "menu_tap") {
    return { who, what: `opened ${detail ? `“${MENU[detail] ?? detail}”` : "the menu"}`, detail: null };
  }
  if (kind === "ask_ai_answer") {
    return { who, what: "got an answer from the AI assistant", detail };
  }
  if (kind === "line_bound") return { who, what: VERB.line_bound, detail: null };
  const pretty = detail
    ? detail
        .split(" · ")
        .map((part) => TOKENS[part] ?? part.replace(/\b(clean|auto_fixed|needs_review)\b/g, (m) => VERDICTS[m] ?? m))
        .join(" · ")
    : null;
  return { who, what: VERB[kind] ?? kind.replace(/_/g, " "), detail: pretty };
}

/** Polls the event stream; new real (non-demo) events flash and refresh the KPIs. */
export default function LiveFeed({ limit = 15 }: { limit?: number }) {
  const utils = trpc.useUtils();
  const feed = trpc.hub.admin.feed.useQuery({ sinceId: 0 }, { refetchInterval: 3000 });

  const maxSeen = useRef<number | null>(null);
  const timers = useRef<number[]>([]);
  const [fresh, setFresh] = useState<number[]>([]);

  useEffect(() => {
    const items = feed.data;
    if (!items) return;
    const top = items.reduce((m, e) => Math.max(m, e.id), 0);
    if (maxSeen.current == null) {
      maxSeen.current = top; // first load: nothing is "new"
      return;
    }
    const since = maxSeen.current;
    maxSeen.current = Math.max(since, top);
    const liveIds = items.filter((e) => e.id > since && !e.isDemo).map((e) => e.id);
    if (!liveIds.length) return;
    setFresh((f) => [...f, ...liveIds]);
    void utils.hub.admin.overview.invalidate();
    timers.current.push(window.setTimeout(() => setFresh((f) => f.filter((id) => !liveIds.includes(id))), 3000));
  }, [feed.data, utils]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  // Keep "2m ago" honest even when the feed itself hasn't changed.
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = window.setInterval(() => setTick((t) => t + 1), 15000);
    return () => window.clearInterval(i);
  }, []);

  const items = (feed.data ?? []).slice(0, limit);

  return (
    <Card className="min-w-0">
      <SectionTitle
        title="Live activity"
        hint="What reps and booth visitors are doing right now."
        right={
          <span className="inline-flex items-center gap-1.5 text-[12px] text-stone-500">
            <LiveDot /> Updating every 3s
          </span>
        }
      />
      <ErrorNote error={feed.error} />
      {feed.isLoading ? (
        <Loading label="Connecting to the activity stream…" />
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-stone-500">No activity yet. Scan the booth QR to create the first event.</p>
      ) : (
        <ul className="-mx-2 divide-y divide-stone-100">
          {items.map((e) => {
            const d = describe(e);
            return (
              <li
                key={e.id}
                className={cx(
                  "flex items-start gap-3 rounded-md px-2 py-2.5 transition-colors duration-700",
                  fresh.includes(e.id) ? "bg-amber-50" : "bg-transparent",
                )}
              >
                <Avatar name={d.who} seed={e.avatarSeed ? String(e.avatarSeed) : undefined} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] leading-snug text-stone-800">
                    <span className="font-medium text-stone-900">{d.who}</span> {d.what}
                  </div>
                  {d.detail ? <div className="mt-0.5 truncate text-[12px] text-stone-500">{d.detail}</div> : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <SourceTag isDemo={Boolean(e.isDemo)} />
                  <span className="text-[11px] tabular-nums text-stone-400">{timeAgo(e.createdAt)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
