/**
 * 底圖模板的挑選規則：用戶選的＞依產業＞傳播圈；圖還沒產出來的模板不能用。
 */
import { describe, it, expect } from "vitest";
import { availableBackdrops, backdropForIndustry, resolveBackdrop, DEFAULT_BACKDROP } from "./campaignBackdrops";

const all = new Set(["roadtrip", "kitchen", "marker", "garden", "blueprint"]);
const none = new Set<string>();

describe("backdropForIndustry", () => {
  it("依產業挑", () => {
    expect(backdropForIndustry("餐飲・牛排", all)).toBe("kitchen");
    expect(backdropForIndustry("色彩文具", all)).toBe("marker");
    expect(backdropForIndustry("汽車經銷", all)).toBe("roadtrip");
    expect(backdropForIndustry("香氛", all)).toBe("garden");
    expect(backdropForIndustry("AI 行銷顧問", all)).toBe("blueprint");
  });
  it("認不出、沒填、或那組圖還沒產出來：傳播圈", () => {
    expect(backdropForIndustry("寵物", all)).toBe(DEFAULT_BACKDROP);
    expect(backdropForIndustry("", all)).toBe(DEFAULT_BACKDROP);
    expect(backdropForIndustry("餐飲", none)).toBe(DEFAULT_BACKDROP);
  });
});

describe("resolveBackdrop", () => {
  it("用戶選的優先於產業", () => {
    expect(resolveBackdrop("marker", "餐飲", all)).toBe("marker");
  });
  it("用戶明確選傳播圈，就算產業對得上也用傳播圈", () => {
    expect(resolveBackdrop("reach", "餐飲", all)).toBe("reach");
  });
  it("選的那組已經不存在或沒有圖：退回產業預設", () => {
    expect(resolveBackdrop("ghost", "餐飲", all)).toBe("kitchen");
    expect(resolveBackdrop("marker", "餐飲", new Set(["kitchen"]))).toBe("kitchen");
  });
  it("沒選：依產業", () => {
    expect(resolveBackdrop(null, "文具", all)).toBe("marker");
  });
});

describe("availableBackdrops", () => {
  it("傳播圈永遠在；其他要有圖", () => {
    expect(availableBackdrops(none).map((t) => t.id)).toEqual(["reach"]);
    expect(availableBackdrops(new Set(["kitchen"])).map((t) => t.id)).toEqual(["reach", "kitchen"]);
  });
});
