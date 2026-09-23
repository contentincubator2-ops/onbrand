import { describe, expect, it } from "vitest";
import { diffStrategyFields, requiresApproval } from "./strategyEdits";

/**
 * 只測不碰資料庫的那一層。
 *
 * 這一層正好是安全邊界：`diffStrategyFields` 是通用編輯介面唯一的防線。沒有它，
 * 「改任何欄位」就等於「改任何欄位」，包含 org_id。所以它值得被單獨測。
 */
describe("diffStrategyFields", () => {
  it("keeps only the fields that actually changed", () => {
    const got = diffStrategyFields("wording", { term: "整合", replacement: null }, { term: "整合" });
    expect(got.changes).toEqual([]);
  });

  it("carries both sides of a real change", () => {
    const got = diffStrategyFields("wording", { term: "便宜" }, { term: "高性價比" });
    expect(got.changes).toEqual([{ field: "term", from: "便宜", to: "高性價比" }]);
  });

  it("trims before comparing, so whitespace is not a change", () => {
    const got = diffStrategyFields("wording", { term: "整合" }, { term: "  整合  " });
    expect(got.changes).toEqual([]);
  });

  // 這是整個通用編輯層的安全邊界。改壞了就是任意欄位寫入。
  it("refuses a field the entity did not declare, and says so", () => {
    const got = diffStrategyFields("wording", { term: "a", org_id: 1 }, { term: "b", org_id: 999 });
    expect(got.changes.map((c) => c.field)).toEqual(["term"]);
    expect(got.rejected).toEqual(["org_id"]);
  });

  it("refuses everything for an entity it does not know", () => {
    const got = diffStrategyFields("nonsense", { a: 1 }, { a: 2 });
    expect(got.changes).toEqual([]);
    expect(got.rejected).toEqual(["a"]);
  });

  it("compares structured values by their JSON, not by reference", () => {
    const same = diffStrategyFields("fact", { industries: ["manufacturing"] }, { industries: ["manufacturing"] });
    expect(same.changes).toEqual([]);
    const diff = diffStrategyFields("fact", { industries: ["manufacturing"] }, { industries: ["food_beverage"] });
    expect(diff.changes).toHaveLength(1);
  });

  it("treats null and an empty string as the same absence", () => {
    expect(diffStrategyFields("wording", { replacement: null }, { replacement: "" }).changes).toEqual([]);
  });

  it("can edit the brand payload's own keys, which are not table columns", () => {
    const got = diffStrategyFields("brand_asset", { label: "官網" }, { label: "官方網站" });
    expect(got.changes).toEqual([{ field: "label", from: "官網", to: "官方網站" }]);
    expect(got.rejected).toEqual([]);
  });
});

describe("requiresApproval", () => {
  // 用詞那一頁寫著「即時生效」，加核准會讓那句話變成謊話。
  it("leaves wording instant and gates the rest", () => {
    expect(requiresApproval("wording")).toBe(false);
    expect(requiresApproval("fact")).toBe(true);
    expect(requiresApproval("regulation")).toBe(true);
    expect(requiresApproval("brand_asset")).toBe(true);
    expect(requiresApproval("solution")).toBe(true);
  });

  it("does not gate something it has never heard of — it simply is not editable", () => {
    expect(requiresApproval("nonsense")).toBe(false);
  });
});
