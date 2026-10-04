import React, { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Circle, Clock, Eye, Hand, Link2, Lock, MessageCircle, PenLine, Scale, Send, UserCheck } from "lucide-react";
import { trpc } from "../../../lib/trpc";
import { Card, RepPhoto, DemoTag, ErrorNote, Loading, PageHeader, Pill, SectionTitle, cx, fmt } from "../ui";
import { LiveTag } from "../components/ov-LiveTag";
import InviteModal from "../components/reps-InviteModal";
import HermesTokens, { type RepRow } from "../components/reps-HermesTokens";
import RepPhotoGrid from "../components/reps-PhotoGrid";

const th = "px-2.5 py-2 font-medium whitespace-nowrap";
const td = "px-2.5 py-2.5 align-middle";

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] text-stone-400">{children}</span>;
}

function StatusCell({ main, note }: { main: React.ReactNode; note?: string }) {
  return (
    <div className="flex flex-col items-start gap-0.5">
      {main}
      {note ? <span className="max-w-[104px] text-[11px] leading-tight text-stone-500">{note}</span> : null}
    </div>
  );
}

function LinkedInStatus({ status }: { status: string }) {
  if (status === "connected")
    return <StatusCell main={<Pill tone="good"><Check className="h-3 w-3" aria-hidden />Connected</Pill>} note="Verified analytics" />;
  if (status === "pending")
    return <StatusCell main={<Pill tone="warn"><Clock className="h-3 w-3" aria-hidden />Pending</Pill>} note="Awaiting approval" />;
  return <Muted><Circle className="h-3 w-3" aria-hidden />Not connected</Muted>;
}

function InstagramStatus({ status }: { status: string }) {
  if (status === "connected")
    return <StatusCell main={<Pill tone="good"><Check className="h-3 w-3" aria-hidden />Connected</Pill>} note="Verified insights" />;
  return <StatusCell main={<Muted><Circle className="h-3 w-3" aria-hidden />Not connected</Muted>} note="Creator account required" />;
}

function FacebookStatus({ status }: { status: string }) {
  if (status === "self_report")
    return <StatusCell main={<Pill tone="neutral"><PenLine className="h-3 w-3" aria-hidden />Self-report</Pill>} note="No public API" />;
  return <Muted><Circle className="h-3 w-3" aria-hidden />Not used</Muted>;
}

const PRIVACY: Array<{ icon: React.ComponentType<{ className?: string }>; title: string; body: string }> = [
  { icon: UserCheck, title: "Why consent", body: "Personal accounts belong to the employee, not the company, so nothing is connected without their opt-in." },
  { icon: Scale, title: "Only what's needed", body: "Built around Taiwan's PDPA and US privacy norms: we collect only what's needed to attribute a post." },
  { icon: Hand, title: "Voluntary", body: "Participation is voluntary — reps opt in account by account." },
  { icon: Eye, title: "Same view as HQ", body: "Each rep sees exactly what HQ sees about them." },
  { icon: Lock, title: "No lead mining", body: "LinkedIn member data isn't used for lead generation." },
];

