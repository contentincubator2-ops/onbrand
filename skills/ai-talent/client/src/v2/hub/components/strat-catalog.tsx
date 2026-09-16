import React, { useState } from "react";
import { ChevronDown, History, Star } from "lucide-react";
import { Card, Pill, SectionTitle, cx } from "../ui";
import { ExtLink, FieldLabel, categoryLabel, formatDay, priceLabel, type Solution } from "./strat-shared";

function SolutionCard({ s }: { s: Solution }) {
  const [open, setOpen] = useState(false);
  const listedOn = s.prices.map((p) => p.effectiveFrom).filter(Boolean).sort()[0];
  const listed = formatDay(listedOn);
  const panelId = `sol-features-${s.id}`;

  return (
    <Card className="flex min-w-0 flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold leading-snug text-stone-900">{s.nameEn}</h3>
          <div lang="zh-Hant" className="mt-0.5 text-[13px] text-stone-500">{s.nameZh}</div>
        </div>
        {s.featured ? (
          <Pill tone="neutral" title="Featured by marketing">
            <Star className="h-3 w-3" aria-hidden />
            Featured
          </Pill>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-stone-600">
        <span>{s.vendor}</span>
        <span className="text-stone-300" aria-hidden>·</span>
        <span>{categoryLabel(s.category)}</span>
      </div>

      {s.summaryEn ? <p className="mt-3 line-clamp-3 text-[13px] leading-relaxed text-stone-600">{s.summaryEn}</p> : null}

      <div className="mt-4">
        <FieldLabel>Approved prices</FieldLabel>
        {s.prices.length ? (
          <ul className="mt-1.5 divide-y divide-stone-100 rounded-lg border border-stone-200">
            {s.prices.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-[13px] text-stone-800">{p.planEn}</div>
                  <div lang="zh-Hant" className="text-[11.5px] text-stone-500">{p.planZh}</div>
                </div>
                <div className="text-[13px] font-semibold tabular-nums text-stone-900">{priceLabel(p)}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-[13px] text-stone-500">No active price — reps can't quote one.</p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-stone-500">
        {listed ? <span>Listed {listed}</span> : null}
        {s.sourceUrl ? <ExtLink href={s.sourceUrl}>Source</ExtLink> : null}
      </div>

      {s.features.length ? (
        <div className="mt-3 border-t border-stone-100 pt-2">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
            className="-mx-1 inline-flex items-center gap-1 rounded px-1 py-1 text-[12px] font-medium text-stone-700 hover:bg-stone-100"
          >
            <ChevronDown className={cx("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden />
            {open ? "Hide features" : `Features (${s.features.length})`}
          </button>
          {open ? (
            <ul id={panelId} className="mt-1.5 space-y-1.5">
              {s.features.map((f, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-[8px] h-1 w-1 shrink-0 rounded-full bg-stone-400" aria-hidden />
                  <div className="min-w-0">
                    <div className="text-[13px] text-stone-800">{f.en}</div>
                    <div lang="zh-Hant" className="text-[12px] text-stone-500">{f.zh}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

export default function StratCatalog({ solutions }: { solutions: Solution[] }) {
  return (
    <section>
      <SectionTitle
        title="Solution catalog"
        hint={`${solutions.length} solutions with the prices marketing has approved. Reps quote from this list or not at all.`}
      />
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-[12.5px] text-stone-600">
        <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-500" aria-hidden />
        <span>Prices are versioned. When marketing changes a price, posts quoting the old one are flagged.</span>
      </div>
      {solutions.length ? (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {solutions.map((s) => (
            <SolutionCard key={s.id} s={s} />
          ))}
        </div>
      ) : (
        <Card>
          <p className="text-[13px] text-stone-500">No solutions in the catalog yet.</p>
        </Card>
      )}
    </section>
  );
}
