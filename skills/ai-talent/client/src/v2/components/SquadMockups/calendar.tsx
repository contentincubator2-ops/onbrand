/**
 * CalendarGridMockup — squad step 4 output: monthly calendar grid.
 *
 * 5 weeks × 7 days. Each cell:
 *   - date number
 *   - pillar color dot
 *   - format icon (📝 文 / 🎬 reel / 🖼 carousel / 📊 long-text)
 *   - red flag if event peak
 *   - dim/hidden if off-month
 *
 * Drag-drop hint when hovering an entry. Pillar legend bottom.
 */
import React from "react";
import { Chip, Tooltip } from "@heroui/react";
import { SectionHeader, NotionCard, EmptyHint, type SquadMockupCommonProps } from "./shared";

export interface CalendarEntry {
  date: string;          // YYYY-MM-DD
  pillarIndex: number;   // 0-4
  pillarName: string;
  format: "post" | "reel" | "carousel" | "long-text" | "story";
  eventAnchor?: string;  // event name if this slot anchors an event
  topic?: string;
}

interface Props extends SquadMockupCommonProps {
  data?: {
    targetMonth: string;     // YYYY-MM-01
    entries: CalendarEntry[];
    pillars?: Array<{ name: string; ratio: number }>;
  };
}

const PILLAR_COLORS = ["#7c5dfa", "#10b981", "#f59e0b", "#3b82f6", "#ec4899"] as const;

const FORMAT_ICONS: Record<CalendarEntry["format"], string> = {
  "post":      "📝",
  "reel":      "🎬",
  "carousel":  "🖼",
  "long-text": "📊",
  "story":     "📱",
};

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function buildMonthGrid(targetMonthStr: string): Array<Array<{ date: string; iso: string; isOffMonth: boolean }>> {
  const target = new Date(targetMonthStr);
  if (isNaN(target.getTime())) return [];
  const year = target.getFullYear();
  const month = target.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay(); // 0 = Sun
  const startDate = new Date(year, month, 1 - startWeekday); // back-fill to Sunday
  const grid: Array<Array<{ date: string; iso: string; isOffMonth: boolean }>> = [];
  for (let week = 0; week < 5; week++) {
    const row: Array<{ date: string; iso: string; isOffMonth: boolean }> = [];
    for (let day = 0; day < 7; day++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + week * 7 + day);
      row.push({
        date: String(d.getDate()),
        iso: d.toISOString().split("T")[0]!,
        isOffMonth: d.getMonth() !== month,
      });
    }
    grid.push(row);
  }
  return grid;
}

export function CalendarGridMockup({ data, readOnly = false }: Props) {
  if (!data) {
    return (
      <NotionCard>
        <SectionHeader icon="📅" eyebrow="STEP 4 · CALENDAR" title="月度排程" />
        <EmptyHint>Step 4 跑完才有 calendar</EmptyHint>
      </NotionCard>
    );
  }

  const grid = buildMonthGrid(data.targetMonth);
  // Map date → entries (multiple posts per day possible)
  const entriesByDate = new Map<string, CalendarEntry[]>();
  for (const e of data.entries) {
    const list = entriesByDate.get(e.date) ?? [];
    list.push(e);
    entriesByDate.set(e.date, list);
  }

  const monthLabel = (() => {
    const d = new Date(data.targetMonth);
    if (isNaN(d.getTime())) return data.targetMonth;
    return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`;
  })();

  return (
    <div className="flex flex-col gap-3 max-w-5xl">
      <NotionCard>
        <SectionHeader icon="📅" eyebrow="STEP 4 · CALENDAR" title={`${monthLabel} 月度排程`} />

        {/* Weekday header */}
        <div className="grid grid-cols-7 text-tiny text-default-500 font-medium border-b border-divider pb-1.5">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2">{d}</div>
          ))}
        </div>

        {/* 5-week grid */}
        <div className="grid grid-cols-7 gap-px bg-divider">
          {grid.flat().map((cell, i) => {
            const list = entriesByDate.get(cell.iso) ?? [];
            return (
              <div
                key={i}
                className={[
                  "min-h-[88px] p-1.5 bg-content1 flex flex-col gap-1",
                  cell.isOffMonth ? "opacity-30" : "",
                ].join(" ")}
              >
                <div className="text-tiny text-default-500 tabular-nums">{cell.date}</div>
                <div className="flex flex-col gap-0.5">
                  {list.map((entry, j) => (
                    <Tooltip
                      key={j}
                      content={
                        <div className="px-1 py-1 max-w-[260px]">
                          <p className="text-tiny font-medium">{entry.pillarName}</p>
                          {entry.topic && <p className="text-tiny text-default-500">{entry.topic}</p>}
                          {entry.eventAnchor && (
                            <p className="text-tiny text-danger mt-1">📍 {entry.eventAnchor}</p>
                          )}
                        </div>
                      }
                      placement="top"
                      delay={150}
                    >
                      <div
                        className="text-tiny rounded px-1.5 py-0.5 bg-default-50 border border-divider flex items-center gap-1 cursor-pointer hover:bg-default-100"
                        style={{ borderLeft: `3px solid ${PILLAR_COLORS[entry.pillarIndex % 5]}` }}
                      >
                        <span>{FORMAT_ICONS[entry.format]}</span>
                        <span className="truncate text-foreground">{entry.topic ?? entry.pillarName}</span>
                        {entry.eventAnchor && <span className="text-danger ml-auto">⭐</span>}
                      </div>
                    </Tooltip>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Pillar legend */}
        {data.pillars && data.pillars.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 items-center">
            <span className="text-tiny text-default-500 mr-1">Pillar 圖例：</span>
            {data.pillars.map((p, i) => (
              <Chip
                key={i}
                size="sm"
                variant="flat"
                classNames={{ content: "flex items-center gap-1.5" }}
                startContent={
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: PILLAR_COLORS[i % 5] }}
                  />
                }
              >
                {p.name} · {p.ratio}%
              </Chip>
            ))}
          </div>
        )}

        {!readOnly && (
          <p className="text-tiny text-default-400 mt-2">
            💡 拖拽切換日期、點擊單格編輯內容（drag-drop 互動 phase 2 接）
          </p>
        )}
      </NotionCard>
    </div>
  );
}
