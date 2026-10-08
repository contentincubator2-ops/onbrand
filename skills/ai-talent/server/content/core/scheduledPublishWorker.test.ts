import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
const publishScheduledPost = vi.fn();
const approval = vi.fn();

vi.mock("../../localDb", () => ({ default: { execute: (...a: any[]) => execute(...a) } }));
vi.mock("./publishGate", () => ({ outputApprovalState: (...a: any[]) => approval(...a) }));
vi.mock("../routers/calendarRouter", () => ({ publishScheduledPost: (...a: any[]) => publishScheduledPost(...a) }));
vi.mock("../../platform/routers/opsRouter", () => ({ logError: vi.fn() }));

import { APPROVAL_HINT, isAutoPublishEnabled, tickScheduledPublish } from "./scheduledPublishWorker";

const rows = (...r: any[]) => [r];

describe("scheduledPublishWorker", () => {
  const env = { ...process.env };
  beforeEach(() => {
    execute.mockReset(); publishScheduledPost.mockReset(); approval.mockReset();
    process.env.AUTOPUBLISH_SCHEDULED = "on";
    delete process.env.SOCIAL_PUBLISH_ENABLED;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => { process.env = { ...env }; vi.restoreAllMocks(); });

  it("is disabled unless AUTOPUBLISH_SCHEDULED=on (and never queries the db)", async () => {
    delete process.env.AUTOPUBLISH_SCHEDULED;
    expect(isAutoPublishEnabled()).toBe(false);
    expect(await tickScheduledPublish()).toEqual({ published: 0, awaitingApproval: 0 });
    process.env.AUTOPUBLISH_SCHEDULED = "true";
    expect(isAutoPublishEnabled()).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  it("stays off when the SOCIAL_PUBLISH_ENABLED kill switch is off", async () => {
    process.env.SOCIAL_PUBLISH_ENABLED = "false";
    expect(await tickScheduledPublish()).toEqual({ published: 0, awaitingApproval: 0 });
    expect(execute).not.toHaveBeenCalled();
  });

  it("only selects pending rows inside the 6h grace window (older ones are skipped)", async () => {
    execute.mockResolvedValueOnce(rows());
    await tickScheduledPublish();
    const sql = String(execute.mock.calls[0][0]);
    expect(sql).toMatch(/status = 'pending'/);
    expect(sql).toMatch(/scheduledAt <= NOW\(3\)/);
    expect(sql).toMatch(/INTERVAL 21600 SECOND/);
    expect(sql).toMatch(/LIMIT 50\b/);
  });

  it.each(["in_review", "revision_requested", "not_submitted"])("hints %s without claiming or changing attempts/status, and does not rewrite the hint", async (state) => {
    const post = { id: 1, userId: 7, outputId: 9, status: "pending", attempts: 2, lastError: null as string | null };
    let writes = 0;
    execute.mockImplementation(async (sql: string, params: any[] = []) => {
      if (sql.includes("SELECT id, userId, outputId")) return rows(post);
      expect(sql).toMatch(/SET lastError = \?\s+WHERE id = \? AND status = 'pending' AND \(lastError IS NULL OR lastError <> \?\)/);
      expect(params).toEqual([APPROVAL_HINT, post.id, APPROVAL_HINT]);
      if (post.status === "pending" && (post.lastError === null || post.lastError !== params[2])) {
        post.lastError = params[0];
        writes++;
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 0 }];
    });
    approval.mockResolvedValue(state);
    expect(await tickScheduledPublish()).toEqual({ published: 0, awaitingApproval: 1 });
    expect(post).toMatchObject({ lastError: APPROVAL_HINT, status: "pending", attempts: 2 });
    expect(writes).toBe(1);
    expect(await tickScheduledPublish()).toEqual({ published: 0, awaitingApproval: 1 });
    expect(writes).toBe(1); // still issues a guarded UPDATE, but does not rewrite the row
    expect(post).toMatchObject({ status: "pending", attempts: 2 });
    expect(publishScheduledPost).not.toHaveBeenCalled();
    expect(approval).toHaveBeenCalledWith(expect.anything(), 9, 7);
  });

  it("reaches an approved post after six unapproved posts", async () => {
    const due = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, userId: 7, outputId: i + 9 }));
    execute.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT id, userId, outputId")) {
        const limit = Number(sql.match(/LIMIT (\d+)/)?.[1]);
        return [due.slice(0, limit)];
      }
      return [{ affectedRows: 1 }];
    });
    approval.mockImplementation(async (_pool, outputId) => outputId === 15 ? "approved" : "in_review");
    publishScheduledPost.mockResolvedValue({ ok: true });
    expect(await tickScheduledPublish()).toEqual({ published: 1, awaitingApproval: 6 });
    expect(publishScheduledPost).toHaveBeenCalledTimes(1);
    expect(publishScheduledPost).toHaveBeenCalledWith({ id: 7, userId: 7, claimed: true });
    expect(execute.mock.calls.filter(([sql]) => sql.includes("SET status = 'publishing'"))).toHaveLength(1);
  });

  it("stops after five successful publishes in one tick", async () => {
    execute.mockResolvedValueOnce(rows(...Array.from({ length: 7 }, (_, i) => ({ id: i + 1, userId: 7, outputId: i + 9 }))))
      .mockResolvedValue([{ affectedRows: 1 }]);
    approval.mockResolvedValue("approved");
    publishScheduledPost.mockResolvedValue({ ok: true });
    expect(await tickScheduledPublish()).toEqual({ published: 5, awaitingApproval: 0 });
    expect(publishScheduledPost).toHaveBeenCalledTimes(5);
    expect(approval).toHaveBeenCalledTimes(5);
  });

  it("publishes a previously hinted post on the next tick after approval", async () => {
    const post = { id: 1, userId: 7, outputId: 9 };
    execute.mockImplementation(async (sql: string) => sql.includes("SELECT id, userId, outputId") ? rows(post) : [{ affectedRows: 1 }]);
    approval.mockResolvedValueOnce("in_review").mockResolvedValueOnce("approved");
    expect(await tickScheduledPublish()).toEqual({ published: 0, awaitingApproval: 1 });
    expect(publishScheduledPost).not.toHaveBeenCalled();
    publishScheduledPost.mockResolvedValueOnce({ ok: true });
    expect(await tickScheduledPublish()).toEqual({ published: 1, awaitingApproval: 0 });
    expect(publishScheduledPost).toHaveBeenCalledTimes(1);
    expect(publishScheduledPost).toHaveBeenCalledWith({ id: 1, userId: 7, claimed: true });
  });

  it("publishes an approved, claimed row", async () => {
    execute.mockResolvedValueOnce(rows({ id: 1, userId: 7, outputId: 9 })).mockResolvedValueOnce([{ affectedRows: 1 }]);
    approval.mockResolvedValueOnce("approved");
    publishScheduledPost.mockResolvedValueOnce({ ok: true });
    expect(await tickScheduledPublish()).toEqual({ published: 1, awaitingApproval: 0 });
    expect(publishScheduledPost).toHaveBeenCalledWith({ id: 1, userId: 7, claimed: true });
  });

  it("loses the claim race gracefully: no publish when another worker got the row", async () => {
    execute.mockResolvedValueOnce(rows({ id: 1, userId: 7, outputId: 9 })).mockResolvedValueOnce([{ affectedRows: 0 }]);
    approval.mockResolvedValueOnce("approved");
    expect(await tickScheduledPublish()).toEqual({ published: 0, awaitingApproval: 0 });
    expect(publishScheduledPost).not.toHaveBeenCalled();
    expect(String(execute.mock.calls[1][0])).toMatch(/WHERE id = \? AND status = 'pending'/);
  });

  it("marks a failing row failed with a friendly lastError and carries on with the next", async () => {
    execute
      .mockResolvedValueOnce(rows({ id: 1, userId: 7, outputId: 9 }, { id: 2, userId: 7, outputId: 10 }))
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // claim #1
      .mockResolvedValueOnce([{}])                  // failed UPDATE #1
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // claim #2
    approval.mockResolvedValue("approved");
    publishScheduledPost
      .mockRejectedValueOnce(new Error('zernio 429: {"message":"slow down"}'))
      .mockResolvedValueOnce({ ok: true });
    expect(await tickScheduledPublish()).toEqual({ published: 1, awaitingApproval: 0 });
    const failUpdate = execute.mock.calls.find((c) => /status = 'failed'/.test(String(c[0])))!;
    expect(String(failUpdate[0])).toMatch(/status = 'publishing'/);
    expect(failUpdate[1][0]).toMatch(/稍後/);
    expect(failUpdate[1][0]).not.toMatch(/[{}]/);
    expect(failUpdate[1][1]).toBe(1);
    expect(publishScheduledPost).toHaveBeenCalledTimes(2);
  });
});
