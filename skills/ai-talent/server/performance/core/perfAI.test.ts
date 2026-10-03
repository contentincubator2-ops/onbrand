import { describe, it, expect, vi } from "vitest";

vi.mock("../../localDb", () => ({ default: { execute: vi.fn() } }));
vi.mock("../../platform/core/llm/multiModelRouter", () => ({ callModel: vi.fn() }));

import { sanitizeProposal, toValues } from "./perfAI";

describe("perfAI.sanitizeProposal", () => {
  it("does not let a builtin dim swallow a user dim that came with its own values", () => {
    // dev 實測：「素材類型：開箱影片、料理教學短影音…」被模型套成 key "format"
    const p = sanitizeProposal({
      name: "月度廣告", rowDim: { key: "buyerstage", label: "購買階段", values: ["新客", "回購客"] },
      colDim: { key: "format", label: "素材類型", values: ["開箱影片", "料理教學短影音", "優惠圖卡"] },
      stages: [{ metric: "impressions" }, { metric: "clicks" }, { metric: "bogus" }, { metric: "orders" }],
      judge: "cpa", unmapped: ["收藏數"],
    }, []);
    expect(p!.colDim!.key).not.toBe("format");
    expect(p!.colDim!.values.map((v) => v.label)).toEqual(["開箱影片", "料理教學短影音", "優惠圖卡"]);
    expect(p!.config.stages.map((s) => s.metric)).toEqual(["impressions", "clicks", "orders"]);
    expect(p!.config.judge).toBe("cpa");
  });

  it("maps to the builtin dim when no values are given", () => {
    const p = sanitizeProposal({ rowDim: { key: "month", label: "月份" }, stages: ["reach"], judge: "reach" }, []);
    expect(p!.config.rowDim).toBe("month");
  });

  it("keeps existing codes when extending an existing dimension", () => {
    const existing = [{ key: "ta", label: "目標族群", values: [{ code: "v1", label: "上班族" }] }];
    const p = sanitizeProposal({ rowDim: { key: "ta", label: "目標族群", values: ["上班族", "學生"] }, stages: [], judge: "roas" }, existing);
    expect(p!.rowDim.values).toEqual([{ code: "v1", label: "上班族" }, expect.objectContaining({ label: "學生" })]);
    expect(p!.rowDim.isNew).toBe(false);
  });

  it("toValues dedupes and caps", () => {
    expect(toValues(["A", "A", "B"]).map((v) => v.label)).toEqual(["A", "B"]);
  });
});
