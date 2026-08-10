import { describe, expect, it } from "vitest";
import { getStrategyPresentationMockup, isStrategyReportPresentation } from "./strategyPresentation";

describe("isStrategyReportPresentation", () => {
  it("recognizes only the explicit server-owned presentation flag", () => {
    expect(isStrategyReportPresentation({ presentation: "strategy-report" })).toBe(true);
    expect(isStrategyReportPresentation({ presentation: "post" })).toBe(false);
    expect(isStrategyReportPresentation({ squadSlug: "ig-baer-youtility" })).toBe(false);
    expect(isStrategyReportPresentation(null)).toBe(false);
  });

  it("maps the explicit flag to the report mockup contract", () => {
    expect(getStrategyPresentationMockup({ presentation: "strategy-report" })).toEqual({
      platform: "generic",
      format: "research-doc",
      label: "generic:research-doc",
    });
    expect(getStrategyPresentationMockup({ presentation: "post" })).toBeNull();
    expect(getStrategyPresentationMockup({ squadSlug: "ig-chrisdo-visual-story" })).toBeNull();
  });
});
