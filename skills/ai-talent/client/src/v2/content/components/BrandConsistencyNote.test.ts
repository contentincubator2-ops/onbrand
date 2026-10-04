import { describe, expect, it } from "vitest";
import { brandCheckSummary, pickBrandRecord } from "./BrandConsistencyNote";

describe("brandCheckSummary", () => {
  it("consistent / fixed read as ok", () => {
    expect(brandCheckSummary({ variantIndex: 0, status: "consistent" }, true).tone).toBe("ok");
    expect(brandCheckSummary({ variantIndex: 0, status: "fixed", issues: [{ aspect: "tone", detail: "x" }] }, false).text).toContain("修正 1 處");
  });
  it("flagged warns", () => {
    expect(brandCheckSummary({ variantIndex: 0, status: "flagged", issues: [] }, true).tone).toBe("warn");
  });
  it("skipped (and unknown) is never shown as passed", () => {
    for (const status of ["skipped", "weird"]) {
      const s = brandCheckSummary({ variantIndex: 0, status }, true);
      expect(s.tone).toBe("none");
      expect(s.text).toMatch(/Not checked/);
    }
    expect(brandCheckSummary({ variantIndex: 0, status: "skipped" }, false).text).toContain("未檢查");
  });
});

describe("pickBrandRecord", () => {
  it("returns null without a record", () => {
    expect(pickBrandRecord(undefined, 0)).toBeNull();
    expect(pickBrandRecord([], 0)).toBeNull();
  });
  it("matches by variantIndex", () => {
    expect(pickBrandRecord([{ variantIndex: 1, status: "fixed" }], 1)?.status).toBe("fixed");
  });
});
