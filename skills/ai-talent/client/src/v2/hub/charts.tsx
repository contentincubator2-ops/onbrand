/**
 * Sales Hub charts — plain SVG/HTML, one measure per chart (no dual axes),
 * thin marks, rounded data ends, recessive axes, hover tooltips, and a legend
 * whenever there is more than one series. Grade colors come from GRADE.
 */
import React, { useState } from "react";
import { GRADE, GradeSwatch, fmt, type GradeKey } from "./ui";

/** "2026-09-14" parsed as a local calendar day (new Date() would read it as UTC midnight). */
const localDay = (ymd: string) => new Date(`${ymd}T00:00:00`);

export function DailyBars({
  data,
  label,
  color = "#2a78d6",
  height = 120,
}: {
  data: Array<{ date: string; value: number }>;
  label: string;
  color?: string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((a, d) => a + d.value, 0);
  const h = hover != null ? data[hover] : null;
  return (
    <figure className="min-w-0">
      <figcaption className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium text-stone-600">{label}</span>
        <span className="text-[12px] tabular-nums text-stone-500">
          {h ? `${localDay(h.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}: ${fmt(h.value)}` : `${fmt(total)} total`}
        </span>
      </figcaption>
      <div className="relative flex items-end gap-[2px] border-b border-stone-200" style={{ height }} onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => (
          <div
            key={d.date}
            className="flex h-full flex-1 cursor-default items-end"
            onMouseEnter={() => setHover(i)}
            role="img"
            aria-label={`${d.date}: ${d.value}`}
          >
            <div
              className="w-full rounded-t-[4px]"
              style={{
                height: `${d.value === 0 ? 0 : Math.max(2, (d.value / max) * 100)}%`,
                background: color,
                opacity: hover == null || hover === i ? 1 : 0.45,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-stone-400">
        <span>{data[0] ? localDay(data[0].date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</span>
        <span>Today</span>
      </div>
    </figure>
  );
}

export function GradeLegend({ grades }: { grades: GradeKey[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {grades.map((g) => (
        <span key={g} className="inline-flex items-center gap-1.5 text-[12px] text-stone-600" title={GRADE[g].hint}>
          <GradeSwatch grade={g} /> {GRADE[g].label}
        </span>
      ))}
    </div>
  );
}

/** Horizontal stacked bars: one row per channel, segments by data grade. */
export function GradeStack({
  rows,
  grades,
}: {
  rows: Array<{ label: string; parts: Partial<Record<GradeKey, number>> }>;
  grades: GradeKey[];
}) {
  const [tip, setTip] = useState<string | null>(null);
  const max = Math.max(1, ...rows.map((r) => grades.reduce((a, g) => a + (r.parts[g] ?? 0), 0)));
  return (
    <div className="space-y-3">
      <GradeLegend grades={grades} />
      <div className="space-y-2.5">
        {rows.map((r) => {
          const total = grades.reduce((a, g) => a + (r.parts[g] ?? 0), 0);
          const present = grades.filter((g) => (r.parts[g] ?? 0) > 0);
          return (
            <div key={r.label} className="grid grid-cols-[88px_1fr_72px] items-center gap-3">
              <div className="truncate text-[13px] text-stone-700">{r.label}</div>
              <div className="flex h-3.5 gap-[2px]" style={{ width: `${Math.max(2, (total / max) * 100)}%` }} onMouseLeave={() => setTip(null)}>
                {present.map((g, i) => (
                  <div
                    key={g}
                    className="h-full"
                    style={{
                      width: `${((r.parts[g] ?? 0) / total) * 100}%`,
                      background: GRADE[g].color,
                      borderTopRightRadius: i === present.length - 1 ? 4 : 0,
                      borderBottomRightRadius: i === present.length - 1 ? 4 : 0,
                    }}
                    onMouseEnter={() => setTip(`${r.label} · ${GRADE[g].label}: ${fmt(r.parts[g])}`)}
                  />
                ))}
              </div>
              <div className="text-right text-[12px] tabular-nums text-stone-600">{fmt(total)}</div>
            </div>
          );
        })}
      </div>
      <div className="h-4 text-[12px] text-stone-600" aria-live="polite">{tip}</div>
    </div>
  );
}
