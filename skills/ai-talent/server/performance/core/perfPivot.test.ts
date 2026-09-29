import { describe, it, expect } from "vitest";
import { pivot, resolveTag, judgeValue, funnelOf, slugCode, UNTAGGED, type Fact, type Dimension, type TagRule } from "./perfPivot";

const dims: Dimension[] = [
  { key: "ta", label: "族群", values: [{ code: "family", label: "雙薪家庭" }, { code: "office", label: "上班族" }] },
  { key: "usp", label: "USP", values: [{ code: "fast", label: "5 分鐘上桌" }, { code: "nomess", label: "免洗鍋" }] },
];
const f = (id: number, tags: Record<string, string>, metrics: Record<string, number>, extra: Partial<Fact> = {}): Fact => ({
  id, source: "meta_ads", entityType: "ad", entityId: String(id), entityLabel: null, date: "2026-09-10", tags, metrics, ...extra,
});

describe("perfPivot", () => {
  it("groups by row × col and computes ROAS per cell", () => {
    const facts = [
      f(1, { ta: "family", usp: "nomess" }, { spend: 100, revenue: 460 }),
      f(2, { ta: "family", usp: "fast" }, { spend: 100, revenue: 310 }),
      f(3, { ta: "office", usp: "fast" }, { spend: 200, revenue: 840 }),
    ];
    const r = pivot(facts, { rowDim: "ta", colDim: "usp", stages: [], judge: "roas" }, dims, []);
    expect(r.cells["family|nomess"].judge).toBeCloseTo(4.6);
    expect(r.cells["office|fast"].judge).toBeCloseTo(4.2);
    expect(r.rowTotals.family.totals.spend).toBe(200);
    expect(r.total.judge).toBeCloseTo(1610 / 400);
    expect(r.rows.map((x) => x.code)).toEqual(["family", "office"]);
  });

  it("applies rules retroactively and keeps untagged facts visible", () => {
    const rules: TagRule[] = [{ dimKey: "ta", valueCode: "family", pattern: "媽媽|family" }];
    const facts = [
      f(1, {}, { spend: 10 }, { entityLabel: "FALL_Family_Retarget" }),
      f(2, {}, { spend: 5 }, { entityLabel: "brand awareness" }),
    ];
    const r = pivot(facts, { rowDim: "ta", stages: [], judge: "spend" }, dims, rules);
    expect(r.rowTotals.family.totals.spend).toBe(10);
    expect(r.rowTotals[UNTAGGED].totals.spend).toBe(5);
    expect(r.coverage).toEqual({ tagged: 1, total: 2 });
    expect(r.rows.at(-1)!.code).toBe(UNTAGGED);
  });

  it("derives builtin month / source dims", () => {
    expect(resolveTag(f(1, {}, {}), "month", [])).toBe("2026-09");
    expect(resolveTag(f(1, {}, {}, { source: "fb_page" }), "source", [])).toBe("fb_page");
  });

  it("filters by lens sources", () => {
    const facts = [f(1, {}, { spend: 1 }), f(2, {}, { reach: 9 }, { source: "fb_page" })];
    const r = pivot(facts, { rowDim: "month", stages: [], judge: "reach", sources: ["fb_page"] }, dims, []);
    expect(r.factCount).toBe(1);
    expect(r.total.totals.reach).toBe(9);
  });

  it("returns null for undefined ratios instead of 0", () => {
    expect(judgeValue("roas", { revenue: 10 })).toBeNull();
    expect(judgeValue("engagementRate", { engagement: 5, impressions: 100 })).toBeCloseTo(0.05);
  });

  it("computes funnel step rates", () => {
    const fn = funnelOf({ impressions: 1000, clicks: 20, orders: 2 }, [{ metric: "impressions" }, { metric: "clicks" }, { metric: "orders" }]);
    expect(fn[1].stepRate).toBeCloseTo(0.02);
    expect(fn[2].stepRate).toBeCloseTo(0.1);
    expect(fn[0].label).toBe("曝光");
  });

  it("slugCode yields unique ascii codes", () => {
    const taken = new Set<string>();
    expect(slugCode("Busy Office", taken)).toBe("busy-office");
    expect(slugCode("Busy Office", taken)).toBe("busy-office-2");
    expect(slugCode("雙薪家庭", taken)).toMatch(/^v\d+$/);
  });
});
