/**
 * 主動引擎的時間換算。伺服器跑 UTC；「週一早上」「早上九點」指的是用戶的時間。
 * 目前一律用台北時間（UTC+8、無日光節約）——品牌有目標市場，但收訊息的人在台灣。
 * 之後要跟著收件人時區走，只改這一支。
 */
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
const WEEKDAY_ZH = ["日", "一", "二", "三", "四", "五", "六"];

export interface LocalParts { ymd: string; dow: number; hour: number; minute: number }

export function taipeiParts(at: Date): LocalParts {
  const d = new Date(at.getTime() + TAIPEI_OFFSET_MS);
  return { ymd: d.toISOString().slice(0, 10), dow: d.getUTCDay(), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}

/** 台北某一天 00:00 的絕對時間。 */
export function taipeiMidnight(ymd: string): Date {
  return new Date(new Date(`${ymd}T00:00:00Z`).getTime() - TAIPEI_OFFSET_MS);
}

/** 「10/8（三）10:00」 */
export function fmtTaipei(at: Date): string {
  const d = new Date(at.getTime() + TAIPEI_OFFSET_MS);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WEEKDAY_ZH[d.getUTCDay()]}）${hh}:${mm}`;
}

/** 「10/8（三）」——給只有日期的格子用。 */
export function fmtYmd(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WEEKDAY_ZH[d.getUTCDay()]}）`;
}
