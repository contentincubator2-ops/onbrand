/**
 * 本週企劃的週次計算（台北時間）。PlannerPage 與側欄儀表共用，
 * 兩邊看的「這週」才會是同一週。
 */
export const ymdTpe = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
export function addDays(ymd: string, n: number) { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export function mondayOf(ymd: string) { const dow = new Date(`${ymd}T00:00:00Z`).getUTCDay(); return addDays(ymd, dow === 0 ? -6 : 1 - dow); }
/** 預設週：今天所在週；週六、週日打開時直接看下週（要排的是下週）。 */
export function defaultWeek() {
  const today = ymdTpe(new Date());
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6 ? addDays(mondayOf(today), 7) : mondayOf(today);
}
