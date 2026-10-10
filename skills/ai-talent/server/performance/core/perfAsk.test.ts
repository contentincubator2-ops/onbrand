import { describe, it, expect, vi } from "vitest";

vi.mock("../../localDb", () => ({ default: { execute: vi.fn() } }));
vi.mock("../../platform/core/llm/multiModelRouter", () => ({ callModel: vi.fn() }));

import { sanitizePlan, periodRange, applyFilters, buildAnswer, buildExplain, formulaOf } from "./perfAsk";
import { pivot, type Fact, type Dimension } from "./perfPivot";

const TODAY = new Date("2026-10-11T00:00:00Z");
const dims: Dimension[] = [
  { key: "ta", label: "族群", values: [{ code: "family", label: "家庭" }, { code: "single", label: "單身" }] },
  { key: "usp", label: "USP", values: [{ code: "fast", label: "快速" }, { code: "clean", label: "不髒手" }] },
];

function fact(id: number, tags: Record<string, string>, metrics: Record<string, number>, over: Partial<Fact> = {}): Fact {
  return { id, source: "meta_ads", entityType: "ad", entityId: String(id), entityLabel: null, date: "2026-09-20", tags, metrics, ...over };
}

describe("perfAsk.sanitizePlan", () => {
  const ok = { answerable: true, title: "族群轉換", rowDim: "ta", colDim: "usp", judge: "cvr", stages: [{ metric: "clicks" }, { metric: "bogus" }], period: { days: 80 } };

  it("keeps a valid plan and snaps odd day counts to a known period", () => {
    const r = sanitizePlan(ok, dims, ["meta_ads"], TODAY, 90);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan.config.rowDim).toBe("ta");
      expect(r.plan.config.colDim).toBe("usp");
      expect(r.plan.config.stages).toEqual([{ metric: "clicks" }]);
      expect(r.plan.period).toEqual({ kind: "days", days: 90 });
      expect(r.plan.config.sources).toEqual(["meta_ads"]);
    }
  });

  it("rejects dimensions the brand does not have — a question must not create dimensions", () => {
    expect(sanitizePlan({ ...ok, rowDim: "weather" }, dims, [], TODAY, 90).ok).toBe(false);
  });

  it("rejects an unknown judge metric", () => {
    expect(sanitizePlan({ ...ok, judge: "happiness" }, dims, [], TODAY, 90).ok).toBe(false);
  });

  it("passes the model's own refusal reason through", () => {
    const r = sanitizePlan({ answerable: false, reason: "沒有天氣資料" }, dims, [], TODAY, 90);
    expect(r).toEqual({ ok: false, reason: "沒有天氣資料" });
  });

  it("drops filters whose code is not a known value, keeps valid ones", () => {
    const r = sanitizePlan({ ...ok, filters: [{ dimKey: "ta", code: "nobody" }, { dimKey: "ta", code: "family" }, { dimKey: "month", code: "2026-09" }] }, dims, [], TODAY, 90);
    expect(r.ok && r.plan.filters).toEqual([{ dimKey: "ta", code: "family" }, { dimKey: "month", code: "2026-09" }]);
  });

  it("only allows sources inside the tray's scope", () => {
    const r = sanitizePlan({ ...ok, sources: ["google_ads", "meta_ads"] }, dims, ["meta_ads"], TODAY, 90);
    expect(r.ok && r.plan.config.sources).toEqual(["meta_ads"]);
  });

  it("falls back to the UI range when no period is given and rejects future months", () => {
    const a = sanitizePlan({ ...ok, period: null }, dims, [], TODAY, 180);
    expect(a.ok && a.plan.period).toEqual({ kind: "days", days: 180 });
    const b = sanitizePlan({ ...ok, period: { month: "2027-01" } }, dims, [], TODAY, 30);
    expect(b.ok && b.plan.period).toEqual({ kind: "days", days: 30 });
  });
});

describe("perfAsk.periodRange", () => {
  it("walks back N days from today", () => {
    expect(periodRange({ kind: "days", days: 30 }, TODAY)).toEqual({ from: "2026-09-11", to: "2026-10-11" });
  });
  it("covers a whole past month", () => {
    expect(periodRange({ kind: "month", month: "2026-09" }, TODAY)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });
  it("stops at today for the current month", () => {
    expect(periodRange({ kind: "month", month: "2026-10" }, TODAY)).toEqual({ from: "2026-10-01", to: "2026-10-11" });
  });
});

describe("perfAsk.buildAnswer / buildExplain", () => {
  const facts: Fact[] = [
    fact(1, { ta: "family", usp: "fast" }, { clicks: 100, orders: 10 }),
    fact(2, { ta: "family", usp: "fast" }, { clicks: 100, orders: 10 }),
    fact(3, { ta: "single", usp: "fast" }, { clicks: 100, orders: 2 }),
    fact(4, { ta: "single", usp: "fast" }, { clicks: 100, orders: 2 }),
    fact(5, { ta: "single", usp: "clean" }, { clicks: 100, orders: 50 }), // 只有 1 筆 → 不進排名
    fact(6, {}, { clicks: 50, orders: 1 }),                                // 沒標族群
  ];
  const cfg = { rowDim: "ta", colDim: null, judge: "cvr", stages: [] };
  const result = pivot(facts, cfg, dims, []);

  it("ranks by the judge value and excludes untagged and thin cells", () => {
    const a = buildAnswer(result, "cvr");
    expect(a.kind).toBe("ranking");
    // 單身整列：clicks 300、orders 54 → 0.18；家庭：clicks 200、orders 20 → 0.10；未歸類不進排名
    expect(a.best!.row.label).toBe("單身");
    expect(a.best!.judge).toBeCloseTo(0.18);
    expect(a.worst!.row.label).toBe("家庭");
    expect(a.ranked.map((c) => c.row.label)).toEqual(["單身", "家庭"]);
  });

  it("explains what was excluded", () => {
    const e = buildExplain({ facts, from: "2026-09-01", to: "2026-09-30", config: cfg, filters: [], result });
    expect(e.factCount).toBe(6);
    expect(e.excluded.untaggedFacts).toBe(1);
    expect(e.sources).toEqual([expect.objectContaining({ source: "meta_ads", facts: 6, latest: "2026-09-20" })]);
    expect(e.formula.zh).toBe("訂單 ÷ 點擊");
  });

  it("says no-data instead of inventing a ranking", () => {
    const empty = pivot([], cfg, dims, []);
    expect(buildAnswer(empty, "cvr").kind).toBe("nodata");
  });

  it("treats lower CPA as better", () => {
    const cpaFacts = [
      fact(1, { ta: "family" }, { spend: 100, orders: 10 }), fact(2, { ta: "family" }, { spend: 100, orders: 10 }),
      fact(3, { ta: "single" }, { spend: 100, orders: 2 }), fact(4, { ta: "single" }, { spend: 100, orders: 2 }),
    ];
    const r = pivot(cpaFacts, { rowDim: "ta", colDim: null, judge: "cpa", stages: [] }, dims, []);
    const a = buildAnswer(r, "cpa");
    expect(a.best!.row.label).toBe("家庭");
    expect(a.worst!.row.label).toBe("單身");
  });

  it("applyFilters keeps only matching facts", () => {
    expect(applyFilters(facts, [{ dimKey: "ta", code: "family" }], []).map((f) => f.id)).toEqual([1, 2]);
  });

  it("formulaOf names a plain metric sum", () => {
    expect(formulaOf("orders").zh).toBe("訂單 加總");
  });
});
