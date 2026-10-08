import { describe, expect, it } from "vitest";
import { failedNote, isFailedScheduled } from "./plannerFailed";

describe("plannerFailed", () => {
  it("detects only failed scheduled rows", () => {
    expect(isFailedScheduled({ kind: "scheduled", status: "failed" })).toBe(true);
    expect(isFailedScheduled({ kind: "scheduled", status: "pending" })).toBe(false);
    expect(isFailedScheduled({ kind: "scheduled", status: "pending", awaitingApproval: true, lastError: "approval hint" })).toBe(false);
    expect(isFailedScheduled({ kind: "published", status: "failed" })).toBe(false);
    expect(isFailedScheduled(null)).toBe(false);
  });
  it("handles absent lastError", () => {
    expect(failedNote({}, true)).toContain("schedule again");
    expect(failedNote({}, false)).toContain("重新排程");
  });
  it("includes and truncates lastError", () => {
    const n = failedNote({ lastError: "x".repeat(500) }, true);
    expect(n.length).toBeLessThan(200);
    expect(n).toContain("xxx");
  });
});
