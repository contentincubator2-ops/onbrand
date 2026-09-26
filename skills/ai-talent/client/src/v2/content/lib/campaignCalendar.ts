/**
 * campaignCalendar — 把企劃的日期攤成月曆格子。
 *
 * 2026-09-26（CJ「點進去，會展開該活動的時間與發佈平台的圖」）：格子是純函式算
 * 出來的，而算錯的樣子很安靜——少一週就是某幾則永遠點不到，畫面卻看起來正常。
 * 所以放在 lib 而不是頁面裡（頁面帶著 react-router，測試載不動）。
 */
const DAY = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: string) => new Date(`${s}T00:00:00.000Z`);

/**
 * 週一起算的整週格子，範圍涵蓋所有傳入的日期。
 * 範圍取自**企劃本身**而不是活動起迄——預熱在開賣前、返場在結束後，它們也要有格子。
 */
export function weeksFor(dates: string[]): string[][] {
  if (dates.length === 0) return [];
  const sorted = [...dates].sort();
  const first = parse(sorted[0]!);
  const last = parse(sorted[sorted.length - 1]!);
  const startDow = (first.getUTCDay() + 6) % 7;             // 週一 = 0
  const gridStart = new Date(first.getTime() - startDow * DAY);
  const endDow = (last.getUTCDay() + 6) % 7;
  const gridEnd = new Date(last.getTime() + (6 - endDow) * DAY);

  const weeks: string[][] = [];
  for (let cur = gridStart; cur <= gridEnd; cur = new Date(cur.getTime() + 7 * DAY)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => ymd(new Date(cur.getTime() + i * DAY))));
  }
  return weeks;
}
