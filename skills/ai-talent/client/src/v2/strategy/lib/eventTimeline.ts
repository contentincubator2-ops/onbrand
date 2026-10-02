/**
 * eventTimeline.ts — 活動頁年度時間軸的版面計算（純函式，給 EventYearTimeline 用）。
 *
 * 2026-10-02（CJ「活動頁要不要用行事曆鼓勵用戶把一整年的活動先建進來」）：時間軸是
 * 「滾動 12 個月」——從這個月開始往後看一年，不是 1–12 月；十月打開時，眼前要排的是
 * 接下來這一年，不是已經過了九個月的今年。左右箭頭一次移 12 個月。
 */

export const pad2 = (n: number) => String(n).padStart(2, "0");
export const ymd = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;

/** Date／ISO 字串 → 本地的 YYYY-MM-DD；無效回 null。 */
export function toYmd(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;
  return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

const dayNum = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) / 86_400_000;

export interface TimelineWindow {
  /** YYYY-MM */
  fromMonth: string;
  /** YYYY-MM-DD，含 */
  from: string;
  /** YYYY-MM-DD，不含 */
  to: string;
  months: Array<{ year: number; month: number; key: string }>;
}

export function timelineWindow(fromMonth: string, count = 12): TimelineWindow {
  const y = Number(fromMonth.slice(0, 4)), m = Number(fromMonth.slice(5, 7));
  const months = Array.from({ length: count }, (_, i) => {
    const t = new Date(Date.UTC(y, m - 1 + i, 1));
    return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, key: `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}` };
  });
  const end = new Date(Date.UTC(y, m - 1 + count, 1));
  return { fromMonth, from: ymd(y, m, 1), to: ymd(end.getUTCFullYear(), end.getUTCMonth() + 1, 1), months };
}

export function shiftMonth(fromMonth: string, delta: number): string {
  const y = Number(fromMonth.slice(0, 4)), m = Number(fromMonth.slice(5, 7));
  const t = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}`;
}

/** 日期在視窗中的位置（0–100%），超出範圍夾在兩端。 */
export function pct(w: TimelineWindow, date: string): number {
  const a = dayNum(w.from), b = dayNum(w.to);
  return Math.min(100, Math.max(0, ((dayNum(date) - a) / (b - a)) * 100));
}

/** [start, end] 是否跟視窗有交集（end 為 null 視為單日）。 */
export function overlaps(w: TimelineWindow, start: string, end: string | null): boolean {
  return (end ?? start) >= w.from && start < w.to;
}

/**
 * 把有期間的項目分到不重疊的「道」裡（貪婪法，依開始日排序）。單日項目也佔一個最小寬度，
 * 用 minGapDays 表示——字要排得下，兩個靠太近的節點不能放同一道。
 */
export function packLanes<T extends { start: string; end: string | null }>(
  items: T[],
  minGapDays: number | ((it: T) => number) = 0,
  /** 同一列前後兩項之間至少空幾天（期間線的尾巴不要黏到下一個標籤） */
  padDays = 0,
): Array<T & { lane: number }> {
  const sorted = [...items].sort((a, b) => a.start.localeCompare(b.start));
  const laneEnds: number[] = [];
  return sorted.map((it) => {
    const s = dayNum(it.start);
    const gap = typeof minGapDays === "function" ? minGapDays(it) : minGapDays;
    // 標籤／最小寬度從開始日算起：短期的橫條或單日節點，畫面上仍佔這麼寬
    const e = Math.max(dayNum(it.end ?? it.start), s + gap) + padDays;
    let lane = laneEnds.findIndex((end) => end < s);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(e); } else laneEnds[lane] = e;
    return { ...it, lane };
  });
}

export type EventPhase = "undated" | "upcoming" | "live" | "ended";

/** 標籤大約多寬（px）：中日韓字 12px、其他 6.5px，另加圓點與留白。 */
export function labelPx(text: string, extra = 20): number {
  let w = 0;
  for (const ch of text) w += /[⺀-￿]/.test(ch) ? 12 : 6.5;
  return Math.ceil(w + extra);
}

/** 這麼多 px 在時間軸上等於幾天。 */
export function pxToDays(px: number, w: TimelineWindow, trackPx: number): number {
  const days = dayNum(w.to) - dayNum(w.from);
  return Math.ceil((px / Math.max(trackPx, 1)) * days);
}

/** 活動卡與時間軸共用的狀態。只有開始日、沒有結束日 → 當成單日活動。 */
export function eventPhase(startAt: unknown, endAt: unknown, today: string): { phase: EventPhase; days: number | null } {
  const s = toYmd(startAt);
  if (!s) return { phase: "undated", days: null };
  const e = toYmd(endAt) ?? s;
  if (today < s) return { phase: "upcoming", days: dayNum(s) - dayNum(today) };
  if (today <= e) return { phase: "live", days: dayNum(e) - dayNum(today) };
  return { phase: "ended", days: dayNum(today) - dayNum(e) };
}

/** 卡片排序：進行中 → 即將開始（近的先）→ 未排日期 → 已結束（近的先）。 */
export function sortEventsForCards<T extends { startAt?: unknown; endAt?: unknown }>(events: T[], today: string): T[] {
  const rank: Record<EventPhase, number> = { live: 0, upcoming: 1, undated: 2, ended: 3 };
  return [...events].sort((a, b) => {
    const pa = eventPhase(a.startAt, a.endAt, today), pb = eventPhase(b.startAt, b.endAt, today);
    if (pa.phase !== pb.phase) return rank[pa.phase] - rank[pb.phase];
    return (pa.days ?? 0) - (pb.days ?? 0);
  });
}

/**
 * 節點 API 的錯誤 → 介面語言的訊息。後端（eventCalendarRouter）跟專案其他 router 一樣
 * 只回中文，英文介面不能直接把它丟給用戶，所以在這裡依錯誤種類翻。
 * 認不得的錯誤：中文介面照原文，英文介面原文有中文就換成通用句。
 */
export function nodeErrorText(e: unknown, en: boolean): string {
  const err = e as { message?: string; data?: { code?: string } } | null;
  const msg = String(err?.message ?? e ?? "");
  const code = err?.data?.code;
  if (code === "NOT_FOUND" || msg.includes("找不到這個節點")) {
    return en ? "This date no longer exists — it may have been deleted." : "找不到這個節點，可能已經被刪除。";
  }
  const cap = msg.match(/最多\s*(\d+)\s*個自訂節點/);
  if (cap) {
    return en ? `A brand can have at most ${cap[1]} custom dates.` : `一個品牌最多 ${cap[1]} 個自訂節點。`;
  }
  if (msg.includes("結束日不能早於開始日")) {
    return en ? "End date is before the start." : "結束日不能早於開始日。";
  }
  if (en && /[一-鿿]/.test(msg)) return "Something went wrong — please try again.";
  return msg;
}
