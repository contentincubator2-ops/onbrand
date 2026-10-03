import { beforeEach, describe, expect, it, vi } from "vitest";

const { executeMock } = vi.hoisted(() => ({ executeMock: vi.fn() }));

vi.mock("../../../localDb", () => ({
  default: { execute: executeMock },
}));

import { getTouchpointCoverage, TOUCHPOINTS } from "./touchpoints";

describe("touchpoints registry", () => {
  beforeEach(() => {
    executeMock.mockReset();
  });

  it("marks facebook/instagram connected only when the brand has a bundle.social team", async () => {
    executeMock.mockResolvedValue([[{ industry: "電商", targetCountry: "US", bundleConnectedAt: "2026-09-01 00:00:00" }]]);

    const coverage = await getTouchpointCoverage(42);

    const fb = coverage.touchpoints.find((t) => t.id === "facebook")!;
    const ig = coverage.touchpoints.find((t) => t.id === "instagram")!;
    expect(fb.deployStatus).toBe("connected");
    expect(ig.deployStatus).toBe("connected");
    expect(coverage.industry).toBe("電商");
    expect(coverage.targetCountry).toBe("US");
  });

  it("marks every manual-copy touchpoint as manual regardless of bundle connection", async () => {
    executeMock.mockResolvedValue([[{ industry: null, targetCountry: null, bundleConnectedAt: "2026-09-01 00:00:00" }]]);

    const coverage = await getTouchpointCoverage(42);

    const manualIds = coverage.touchpoints.filter((t) => t.deployMethod !== "api-publish").map((t) => t.id);
    expect(manualIds.length).toBeGreaterThan(0);
    for (const id of manualIds) {
      expect(coverage.touchpoints.find((t) => t.id === id)!.deployStatus).toBe("manual");
    }
  });

  it("marks facebook/instagram manual when the brand has never connected bundle.social", async () => {
    executeMock.mockResolvedValue([[{ industry: null, targetCountry: null, bundleConnectedAt: null }]]);

    const coverage = await getTouchpointCoverage(42);

    expect(coverage.touchpoints.find((t) => t.id === "facebook")!.deployStatus).toBe("manual");
    expect(coverage.connectedCount).toBe(0);
  });

  it("counts connectedCount and totalCount consistently with the static registry length", async () => {
    executeMock.mockResolvedValue([[{ industry: null, targetCountry: null, bundleConnectedAt: "2026-09-01 00:00:00" }]]);

    const coverage = await getTouchpointCoverage(42);

    expect(coverage.totalCount).toBe(coverage.touchpoints.length);
    expect(coverage.connectedCount).toBe(2);
  });

  // 2026-09-29（CJ）：內容通路只剩 FB／IG／TikTok／電子報／官網。
  it("hides linkedin / youtube / x / pr from coverage (registry keeps them)", async () => {
    executeMock.mockResolvedValue([[{ industry: null, targetCountry: null, bundleConnectedAt: null }]]);

    const coverage = await getTouchpointCoverage(42);
    const ids = coverage.touchpoints.map((t) => t.id);

    for (const hidden of ["linkedin", "youtube", "x", "pr"]) {
      expect(ids).not.toContain(hidden);
      expect(TOUCHPOINTS.some((t) => t.id === hidden)).toBe(true);
    }
    expect(ids).toEqual(["facebook", "instagram", "tiktok", "email", "website", "brand-agent"]);
    expect(coverage.totalCount).toBe(6);
  });

  it("falls back to defaults when the brand row is missing", async () => {
    executeMock.mockResolvedValue([[]]);

    const coverage = await getTouchpointCoverage(999);

    expect(coverage.industry).toBeNull();
    expect(coverage.targetCountry).toBeNull();
    expect(coverage.connectedCount).toBe(0);
  });
});
