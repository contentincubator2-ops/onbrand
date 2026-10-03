/**
 * eventCalendar.ts — 策略層「活動」頁的年度時間軸資料：內建節慶＋品牌自建節點。
 *
 * 2026-10-02（CJ「活動頁要不要用行事曆鼓勵用戶把一整年的活動先建進來」→ 定案：年度時間軸
 * ＋建議節點；「建議節點也可以讓用戶自己增加」）：
 *
 *   節點 ≠ 活動。節點只是「這天可能值得做一檔」的標記，按「開始企劃」才真的建活動。
 *   原因是方案限制活動是「每 30 天建幾檔」（plans.eventsPerCycle），若節點一加入就是
 *   活動，規劃一整年會立刻撞上限——而且一次生出 12 份半成品企劃也沒有意義。
 *
 *   內建節慶依品牌市場（brands.targetCountry）在這裡算，不讀 festivals 表：那張表只有
 *   台灣、只種到 2027 上半，美國品牌（如 HOTU）完全沒有資料。國曆固定日直接寫、美國的
 *   「某月第 N 個星期幾」與復活節用算的、農曆節日查下面的對照表（要延伸年份就補表）。
 *
 *   brand_calendar_nodes 一張表放兩種列：
 *     kind='custom'  用戶自建的節點（可設每年重複）
 *     kind='hidden'  用戶隱藏的內建節慶（builtinKey）
 */
import localPool from "../../../localDb";

