import React, { useState } from "react";
import { ArrowRight, ChevronDown, Quote } from "lucide-react";
import { Card, SectionTitle, cx } from "../ui";
import { readablePattern, type Pack } from "./content-types";

function Collapsible({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-stone-100 pt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="-mx-1 inline-flex items-center gap-1 rounded px-1 py-1 text-[12px] font-medium text-stone-700 hover:bg-stone-100"
      >
        <ChevronDown className={cx("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden />
        {label} ({count})
      </button>
      {open ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}

function PackCard({ pack }: { pack: Pack }) {
  const zh = pack.language.startsWith("zh");
  return (
    <Card className="flex min-w-0 flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-7 min-w-[2.25rem] shrink-0 items-center justify-center rounded-md border border-stone-300 px-1.5 text-[12px] font-semibold text-stone-800">
          {pack.market}
        </span>
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold leading-snug text-stone-900">{pack.name}</h3>
          <div className="mt-0.5 text-[12.5px] text-stone-500">{pack.authority}</div>
        </div>
      </div>

      <ol className="divide-y divide-stone-100 rounded-lg border border-stone-200">
        {pack.rules.map((r, i) => (
          <li key={r.id} className="flex gap-2.5 px-3 py-2.5">
            <span className="w-4 shrink-0 pt-px text-right text-[12px] tabular-nums text-stone-400">{i + 1}</span>
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-stone-900">{r.title}</div>
              <div className="mt-0.5 text-[12px] leading-snug text-stone-600">{r.description}</div>
              <div className="mt-0.5 text-[11px] text-stone-400">{r.legalRef}</div>
            </div>
          </li>
        ))}
      </ol>

      <div>
        <div className="text-[11px] font-medium uppercase tracking-wide text-stone-500">Disclosure added when a post has none</div>
        <blockquote
          lang={zh ? "zh-Hant" : "en"}
          className="mt-1.5 flex gap-2 rounded-lg border-l-2 border-stone-400 bg-stone-50 px-3 py-2 text-[13px] text-stone-800"
        >
          <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden />
          <span>{pack.disclosureLine}</span>
        </blockquote>
      </div>

      <div className="space-y-2">
        <Collapsible label="Blocked wording" count={pack.blockedWording.length}>
          <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
            {pack.blockedWording.map((b, i) => (
              <li
                key={i}
                className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-baseline gap-2 px-3 py-1.5 text-[12.5px]"
                title={`Pattern: /${b.pattern}/`}
              >
                <span lang={zh ? "zh-Hant" : "en"} className="min-w-0 break-words text-stone-800">
                  {readablePattern(b.pattern).join(" · ")}
                </span>
                <ArrowRight className="h-3 w-3 self-center text-stone-400" aria-label="becomes" />
                <span lang={zh ? "zh-Hant" : "en"} className="min-w-0 break-words text-stone-600">
                  {b.replacement ? b.replacement : <em className="text-stone-400">removed</em>}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-stone-500">Simplified view of the matching rules. Hover a row to see the exact pattern.</p>
        </Collapsible>
        <Collapsible label="Competitors reps may not name" count={pack.competitorNames.length}>
          <div className="flex flex-wrap gap-1.5">
            {pack.competitorNames.map((n) => (
              <span key={n} className="rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 text-[12px] text-stone-700">
                {n}
              </span>
            ))}
          </div>
        </Collapsible>
      </div>
    </Card>
  );
}

export default function ContentPolicy({ packs }: { packs: Pack[] }) {
  return (
    <section>
      <SectionTitle
        title="Policy packs"
        hint="Each market's rules and the legal basis behind them. The same checks run in every market; the wording and the law change."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {packs.map((p) => (
          <PackCard key={p.id} pack={p} />
        ))}
      </div>
    </section>
  );
}
