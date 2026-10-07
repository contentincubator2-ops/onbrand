import { describe, it, expect } from "vitest";
import { groupByBrand } from "./InboxPage";

describe("待確認事項 · 依品牌分組", () => {
  const it_ = (brandId: number, urgency = "normal") => ({ brandId, brandName: `B${brandId}`, urgency });
  it("急件多的品牌在前，其次件數多的；組內順序不動", () => {
    const g = groupByBrand([it_(1), it_(2), it_(1), it_(3, "urgent"), it_(2), it_(2)]);
    expect(g.map((x) => x.brandId)).toEqual([3, 2, 1]);
    expect(g[1]!.items).toHaveLength(3);
  });
  it("只有一個品牌就是一組", () => {
    expect(groupByBrand([it_(1), it_(1)])).toHaveLength(1);
  });
});