export const BRAND_CALENDAR_NODES_DDL = `
  CREATE TABLE IF NOT EXISTS brand_calendar_nodes (
    id          INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
    brandId     INT           NOT NULL,
    userId      INT           NOT NULL,
    kind        VARCHAR(16)   NOT NULL DEFAULT 'custom',
    builtinKey  VARCHAR(64)   NULL,
    name        VARCHAR(120)  NULL,
    startDate   DATE          NULL,
    endDate     DATE          NULL,
    recurring   TINYINT(1)    NOT NULL DEFAULT 0,
    note        VARCHAR(500)  NULL,
    createdAt   DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_bcn_brand (brandId, kind)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export const NODE_NAME_MAX = 60;
export const NODE_NOTE_MAX = 300;
/** 一個品牌最多幾個自建節點——夠排滿一年，又不會讓時間軸擠成一團。 */
export const NODE_MAX_PER_BRAND = 60;

export interface CalendarNode {
  /** builtin:<market>:<slug>:<yyyy>，或 custom:<id>:<yyyy>（重複的節點每年一個） */
  key: string;
  source: "builtin" | "custom";
  /** custom 節點的資料列 id；builtin 為 null */
  id: number | null;
  /** builtin 節慶的穩定鍵（不含年份），隱藏時用 */
  builtinKey: string | null;
  nameZh: string;
  nameEn: string;
  /** YYYY-MM-DD */
  date: string;
  /** YYYY-MM-DD；單日節點為 null */
  endDate: string | null;
  recurring: boolean;
  note: string | null;
  /** 1–5，時間軸用來決定字的深淺；custom 一律 5（用戶自己加的就是重要的） */
  priority: number;
}

// ── 日期工具（全部用 UTC 運算、字串進出，避免時區把日期推前一天）────────────

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** y 年 m 月第 n 個星期 weekday（0=日）；n=-1 表示最後一個。 */
export function nthWeekday(y: number, m: number, weekday: number, n: number): string {
  if (n > 0) {
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const day = 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
    return ymd(y, m, day);
  }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lastDow = new Date(Date.UTC(y, m - 1, lastDay)).getUTCDay();
  return ymd(y, m, lastDay - ((lastDow - weekday + 7) % 7));
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y!, m! - 1, d! + days));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** 西方復活節（Anonymous Gregorian algorithm）。 */
export function easter(y: number): string {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(y, month, day);
}

// ── 內建節慶 ────────────────────────────────────────────────────────────────

type Rule = { slug: string; zh: string; en: string; priority: number; on: (y: number) => string | null };

const fixed = (m: number, d: number) => (y: number) => ymd(y, m, d);
const lunar = (table: Record<number, string>) => (y: number) => table[y] ?? null;

/** 農曆節日的國曆日期。超出表的年份就不顯示（寧缺勿錯）。 */
const LUNAR = {
  springFestival: { 2026: "2026-02-17", 2027: "2027-02-06", 2028: "2028-01-26" },
  lantern:        { 2026: "2026-03-03", 2027: "2027-02-20", 2028: "2028-02-09" },
  dragonBoat:     { 2026: "2026-06-19", 2027: "2027-06-09", 2028: "2028-05-28" },
  qixi:           { 2026: "2026-08-19", 2027: "2027-08-08", 2028: "2028-08-26" },
  midAutumn:      { 2026: "2026-09-25", 2027: "2027-09-15", 2028: "2028-10-03" },
} as const;

const UNIVERSAL: Rule[] = [
  { slug: "new-year",     zh: "元旦",       en: "New Year's Day", priority: 4, on: fixed(1, 1) },
  { slug: "valentine",    zh: "情人節",     en: "Valentine's Day", priority: 4, on: fixed(2, 14) },
  { slug: "halloween",    zh: "萬聖節",     en: "Halloween",      priority: 3, on: fixed(10, 31) },
  { slug: "christmas",    zh: "聖誕節",     en: "Christmas",      priority: 5, on: fixed(12, 25) },
  { slug: "new-year-eve", zh: "跨年",       en: "New Year's Eve", priority: 3, on: fixed(12, 31) },
];

const MARKET_RULES: Record<string, Rule[]> = {
  TW: [
    { slug: "new-year",        zh: "元旦",       en: "New Year's Day",        priority: 4, on: fixed(1, 1) },
    { slug: "spring-festival", zh: "春節",       en: "Lunar New Year",        priority: 5, on: lunar(LUNAR.springFestival) },
    { slug: "valentine",       zh: "西洋情人節", en: "Valentine's Day",       priority: 4, on: fixed(2, 14) },
    { slug: "lantern",         zh: "元宵節",     en: "Lantern Festival",      priority: 3, on: lunar(LUNAR.lantern) },
    { slug: "women-day",       zh: "婦女節",     en: "Women's Day",           priority: 3, on: fixed(3, 8) },
    { slug: "white-valentine", zh: "白色情人節", en: "White Day",             priority: 3, on: fixed(3, 14) },
    { slug: "children-day",    zh: "兒童節",     en: "Children's Day",        priority: 3, on: fixed(4, 4) },
    { slug: "mother-day",      zh: "母親節",     en: "Mother's Day",          priority: 5, on: (y) => nthWeekday(y, 5, 0, 2) },
    { slug: "520",             zh: "520",        en: "520 Love Day",          priority: 3, on: fixed(5, 20) },
    { slug: "618",             zh: "618 年中慶", en: "618 Mid-Year Sale",     priority: 4, on: fixed(6, 18) },
    { slug: "dragon-boat",     zh: "端午節",     en: "Dragon Boat Festival",  priority: 4, on: lunar(LUNAR.dragonBoat) },
    { slug: "father-day",      zh: "父親節",     en: "Father's Day",          priority: 5, on: fixed(8, 8) },
    { slug: "qixi",            zh: "七夕",       en: "Qixi Festival",         priority: 4, on: lunar(LUNAR.qixi) },
    { slug: "mid-autumn",      zh: "中秋節",     en: "Mid-Autumn Festival",   priority: 5, on: lunar(LUNAR.midAutumn) },
    { slug: "teacher-day",     zh: "教師節",     en: "Teacher's Day",         priority: 3, on: fixed(9, 28) },
    { slug: "halloween",       zh: "萬聖節",     en: "Halloween",             priority: 3, on: fixed(10, 31) },
    { slug: "double-11",       zh: "雙 11",      en: "Double 11",             priority: 5, on: fixed(11, 11) },
    { slug: "double-12",       zh: "雙 12",      en: "Double 12",             priority: 4, on: fixed(12, 12) },
    { slug: "christmas",       zh: "聖誕節",     en: "Christmas",             priority: 5, on: fixed(12, 25) },
    { slug: "new-year-eve",    zh: "跨年",       en: "New Year's Eve",        priority: 4, on: fixed(12, 31) },
  ],
  US: [
    { slug: "new-year",       zh: "元旦",         en: "New Year's Day",   priority: 4, on: fixed(1, 1) },
    { slug: "super-bowl",     zh: "超級盃",       en: "Super Bowl",       priority: 4, on: (y) => nthWeekday(y, 2, 0, 2) },
    { slug: "valentine",      zh: "情人節",       en: "Valentine's Day",  priority: 5, on: fixed(2, 14) },
    { slug: "st-patrick",     zh: "聖派翠克節",   en: "St. Patrick's Day", priority: 3, on: fixed(3, 17) },
    { slug: "easter",         zh: "復活節",       en: "Easter",           priority: 4, on: easter },
    { slug: "mother-day",     zh: "母親節",       en: "Mother's Day",     priority: 5, on: (y) => nthWeekday(y, 5, 0, 2) },
    { slug: "memorial-day",   zh: "陣亡將士紀念日", en: "Memorial Day",   priority: 3, on: (y) => nthWeekday(y, 5, 1, -1) },
    { slug: "father-day",     zh: "父親節",       en: "Father's Day",     priority: 5, on: (y) => nthWeekday(y, 6, 0, 3) },
    { slug: "independence",   zh: "國慶日",       en: "Independence Day", priority: 4, on: fixed(7, 4) },
    { slug: "labor-day",      zh: "勞動節",       en: "Labor Day",        priority: 3, on: (y) => nthWeekday(y, 9, 1, 1) },
    { slug: "halloween",      zh: "萬聖節",       en: "Halloween",        priority: 5, on: fixed(10, 31) },
    { slug: "thanksgiving",   zh: "感恩節",       en: "Thanksgiving",     priority: 5, on: (y) => nthWeekday(y, 11, 4, 4) },
    { slug: "black-friday",   zh: "黑色星期五",   en: "Black Friday",     priority: 5, on: (y) => addDays(nthWeekday(y, 11, 4, 4), 1) },
    { slug: "cyber-monday",   zh: "網購星期一",   en: "Cyber Monday",     priority: 4, on: (y) => addDays(nthWeekday(y, 11, 4, 4), 4) },
    { slug: "christmas",      zh: "聖誕節",       en: "Christmas",        priority: 5, on: fixed(12, 25) },
    { slug: "new-year-eve",   zh: "跨年",         en: "New Year's Eve",   priority: 4, on: fixed(12, 31) },
  ],
};

export function marketRules(targetCountry: string | null | undefined): { market: string; rules: Rule[] } {
  const code = String(targetCountry ?? "TW").toUpperCase();
  if (MARKET_RULES[code]) return { market: code, rules: MARKET_RULES[code]! };
  return { market: "GLOBAL", rules: UNIVERSAL };
}

/** [from, to) 期間內的內建節慶，依日期排序。from/to 都是 YYYY-MM-DD。 */
export function builtinNodes(targetCountry: string | null | undefined, from: string, to: string): CalendarNode[] {
  const { market, rules } = marketRules(targetCountry);
  const y0 = Number(from.slice(0, 4)), y1 = Number(to.slice(0, 4));
  const out: CalendarNode[] = [];
  for (let y = y0; y <= y1; y++) {
    for (const r of rules) {
      const date = r.on(y);
      if (!date || date < from || date >= to) continue;
      const builtinKey = `${market.toLowerCase()}:${r.slug}`;
      out.push({
        key: `builtin:${builtinKey}:${y}`, source: "builtin", id: null, builtinKey,
        nameZh: r.zh, nameEn: r.en, date, endDate: null, recurring: true, note: null, priority: r.priority,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ── 自建節點 ────────────────────────────────────────────────────────────────

export interface CustomNodeRow {
  id: number;
  name: string;
  startDate: string;
  endDate: string | null;
  recurring: boolean;
  note: string | null;
}

/** 自建節點展開到 [from, to)：每年重複的節點每年各一個，跨年期間照原本的天數平移。 */
export function expandCustomNodes(rows: CustomNodeRow[], from: string, to: string): CalendarNode[] {
  const y0 = Number(from.slice(0, 4)), y1 = Number(to.slice(0, 4));
  const out: CalendarNode[] = [];
  for (const r of rows) {
    const spanDays = r.endDate ? daysBetween(r.startDate, r.endDate) : 0;
    // 從前一年算起：去年 12/28 開始、延伸到今年 1/3 的那一檔也要出現在今年的視窗
    const years = r.recurring ? range(y0 - 1, y1) : [Number(r.startDate.slice(0, 4))];
    for (const y of years) {
      const start = r.recurring ? shiftYear(r.startDate, y) : r.startDate;
      if (!start) continue;
      const end = r.endDate ? addDays(start, spanDays) : null;
      // 期間跟視窗有交集就顯示（例如 12/28–1/3 的節點在一月視窗裡也看得到）
      if ((end ?? start) < from || start >= to) continue;
      out.push({
        key: `custom:${r.id}:${start.slice(0, 4)}`, source: "custom", id: r.id, builtinKey: null,
        nameZh: r.name, nameEn: r.name, date: start, endDate: end, recurring: r.recurring, note: r.note, priority: 5,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

function daysBetween(a: string, b: string): number {
  const t = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.max(0, Math.round((t(b) - t(a)) / 86_400_000));
}

/** 2/29 在非閏年回 null（那年就不顯示，比偷偷改成 2/28 或 3/1 誠實）。 */
function shiftYear(date: string, y: number): string | null {
  const m = Number(date.slice(5, 7)), d = Number(date.slice(8, 10));
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d > lastDay ? null : ymd(y, m, d);
}

const toYmd = (v: any): string | null => {
  if (!v) return null;
  if (v instanceof Date) return ymd(v.getFullYear(), v.getMonth() + 1, v.getDate());
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};

export async function loadNodeRows(brandId: number): Promise<{ custom: CustomNodeRow[]; hidden: Set<string> }> {
  const [rows]: any = await localPool.execute(
    `SELECT id, kind, builtinKey, name, startDate, endDate, recurring, note
       FROM brand_calendar_nodes WHERE brandId = ? ORDER BY startDate, id`,
    [brandId],
  );
  const custom: CustomNodeRow[] = [];
  const hidden = new Set<string>();
  for (const r of (rows as any[]) ?? []) {
    if (r.kind === "hidden" && r.builtinKey) { hidden.add(String(r.builtinKey)); continue; }
    const startDate = toYmd(r.startDate);
    if (r.kind !== "custom" || !startDate) continue;
    custom.push({
      id: Number(r.id), name: String(r.name ?? ""), startDate, endDate: toYmd(r.endDate),
      recurring: !!Number(r.recurring), note: r.note ? String(r.note) : null,
    });
  }
  return { custom, hidden };
}
