/**
 * CalendarGridMockup — squad step 4 output: monthly editorial calendar.
 *
 * Redesign 2 (2026-04-30): per CJ refs (freefrontend / Markshall codepen)
 * — clean month grid (Apple/Notion/Linear aesthetic) with selected-day
 * detail panel below.
 *
 * Layout:
 *   ┌─ MONTH GRID (compact, dot-density per day) ─┐
 *   │ S  M  T  W  T  F  S                          │
 *   │ ·  ·  ·  ·  ·  · ·                           │
 *   │ each day cell: date + ≤4 colored dots        │
 *   │ today/selected = rounded fill background     │
 *   └──────────────────────────────────────────────┘
 *
 *   ┌─ SELECTED DAY DETAIL ────────────────────────┐
 *   │ 5/17 (週六) · 1 篇                            │
 *   │ [pillar bar] [format] [topic] [event ⭐]    │ ← post rows
 *   └──────────────────────────────────────────────┘
 *
 *   ┌─ PILLAR LEGEND ──────────────────────────────┐
 *   └──────────────────────────────────────────────┘
 *
 * Discipline:
 *   - Color = function (pillar + event peak); no decoration
 *   - Off-month days dimmed
 *   - Today = subtle blue ring
 *   - Hover = soft fill; click = select day → detail expands
 */
import React from "react";
import { Card, CardBody, Chip } from "@heroui/react";
import { SectionHeader, NotionCard, EmptyHint, type SquadMockupCommonProps } from "./shared";

export interface CalendarEntry {
  date: string;          // YYYY-MM-DD
  pillarIndex: number;   // 0-4
  pillarName: string;
  format: "post" | "reel" | "carousel" | "long-text" | "story";
  eventAnchor?: string;
  topic?: string;
}

interface Props extends SquadMockupCommonProps {
  data?: {
    targetDateStart: string;
    targetDateEnd: string;
    entries: CalendarEntry[];
    pillars?: Array<{ name: string; ratio: number }>;
  };
}

const PILLAR_COLORS = ["#7c5dfa", "#10b981", "#f59e0b", "#3b82f6", "#ec4899"] as const;

const FORMAT_LABEL: Record<CalendarEntry["format"], string> = {
  "post":      "📝 圖文",
  "reel":      "🎬 Reel",
  "carousel":  "🖼 Carousel",
  "long-text": "📊 長文",
  "story":     "📱 Story",
};

const WEEKDAYS_SHORT = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAYS_ZH    = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

interface DayCell {
  iso: string;      // YYYY-MM-DD
  date: number;     // day of month
  isOffMonth: boolean;
  isToday: boolean;
  isInRange: boolean;
  entries: CalendarEntry[];
}

function buildMonthGrid(targetStart: string, targetEnd: string, entries: CalendarEntry[]): DayCell[] {
  const start = new Date(targetStart);
  const end = new Date(targetEnd);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];
  // Render 6 weeks × 7 days starting from Sunday of week containing start
  const cursor = new Date(start);
  cursor.setDate(start.getDate() - start.getDay()); // back to Sunday
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cells: DayCell[] = [];
  const entriesByDate = new Map<string, CalendarEntry[]>();
  for (const e of entries) {
    const list = entriesByDate.get(e.date) ?? [];
    list.push(e);
    entriesByDate.set(e.date, list);
  }
  // 6 weeks max — enough to cover any month + any 1-2 month range
  for (let i = 0; i < 42; i++) {
    const d = new Date(cursor);
    d.setDate(cursor.getDate() + i);
    const iso = d.toISOString().split("T")[0]!;
    const isOffMonth = d.getMonth() !== start.getMonth();
    const isToday = d.getTime() === today.getTime();
    const isInRange = d >= start && d <= end;
    cells.push({
      iso,
      date: d.getDate(),
      isOffMonth,
      isToday,
      isInRange,
      entries: entriesByDate.get(iso) ?? [],
    });
    // Stop after we've covered the end (when next week starts past end+7)
    if (d > end && i % 7 === 6) break;
  }
  return cells;
}

