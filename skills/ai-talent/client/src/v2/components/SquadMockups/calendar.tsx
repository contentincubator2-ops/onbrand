/**
 * CalendarGridMockup — squad step 4 output: monthly calendar.
 *
 * Redesigned 2026-04-30 per CJ feedback: original 5×7 grid felt too
 * different from other Notion-style mockups. New layout = weekly card
 * list (one card per week), matching Notion / Buffer / Hootsuite content
 * calendar conventions adapted to SoWork's design system:
 *
 *   ┌─ WEEK 1 (5/4 — 5/10) · 4 篇 ─────────────────────┐
 *   │ [date] [pillar bar] [format] [topic] [event ⭐] │ ← post card per row
 *   │ [date] [pillar bar] [format] [topic]            │
 *   │ ...                                              │
 *   └──────────────────────────────────────────────────┘
 *
 * Layout discipline:
 *   - Pillar = colored left-edge stripe (per project_design_system.md
 *     "color is functional only")
 *   - Date column tabular-nums for alignment
 *   - Format icon as Chip
 *   - Event peak as warning/danger Chip
 *   - Hover/click reveals details (topic + tooltip; phase 2 expands edit)
 */
import React from "react";
import { Card, CardBody, Chip, Tooltip } from "@heroui/react";
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
    targetDateStart: string; // YYYY-MM-DD
    targetDateEnd: string;   // YYYY-MM-DD
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

const WEEKDAY_ZH = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

interface WeekBucket {
  weekStart: Date;
  weekEnd: Date;
  entries: CalendarEntry[];
}

/** Group entries into weekly buckets, Sunday-anchored. */
function groupByWeek(entries: CalendarEntry[], rangeStart: string, rangeEnd: string): WeekBucket[] {
  const start = new Date(rangeStart);
  const end = new Date(rangeEnd);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];
  const buckets: WeekBucket[] = [];
  // Backfill to Sunday of week containing start
  const cursor = new Date(start);
  cursor.setDate(start.getDate() - start.getDay());
  while (cursor <= end) {
    const weekStart = new Date(cursor);
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekStart.getDate() + 6);
    const inWeek = entries.filter((e) => {
      const d = new Date(e.date);
      return !isNaN(d.getTime()) && d >= weekStart && d <= weekEnd;
    });
    inWeek.sort((a, b) => a.date.localeCompare(b.date));
    buckets.push({ weekStart: new Date(weekStart), weekEnd: new Date(weekEnd), entries: inWeek });
    cursor.setDate(cursor.getDate() + 7);
  }
  return buckets;
}

function fmtMD(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function CalendarGridMockup({ data, readOnly = false, isActive = false }: Props) {
  if (!data) {
    return (
      <NotionCard>
        <SectionHeader icon="📅" eyebrow="STEP 4 · CALENDAR" title="月度排程" />
        <EmptyHint>Step 4 跑完才有 calendar</EmptyHint>
      </NotionCard>
    );
  }

  const buckets = groupByWeek(data.entries, data.targetDateStart, data.targetDateEnd);
  const totalPosts = data.entries.length;

  const rangeLabel = (() => {
    const s = new Date(data.targetDateStart);
    const e = new Date(data.targetDateEnd);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) {
      return `${data.targetDateStart} → ${data.targetDateEnd}`;
    }
    return `${s.getFullYear()}/${s.getMonth() + 1}/${s.getDate()} → ${e.getFullYear()}/${e.getMonth() + 1}/${e.getDate()}`;
  })();

  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      {/* Header card with summary + isActive indicator */}
      <NotionCard>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <SectionHeader
              icon="📅"
              eyebrow="STEP 4 · EDITORIAL CALENDAR"
              title={`${rangeLabel} · ${totalPosts} 篇`}
            />
          </div>
          {isActive && (
            <Chip size="sm" variant="flat" color="primary" className="self-start">
              ● Phoebe Yang 編排中…
            </Chip>
          )}
        </div>

        {/* Pillar legend */}
        {data.pillars && data.pillars.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center mt-1">
            <span className="text-tiny text-default-500 mr-1">Pillar：</span>
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

      {/* Weekly buckets */}
      {buckets.map((bucket, bi) => (
        <Card key={bi} shadow="none" className="border border-divider">
          <CardBody className="p-4 gap-2">
            <div className="flex items-center justify-between">
              <p className="text-tiny text-default-500 uppercase tracking-wider font-medium">
                Week {bi + 1} · {fmtMD(bucket.weekStart)} – {fmtMD(bucket.weekEnd)}
              </p>
              <span className="text-tiny text-default-500 tabular-nums">
                {bucket.entries.length} 篇
              </span>
            </div>

            {bucket.entries.length === 0 ? (
              <EmptyHint>本週無排程</EmptyHint>
            ) : (
              <div className="flex flex-col">
                {bucket.entries.map((entry, ei) => (
                  <PostRow key={ei} entry={entry} />
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

function PostRow({ entry }: { entry: CalendarEntry }) {
  const color = PILLAR_COLORS[entry.pillarIndex % 5]!;
  const d = new Date(entry.date);
  const weekday = !isNaN(d.getTime()) ? WEEKDAY_ZH[d.getDay()] : "";
  const dateLabel = !isNaN(d.getTime()) ? `${d.getMonth() + 1}/${d.getDate()}` : entry.date;

  return (
    <Tooltip
      content={
        <div className="px-1 py-1 max-w-[280px]">
          <p className="text-tiny font-medium">{entry.pillarName}</p>
          {entry.topic && <p className="text-tiny text-default-700 mt-0.5">{entry.topic}</p>}
          {entry.eventAnchor && (
            <p className="text-tiny text-danger mt-1">⭐ {entry.eventAnchor}</p>
          )}
        </div>
      }
      placement="right"
      delay={250}
    >
      <div
        className="flex items-center gap-3 py-2 px-2 rounded-md hover:bg-default-50 cursor-pointer border-l-[3px] mt-1"
        style={{ borderLeftColor: color }}
      >
        {/* Date column */}
        <div className="w-12 shrink-0 text-tiny text-default-500 tabular-nums">
          <div className="font-semibold text-foreground">{dateLabel}</div>
          <div className="text-default-400">{weekday}</div>
        </div>

        {/* Pillar chip */}
        <Chip size="sm" variant="flat" className="shrink-0 max-w-[110px]"
          classNames={{ content: "truncate" }}>
          {entry.pillarName}
        </Chip>

        {/* Format chip */}
        <Chip size="sm" variant="flat" color="default" className="shrink-0">
          {FORMAT_LABEL[entry.format]}
        </Chip>

        {/* Topic */}
        <div className="text-small text-foreground truncate flex-1 min-w-0">
          {entry.topic ?? <span className="text-default-400">—</span>}
        </div>

        {/* Event anchor */}
        {entry.eventAnchor && (
          <Chip size="sm" variant="flat" color="danger" className="shrink-0">
            ⭐ {entry.eventAnchor}
          </Chip>
        )}
      </div>
    </Tooltip>
  );
}
