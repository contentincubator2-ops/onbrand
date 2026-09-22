/**
 * 緘默期的日期判斷。
 *
 * 這條規則跟政策包那六條不同：它會依日期自動開關，而且開著的時候會擋掉業務
 * 談營收。判斷錯的兩個方向代價都很高——該生效沒生效，等於證券法風險沒擋到；
 * 不該生效卻生效，等於整段期間所有人都被綁住而且沒人知道為什麼。
 */
import { describe, expect, it } from "vitest";
import { isQuietOn, localToday, toQuietPeriod, type ActiveQuietPeriod } from "./brandAssets";

const period = (over: Partial<ActiveQuietPeriod> = {}): ActiveQuietPeriod => ({
  label: "Q3 earnings",
  startsOn: "2026-10-01",
  endsOn: "2026-10-28",
  topics: ["revenue"],
  ...over,
});

describe("isQuietOn", () => {
  it("includes both end days", () => {
    expect(isQuietOn(period(), "2026-10-01")).toBe(true);
    expect(isQuietOn(period(), "2026-10-28")).toBe(true);
  });

  it("excludes the day before and the day after", () => {
    expect(isQuietOn(period(), "2026-09-30")).toBe(false);
    expect(isQuietOn(period(), "2026-10-29")).toBe(false);
  });

  it("compares across month and year boundaries", () => {
    const p = period({ startsOn: "2026-12-28", endsOn: "2027-01-05" });
    expect(isQuietOn(p, "2026-12-31")).toBe(true);
    expect(isQuietOn(p, "2027-01-01")).toBe(true);
    expect(isQuietOn(p, "2027-01-06")).toBe(false);
    // 字串比較必須是時序，不是「1 月小於 12 月」那種數值直覺。
    expect(isQuietOn(p, "2026-01-15")).toBe(false);
  });

  it("never fires on a half-filled window", () => {
    // 沒有結束日的緘默期會把之後每一篇都綁死，寧可漏掉。
    expect(isQuietOn(period({ endsOn: "" }), "2026-10-10")).toBe(false);
    expect(isQuietOn(period({ startsOn: "" }), "2026-10-10")).toBe(false);
  });

  it("never fires when the window is inverted", () => {
    expect(isQuietOn(period({ startsOn: "2026-10-28", endsOn: "2026-10-01" }), "2026-10-10")).toBe(false);
  });
});

describe("toQuietPeriod", () => {
  it("takes topics as an array", () => {
    const p = toQuietPeriod({ payload: { label: "x", startsOn: "2026-10-01", endsOn: "2026-10-02", topics: ["revenue", " growth "] } });
    expect(p.topics).toEqual(["revenue", "growth"]);
  });

  it("also takes them as the comma string the form sends", () => {
    const p = toQuietPeriod({ payload: { startsOn: "2026-10-01", endsOn: "2026-10-02", topics: "revenue, growth rate、forecasts" } });
    expect(p.topics).toEqual(["revenue", "growth rate", "forecasts"]);
  });

  it("trims a datetime down to the date", () => {
    const p = toQuietPeriod({ payload: { startsOn: "2026-10-01T00:00:00.000Z", endsOn: "2026-10-28T23:59:59.000Z" } });
    expect(p.startsOn).toBe("2026-10-01");
    expect(p.endsOn).toBe("2026-10-28");
  });

  it("survives an empty payload instead of throwing", () => {
    const p = toQuietPeriod({ payload: {} });
    expect(p).toEqual({ label: "", startsOn: "", endsOn: "", topics: [] });
    expect(isQuietOn(p, localToday())).toBe(false);
  });
});

describe("localToday", () => {
  it("is a plain local YYYY-MM-DD, not a UTC ISO string", () => {
    // toISOString() 會把台北時間的凌晨推回前一天，緘默期就會早一天結束。
    const today = localToday();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    expect(today).toBe(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
  });
});