export default function HubRepsPage() {
  const utils = trpc.useUtils();
  const reps = trpc.hub.admin.reps.useQuery(undefined, { refetchInterval: 10000 });
  const [invite, setInvite] = useState<{ repName: string; code: string } | null>(null);
  const bind = trpc.hub.admin.issueBindCode.useMutation({
    onSuccess: () => void utils.hub.admin.reps.invalidate(),
  });
  const closeInvite = useCallback(() => setInvite(null), []);

  const rows: RepRow[] = reps.data ?? [];
  const total = rows.length;
  const count = (pred: (r: RepRow) => boolean) => rows.filter(pred).length;
  const summary = [
    { icon: UserCheck, n: count((r) => r.consented), label: "consented" },
    { icon: MessageCircle, n: count((r) => r.lineBound), label: "LINE connected" },
    { icon: Link2, n: count((r) => r.linkedin === "connected"), label: "LinkedIn connected" },
    { icon: Link2, n: count((r) => r.instagram === "connected"), label: "Instagram connected" },
  ];

  function onInvite(r: RepRow) {
    bind.mutate({ repId: Number(r.id) }, { onSuccess: (d) => setInvite({ repName: String(r.name), code: d.code }) });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Sales reps"
        title="Opt-in, consent-first. Reps see their own numbers."
        subtitle="Invite reps to the LINE bot and see which accounts they've chosen to connect — and what grade of data each connection gives you."
      />

      <ErrorNote error={reps.error ?? bind.error} />

      {reps.isLoading ? (
        <Loading label="Loading reps…" />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {summary.map((s) => (
              <Pill key={s.label}>
                <s.icon className="h-3 w-3" aria-hidden />
                <span className="font-semibold tabular-nums text-stone-900">{fmt(s.n)}</span>
                <span className="tabular-nums">of {fmt(total)}</span> {s.label}
              </Pill>
            ))}
          </div>

          <section>
            <SectionTitle
              title="Team"
              hint="Open a rep to see their profile, how their AI writes for them, and their brand-brain access QR."
            />
            <RepPhotoGrid reps={rows} />
          </section>

          <Card pad={false} className="min-w-0">
            <div className="px-5 pt-5">
              <SectionTitle title="Connections" hint="Connections are the rep's choice. Posts and clicks cover the last 21 days." />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-[13px]">
                <thead className="border-y border-stone-200 bg-stone-50 text-[12px] text-stone-500">
                  <tr>
                    <th className={cx(th, "pl-5")}>Rep</th>
                    <th className={th}>Team</th>
                    <th className={th}>Market</th>
                    <th className={th}>Consent</th>
                    <th className={th}>LINE</th>
                    <th className={th}>LinkedIn</th>
                    <th className={th}>Instagram</th>
                    <th className={th}>Facebook</th>
                    <th className={cx(th, "text-right")}>Posts</th>
                    <th className={cx(th, "pr-5 text-right")}>Clicks</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const pending = bind.isPending && bind.variables?.repId === r.id;
                    return (
                      <tr key={r.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50/60">
                        <td className={cx(td, "pl-5")}>
                          <div className="flex items-center gap-2.5">
                            <RepPhoto name={String(r.name)} seed={r.avatarSeed ? String(r.avatarSeed) : undefined} photoUrl={r.photoUrl} size={30} />
                            <div className="min-w-0">
                              <Link
                                to={`/hub/reps/${r.id}`}
                                className="whitespace-nowrap font-medium text-stone-900 hover:text-orange-700 hover:underline"
                                title={String(r.title ?? "")}
                              >
                                {r.name}
                              </Link>
                              {r.isDemo ? <div className="mt-0.5"><DemoTag /></div> : null}
                            </div>
                          </div>
                        </td>
                        <td className={cx(td, "whitespace-nowrap")}>
                          {String(r.team ?? "")
                            .split(" · ")
                            .map((part, i) => (
                              <div key={i} className={i === 0 ? "text-stone-700" : "text-[12px] text-stone-500"}>
                                {part}
                              </div>
                            ))}
                        </td>
                        <td className={td}>
                          <span className="rounded border border-stone-200 px-1.5 py-0.5 text-[11px] font-medium text-stone-600">{r.market}</span>
                        </td>
                        <td className={td}>
                          {r.consented ? (
                            <Pill tone="good"><Check className="h-3 w-3" aria-hidden />Consented</Pill>
                          ) : (
                            <Muted><Circle className="h-3 w-3" aria-hidden />Not yet</Muted>
                          )}
                        </td>
                        <td className={td}>
                          {r.lineBound ? (
                            <Pill tone="good"><Check className="h-3 w-3" aria-hidden />Connected</Pill>
                          ) : (
                            <div className="flex flex-col items-start gap-0.5">
                              <button
                                type="button"
                                onClick={() => onInvite(r)}
                                disabled={bind.isPending}
                                className={cx(
                                  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-stone-300 bg-white px-2.5 py-1 text-[12px] font-medium text-stone-800 hover:bg-stone-50",
                                  bind.isPending && "cursor-not-allowed opacity-60",
                                )}
                              >
                                <Send className="h-3.5 w-3.5" aria-hidden />
                                {pending ? "Issuing…" : "Invite to LINE bot"}
                              </button>
                              {r.bindCode ? (
                                <span className="whitespace-nowrap text-[11px] text-stone-500">
                                  Pending code: <span className="font-mono text-stone-700">{r.bindCode}</span>
                                </span>
                              ) : null}
                            </div>
                          )}
                        </td>
                        <td className={td}><LinkedInStatus status={String(r.linkedin)} /></td>
                        <td className={td}><InstagramStatus status={String(r.instagram)} /></td>
                        <td className={td}><FacebookStatus status={String(r.facebook)} /></td>
                        <td className={cx(td, "text-right tabular-nums text-stone-900")}>{fmt(r.posts)}</td>
                        <td className={cx(td, "pr-5 text-right tabular-nums text-stone-900")}>
                          <div className="flex flex-col items-end gap-1">
                            {fmt(r.clicks)}
                            {r.liveClicks > 0 ? <LiveTag count={r.liveClicks} title="Clicks from real visitors" /> : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <SectionTitle title="Privacy, by design" hint="What we tell every rep before they opt in." />
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PRIVACY.map((p) => (
                <li key={p.title} className="flex min-w-0 items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-stone-100 text-stone-600">
                    <p.icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-stone-900">{p.title}</div>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-stone-500">{p.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <HermesTokens reps={rows} />
        </>
      )}

      {invite ? <InviteModal repName={invite.repName} code={invite.code} onClose={closeInvite} /> : null}
    </div>
  );
}
