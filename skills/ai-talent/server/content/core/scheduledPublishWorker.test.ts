import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
const publishScheduledPost = vi.fn();
const approval = vi.fn();

vi.mock("../../localDb", () => ({ default: { execute: (...a: any[]) => execute(...a) } }));
vi.mock("./publishGate", () => ({ outputApprovalState: (...a: any[]) => approval(...a) }));
vi.mock("../routers/calendarRouter", () => ({ publishScheduledPost: (...a: any[]) => publishScheduledPost(...a) }));
vi.mock("../../platform/routers/opsRouter", () => ({ logError: vi.fn() }));

import { isAutoPublishEnabled, tickScheduledPublish } from "./scheduledPublishWorker";

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
    expect(await tickScheduledPublish()).toBe(0);
    process.env.AUTOPUBLISH_SCHEDULED = "true";
    expect(isAutoPublishEnabled()).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  it("stays off when the SOCIAL_PUBLISH_ENABLED kill switch is off", async () => {
    process.env.SOCIAL_PUBLISH_ENABLED = "false";
    expect(await tickScheduledPublish()).toBe(0);
    expect(execute).not.toHaveBeenCalled();
  });

  it("only selects pending rows inside the 6h grace window (older ones are skipped)", async () => {
    execute.mockResolvedValueOnce(rows());
    await tickScheduledPublish();
    const sql = String(execute.mock.calls[0][0]);
    expect(sql).toMatch(/status = 'pending'/);
    expect(sql).toMatch(/scheduledAt <= NOW\(3\)/);
    expect(sql).toMatch(/INTERVAL 21600 SECOND/);
  });

  it("skips unapproved outputs without claiming them", async () => {
    execute.mockResolvedValueOnce(rows({ id: 1, userId: 7, outputId: 9 }));
    approval.mockResolvedValueOnce("in_review");
    expect(await tickScheduledPublish()).toBe(0);
    expect(execute).toHaveBeenCalledTimes(1); // no claim UPDATE
    expect(publishScheduledPost).not.toHaveBeenCalled();
    expect(approval).toHaveBeenCalledWith(expect.anything(), 9, 7);
  });

  it("publishes an approved, claimed row", async () => {
    execute.mockResolvedValueOnce(rows({ id: 1, userId: 7, outputId: 9 })).mockResolvedValueOnce([{ affectedRows: 1 }]);
    approval.mockResolvedValueOnce("approved");
    publishScheduledPost.mockResolvedValueOnce({ ok: true });
    expect(await tickScheduledPublish()).toBe(1);
    expect(publishScheduledPost).toHaveBeenCalledWith({ id: 1, userId: 7, claimed: true });
  });

  it("loses the claim race gracefully: no publish when another worker got the row", async () => {
    execute.mockResolvedValueOnce(rows({ id: 1, userId: 7, outputId: 9 })).mockResolvedValueOnce([{ affectedRows: 0 }]);
    approval.mockResolvedValueOnce("approved");
    expect(await tickScheduledPublish()).toBe(0);
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
      .mockRejectedValueOnce(new Error('bundle.social 429: {"message":"slow down"}'))
      .mockResolvedValueOnce({ ok: true });
    expect(await tickScheduledPublish()).toBe(1);
    const failUpdate = execute.mock.calls.find((c) => /status = 'failed'/.test(String(c[0])))!;
    expect(String(failUpdate[0])).toMatch(/status = 'publishing'/);
    expect(failUpdate[1][0]).toMatch(/稍後/);
    expect(failUpdate[1][0]).not.toMatch(/[{}]/);
    expect(failUpdate[1][1]).toBe(1);
    expect(publishScheduledPost).toHaveBeenCalledTimes(2);
  });
});
