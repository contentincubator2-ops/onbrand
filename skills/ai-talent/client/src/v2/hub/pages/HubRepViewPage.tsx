import React, { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { trpc } from "../../../lib/trpc";
import { Avatar, Card, ErrorNote, Loading, PageHeader, SectionTitle, cx } from "../ui";
import PhoneSimulator, { type PhoneSimulatorHandle } from "../components/sim-PhoneSimulator";
import { MENU_ITEMS } from "../components/sim-RichMenu";
import Architecture from "../components/sim-Architecture";

/** Booth reps shown as chips, in this order: one TW (zh-TW bot), one US (English bot). */
const PINNED_SEEDS = ["amy", "priya"];

const BOOTH_FLOWS: Array<{ title: string; steps: string[]; run: (sim: PhoneSimulatorHandle) => Promise<void> }> = [
  {
    title: "Write a post",
    steps: ["Tap Write a post", "Pick Zynkr", "Tap LinkedIn"],
    run: (sim) => sim.tapMenu("write"),
  },
  {
    title: "Ask AI",
    steps: ["Tap Ask AI", "Ask “Give me 3 LinkedIn hooks about AI for small businesses”"],
    run: async (sim) => {
      await sim.tapMenu("ask");
      await sim.say("Give me 3 LinkedIn hooks about AI for small businesses");
    },
  },
  {
    title: "My results",
    steps: ["Tap My results", "Posts, clicks, verified impressions, team rank"],
    run: (sim) => sim.tapMenu("stats"),
  },
];

export default function HubRepViewPage() {
  const reps = trpc.hub.admin.reps.useQuery();
  const integrations = trpc.hub.admin.integrations.useQuery();
  const [repId, setRepId] = useState<number | null>(null);
  const simRef = useRef<PhoneSimulatorHandle>(null);
  const phoneRef = useRef<HTMLDivElement>(null);

  const list = reps.data ?? [];
  const pinned = PINNED_SEEDS.map((seed) => list.find((r) => r.avatarSeed === seed)).filter((r): r is (typeof list)[number] => Boolean(r));
  const others = list.filter((r) => !pinned.some((p) => p.id === r.id));

  useEffect(() => {
    if (repId == null && list.length) setRepId((pinned[0] ?? list[0]).id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reps.data]);

  const rep = list.find((r) => r.id === repId) ?? null;

  const runFlow = (flow: (typeof BOOTH_FLOWS)[number]) => {
    const el = phoneRef.current;
    if (el) {
      const box = el.getBoundingClientRect();
      if (box.top < 0 || box.bottom > window.innerHeight) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (simRef.current) void flow.run(simRef.current);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Rep's LINE bot"
        title="Every rep gets a personal AI marketing team — in the chat app they already use"
        subtitle="One company bot, six buttons. Everything below runs the same code as the live LINE bot."
      />

      <div className="grid gap-6 xl:grid-cols-[390px_minmax(0,1fr)] xl:items-start">
        {/* phone */}
        <div ref={phoneRef} className="min-w-0 scroll-mt-24 xl:sticky xl:top-[81px]">
          {reps.isLoading ? <Loading label="Loading reps…" /> : null}
          <ErrorNote error={reps.error} />
          {list.length ? (
            <div className="mb-3">
              <div className="flex flex-wrap items-center gap-2">
                {pinned.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRepId(r.id)}
                    aria-pressed={r.id === repId}
                    className={cx(
                      "flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-[13px]",
                      r.id === repId ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-800 hover:bg-stone-100",
                    )}
                  >
                    <Avatar name={r.name} seed={r.avatarSeed} size={24} />
                    <span className="font-medium">{r.name.match(/[A-Za-z][A-Za-z'-]+/)?.[0] ?? r.name}</span>
                    <span className={cx("text-[11px]", r.id === repId ? "text-stone-300" : "text-stone-500")}>{r.market}</span>
                  </button>
                ))}
                {others.length ? (
                  <select
                    value={others.some((o) => o.id === repId) ? String(repId) : ""}
                    onChange={(e) => e.target.value && setRepId(Number(e.target.value))}
                    aria-label="Other reps"
                    className="h-[34px] min-w-0 max-w-full rounded-full border border-stone-200 bg-white px-3 text-[13px] text-stone-700"
                  >
                    <option value="" disabled>
                      Other reps…
                    </option>
                    {others.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name} · {o.market}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
              {rep ? (
                <div className="mt-1.5 text-[12px] text-stone-500">
                  Chatting as <span className="font-medium text-stone-700">{rep.name}</span> · {rep.title} · bot replies in {rep.market === "US" ? "English" : "Traditional Chinese (zh-TW)"}
                </div>
              ) : null}
            </div>
          ) : null}
          {rep ? <PhoneSimulator key={rep.id} ref={simRef} rep={rep} /> : null}
        </div>

        {/* info */}
        <div className="min-w-0 space-y-4">
          <Card>
            <SectionTitle title="What each button does" hint="The rich menu is the same for every rep; replies follow the rep's market." />
            <ul className="divide-y divide-stone-100">
              {MENU_ITEMS.map((m) => (
                <li key={m.action} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-stone-100">
                    <m.icon className="h-4 w-4 text-stone-700" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-stone-900">
                      {m.en} <span className="font-normal text-stone-500">· {m.zh}</span>
                    </div>
                    <div className="text-[13px] text-stone-600">{m.description}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <SectionTitle title="Try this at the booth" hint="Each flow starts in the phone; generation takes about 8–25 seconds." />
            <ol className="space-y-2">
              {BOOTH_FLOWS.map((flow, idx) => (
                <li key={flow.title} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-stone-900">
                      {idx + 1}. {flow.title}
                    </div>
                    <div className="mt-0.5 text-[12px] text-stone-600">{flow.steps.join(" → ")}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => runFlow(flow)}
                    disabled={!rep}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-[12px] font-medium text-stone-800 hover:bg-stone-100 disabled:opacity-50"
                  >
                    <Play className="h-3.5 w-3.5" aria-hidden />
                    Start in phone
                  </button>
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <SectionTitle title="Architecture" hint="What runs behind each tap. Status is live from this server." />
            <ErrorNote error={integrations.error} />
            <Architecture integrations={integrations.data ?? null} />
          </Card>
        </div>
      </div>
    </div>
  );
}
