import { describe, expect, it } from "vitest";
import { isQuotable, perRepCounts, routeFacts, unreachable } from "./factRouting";

const TODAY = "2026-09-23";

const fact = (p: Partial<Parameters<typeof routeFacts>[0][number]> = {}) => ({
  id: 1, kind: "subsidy", market: "TW", industries: ["manufacturing"],
  expiresOn: null, confidence: "official", figures: {}, ...p,
}) as any;

const rep = (id: number, market: string, industries: string[], name = `rep${id}`) =>
  ({ id, name, market, industries }) as any;

const REPS = [
  rep(1, "TW", ["manufacturing"]),
  rep(2, "TW", ["food_beverage"]),
  rep(3, "TW", ["all_industries"]),
  rep(4, "US", ["manufacturing"]),
];

describe("routeFacts", () => {
  it("sends an industry-specific fact to the reps who cover it, plus the all-industries reps", () => {
    const r = routeFacts([fact()], REPS, TODAY)[1];
    expect(r.repIds).toEqual([1, 3]);
    expect(r.forwardable).toBe(true);
  });

  // 台灣的補助不該出現在美國業務的手機上。
  it("never crosses markets", () => {
    const r = routeFacts([fact({ market: "US" })], REPS, TODAY)[1];
    expect(r.repIds).toEqual([4]);
  });

  it("stops forwarding the day after the deadline", () => {
    const live = routeFacts([fact({ expiresOn: "2026-09-23" })], REPS, TODAY)[1];
    expect(live.live).toBe(true);
    expect(live.daysLeft).toBe(0);
    expect(live.forwardable).toBe(true);

    const gone = routeFacts([fact({ expiresOn: "2026-09-22" })], REPS, TODAY)[1];
    expect(gone.live).toBe(false);
    expect(gone.forwardable).toBe(false);
  });

  // 競品比較是總部的判斷材料，不是可以往外轉的東西。
  it("never forwards competitor intel", () => {
    const r = routeFacts([fact({ kind: "competitor", industries: ["all_industries"] })], REPS, TODAY)[1];
    expect(r.repIds.length).toBeGreaterThan(0);
    expect(r.forwardable).toBe(false);
  });

  it("never forwards something still to be verified", () => {
    const r = routeFacts([fact({ confidence: "needs_verification" })], REPS, TODAY)[1];
    expect(r.forwardable).toBe(false);
  });

  it("surfaces an industry tag that is not in the vocabulary", () => {
    const r = routeFacts([fact({ industries: ["manufacutring"] })], REPS, TODAY)[1];
    expect(r.unknownIndustries).toEqual(["manufacutring"]);
  });
});

describe("perRepCounts", () => {
  it("counts what each rep would actually receive, not the total", () => {
    const facts = [
      fact({ id: 1, industries: ["manufacturing"] }),
      fact({ id: 2, industries: ["food_beverage"] }),
      fact({ id: 3, industries: ["all_industries"] }),
      fact({ id: 4, industries: ["manufacturing"], expiresOn: "2026-01-01" }), // 過期
    ];
    const counts = perRepCounts(routeFacts(facts, REPS, TODAY), REPS);
    expect(counts.find((c) => c.id === 1)?.count).toBe(2); // manufacturing + all
    expect(counts.find((c) => c.id === 2)?.count).toBe(2); // food_beverage + all
    expect(counts.find((c) => c.id === 3)?.count).toBe(3); // all-industries rep gets every TW one
    expect(counts.find((c) => c.id === 4)?.count).toBe(0); // US rep, none of these are US
  });

  it("lists a rep who would receive nothing", () => {
    const counts = perRepCounts(routeFacts([fact()], REPS, TODAY), REPS);
    expect(counts.find((c) => c.id === 2)?.count).toBe(0);
  });
});

describe("unreachable", () => {
  it("flags a live fact that reaches nobody", () => {
    const facts = [fact({ id: 1, market: "JP", industries: ["manufacturing"] })];
    expect(unreachable(facts, routeFacts(facts, REPS, TODAY)).map((f) => f.id)).toEqual([1]);
  });

  it("does not flag an expired one — that is not a tagging problem", () => {
    const facts = [fact({ id: 1, market: "JP", expiresOn: "2020-01-01" })];
    expect(unreachable(facts, routeFacts(facts, REPS, TODAY))).toEqual([]);
  });
});

describe("isQuotable", () => {
  it("needs a figure, not just a statement", () => {
    expect(isQuotable(fact({ figures: {} }))).toBe(false);
    expect(isQuotable(fact({ figures: { percents: [{ value: 7.4 }] } }))).toBe(true);
    expect(isQuotable(fact({ figures: { amounts: [50000] } }))).toBe(true);
  });

  it("excludes anything still to be verified", () => {
    expect(isQuotable(fact({ confidence: "needs_verification", figures: { amounts: [1] } }))).toBe(false);
  });
});
