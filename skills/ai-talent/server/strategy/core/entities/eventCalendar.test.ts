import { describe, expect, it } from "vitest";
import { addDays, builtinNodes, easter, expandCustomNodes, marketRules, nthWeekday } from "./eventCalendar";

describe("日期工具", () => {
  it("某月第 N 個星期幾／最後一個", () => {
    expect(nthWeekday(2026, 5, 0, 2)).toBe("2026-05-10");   // 母親節
    expect(nthWeekday(2027, 5, 0, 2)).toBe("2027-05-09");
    expect(nthWeekday(2026, 11, 4, 4)).toBe("2026-11-26");  // 感恩節
    expect(nthWeekday(2027, 11, 4, 4)).toBe("2027-11-25");
    expect(nthWeekday(2026, 5, 1, -1)).toBe("2026-05-25");  // Memorial Day
    expect(nthWeekday(2026, 6, 0, 3)).toBe("2026-06-21");   // 美國父親節
    expect(nthWeekday(2027, 2, 0, 2)).toBe("2027-02-14");   // Super Bowl LXI
  });
  it("復活節", () => {
    expect(easter(2026)).toBe("2026-04-05");
    expect(easter(2027)).toBe("2027-03-28");
    expect(easter(2028)).toBe("2028-04-16");
  });
  it("跨月加天數", () => {
    expect(addDays("2026-11-26", 1)).toBe("2026-11-27");
    expect(addDays("2026-11-26", 4)).toBe("2026-11-30");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });
});

describe("內建節慶依市場", () => {
  it("台灣：含農曆節日，母親節第二個週日", () => {
    const n = builtinNodes("TW", "2027-01-01", "2028-01-01");
    const by = Object.fromEntries(n.map((x) => [x.builtinKey, x.date]));
    expect(by["tw:spring-festival"]).toBe("2027-02-06");
    expect(by["tw:mid-autumn"]).toBe("2027-09-15");
    expect(by["tw:mother-day"]).toBe("2027-05-09");
    expect(by["tw:double-11"]).toBe("2027-11-11");
    expect(by["tw:black-friday"]).toBeUndefined();
  });
  it("美國：感恩節、黑五、網購星期一、父親節", () => {
    const n = builtinNodes("us", "2026-10-01", "2027-10-01");
    const by = Object.fromEntries(n.map((x) => [x.builtinKey, x.date]));
    expect(by["us:thanksgiving"]).toBe("2026-11-26");
    expect(by["us:black-friday"]).toBe("2026-11-27");
    expect(by["us:cyber-monday"]).toBe("2026-11-30");
    expect(by["us:father-day"]).toBe("2027-06-20");
    expect(by["tw:spring-festival"]).toBeUndefined();
  });
  it("未建檔市場給通用節日；視窗是半開區間", () => {
    expect(marketRules("JP").market).toBe("GLOBAL");
    const n = builtinNodes("JP", "2026-12-25", "2026-12-31");
    expect(n.map((x) => x.nameEn)).toEqual(["Christmas"]);
  });
  it("農曆表沒有的年份就不顯示，不猜", () => {
    const n = builtinNodes("TW", "2031-01-01", "2032-01-01");
    expect(n.find((x) => x.builtinKey === "tw:spring-festival")).toBeUndefined();
    expect(n.find((x) => x.builtinKey === "tw:christmas")?.date).toBe("2031-12-25");
  });
  it("跨兩個年份的視窗按日期排序", () => {
    const n = builtinNodes("US", "2026-10-01", "2027-10-01");
    const dates = n.map((x) => x.date);
    expect([...dates].sort()).toEqual(dates);
    expect(dates[0]).toBe("2026-10-31");
  });
});

describe("自建節點展開", () => {
  const base = { note: null };
  it("每年重複的節點在視窗內每年一個", () => {
    const n = expandCustomNodes([{ ...base, id: 7, name: "週年慶", startDate: "2025-11-15", endDate: "2025-11-30", recurring: true }],
      "2026-10-01", "2027-12-01");
    expect(n.map((x) => [x.date, x.endDate])).toEqual([["2026-11-15", "2026-11-30"], ["2027-11-15", "2027-11-30"]]);
    expect(n[0]!.key).toBe("custom:7:2026");
  });
  it("不重複的節點只在自己那天", () => {
    const n = expandCustomNodes([{ ...base, id: 8, name: "新品上市", startDate: "2027-03-01", endDate: null, recurring: false }],
      "2026-10-01", "2027-10-01");
    expect(n).toHaveLength(1);
    expect(expandCustomNodes([{ ...base, id: 8, name: "x", startDate: "2025-03-01", endDate: null, recurring: false }],
      "2026-10-01", "2027-10-01")).toHaveLength(0);
  });
  it("跨年期間平移天數、跟視窗有交集就顯示", () => {
    const n = expandCustomNodes([{ ...base, id: 9, name: "年終", startDate: "2025-12-28", endDate: "2026-01-03", recurring: true }],
      "2027-01-01", "2028-01-01");
    // 2026-12-28 開始的那一檔延伸到 2027-01-03，2027 的視窗看得到
    expect(n.map((x) => [x.date, x.endDate])).toEqual([["2026-12-28", "2027-01-03"], ["2027-12-28", "2028-01-03"]]);
  });
  it("2/29 在非閏年不顯示", () => {
    const n = expandCustomNodes([{ ...base, id: 10, name: "閏日", startDate: "2028-02-29", endDate: null, recurring: true }],
      "2027-01-01", "2029-01-01");
    expect(n.map((x) => x.date)).toEqual(["2028-02-29"]);
  });
});