export function CalendarGridMockup({ data, readOnly = false, isActive = false }: Props) {
  const [selectedIso, setSelectedIso] = React.useState<string | null>(null);

  // Guard partial data — LLM may return {} or missing required fields
  if (!data || !data.targetDateStart || !data.targetDateEnd || !Array.isArray(data.entries)) {
    return (
      <NotionCard>
        <SectionHeader icon="📅" eyebrow="步驟 4 · 行事曆" title="月度排程" />
        <EmptyHint>{!data ? "步驟 4 跑完才有行事曆" : "資料不完整 — 缺 targetDateStart / targetDateEnd / entries"}</EmptyHint>
      </NotionCard>
    );
  }

  const cells = buildMonthGrid(data.targetDateStart, data.targetDateEnd, data.entries);
  const totalPosts = data.entries.length;

  // Default-select first day with content
  React.useEffect(() => {
    if (!selectedIso) {
      const first = cells.find((c) => c.entries.length > 0);
      if (first) setSelectedIso(first.iso);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.targetDateStart, data.targetDateEnd]);

  const selectedCell = cells.find((c) => c.iso === selectedIso) ?? null;
  const rangeLabel = (() => {
    const s = new Date(data.targetDateStart);
    const e = new Date(data.targetDateEnd);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) {
      return `${data.targetDateStart} → ${data.targetDateEnd}`;
    }
    return `${s.getFullYear()}/${s.getMonth() + 1}/${s.getDate()} → ${e.getMonth() + 1}/${e.getDate()}`;
  })();

  // Render in 7-column rows; weeks may be 5 or 6 depending on month length
  const weeks: DayCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      {/* Header */}
      <NotionCard>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <SectionHeader
            icon="📅"
            eyebrow="步驟 4 · 編輯行事曆"
            title={`${rangeLabel} · ${totalPosts} 篇`}
          />
          {isActive && (
            <Chip size="sm" variant="flat" color="primary" className="self-start">
              ● Phoebe Yang 編排中…
            </Chip>
          )}
        </div>

        {/* Month grid */}
        <div className="mt-3">
          {/* Weekday header */}
          <div className="grid grid-cols-7 gap-1 mb-1.5 px-1">
            {WEEKDAYS_SHORT.map((w, i) => (
              <div
                key={i}
                className={`text-tiny text-center font-medium ${i === 0 || i === 6 ? "text-default-400" : "text-default-500"}`}
              >
                {w}
              </div>
            ))}
          </div>
          {/* Day cells */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell) => (
              <DayButton
                key={cell.iso}
                cell={cell}
                isSelected={cell.iso === selectedIso}
                onClick={() => cell.entries.length > 0 && setSelectedIso(cell.iso)}
              />
            ))}
          </div>
        </div>

        {/* Pillar legend */}
        {data.pillars && data.pillars.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center mt-4 pt-3 border-t border-divider">
            <span className="text-tiny text-default-500 mr-1">支柱：</span>
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
      </NotionCard>

      {/* Selected day detail */}
      {selectedCell && (
        <SelectedDayCard cell={selectedCell} />
      )}

      {!readOnly && (
        <p className="text-tiny text-default-400 px-1">
          💡 點擊有貼文的日期看詳細；拖拽切換日期（互動 phase 2 接）
        </p>
      )}
    </div>
  );
}

