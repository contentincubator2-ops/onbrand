/**
 * /scan/:code — where a booth visitor lands after scanning a rep's QR
 * (/r/:code logs the click, then redirects here). Public: plain fetch, no tRPC.
 */
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, Circle, Info } from "lucide-react";
import { Avatar } from "../ui";

interface ScanCard {
  found: boolean;
  disclaimer?: string;
  landingUrl?: string | null;
  repName?: string;
  repTitle?: string | null;
  market?: string;
  avatarSeed?: string | null;
  channel?: string | null;
  solutionEn?: string | null;
  solutionZh?: string | null;
  solutionUrl?: string | null;
  clicks?: number;
  repLiveClicks?: number;
}

const STEPS = [
  "Rep shares a post written & policy-checked by their AI team.",
  "Every post carries the rep's own tracked link.",
  "HQ sees posts, clicks, verified reach and leads — per rep.",
];

export default function ScanPage() {
  const { code = "" } = useParams<{ code: string }>();
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "done"; card: ScanCard }>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetch(`/api/hub/scan/${encodeURIComponent(code.slice(0, 12))}`, { credentials: "omit" })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as ScanCard | null;
        if (!body) throw new Error(`Lookup failed (${res.status})`);
        if (!cancelled) setState({ status: "done", card: body });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: "error", message: String(err?.message ?? err) });
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const card = state.status === "done" ? state.card : null;

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-md items-center gap-2.5 px-4 py-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-stone-900 text-[11px] font-bold text-white" aria-hidden>
            EH
          </div>
          <div className="text-[14px] font-semibold">ExpertHub · Sales Hub</div>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-4 py-6">
        {state.status === "loading" ? (
          <div className="flex items-center gap-2 py-10 text-[14px] text-stone-500" role="status">
            <Circle className="h-3 w-3 animate-pulse" aria-hidden /> Loading…
          </div>
        ) : null}

        {state.status === "error" ? (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-[14px] text-red-800" role="alert">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>Couldn't load this link. {state.message}</span>
          </div>
        ) : null}

        {card && !card.found ? (
          <section className="rounded-xl border border-stone-200 bg-white p-5 text-center">
            <Info className="mx-auto h-6 w-6 text-stone-400" aria-hidden />
            <h1 className="mt-2 text-[20px] font-semibold">This link has expired.</h1>
            <p className="mt-1 text-[14px] text-stone-600">Ask the rep for a fresh link, or visit the booth.</p>
          </section>
        ) : null}

        {card?.found ? (
          <>
            <section className="rounded-xl border border-stone-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-7 w-7 shrink-0 text-emerald-600" aria-hidden />
                <h1 className="text-[22px] font-semibold leading-tight">Thanks for scanning!</h1>
              </div>
              <div className="mt-4 flex items-start gap-3">
                <Avatar name={card.repName ?? "?"} seed={card.avatarSeed ?? undefined} size={44} />
                <div className="min-w-0">
                  <p className="text-[15px] leading-relaxed text-stone-800">
                    This visit was just attributed to <strong className="font-semibold text-stone-900">{card.repName}</strong>'s tracked link. HQ's
                    dashboard updated in real time.
                  </p>
                  {card.repTitle ? <p className="mt-1 text-[12px] text-stone-500">{card.repTitle}</p> : null}
                </div>
              </div>
              <div className="mt-4 flex items-baseline justify-between gap-3 rounded-lg bg-stone-50 px-4 py-3">
                <span className="text-[13px] text-stone-600">Visits on this link</span>
                <span className="text-[28px] font-semibold tabular-nums leading-none">{(card.clicks ?? 0).toLocaleString("en-US")}</span>
              </div>
            </section>

            <section className="rounded-xl border border-stone-200 bg-white p-5">
              <h2 className="text-[15px] font-semibold">How it works</h2>
              <ol className="mt-3 space-y-3">
                {STEPS.map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-900 text-[12px] font-semibold text-white">
                      {i + 1}
                    </span>
                    <span className="pt-0.5 text-[14px] leading-snug text-stone-700">{step}</span>
                  </li>
                ))}
              </ol>
            </section>

            {card.landingUrl ? (
              <section className="space-y-2">
                <a
                  href={card.landingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-stone-900 px-4 py-3.5 text-center text-[15px] font-medium text-white hover:bg-stone-700"
                >
                  In production this opens ExpertHub's free diagnosis
                  <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                </a>
                {card.solutionEn ? (
                  <p className="text-center text-[13px] text-stone-500">
                    The post you came from features <span className="font-medium text-stone-700">{card.solutionEn}</span>.
                  </p>
                ) : null}
              </section>
            ) : card.solutionEn ? (
              <p className="text-center text-[13px] text-stone-500">
                The post you came from features <span className="font-medium text-stone-700">{card.solutionEn}</span>.
              </p>
            ) : null}
          </>
        ) : null}
      </main>

      <footer className="mx-auto max-w-md space-y-1 px-4 pb-8 text-center text-[11px] leading-relaxed text-stone-400">
        {card?.disclaimer ? <p>{card.disclaimer}</p> : null}
        <p>
          Powered by <span className="font-semibold text-stone-600">OnBrand</span>
        </p>
      </footer>
    </div>
  );
}
