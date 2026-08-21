import { describe, expect, it } from "vitest";
import { getPostTitleFallback } from "./mockupTitle";

describe("getPostTitleFallback", () => {
  it("hides an administrative output title whenever a real caption exists", () => {
    expect(getPostTitleFallback("IG 實用內容成品", "這是實際貼文文案")).toBeNull();
  });

  it("keeps the title as a fallback for legacy runs with no caption", () => {
    expect(getPostTitleFallback("  舊資料標題  ", null)).toBe("舊資料標題");
    expect(getPostTitleFallback("舊資料標題", "")).toBe("舊資料標題");
  });

  it("does not invent a fallback when both fields are empty", () => {
    expect(getPostTitleFallback("  ", undefined)).toBeNull();
  });

  it("matches FBFeed truthiness semantics for whitespace captions", () => {
    expect(getPostTitleFallback("舊資料標題", "   ")).toBeNull();
  });
});
