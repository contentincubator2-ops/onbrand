import { describe, expect, it } from "vitest";
import { findValidRunProductSelection, type RunProductImage } from "./runProductSelection";

const currentProducts: RunProductImage[] = [
  { productId: 11, name: "Current product", imageUrl: "https://example.com/current.png" },
];

describe("同一個產品有好幾張照片", () => {
  const list: RunProductImage[] = [
    { productId: 263, name: "橫膈牛排", imageUrl: "/static/asset-photos/product/263/raw.webp" },
    { productId: 263, name: "橫膈牛排", imageUrl: "/static/asset-photos/product/263/cooked.webp" },
  ];
  it("選哪張就是哪張，不會被換回第一張", () => {
    expect(findValidRunProductSelection(list[1]!, list)?.imageUrl).toBe("/static/asset-photos/product/263/cooked.webp");
  });
  it("選的那張不在清單裡時，退回同產品的第一張", () => {
    expect(findValidRunProductSelection({ ...list[0]!, imageUrl: "/gone.webp" }, list)?.imageUrl).toBe("/static/asset-photos/product/263/raw.webp");
  });
});

describe("findValidRunProductSelection", () => {
  it("rejects an empty selection", () => {
    expect(findValidRunProductSelection(null, currentProducts)).toBeNull();
  });

  it("rejects a product that is not in the current brand list", () => {
    const stale = { productId: 99, name: "Previous brand", imageUrl: "https://example.com/stale.png" };
    expect(findValidRunProductSelection(stale, currentProducts)).toBeNull();
  });

  it("returns the canonical current-brand entry for a matching product id", () => {
    const staleObject = { productId: 11, name: "Old name", imageUrl: "https://example.com/old.png" };
    expect(findValidRunProductSelection(staleObject, currentProducts)).toEqual(currentProducts[0]);
  });

  it("rejects a current-list product without a usable image URL", () => {
    const withoutImage = { productId: 12, name: "No image", imageUrl: "  " };
    expect(findValidRunProductSelection(withoutImage, [withoutImage])).toBeNull();
  });
});