/* ─────────────── DayButton ─────────────── */
function DayButton({
  cell, isSelected, onClick,
}: { cell: DayCell; isSelected: boolean; onClick: () => void }) {
  const hasEntries = cell.entries.length > 0;
  const dotsToShow = cell.entries.slice(0, 4);
  const overflow = cell.entries.length > 4 ? cell.entries.length - 4 : 0;
  const isClickable = hasEntries;

  // Visual state classes
  const base = "h-14 rounded-lg flex flex-col items-center justify-start py-1.5 px-1 transition";
  const stateClass = (() => {
    if (cell.isOffMonth) return "opacity-30";
    if (isSelected) return "bg-primary-100 border border-primary-300";
    if (cell.isToday) return "bg-default-100 ring-1 ring-primary-300";
    if (hasEntries) return "hover:bg-default-100 cursor-pointer";
    return "text-default-400";
  })();

  const dateNumberClass = cell.isToday
    ? "text-tiny font-bold text-primary"
    : cell.isOffMonth
      ? "text-tiny text-default-400"
      : "text-tiny text-foreground font-medium";

  return (
    <button
      type="button"
      onClick={isClickable ? onClick : undefined}
      disabled={!isClickable}
      className={`${base} ${stateClass}`}
      aria-label={`${cell.iso}${hasEntries ? `, ${cell.entries.length} posts` : ""}`}
    >
      <span className={`tabular-nums ${dateNumberClass}`}>{cell.date}</span>
      {hasEntries && (
        <div className="flex items-center justify-center gap-0.5 mt-1.5 h-2">
          {dotsToShow.map((e, i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: PILLAR_COLORS[e.pillarIndex % 5] }}
            />
          ))}
          {overflow > 0 && (
            <span className="text-[9px] text-default-500 leading-none ml-0.5">+{overflow}</span>
          )}
        </div>
      )}
      {/* Event peak indicator — top-right tiny dot */}
      {cell.entries.some((e) => e.eventAnchor) && (
        <span
          className="absolute mt-0 -translate-y-1 translate-x-3 w-1.5 h-1.5 rounded-full bg-danger"
          style={{ alignSelf: "flex-end" }}
          aria-label="event peak"
        />
      )}
    </button>
  );
}

/* ─────────────── SelectedDayCard ─────────────── */
function SelectedDayCard({ cell }: { cell: DayCell }) {
  const d = new Date(cell.iso);
  const weekday = !isNaN(d.getTime()) ? WEEKDAYS_ZH[d.getDay()] : "";
  const dateLabel = !isNaN(d.getTime()) ? `${d.getMonth() + 1}/${d.getDate()}` : cell.iso;

  return (
    <Card shadow="none" className="border border-divider">
      <CardBody className="p-4 gap-3">
        <div className="flex items-baseline justify-between">
          <p className="text-medium font-semibold tracking-tight">
            <span className="tabular-nums">{dateLabel}</span>
            <span className="text-default-500 text-small ml-2">{weekday}</span>
          </p>
          <span className="text-tiny text-default-500">{cell.entries.length} 篇貼文</span>
        </div>
        {cell.entries.length === 0 ? (
          <EmptyHint>這天無排程</EmptyHint>
        ) : (
          <div className="flex flex-col gap-1.5">
            {cell.entries.map((entry, i) => (
              <PostRow key={i} entry={entry} />
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function PostRow({ entry }: { entry: CalendarEntry }) {
  const color = PILLAR_COLORS[entry.pillarIndex % 5]!;
  return (
    <div
      className="flex items-center gap-3 py-2 px-2 rounded-md border border-divider bg-content1"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <Chip size="sm" variant="flat" className="shrink-0 max-w-[110px]"
        classNames={{ content: "truncate" }}>
        {entry.pillarName}
      </Chip>
      <Chip size="sm" variant="flat" color="default" className="shrink-0">
        {FORMAT_LABEL[entry.format]}
      </Chip>
      <div className="text-small text-foreground truncate flex-1 min-w-0">
        {entry.topic ?? <span className="text-default-400">—</span>}
      </div>
      {entry.eventAnchor && (
        <Chip size="sm" variant="flat" color="danger" className="shrink-0">
          ⭐ {entry.eventAnchor}
        </Chip>
      )}
    </div>
  );
}
