import { describe, expect, it } from "vitest";
import {
  ALL_INDUSTRIES,
  INDUSTRIES,
  daysLeft,
  industryLabel,
  isLive,
  reaches,
  unknownIndustries,
} from "./industries";

describe("reaches", () => {
  it("sends an industry-specific fact only to reps who cover it", () => {
    expect(reaches(["manufacturing"], ["manufacturing"])).toBe(true);
    expect(reaches(["manufacturing"], ["food_beverage"])).toBe(false);
  });

  it("sends an all-industries fact to everyone", () => {
    expect(reaches([ALL_INDUSTRIES], ["food_beverage"])).toBe(true);
  });

  it("gives a rep who covers all industries everything", () => {
    expect(reaches(["manufacturing"], [ALL_INDUSTRIES])).toBe(true);
  });

  // 空的 = 不限，不是 = 沒有。漏掉一則補助的代價比多收一則大得多。
  it("treats an untagged fact as everyone's, not nobody's", () => {
    expect(reaches([], ["manufacturing"])).toBe(true);
  });

  it("treats an untagged rep as receiving everything, not nothing", () => {
    expect(reaches(["manufacturing"], [])).toBe(true);
  });

  it("matches when the lists overlap on any one industry", () => {
    expect(reaches(["manufacturing", "food_beverage"], ["food_beverage", "retail_ecommerce"])).toBe(true);
  });
});

describe("isLive / daysLeft", () => {
  it("keeps a subsidy live on its deadline day", () => {
    expect(isLive("2026-09-29", "2026-09-29")).toBe(true);
    expect(daysLeft("2026-09-29", "2026-09-29")).toBe(0);
  });

  it("drops it the day after", () => {
    expect(isLive("2026-09-29", "2026-09-30")).toBe(false);
  });

  it("treats no deadline as always live", () => {
    expect(isLive(null, "2026-09-29")).toBe(true);
    expect(daysLeft(null, "2026-09-29")).toBeNull();
  });

  it("counts the days remaining", () => {
    expect(daysLeft("2026-09-29", "2026-09-23")).toBe(6);
  });
});

describe("the vocabulary itself", () => {
  it("labels a known id in both languages and leaves an unknown one visible", () => {
    expect(industryLabel("manufacturing", true)).toBe("製造業");
    expect(industryLabel("manufacturing", false)).toBe("Manufacturing");
    expect(industryLabel("typo_industry", true)).toBe("typo_industry");
  });

  it("names all_industries rather than treating it as a fifth industry", () => {
    expect(industryLabel(ALL_INDUSTRIES, true)).toBe("不分產業");
    expect(INDUSTRIES.map((i) => i.id)).not.toContain(ALL_INDUSTRIES);
  });

  it("reports ids that are not in the vocabulary", () => {
    expect(unknownIndustries(["manufacturing", ALL_INDUSTRIES, "nope"])).toEqual(["nope"]);
  });
});
