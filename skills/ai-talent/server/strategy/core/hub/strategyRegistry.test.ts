import { describe, expect, it } from "vitest";
import {
  STRATEGY_ENTITIES,
  filterStrategy,
  isEditableField,
  summarise,
  type StrategyRecord,
} from "./strategyRegistry";

const rec = (p: Partial<StrategyRecord> = {}): StrategyRecord => ({
  entity: "fact", id: 1,
  title: { en: "A subsidy for manufacturers", zh: "製造業補助" },
  body: { en: "Up to NT$50,000 in points", zh: "最高 5 萬點" },
  market: "TW", industries: ["manufacturing"], kind: "subsidy", status: "official",
  effectiveFrom: null, effectiveTo: null,
  source: { name: "IDA", url: "https://www.ida.gov.tw/" },
  quotable: true,
  ...p,
});

describe("filterStrategy", () => {
  it("narrows by entity, market and industry at once", () => {
    const rows = [
      rec({ id: 1 }),
      rec({ id: 2, market: "US" }),
      rec({ id: 3, industries: ["food_beverage"] }),
      rec({ id: 4, entity: "wording", quotable: false }),
    ];
    const got = filterStrategy(rows, { entity: ["fact"], market: "TW", industries: ["manufacturing"] });
    expect(got.map((r) => r.id)).toEqual([1]);
  });

  // market: null = 不分市場，查任何市場都該看到它，否則產品目錄會整個消失。
  it("keeps market-agnostic records in a market-specific query", () => {
    const rows = [rec({ id: 1, entity: "solution", market: null })];
    expect(filterStrategy(rows, { market: "US" }).map((r) => r.id)).toEqual([1]);
  });

  it("treats all_industries as matching any industry filter", () => {
    const rows = [rec({ id: 1, industries: ["all_industries"] })];
    expect(filterStrategy(rows, { industries: ["food_beverage"] })).toHaveLength(1);
  });

  it("treats an untagged record as matching any industry filter", () => {
    const rows = [rec({ id: 1, industries: [] })];
    expect(filterStrategy(rows, { industries: ["food_beverage"] })).toHaveLength(1);
  });

  it("applies the live-on window at both ends", () => {
    const rows = [
      rec({ id: 1, effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" }),
      rec({ id: 2, effectiveFrom: "2027-01-01" }),               // 還沒開始
      rec({ id: 3, effectiveTo: "2026-01-01" }),                 // 已結束
      rec({ id: 4 }),                                            // 沒有時效
    ];
    expect(filterStrategy(rows, { liveOn: "2026-09-23" }).map((r) => r.id)).toEqual([1, 4]);
  });

  it("can demand a source, which is what an agent should ask for before writing", () => {
    const rows = [rec({ id: 1 }), rec({ id: 2, source: null })];
    expect(filterStrategy(rows, { withSource: true }).map((r) => r.id)).toEqual([1]);
  });

  it("can demand quotable only", () => {
    const rows = [rec({ id: 1 }), rec({ id: 2, quotable: false })];
    expect(filterStrategy(rows, { quotableOnly: true }).map((r) => r.id)).toEqual([1]);
  });

  it("matches text in either language", () => {
    const rows = [rec({ id: 1 })];
    expect(filterStrategy(rows, { text: "manufacturers" })).toHaveLength(1);
    expect(filterStrategy(rows, { text: "製造業" })).toHaveLength(1);
    expect(filterStrategy(rows, { text: "餐飲" })).toHaveLength(0);
  });

  it("caps the result so an agent cannot pull the whole layer into context", () => {
    const rows = Array.from({ length: 300 }, (_, i) => rec({ id: i }));
    expect(filterStrategy(rows, {})).toHaveLength(50);       // 預設
    expect(filterStrategy(rows, { limit: 5 })).toHaveLength(5);
    expect(filterStrategy(rows, { limit: 9999 })).toHaveLength(200); // 上限
  });

  it("returns everything when nothing is asked", () => {
    expect(filterStrategy([rec(), rec({ id: 2 })], {})).toHaveLength(2);
  });
});

describe("summarise", () => {
  it("tells the agent what it got before it reads the rows", () => {
    const got = summarise([rec(), rec({ id: 2, entity: "wording", quotable: false, source: null })]);
    expect(got).toEqual({ total: 2, byEntity: { fact: 1, wording: 1 }, withSource: 1, quotable: 1 });
  });
});

describe("the registry itself", () => {
  it("covers all five trays", () => {
    expect(STRATEGY_ENTITIES.map((e) => e.id).sort()).toEqual(
      ["brand_asset", "fact", "regulation", "solution", "wording"],
    );
  });

  // 白名單制：沒列出來的欄位一律拒絕，否則通用編輯層就是個任意寫入介面。
  it("only allows fields the entity declared", () => {
    expect(isEditableField("wording", "term")).toBe(true);
    expect(isEditableField("wording", "org_id")).toBe(false);
    expect(isEditableField("nonsense", "term")).toBe(false);
  });

  it("keeps wording free of an approval gate, because that page promises instant effect", () => {
    expect(STRATEGY_ENTITIES.find((e) => e.id === "wording")?.requiresApproval).toBe(false);
    expect(STRATEGY_ENTITIES.find((e) => e.id === "fact")?.requiresApproval).toBe(true);
  });
});
