import React, { useMemo, useState } from "react";
import { BadgeCheck, ExternalLink, Info, TriangleAlert } from "lucide-react";
import { Card, Pill, SectionTitle, cx } from "../ui";
import { formatDay, type Fact } from "./strat-shared";

const KINDS: Array<{ id: string; label: string }> = [
  { id: "market", label: "Market" },
  { id: "subsidy", label: "Subsidy" },
  { id: "platform", label: "Platform" },
  { id: "competitor", label: "Competitor" },
  { id: "regulation", label: "Regulation" },
];

const kindLabel = (id: string) => KINDS.find((k) => k.id === id)?.label ?? id;

export function ConfidencePill({ confidence }: { confidence: Fact["confidence"] }) {
  if (confidence === "official") {
    return (
      <Pill tone="good">
        <BadgeCheck className="h-3 w-3" aria-hidden />
        Official source
      </Pill>
    );
  }
  if (confidence === "secondary") {
    return (
      <Pill tone="info">
        <Info className="h-3 w-3" aria-hidden />
        Secondary source
      </Pill>
    );
  }
  return (
    <Pill tone="warn" title="Visible to HQ for planning. The compliance checker never accepts it as a source.">
      <TriangleAlert className="h-3 w-3" aria-hidden />
      Needs verification — HQ only
    </Pill>
  );
}

export default function StratFacts({ facts }: { facts: Fact[] }) {
  const [kind, setKind] = useState<string>("all");
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const f of facts) c[f.kind] = (c[f.kind] ?? 0) + 1;
    return c;
  }, [facts]);
  const chips = [{ id: "all", label: "All", n: facts.length }, ...KINDS.filter((k) => counts[k.id]).map((k) => ({ ...k, n: counts[k.id] }))];
  const shown = kind === "all" ? facts : facts.filter((f) => f.kind === kind);

  return (
    <section>
      <SectionTitle
        title="Market facts"
        hint="Reps can only quote statistics from this list, and only in context (the compliance checker matches each number to its source). Unverified facts are visible to HQ but never quotable."
      />

      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter facts by kind">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={kind === c.id}
            onClick={() => setKind(c.id)}
            className={cx(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px]",
              kind === c.id ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-700 hover:bg-stone-100",
            )}
          >
            {c.label}
            <span className={cx("tabular-nums", kind === c.id ? "text-stone-300" : "text-stone-400")}>{c.n}</span>
          </button>
        ))}
      </div>

      <Card pad={false} className="min-w-0 overflow-hidden">
        <div className="hidden grid-cols-[minmax(0,1fr)_110px_220px_220px] gap-5 border-b border-stone-200 bg-stone-50 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-stone-500 xl:grid">
          <div>Statement</div>
          <div>Kind</div>
          <div>Confidence</div>
          <div>Source</div>
        </div>
        {shown.length ? (
          <ul className="divide-y divide-stone-100">
            {shown.map((f) => {
              const published = formatDay(f.publishedOn);
              return (
                <li key={f.id} className="grid gap-2.5 px-4 py-3.5 xl:grid-cols-[minmax(0,1fr)_110px_220px_220px] xl:gap-5">
                  <div className="min-w-0">
                    <p className="text-[13.5px] leading-relaxed text-stone-800">{f.statementEn}</p>
                    <p lang="zh-Hant" className="mt-1 text-[12.5px] leading-relaxed text-stone-500">{f.statementZh}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 xl:contents">
                    <div className="text-[12px] text-stone-700 xl:pt-0.5">
                      {kindLabel(f.kind)}
                      <span className="text-stone-400"> · {f.market}</span>
                    </div>
                    <div className="xl:pt-0.5">
                      <ConfidencePill confidence={f.confidence} />
                    </div>
                    <div className="min-w-0 text-[12px] xl:pt-0.5">
                      {f.sourceUrl ? (
                        <a
                          href={f.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={f.sourceUrl}
                          className="break-words text-stone-700 underline-offset-2 hover:text-stone-900 hover:underline"
                        >
                          {f.sourceName}
                          <ExternalLink className="ml-1 inline-block h-3 w-3 align-[-1px] text-stone-500" aria-hidden />
                        </a>
                      ) : (
                        <span className="text-stone-700">{f.sourceName}</span>
                      )}
                      <div className="mt-0.5 text-[11.5px] text-stone-500">{published ? `Published ${published}` : "Publication date not stated"}</div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-4 py-6 text-[13px] text-stone-500">No facts of this kind yet.</p>
        )}
      </Card>
    </section>
  );
}
