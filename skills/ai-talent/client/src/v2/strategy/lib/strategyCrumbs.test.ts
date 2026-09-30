/**
 * 2026-09-30（CJ「所有品牌跟品牌定位總覽似乎很像……可以選擇上一頁到哪一個」）：
 * 路徑列每一段要指到對的地方，最後一段是目前位置、不能點。
 */
import { describe, expect, it } from "vitest";
import { strategyCrumbs } from "./strategyCrumbs";

const labels = (c: ReturnType<typeof strategyCrumbs>) => c.map((x) => x.label);

describe("strategyCrumbs", () => {
  it("品牌段落：所有品牌 › SoWork › 品牌定位總覽 › 品牌黃金圈", () => {
    const c = strategyCrumbs({ en: false, brandName: "SoWork", scopeMode: "brand", category: "positioning", section: "seg:goldenCircle", segmentTitle: "品牌黃金圈" });
    expect(labels(c)).toEqual(["所有品牌", "SoWork", "品牌定位總覽", "品牌黃金圈"]);
    expect(c[0]!.target).toEqual({ href: "/brands?all=1" });
    expect(c[2]!.target).toEqual({ cat: "positioning", scope: "brand", section: "pos:home" });
    expect(c[3]!.target).toBeUndefined();
  });

  it("產品段落：所有品牌 › 品牌 › 產品 › 產品名 › 產品定位總覽 › 段落", () => {
    const c = strategyCrumbs({ en: false, brandName: "金安德森香氛", scopeMode: "product", entityName: "No. 01 洛蒙德湖", category: "positioning", section: "seg:core", segmentTitle: "產品核心定位" });
    expect(labels(c)).toEqual(["所有品牌", "金安德森香氛", "產品", "No. 01 洛蒙德湖", "產品定位總覽", "產品核心定位"]);
    expect(c[2]!.target).toEqual({ cat: "products", scope: "brand" });
    expect(c[3]!.target).toEqual({ cat: "positioning", scope: "entity", section: "pos:home" });
  });

  it("總覽本身是最後一段、不能點", () => {
    const c = strategyCrumbs({ en: false, brandName: "SoWork", scopeMode: "brand", category: "positioning", section: "pos:home" });
    expect(labels(c)).toEqual(["所有品牌", "SoWork", "品牌定位總覽"]);
    expect(c[2]!.target).toBeUndefined();
  });

  it("文字卡：文字那一段回到所有卡片", () => {
    const c = strategyCrumbs({ en: false, brandName: "SoWork", scopeMode: "brand", category: "copy", section: "asset:hook_library", assetLabel: "Hook 庫" });
    expect(labels(c)).toEqual(["所有品牌", "SoWork", "文字", "Hook 庫"]);
    expect(c[2]!.target).toEqual({ cat: "copy", scope: "brand", section: "asset:all" });
  });

  it("產品列表頁不重複「產品」", () => {
    const c = strategyCrumbs({ en: false, brandName: "SoWork", scopeMode: "brand", category: "products", section: "pos:home" });
    expect(labels(c)).toEqual(["所有品牌", "SoWork", "產品"]);
  });
});
