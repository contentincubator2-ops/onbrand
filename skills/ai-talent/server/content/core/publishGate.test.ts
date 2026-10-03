import { describe, expect, it } from "vitest";
import { outputApprovalState } from "./publishGate";

const pool = (queue: string | null, output: string | null, hasReviewer = true) => ({
  execute: async (sql: string) => [sql.includes("workspace_members")
    ? (hasReviewer ? [{ 1: 1 }] : [])
    : sql.includes("mission_review_queue")
      ? (queue ? [{ status: queue }] : [])
      : (output ? [{ status: output }] : [])],
});

describe("outputApprovalState", () => {
  it("latest review row wins", async () => {
    expect(await outputApprovalState(pool("approved", "draft"), 1)).toBe("approved");
    expect(await outputApprovalState(pool("pending", "approved"), 1)).toBe("in_review");
    expect(await outputApprovalState(pool("in_review", null), 1)).toBe("in_review");
    expect(await outputApprovalState(pool("revision_requested", "approved"), 1)).toBe("revision_requested");
  });
  it("without a review row, only output.status = approved counts", async () => {
    expect(await outputApprovalState(pool(null, "approved"), 1)).toBe("approved");
    expect(await outputApprovalState(pool(null, "draft"), 1)).toBe("not_submitted");
    expect(await outputApprovalState(pool(null, "published"), 1)).toBe("not_submitted");
    expect(await outputApprovalState(pool(null, null), 1)).toBe("not_submitted");
  });
  it("solo users (no other owner/admin) publish without approval", async () => {
    expect(await outputApprovalState(pool(null, "draft", false), 1, 7)).toBe("approved");
    expect(await outputApprovalState(pool("revision_requested", "draft", false), 1, 7)).toBe("approved");
  });
  it("users with a reviewer available still need approval", async () => {
    expect(await outputApprovalState(pool(null, "draft", true), 1, 7)).toBe("not_submitted");
  });
});
