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

  it.each([
    ["ig-99-youtility", "feed"],
    ["ig-99-visual-story", "story"],
    ["ig-99-live-first", "live"],
    ["ig-99-document", "document"],
    ["ig-99-radical-transparency", "feed"],
  ] as const)("restores the IG mockup for target %s", (taskId, format) => {
    expect(getStrategyPresentationMockup({ presentation: "strategy-report" }, taskId)).toEqual({
      platform: "instagram",
      format,
      label: `instagram:${format}`,
    });
  });

  it("keeps non-target strategy-report presentation unchanged", () => {
    expect(getStrategyPresentationMockup({ presentation: "strategy-report" }, "ig-99-save-worthy")).toEqual({
      platform: "generic",
      format: "research-doc",
      label: "generic:research-doc",
    });
  });
});
