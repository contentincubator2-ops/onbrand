/**
 * CalendarPage — content calendar v1 (P0-1).
 *
 * 2026-05-11 (CJ「四個 P0 都要完成」+ vs Buffer differentiation).
 *
 * v1 scope: month grid showing scheduled + published posts per brand.
 * Click a slot → detail popover; click a post → outputId route.
 * Drag/drop reschedule comes in v2.
 */
import React, { useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";

const PLATFORM_COLOR: Record<string, string> = {
  facebook: "#1877F2",
  instagram: "#E1306C",
  youtube: "#FF0000",
  tiktok: "#000000",
  linkedin: "#0A66C2",
  threads: "#000000",
  email: "#0EA5E9",
  press: "#525252",
  brand: "#7C3AED",
  audience: "#7C3AED",
};

export default function CalendarPage() {
  const navigate = useNavigate();
  const ctx = useOutletContext<ShellOutletCtx>();
  const brandId = (ctx?.brandId as number | null) ?? null;
  const brandName = useMemo(() => {
    const list = (ctx?.brands ?? []) as Array<{ id: number; name: string }>;
    return list.find((b) => b?.id === brandId)?.name ?? "全部品牌";
  }, [ctx, brandId]);

  // Current month cursor
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const monthStart = cursor;
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  const monthLabel = cursor.toLocaleDateString("zh-TW", { year: "numeric", month: "long" });

  // Build 6-row × 7-col grid (Sun=0 first)
  const days = useMemo(() => {
    const firstWeekday = monthStart.getDay();
    const result: Array<{ date: Date; inMonth: boolean }> = [];
    // Leading days from previous month
    for (let i = firstWeekday; i > 0; i--) {
      const d = new Date(monthStart);
      d.setDate(d.getDate() - i);
      result.push({ date: d, inMonth: false });
    }
    // Days of this month
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    for (let i = 1; i <= daysInMonth; i++) {
      result.push({ date: new Date(cursor.getFullYear(), cursor.getMonth(), i), inMonth: true });
    }
    // Trailing to complete 42 cells
    while (result.length < 42) {
      const last = result[result.length - 1]!.date;
      const d = new Date(last);
      d.setDate(d.getDate() + 1);
      result.push({ date: d, inMonth: false });
    }
    return result;
  }, [cursor]);

  // Range query
  const rangeQ = (trpc as any).calendar?.range?.useQuery?.(
    {
      from: monthStart.toISOString(),
      to: monthEnd.toISOString(),
      brandId: brandId ?? undefined,
    },
    { refetchOnWindowFocus: false, staleTime: 30_000 },
  );
  const items: any[] = rangeQ?.data ?? [];

  // Bucket by day key
  const byDay = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const it of items) {
      const d = new Date(it.at);
      const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(it);
    }
    return m;
  }, [items]);

  const today = new Date();
  const isToday = (d: Date) =>
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAFA" }}>
      {/* Hero */}
      <div className="relative pt-10 pb-6 px-6 text-center">
        <div className="relative z-10 flex flex-col items-center max-w-[1100px] mx-auto">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-default-600 mb-3">
            CALENDAR · CONTENT TIMELINE
          </p>
          <h1
            className="font-semibold tracking-tight leading-tight"
            style={{
              fontSize: "clamp(1.6rem, 3vw, 2.25rem)",
              background: "linear-gradient(135deg, #00b4bc 0%, #7c3aed 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            這個月，你會發什麼？
          </h1>
          <p
            className="mt-3 mx-auto text-default-700"
            style={{
              fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
              fontStyle: "italic", fontSize: 14, lineHeight: 1.7, maxWidth: 640,
            }}
          >
            {brandName} 已排程 + 已發布的內容，一目了然
          </p>
          <p
            className="mt-2 mx-auto text-default-700"
            style={{ fontSize: 12, lineHeight: 1.55, maxWidth: 640, letterSpacing: "0.02em" }}
          >
            <span style={{ fontWeight: 600, color: "#171717", marginRight: 6 }}>適合：</span>
            月度節奏 · 跨平台一致性 · 不要重複發 · 補洞看哪天還沒內容
          </p>
        </div>
      </div>

      {/* Month control bar */}
      <div className="max-w-[1100px] mx-auto px-6 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            className="w-8 h-8 rounded border border-default-300 hover:border-default-900 flex items-center justify-center"
          >
            <ChevronLeft size={14} />
          </button>
          <h2 className="text-base font-semibold text-default-900 tabular-nums min-w-[120px] text-center">
            {monthLabel}
          </h2>
          <button
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            className="w-8 h-8 rounded border border-default-300 hover:border-default-900 flex items-center justify-center"
          >
            <ChevronRight size={14} />
          </button>
          <button
            onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
            className="ml-2 px-3 py-1 text-xs border border-default-300 rounded hover:border-default-900"
          >
            今天
          </button>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-default-700">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-neutral-900" />
            已排程
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-600" />
            已發布
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            失敗
          </span>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="max-w-[1100px] mx-auto px-6 pb-12">
        <div className="bg-white border border-default-300 rounded-xl overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-7 border-b border-default-300">
            {["日", "一", "二", "三", "四", "五", "六"].map((d) => (
              <div
                key={d}
                className="text-[10px] font-semibold uppercase tracking-[0.18em] text-default-700 py-2 px-3 border-r border-default-300 last:border-r-0"
              >
                {d}
              </div>
            ))}
          </div>
          {/* Day cells */}
          <div className="grid grid-cols-7" style={{ minHeight: 540 }}>
            {days.map((d, i) => {
              const key = `${d.date.getFullYear()}-${d.date.getMonth()}-${d.date.getDate()}`;
              const cellItems = byDay.get(key) ?? [];
              return (
                <div
                  key={i}
                  className="border-r border-b border-default-200 last:border-r-0 p-1.5 relative"
                  style={{
                    minHeight: 88,
                    background: d.inMonth ? "white" : "#FAFAFA",
                    opacity: d.inMonth ? 1 : 0.5,
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className="text-[11px] font-medium tabular-nums"
                      style={{
                        color: isToday(d.date) ? "white" : "#404040",
                        background: isToday(d.date) ? "#171717" : "transparent",
                        borderRadius: 4,
                        padding: isToday(d.date) ? "1px 5px" : "1px 2px",
                      }}
                    >
                      {d.date.getDate()}
                    </span>
                    {cellItems.length > 3 && (
                      <span className="text-[9px] text-default-600">+{cellItems.length - 3}</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {cellItems.slice(0, 3).map((it, j) => {
                      const color = PLATFORM_COLOR[it.platform] ?? "#7C3AED";
                      const stat = it.kind === "published" ? "published"
                        : it.status === "failed" ? "failed" : "scheduled";
                      const dot = stat === "published" ? "#10b981"
                        : stat === "failed" ? "#f59e0b" : "#171717";
                      return (
                        <button
                          key={j}
                          onClick={() => navigate(`/run/${it.outputId}`)}
                          className="w-full text-left text-[10px] truncate px-1.5 py-0.5 rounded hover:bg-default-100 flex items-center gap-1"
                          title={`${it.brandName ?? ""}・${it.preview ?? it.missionTitle ?? ""}`}
                          style={{ borderLeft: `2px solid ${color}` }}
                        >
                          <span className="w-1 h-1 rounded-full shrink-0" style={{ background: dot }} />
                          <span className="truncate">{it.preview || it.missionTitle || "—"}</span>
                        </button>
                      );
                    })}
                    {cellItems.length === 0 && d.inMonth && (
                      <span className="text-[10px] text-default-500 italic">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer hint */}
        <p className="mt-4 text-[11px] text-default-700 text-center">
          想排新貼文？到 <a href="/30s" className="font-medium text-default-900 underline">30s 快寫</a> 跑一篇 → 結果頁按「排程發布」
          <span className="mx-2 text-default-500">|</span>
          v2 將加入 drag/drop 改時間 + 週曆視圖
        </p>
      </div>
    </div>
  );
}
