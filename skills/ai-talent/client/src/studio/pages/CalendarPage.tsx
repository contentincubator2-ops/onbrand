/**
 * CalendarPage (画面 7) — Content Calendar (month view).
 *
 * Pulls content-type decisions (fb-content, ig-content…) and renders a
 * 7-day grid with audit score + publish/schedule state.
 */

import React, { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import StudioLayout from "../StudioLayout";
import { trpc } from "../../lib/trpc";

function monthGrid(year: number, month: number) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  // WEEK starts MON; getUTCDay() returns 0=Sun..6=Sat → remap so MON=0..SUN=6
  const offset = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: Array<{ d: number | null; key: string }> = [];
  for (let i = 0; i < offset; i++) cells.push({ d: null, key: `pad-${i}` });
  for (let d = 1; d <= daysInMonth; d++) {
    const k = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ d, key: k });
  }
  while (cells.length % 7) cells.push({ d: null, key: `pad2-${cells.length}` });
  return cells;
}

const WEEK = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export default function CalendarPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const q = trpc.calendar.month.useQuery(
    { brandId: Number(brandId), year, month },
    { enabled: !!brandId, refetchOnWindowFocus: false }
  );
  const byDay: Record<string, any[]> = ((q.data as any)?.byDay ?? {}) as any;
  const grid = useMemo(() => monthGrid(year, month), [year, month]);
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(
    today.getMonth() + 1
  ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const prev = () => {
    const d = new Date(Date.UTC(year, month - 2, 1));
    setYear(d.getUTCFullYear());
    setMonth(d.getUTCMonth() + 1);
  };
  const next = () => {
    const d = new Date(Date.UTC(year, month, 1));
    setYear(d.getUTCFullYear());
    setMonth(d.getUTCMonth() + 1);
  };

  const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric" }
  );

  return (
    <StudioLayout
      title="Content Calendar"
      actions={
        <>
          <button onClick={prev} className="px-3 py-2 text-meta uppercase tracking-[0.16em] border border-divider text-foreground hover:border-foreground">
            ←
          </button>
          <button
            onClick={() => {
              setYear(now.getFullYear());
              setMonth(now.getMonth() + 1);
            }}
            className="px-4 py-2 text-meta uppercase tracking-[0.16em] border border-divider text-foreground hover:border-foreground"
          >
            Today
          </button>
          <button onClick={next} className="px-3 py-2 text-meta uppercase tracking-[0.16em] border border-divider text-foreground hover:border-foreground">
            →
          </button>
        </>
      }
    >
      <div className="flex items-center justify-between mb-4">
        <div className="mos-display text-[1.4rem] text-foreground">{monthLabel}</div>
        <div className="text-meta uppercase tracking-[0.16em] text-default-500">
          {Object.keys(byDay).length} days with content
        </div>
      </div>

      {/* Week header */}
      <div className="grid grid-cols-7 gap-px bg-divider border border-divider">
        {WEEK.map((w) => (
          <div
            key={w}
            className="bg-white py-2 text-center text-meta uppercase tracking-[0.18em] text-default-500"
          >
            {w}
          </div>
        ))}

        {grid.map((cell) => {
          const items = cell.d ? byDay[cell.key] ?? [] : [];
          const isToday = cell.key === todayKey;
          return (
            <div
              key={cell.key}
              className="bg-white min-h-[116px] p-2 flex flex-col"
              style={isToday ? { boxShadow: "inset 0 0 0 2px #0A0A0A" } : {}}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="text-meta text-default-500">
                  {cell.d ? String(cell.d).padStart(2, "0") : ""}
                </div>
                {isToday && (
                  <div className="text-[0.62rem] uppercase tracking-[0.2em] text-foreground">
                    Today
                  </div>
                )}
              </div>
              <div className="space-y-1">
                {items.slice(0, 3).map((it: any, i: number) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-[0.72rem] border-l-2 pl-2"
                    style={{
                      borderColor:
                        it.channel === "fb"
                          ? "#1E7FD4"
                          : it.channel === "ig"
                          ? "#C8322E"
                          : "#1A9B8E",
                    }}
                  >
                    <span className="text-foreground truncate uppercase tracking-wide">
                      {it.channel} {it.published ? "live" : it.scheduled ? "sched" : "draft"}
                    </span>
                    {typeof it.auditScore === "number" && (
                      <span className="text-default-500">{it.auditScore}</span>
                    )}
                  </div>
                ))}
                {items.length > 3 && (
                  <div className="text-meta text-default-500">+{items.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center gap-6 text-meta uppercase tracking-[0.16em] text-default-500">
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 bg-secondary inline-block" /> FB
        </span>
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 bg-danger inline-block" /> IG
        </span>
        <span>live · published</span>
        <span>sched · scheduled</span>
      </div>
    </StudioLayout>
  );
}
