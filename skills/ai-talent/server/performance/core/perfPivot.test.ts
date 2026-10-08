import { describe, it, expect } from "vitest";
import { pivot, resolveTag, labelFor, BUILTIN_DIMS, SOURCE_LABELS, judgeValue, funnelOf, slugCode, UNTAGGED, type Fact, type Dimension, type TagRule } from "./perfPivot";

const dims: Dimension[] = [
  { key: "ta", label: "族群", values: [{ code: "family", label: "雙薪家庭" }, { code: "office", label: "上班族" }] },
  { key: "usp", label: "USP", values: [{ code: "fast", label: "5 分鐘上桌" }, { code: "nomess", label: "免洗鍋" }] },
];
const f = (id: number, tags: Record<string, string>, metrics: Record<string, number>, extra: Partial<Fact> = {}): Fact => ({
  id, source: "meta_ads", entityType: "ad", entityId: String(id), entityLabel: null, date: "2026-09-10", tags, metrics, ...extra,
});

describe("perfPivot", () => {
  it("exposes origin as a builtin dimension", () => {
    expect(BUILTIN_DIMS.origin).toEqual({ label: "發布來源", labelEn: "Published by" });
  });

  it("resolves only stored origin and never guesses from text or rules", () => {
    const rules: TagRule[] = [{ dimKey: "origin", valueCode: "onbrand", pattern: "onBrand" }];
    for (const origin of ["onbrand", "external"]) {
      expect(resolveTag(f(1, { origin }, {}), "origin", rules)).toBe(origin);
    }
    for (const tags of [{}, { origin: "" }]) {
      expect(resolveTag(f(1, tags, {}, { entityLabel: "onBrand", source: "fb_page" }), "origin", rules)).toBe(UNTAGGED);
    }
  });

  it.each([
    ["onbrand", "onBrand 發布", "Published via onBrand"],
    ["external", "原本自行發布", "Published elsewhere"],
    [UNTAGGED, "未歸類", "未歸類"],
  ])("labels origin %s in Chinese and English", (code, zh, en) => {
    expect(labelFor("origin", code, [])).toBe(zh);
    expect(labelFor("origin", code, [], "en")).toBe(en);
  });

  it("groups origin in rows and columns while keeping legacy facts unclassified", () => {
    const facts = [f(1, { origin: "onbrand" }, { reach: 10 }), f(2, { origin: "external" }, { reach: 20 }), f(3, {}, { reach: 5 })];
    const rows = [
      { code: "external", label: "原本自行發布" }, { code: "onbrand", label: "onBrand 發布" },
      { code: UNTAGGED, label: "未歸類" },
    ];
    const result = pivot(facts, { rowDim: "origin", stages: [], judge: "reach" }, [], []);
    expect(result.rows).toEqual(rows);
    expect(result.coverage).toEqual({ tagged: 2, total: 3 });
    expect(result.rowTotals.onbrand.totals.reach).toBe(10);
    expect(result.rowTotals[UNTAGGED].count).toBe(1);
    expect(pivot(facts, { rowDim: "month", colDim: "origin", stages: [], judge: "reach" }, [], []).cols).toEqual(rows);
  });

  it.each([
    ["ig_account", "Instagram 貼文"], ["threads_account", "Threads 貼文"],
    ["linkedin_page", "LinkedIn 貼文"], ["fb_page", "粉專貼文"],
  ])("labels social source %s", (source, label) => {
    expect(SOURCE_LABELS[source]).toBe(label);
    expect(pivot([f(1, {}, {}, { source })], { rowDim: "source", stages: [], judge: "reach" }, [], []).rows)
      .toEqual([{ code: source, label }]);
  });
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
