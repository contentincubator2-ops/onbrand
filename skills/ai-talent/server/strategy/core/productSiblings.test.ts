import { describe, expect, it } from "vitest";
import {
  buildSiblingBlock,
  coreOfSeedDescription,
  findSharedDescriptions,
  isSiteWideText,
} from "./productSiblings";

// 2026-10-02 真資料：SoWork 品牌 6 支產品匯入時的描述（前端渲染站，每頁同一個 <title>）。
const SOWORK = [
  "「SoWork.ai — 顧問的策略深度 × AI 的執行規模」。商品頁：https://sowork.ai/products/onbrand",
  "「SoWork.ai — 顧問的策略深度 × AI 的執行規模」。商品頁：https://sowork.ai/services/market-intelligence",
  "「SoWork.ai — 顧問的策略深度 × AI 的執行規模」。商品頁：https://sowork.ai/services/content-marketing",
];
const SITE_TITLE = "SoWork.ai — 顧問的策略深度 × AI 的執行規模";

describe("coreOfSeedDescription", () => {
  it("去掉引號、定價與商品頁網址，只留頁面標題", () => {
    expect(coreOfSeedDescription(SOWORK[0])).toBe(SITE_TITLE);
    expect(coreOfSeedDescription("「【香氣炸裂！】美國橫膈牛排」，定價 NT$560。商品頁：https://x.com/p/1"))
      .toBe("【香氣炸裂！】美國橫膈牛排");
  });
  it("手寫的描述原樣保留", () => {
    expect(coreOfSeedDescription("厚切彈牙牛舌，鹽烤即食")).toBe("厚切彈牙牛舌，鹽烤即食");
  });
});

describe("findSharedDescriptions", () => {
  it("好幾支產品共用同一段描述 → 認出是全站文字", () => {
    expect([...findSharedDescriptions(SOWORK)]).toEqual([SITE_TITLE]);
  });
  it("每支產品描述不同（IRIS／Tom 老闆那種）→ 沒有共用文字", () => {
    expect(findSharedDescriptions([
      "IRIS 2026 春夏系列商品「法式藍語刺繡上衣」，定價 NT$2,890。商品頁：https://a/1",
      "IRIS 2026 春夏系列商品「暮海藍灣吊帶洋裝」，定價 NT$4,390。商品頁：https://a/2",
      "厚切彈牙牛舌", null, undefined,
    ]).size).toBe(0);
  });
});

describe("isSiteWideText", () => {
  const shared = findSharedDescriptions(SOWORK);
  it("商品頁抓回的 <title> 是全站共用的", () => {
    expect(isSiteWideText(SITE_TITLE, shared)).toBe(true);
  });
  it("產品自己的名稱不算", () => {
    expect(isSiteWideText("AI Reporting", shared)).toBe(false);
    expect(isSiteWideText(undefined, shared)).toBe(false);
  });
});

describe("buildSiblingBlock", () => {
  it("列出同品牌其他產品與母品牌定位，並要求區隔", () => {
    const block = buildSiblingBlock({
      productName: "AI Reporting",
      productUrl: "https://sowork.ai/products/ai-reporting",
      siblings: [{ name: "OnBrand Studio", claim: "品牌一致，每次都到位" }, { name: "市場研究洞察" }],
      brandName: "SoWork",
      brandClaim: "顧問把關策略，AI 擴大規模",
      descriptionIsSiteWide: true,
    });
    expect(block).toContain("https://sowork.ai/products/ai-reporting");
    expect(block).toContain("全站共用");
    expect(block).toContain("- OnBrand Studio：品牌一致，每次都到位");
    expect(block).toContain("- 市場研究洞察");
    expect(block).toContain("顧問把關策略，AI 擴大規模");
    expect(block).toContain("為什麼選『AI Reporting』");
  });
  it("沒有兄弟產品也沒有母品牌定位 → 不加區隔規則", () => {
    expect(buildSiblingBlock({ productName: "牛舌", siblings: [] })).toBe("");
  });
});
