import { describe, expect, it } from "vitest";
import { eventPhase, labelPx, nodeErrorText, overlaps, packLanes, pct, pxToDays, shiftMonth, sortEventsForCards, timelineWindow } from "./eventTimeline";

describe("滾動 12 個月視窗", () => {
  it("從十月開始跨到隔年九月", () => {
    const w = timelineWindow("2026-10");
    expect(w.from).toBe("2026-10-01");
    expect(w.to).toBe("2027-10-01");
    expect(w.months.map((m) => m.key)).toEqual([
      "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03",
      "2027-04", "2027-05", "2027-06", "2027-07", "2027-08", "2027-09",
    ]);
  });
  it("左右移動 12 個月", () => {
    expect(shiftMonth("2026-10", 12)).toBe("2027-10");
    expect(shiftMonth("2026-10", -12)).toBe("2025-10");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
  it("位置夾在 0–100，交集判斷含跨進視窗的期間", () => {
    const w = timelineWindow("2026-10");
    expect(pct(w, "2026-10-01")).toBe(0);
    expect(pct(w, "2027-10-01")).toBe(100);
    expect(pct(w, "2025-01-01")).toBe(0);
    expect(pct(w, "2027-04-01")).toBeGreaterThan(49);
    expect(overlaps(w, "2026-09-20", "2026-10-05")).toBe(true);
    expect(overlaps(w, "2026-09-20", null)).toBe(false);
    expect(overlaps(w, "2027-10-01", null)).toBe(false);
  });
});

describe("分道", () => {
  it("重疊的期間放不同道，不重疊的共用", () => {
    const r = packLanes([
      { id: "a", start: "2026-11-01", end: "2026-11-15" },
      { id: "b", start: "2026-11-10", end: "2026-11-20" },
      { id: "c", start: "2026-11-16", end: null },
    ]);
    expect(Object.fromEntries(r.map((x) => [x.id, x.lane]))).toEqual({ a: 0, b: 1, c: 0 });
  });
  it("單日節點靠太近時（minGapDays）分道", () => {
    const r = packLanes([
      { id: "tg", start: "2026-11-26", end: null },
      { id: "bf", start: "2026-11-27", end: null },
      { id: "xmas", start: "2026-12-25", end: null },
    ], 10);
    expect(Object.fromEntries(r.map((x) => [x.id, x.lane]))).toEqual({ tg: 0, bf: 1, xmas: 0 });
  });
});

describe("標籤寬度換算", () => {
  it("中文字比英文寬；寬度換成天數跟軌道寬度成反比", () => {
    expect(labelPx("父親節", 0)).toBe(36);
    expect(labelPx("Easter", 0)).toBe(39);
    const w = timelineWindow("2026-10");
    expect(pxToDays(365, w, 365)).toBe(365);
    expect(pxToDays(60, w, 730)).toBe(30);
  });
  it("同一天開始的寬標籤會把後面靠近的節點擠到下一列", () => {
    const r = packLanes([
      { id: "a", start: "2026-11-01", end: null, gap: 30 },
      { id: "b", start: "2026-11-20", end: null, gap: 5 },
      { id: "c", start: "2026-12-05", end: null, gap: 5 },
    ], (it) => it.gap);
    expect(Object.fromEntries(r.map((x) => [x.id, x.lane]))).toEqual({ a: 0, b: 1, c: 0 });
  });
});

describe("活動狀態與卡片排序", () => {
  const today = "2026-10-02";
  it("四種狀態", () => {
    expect(eventPhase(null, null, today)).toEqual({ phase: "undated", days: null });
    expect(eventPhase("2026-10-12", "2026-10-20", today)).toEqual({ phase: "upcoming", days: 10 });
    expect(eventPhase("2026-09-30", "2026-10-05", today)).toEqual({ phase: "live", days: 3 });
    expect(eventPhase("2026-10-02", null, today)).toEqual({ phase: "live", days: 0 });
    expect(eventPhase("2026-09-01", "2026-09-30", today)).toEqual({ phase: "ended", days: 2 });
  });
  it("進行中 → 即將開始 → 未排日期 → 已結束", () => {
    const sorted = sortEventsForCards([
      { id: 1, startAt: "2026-08-01", endAt: "2026-08-02" },
      { id: 2, startAt: null, endAt: null },
      { id: 3, startAt: "2026-12-01", endAt: null },
      { id: 4, startAt: "2026-10-20", endAt: null },
      { id: 5, startAt: "2026-10-01", endAt: "2026-10-10" },
    ], today);
    expect(sorted.map((e) => e.id)).toEqual([5, 4, 3, 2, 1]);
  });
});

describe("節點錯誤訊息依介面語言", () => {
  it("找不到、數量上限、日期順序都有中英文", () => {
    const nf = { message: "找不到這個節點", data: { code: "NOT_FOUND" } };
    expect(nodeErrorText(nf, true)).toMatch(/no longer exists/);
    expect(nodeErrorText(nf, false)).toMatch(/找不到這個節點/);
    const cap = { message: "一個品牌最多 60 個自訂節點", data: { code: "BAD_REQUEST" } };
    expect(nodeErrorText(cap, true)).toBe("A brand can have at most 60 custom dates.");
    expect(nodeErrorText(cap, false)).toBe("一個品牌最多 60 個自訂節點。");
    // zod refine 的錯誤是一串 JSON，裡面帶著中文訊息
    const zod = { message: '[{"code":"custom","message":"結束日不能早於開始日","path":["endDate"]}]', data: { code: "BAD_REQUEST" } };
    expect(nodeErrorText(zod, true)).toBe("End date is before the start.");
  });
  it("認不得的錯誤：英文介面不顯示中文原文", () => {
    expect(nodeErrorText({ message: "資料庫忙碌" }, true)).toBe("Something went wrong — please try again.");
    expect(nodeErrorText({ message: "資料庫忙碌" }, false)).toBe("資料庫忙碌");
    expect(nodeErrorText({ message: "Network error" }, true)).toBe("Network error");
  });
});
