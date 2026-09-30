import { describe, expect, it } from "vitest";
import { complianceSummary } from "./RegulationComplianceNote";

const rec = (status: any, issues = 0) => ({
  variantIndex: 0, status, regulationCount: 2,
  issues: Array.from({ length: issues }, () => ({ regulation: "化粧品", quote: "幫助入眠", detail: "醫療效能" })),
});

describe("complianceSummary", () => {
  it("通過／自動修正：講清楚依幾條法規、改了幾處", () => {
    expect(complianceSummary(rec("compliant"), false)).toEqual({ tone: "ok", text: "已依 2 條法規完成合規檢查，未發現違規。" });
    expect(complianceSummary(rec("fixed", 1), false).text).toBe("已依 2 條法規完成合規檢查，自動修正 1 處。");
  });
  it("沒修成、沒跑完：警示，不假裝檢查過", () => {
    expect(complianceSummary(rec("flagged", 2), false)).toMatchObject({ tone: "warn" });
    expect(complianceSummary(rec("skipped"), false).text).toContain("沒有完成");
  });
});
