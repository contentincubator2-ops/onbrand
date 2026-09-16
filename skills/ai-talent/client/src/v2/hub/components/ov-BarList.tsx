import React, { useState } from "react";
import { cx, fmt } from "../ui";

export interface BarItem {
  key: string;
  label: string;
  value: number;
  /** Optional marker rendered after the label (e.g. a LIVE tag). */
  extra?: React.ReactNode;
}

/**
 * Single-measure horizontal bar list: neutral ink bars with rounded ends,
 * the count always visible, and the share of total on hover.
 */
export function BarList({ items, unit }: { items: BarItem[]; unit?: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((a, i) => a + i.value, 0);
  return (
    <ul className="space-y-3" onMouseLeave={() => setHover(null)}>
      {items.map((i) => {
        const share = total ? Math.round((i.value / total) * 100) : 0;
        return (
          <li
            key={i.key}
            onMouseEnter={() => setHover(i.key)}
            title={`${i.label}: ${fmt(i.value)}${unit ? ` ${unit}` : ""} (${share}% of total)`}
          >
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 text-stone-700">{i.label}</span>
                {i.extra}
              </span>
              <span className="shrink-0 tabular-nums">
                {hover === i.key ? <span className="mr-1.5 text-[12px] text-stone-400">{share}%</span> : null}
                <span className="font-medium text-stone-900">{fmt(i.value)}</span>
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-stone-100">
              <div
                className={cx("h-2 rounded-full bg-stone-700 transition-[width] duration-500", hover != null && hover !== i.key && "opacity-60")}
                style={{ width: `${i.value === 0 ? 0 : Math.max(1.5, (i.value / max) * 100)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
