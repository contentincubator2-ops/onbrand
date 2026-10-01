/**
 * 策略 rail 的導覽規則。
 *
 * 2026-09-30（CJ「我按了品牌以後，反而出現活動定位」）：守住「按品牌就是品牌」
 * 與「人在活動裡，亮的是活動」。
 */
import { describe, it, expect } from "vitest";
import { strategyRailTarget, strategyRailActiveCat } from "./strategyRail";

describe("strategyRailTarget", () => {
  it("人在活動裡按「品牌」：回到品牌定位，不帶活動 id", () => {
    expect(strategyRailTarget("positioning", "?b=2977&e=31&cat=campaign", 2977))
      .toBe("/brands/edit?b=2977&cat=positioning");
  });

  it("人在活動裡按「活動」：回到活動列表", () => {
    expect(strategyRailTarget("events", "?b=2977&e=31&cat=positioning", 2977))
      .toBe("/brands/edit?b=2977&cat=events");
  });

  it("人在產品裡按「視覺」「會議」「記憶」：都是品牌層，不帶產品 id", () => {
    for (const cat of ["visual", "meetings", "regulations", "brain", "products"]) {
      expect(strategyRailTarget(cat, "?b=5&p=9&cat=positioning", 5)).toBe(`/brands/edit?b=5&cat=${cat}`);
    }
  });

  it("人在活動／產品裡按「文字」：看的是品牌的文字，不帶活動／產品 id（10/2 CJ）", () => {
    expect(strategyRailTarget("copy", "?b=5&e=31&cat=campaign", 5)).toBe("/brands/edit?b=5&cat=copy");
    expect(strategyRailTarget("copy", "?b=5&p=9", 5)).toBe("/brands/edit?b=5&cat=copy");
  });

  it("沒有品牌時只帶 cat", () => {
    expect(strategyRailTarget("positioning", "?e=31", null)).toBe("/brands/edit?cat=positioning");
  });
});

describe("strategyRailActiveCat", () => {
  it("活動的定位頁與企劃頁：亮「活動」", () => {
    expect(strategyRailActiveCat("?b=2977&e=31&cat=positioning")).toBe("events");
    expect(strategyRailActiveCat("?b=2977&e=31&cat=campaign")).toBe("events");
    expect(strategyRailActiveCat("?b=2977&e=31")).toBe("events");
  });

  it("產品的定位頁：亮「產品」", () => {
    expect(strategyRailActiveCat("?b=5&p=9&cat=positioning")).toBe("products");
  });

  it("品牌層照 cat；沒有 cat 是定位", () => {
    expect(strategyRailActiveCat("?b=5")).toBe("positioning");
    expect(strategyRailActiveCat("?b=5&cat=brain")).toBe("brain");
  });

  it("活動底下的「文字」亮「文字」", () => {
    expect(strategyRailActiveCat("?b=5&e=31&cat=copy")).toBe("copy");
  });
});
