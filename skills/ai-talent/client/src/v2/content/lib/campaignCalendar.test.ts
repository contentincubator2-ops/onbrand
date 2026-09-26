/**
 * 2026-09-26（CJ「點進去，會展開該活動的時間與發佈平台的圖」）：日曆的格子是純
 * 函式算出來的。算錯的樣子很安靜——少一週就是某幾則永遠點不到，而畫面看起來正常。
 */
import { describe, expect, it } from "vitest";
import { weeksFor } from "./campaignCalendar";

describe("weeksFor", () => {
  it("每一週都是 7 格，而且從週一開始", () => {
    const weeks = weeksFor(["2026-09-20", "2026-09-28"]);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    for (const w of weeks) {
      expect(new Date(`${w[0]}T00:00:00.000Z`).getUTCDay()).toBe(1); // 週一
    }
  });

  it("企劃上的每一天都一定有格子（預熱在開賣前、返場在結束後也算）", () => {
    const dates = ["2026-09-15", "2026-09-20", "2026-09-23", "2026-09-28", "2026-09-29"];
    const all = new Set(weeksFor(dates).flat());
    for (const d of dates) expect(all.has(d), d).toBe(true);
  });

  it("單日檔期也排得出一整週", () => {
    const weeks = weeksFor(["2026-09-22"]);
    expect(weeks).toHaveLength(1);
    expect(weeks[0]).toContain("2026-09-22");
  });

  it("沒有日期就沒有日曆（不要畫一個空月曆讓人以為壞了）", () => {
    expect(weeksFor([])).toHaveLength(0);
  });

  it("跨月也連得起來", () => {
    const all = new Set(weeksFor(["2026-09-28", "2026-10-05"]).flat());
    expect(all.has("2026-09-30")).toBe(true);
    expect(all.has("2026-10-01")).toBe(true);
    expect(all.has("2026-10-05")).toBe(true);
  });
});
