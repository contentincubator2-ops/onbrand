import { describe, expect, it } from "vitest";
import { resolveProductSubjectReference } from "./productSubjectPolicy";

describe("resolveProductSubjectReference", () => {
  it("fails closed when a product-scoped run has no usable photo", () => {
    expect(resolveProductSubjectReference(42, null)).toEqual({
      required: true,
      imageUrl: null,
      errorMsg: "真實產品圖不存在或連結已失效；已停止生圖，避免產生虛構產品。",
    });
  });

  it("does not require subject mode for a brand-level run", () => {
    expect(resolveProductSubjectReference(null, null)).toEqual({
      required: false,
      imageUrl: null,
    });
  });

  it("keeps a usable product photo in required subject mode", () => {
    expect(resolveProductSubjectReference(42, "https://example.com/product.png")).toEqual({
      required: true,
      imageUrl: "https://example.com/product.png",
    });
  });
});
