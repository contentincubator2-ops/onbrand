import React, { useEffect, useRef, useState } from "react";
import { MousePointerClick } from "lucide-react";
import { trpc } from "../../../lib/trpc";
import { Card, ErrorNote, Loading, SectionTitle, cx, fmt } from "../ui";

/** Booth moment: a visitor scans a rep's QR and the click lands on the dashboard. */
export default function BoothQrCard() {
  const reps = trpc.hub.admin.reps.useQuery();
  const [picked, setPicked] = useState<number | null>(null);
  const list = reps.data ?? [];
  const repId: number | null = picked ?? list.find((r) => r.avatarSeed === "amy")?.id ?? list[0]?.id ?? null;

  const link = trpc.hub.admin.boothLink.useQuery(
    { repId: repId ?? 0 },
    { enabled: repId != null, refetchInterval: 3000 },
  );

  // Briefly highlight the counter when a new click arrives.
  const prev = useRef<{ repId: number | null; clicks: number } | null>(null);
  const [bumped, setBumped] = useState(false);
  const clicks = link.data?.clicks;
  useEffect(() => {
    if (clicks == null) return;
    const p = prev.current;
    prev.current = { repId, clicks };
    if (p && p.repId === repId && clicks > p.clicks) {
      setBumped(true);
      const t = window.setTimeout(() => setBumped(false), 3000);
      return () => window.clearTimeout(t);
    }
    setBumped(false);
    return undefined;
  }, [clicks, repId]);

  return (
    <Card className="flex flex-col">
      <SectionTitle title="Booth: scan to see attribution live" hint="Every rep gets a tracked link. Try one." />

      <label className="mb-3 block">
        <span className="mb-1 block text-[12px] font-medium text-stone-500">Rep</span>
        <select
          className="w-full rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-[13px] text-stone-800 focus:border-stone-400 focus:outline-none"
          value={repId ?? ""}
          onChange={(e) => setPicked(Number(e.target.value))}
          disabled={!list.length}
        >
          {list.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} · {r.market}
            </option>
          ))}
        </select>
      </label>

      <ErrorNote error={reps.error ?? link.error} />
      {reps.isLoading || (repId != null && link.isLoading) ? (
        <Loading label="Preparing booth link…" />
      ) : link.data ? (
        <div className="flex flex-col items-center">
          <div className="rounded-lg border border-stone-200 bg-white p-2">
            <img
              src={link.data.qrPath}
              width={168}
              height={168}
              className="block h-[168px] w-[168px]"
              alt={`QR code for ${link.data.repName}'s tracked booth link`}
            />
          </div>
          <div className="mt-2 max-w-full break-all text-center font-mono text-[11px] text-stone-500">{link.data.url}</div>

          <div
            className={cx(
              "mt-4 flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors duration-700",
              bumped ? "border-amber-200 bg-amber-50" : "border-stone-200 bg-stone-50",
            )}
            aria-live="polite"
          >
            <span className="inline-flex items-center gap-1.5 text-[13px] text-stone-600">
              <MousePointerClick className="h-4 w-4 text-stone-400" aria-hidden />
              Clicks on this link
            </span>
            <span className="text-[22px] font-semibold tabular-nums leading-none text-stone-900">{fmt(link.data.clicks)}</span>
          </div>
          <p className="mt-3 text-center text-[12px] text-stone-500">Scan with your phone — this dashboard updates in seconds.</p>
        </div>
      ) : null}
    </Card>
  );
}
