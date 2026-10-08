import { describe, expect, it } from "vitest";
import { failedNote, isFailedScheduled, isNotConnectedError } from "./plannerFailed";

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

describe("isNotConnectedError", () => {
  it("recognizes the missing connection message including prefixes", () => {
    expect(isNotConnectedError("此品牌尚未連接此平台，請先到品牌設定完成連接。")).toBe(true);
    expect(isNotConnectedError("發布失敗：此品牌尚未連接此平台。")).toBe(true);
  });
  it("does not offer a connection action for other errors", () => {
    for (const msg of ["", "發布失敗，請稍後重試。", "帳號授權已過期"]) expect(isNotConnectedError(msg)).toBe(false);
  });
});
