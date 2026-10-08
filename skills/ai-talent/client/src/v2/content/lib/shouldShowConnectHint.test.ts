import { describe, expect, it } from "vitest";
import { shouldShowConnectHint } from "./shouldShowConnectHint";

const connections = {
  facebook: { connected: false, accountName: null },
  instagram: { connected: false, accountName: null },
  linkedin: { connected: false, accountName: null },
  threads: { connected: false, accountName: null },
};

describe("shouldShowConnectHint", () => {
  it("shows the hint for disconnected supported platforms and aliases", () => {
    for (const platform of ["facebook", "fb", "instagram", "ig", "linkedin", "li", "threads"]) {
      expect(shouldShowConnectHint(platform, connections)).toBe(true);
    }
  });
  it("hides the hint for the connected platform even when other platforms are disconnected", () => {
    const connected = { ...connections, facebook: { connected: true, accountName: "Page" } };
    expect(shouldShowConnectHint("facebook", connected)).toBe(false);
    expect(shouldShowConnectHint("fb", connected)).toBe(false);
    expect(shouldShowConnectHint("ig", connected)).toBe(true);
  });
  it("hides the hint for unsupported or missing platforms", () => {
    for (const platform of ["youtube", "tiktok", "x", "generic", "", null, undefined]) {
      expect(shouldShowConnectHint(platform, connections)).toBe(false);
    }
  });
  it("hides the hint while loading or after a failed query", () => {
    expect(shouldShowConnectHint("facebook", undefined)).toBe(false);
    expect(shouldShowConnectHint("facebook", null)).toBe(false);
  });
});
