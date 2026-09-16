import React from "react";
import { Card, cx } from "../ui";
import { ExtLink, FieldLabel, type Lang, type Localized, type Positioning } from "./strat-shared";

/** "Diagnose — a short online diagnosis…" → ["Diagnose", "a short online diagnosis…"]. */
function splitStep(text: string): [string, string | null] {
  const m = /^(.+?)\s*(?:——|—|–)\s*(.+)$/.exec(text);
  return m ? [m[1], m[2]] : [text, null];
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function PositioningToggle({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  return (
    <div className="inline-flex rounded-md border border-stone-200 bg-white p-0.5 text-[12px]" role="group" aria-label="Positioning language">
      {(["en", "zh"] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          onClick={() => onChange(l)}
          className={cx("rounded px-2.5 py-1", lang === l ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100")}
        >
          {l === "en" ? "EN" : "中文"}
        </button>
      ))}
    </div>
  );
}

export default function StratPositioning({ positioning, lang }: { positioning: Positioning; lang: Lang }) {
  const t = (v: Localized | undefined) => (v ? v[lang] || v.en : "");
  const pains = positioning.pains ?? [];
  const steps = positioning.howItWorks ?? [];
  const pillars = positioning.pillars ?? [];
  const proof = positioning.proofPoints ?? [];

  return (
    <Card className="min-w-0" pad={false}>
      <div lang={lang === "zh" ? "zh-Hant" : "en"} className="space-y-6 p-5 sm:p-6">
        <div>
          <FieldLabel>Positioning</FieldLabel>
          <p className="mt-2 text-[20px] font-semibold leading-snug text-stone-900 sm:text-[23px]">{t(positioning.oneLiner)}</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <FieldLabel>Audience</FieldLabel>
            <p className="mt-1.5 text-[14px] leading-relaxed text-stone-700">{t(positioning.audience)}</p>
          </div>
          {pains.length ? (
            <div>
              <FieldLabel>Pains we solve</FieldLabel>
              <ul className="mt-1.5 space-y-1">
                {pains.map((p, i) => (
                  <li key={i} className="flex gap-2 text-[14px] leading-relaxed text-stone-700">
                    <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-stone-400" aria-hidden />
                    <span>{t(p)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {steps.length ? (
          <div>
            <FieldLabel>How it works</FieldLabel>
            <ol className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((s, i) => {
                const [head, body] = splitStep(t(s));
                return (
                  <li key={i} className="flex gap-3 rounded-lg border border-stone-200 p-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-900 text-[12px] font-semibold tabular-nums text-white">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-stone-900">{head}</div>
                      {body ? <div className="mt-0.5 text-[12.5px] leading-snug text-stone-600">{body}</div> : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}

        {pillars.length ? (
          <div>
            <FieldLabel>Message pillars</FieldLabel>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              {pillars.map((p, i) => (
                <div key={i} className="rounded-lg bg-stone-100/70 px-3 py-2.5 text-[13px] font-medium leading-snug text-stone-800">
                  {t(p)}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-6 border-t border-stone-100 pt-5 md:grid-cols-2">
          <div>
            <FieldLabel>Voice</FieldLabel>
            <p className="mt-1.5 text-[14px] leading-relaxed text-stone-700">{t(positioning.voice)}</p>
          </div>
          {proof.length ? (
            <div>
              <FieldLabel>Proof points</FieldLabel>
              <ul className="mt-1.5 space-y-1.5">
                {proof.map((p, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-[14px] leading-relaxed text-stone-700">
                    <span>{t(p)}</span>
                    {p.source ? (
                      <ExtLink href={p.source} label={`Source: ${hostOf(p.source)}`} className="text-[12px]">
                        <span className="sr-only">Source</span>
                      </ExtLink>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
