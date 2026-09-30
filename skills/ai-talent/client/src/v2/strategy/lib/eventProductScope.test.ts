/**
 * 「這檔活動搭配什麼」的選取規則。
 *
 * 守的是三種狀態不會互相污染：純品牌一定不帶產品；產品全部取消是「還沒選」
 * 而不是悄悄變成純品牌（那兩個在企劃與文案裡是不同的指示）。
 */
import { describe, it, expect } from "vitest";
import { toggleProduct, toggleBrandOnly, scopeSummary, scopeValueFrom, UNDECIDED_SCOPE } from "./eventProductScope";

describe("toggleProduct", () => {
  it("點一個＝單一產品，再點一個＝聯合", () => {
    const one = toggleProduct(UNDECIDED_SCOPE, 7);
    expect(one).toEqual({ scope: "products", productIds: [7] });
    expect(scopeSummary(one, false)).toBe("單一產品活動");
    const two = toggleProduct(one, 9);
    expect(two).toEqual({ scope: "products", productIds: [7, 9] });
    expect(scopeSummary(two, false)).toBe("2 個產品聯合");
  });

  it("全部取消回到還沒選，不是純品牌", () => {
    const v = toggleProduct(toggleProduct(UNDECIDED_SCOPE, 7), 7);
    expect(v).toEqual({ scope: null, productIds: [] });
    expect(scopeSummary(v, false)).toBe("");
  });

  it("從純品牌點產品：切成搭配產品", () => {
    expect(toggleProduct({ scope: "brand", productIds: [] }, 3)).toEqual({ scope: "products", productIds: [3] });
  });
});

describe("toggleBrandOnly", () => {
  it("選純品牌會清掉已選的產品", () => {
    const v = toggleBrandOnly({ scope: "products", productIds: [1, 2] });
    expect(v).toEqual({ scope: "brand", productIds: [] });
    expect(scopeSummary(v, false)).toBe("純品牌活動");
  });

  it("再點一次回到還沒選", () => {
    expect(toggleBrandOnly({ scope: "brand", productIds: [] })).toEqual({ scope: null, productIds: [] });
  });
});

describe("scopeValueFrom", () => {
  it("有綁產品一律是 products，不管存的 scope 寫什麼", () => {
    expect(scopeValueFrom("brand", [4])).toEqual({ scope: "products", productIds: [4] });
  });
  it("沒綁產品：明說是品牌才是 brand，否則還沒選", () => {
    expect(scopeValueFrom("brand", [])).toEqual({ scope: "brand", productIds: [] });
    expect(scopeValueFrom(null, [])).toEqual({ scope: null, productIds: [] });
    expect(scopeValueFrom("products", [])).toEqual({ scope: null, productIds: [] });
  });
});
