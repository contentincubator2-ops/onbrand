import { PublishUserError } from "../../platform/core/connectors/publish/publishAdapter";
import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

/**
 * Publish flow end to end with the REAL publishGate, calendarRouter functions and
 * scheduledPublishWorker, against a small stateful fake of the database. Only the
 * outside world is mocked (the DB, plan checks, the zernio call), so
 * nothing here can post anywhere.
 */

type Post = {
  id: number; userId: number; outputId: number; status: string; lastError: string | null;
  attempts: number; scheduledAt: Date; platform: string; externalUrl: string | null;
};
const db = {
  posts: new Map<number, Post>(),
  review: {} as Record<number, string | undefined>,   // outputId -> mission_review_queue.status
  adminOfOwner: false,
  otherAdminsExist: true,                              // false = solo user (review exempt)
  outputsPublished: [] as number[],
};
const publishViaZernio = vi.fn();

function postRow(p: Post) {
  return {
    id: p.id, ownerId: p.userId, outputId: p.outputId, variantIndex: 0, contentKind: null, contentIndex: null,
    planningConfirmed: 0, platform: p.platform, status: p.status, brandId: 3, attempts: p.attempts,
    outputContent: JSON.stringify([{ caption: "hello world" }]), outputMetadata: null, missionSquadSlug: null,
    brandName: "B",
  };
}

const execute = vi.fn(async (sql: string, params: any[] = []) => {
  const q = String(sql);
  // writes
  if (/UPDATE mission_outputs/.test(q)) { db.outputsPublished.push(params[1]); return [{ affectedRows: 1 }]; }
  if (/UPDATE scheduled_posts SET status = 'publishing'/.test(q)) {
    const p = db.posts.get(params[0]);
    if (p && p.status === "pending") { p.status = "publishing"; p.attempts++; return [{ affectedRows: 1 }]; }
    return [{ affectedRows: 0 }];
  }
  if (/SET status = 'published'/.test(q)) {
    expect(q).toContain("lastError = NULL");
    const p = db.posts.get(params[2])!; p.status = "published"; p.lastError = null; p.externalUrl = params[0];
    return [{ affectedRows: 1 }];
  }
  if (/SET status = 'failed', lastError = \?/.test(q)) {
    const p = db.posts.get(params[1]);
    if (p && p.status === "publishing") { p.status = "failed"; p.lastError = params[0]; return [{ affectedRows: 1 }]; }
    return [{ affectedRows: 0 }];
  }
  if (/SET status = 'pending', lastError = NULL WHERE id = \? AND status = 'failed'/.test(q)) {
    const p = db.posts.get(params[0]);
    if (p && p.status === "failed") { p.status = "pending"; p.lastError = null; return [{ affectedRows: 1 }]; }
    return [{ affectedRows: 0 }];
  }
  if (/SET scheduledAt = \?, lastError = IF/.test(q)) {
    expect(q).toContain("lastError = IF(status = 'failed' OR lastError = ?, NULL, lastError)");
    const p = db.posts.get(params[2]);
    if (p && p.userId === params[3] && (p.status === "pending" || p.status === "failed")) {
      p.scheduledAt = params[0]; if (p.status === "failed" || p.lastError === params[1]) p.lastError = null; p.status = "pending";
      return [{ affectedRows: 1 }];
    }
    return [{ affectedRows: 0 }];
  }
  if (/SET lastError = \?, attempts = attempts \+ 1/.test(q)) {
    const p = db.posts.get(params[1]);
    if (p && p.status === "pending") { p.lastError = params[0]; p.attempts++; }
    return [{ affectedRows: 1 }];
  }
  if (/SET lastError = \?\s+WHERE/.test(q)) {
    expect(q).toMatch(/status = 'pending' AND \(lastError IS NULL OR lastError <> \?\)/);
    const p = db.posts.get(params[1]);
    if (p && p.status === "pending" && (p.lastError === null || p.lastError !== params[2])) {
      p.lastError = params[0]; return [{ affectedRows: 1 }];
    }
    return [{ affectedRows: 0 }];
  }
  if (/^\s*UPDATE/i.test(q)) return [{ affectedRows: 1 }];
  // reads
  if (q.includes("SELECT id, userId, outputId FROM scheduled_posts")) {
    const now = Date.now();
    const limit = Number(q.match(/LIMIT (\d+)/)?.[1]);
    return [[...db.posts.values()]
      .filter((p) => p.status === "pending" && p.scheduledAt.getTime() <= now && p.scheduledAt.getTime() >= now - 6 * 60 * 60 * 1000)
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
      .slice(0, limit)
      .map((p) => ({ id: p.id, userId: p.userId, outputId: p.outputId }))];
  }
  if (q.includes("FROM scheduled_posts sp")) {
    const p = db.posts.get(params[0]);
    // 2026-10-08：真實 SQL 一度漏掉 sp.userId AS ownerId，canPublishFor 拿到 NaN 全部回「排程不存在或無權限」。
    // mock 只在 SELECT 真的有選 ownerId 時才回它，避免再被 mock 蓋掉。
    const row = p ? postRow(p) : null;
    if (row && !q.includes("sp.userId AS ownerId")) delete (row as any).ownerId;
    return [row ? [row] : []];
  }
  if (q.includes("SELECT userId AS ownerId, status FROM scheduled_posts")) {
    const p = db.posts.get(params[0]); return [p ? [{ ownerId: p.userId, status: p.status }] : []];
  }
  if (q.includes("own.workspaceId")) return [db.adminOfOwner ? [{ 1: 1 }] : []];       // canPublishFor
  if (q.includes("other.role")) return [db.otherAdminsExist ? [{ 1: 1 }] : []];        // isSoloUser
  if (q.includes("mission_review_queue")) { const s = db.review[params[0]]; return [s ? [{ status: s }] : []]; }
  if (q.includes("FROM mission_outputs")) return [[{ status: "draft" }]];
  return [[]];
});

vi.mock("../../localDb", () => ({ default: { execute: (...a: any[]) => (execute as any)(...a) } }));
vi.mock("../../db", () => ({ getDb: vi.fn() }));
vi.mock("../../platform/core/brandAuth", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../platform/core/brandAuth")>(),
  assertBrandOwner: vi.fn(),
}));
vi.mock("../../platform/core/billing/planGate", () => ({ assertCanAct: vi.fn(async () => {}), isHiddenHistoryItem: () => false }));
vi.mock("../../platform/routers/opsRouter", () => ({ logError: vi.fn() }));

vi.mock("../../platform/core/connectors/publish/zernioAdapter", () => ({
  createZernioAdapter: () => ({ publish: (...a: any[]) => publishViaZernio(...a) }),
}));

import { calendarRouter, publishScheduledPost, retryScheduledPost, rescheduleScheduledPost } from "../routers/calendarRouter";
import { APPROVAL_HINT, tickScheduledPublish } from "./scheduledPublishWorker";

const OWNER = 2;
const ADMIN = 1;
const mk = (over: Partial<Post> = {}): Post => ({
  id: 50, userId: OWNER, outputId: 9, status: "pending", lastError: null, attempts: 0,
  scheduledAt: new Date(Date.now() - 60_000), platform: "threads", externalUrl: null, ...over,
});

describe("publish flow (approval gate, retry, worker)", () => {
  const env = { ...process.env };
  beforeEach(() => {
    execute.mockClear(); publishViaZernio.mockReset();
    publishViaZernio.mockResolvedValue({ postId: "p1", permalink: "https://threads.net/p1" });
    db.posts.clear(); db.review = { 9: "approved", 10: "pending" }; db.adminOfOwner = false;
    db.otherAdminsExist = true; db.outputsPublished = [];
    process.env.ZERNIO_API_KEY = randomUUID();
    process.env.AUTOPUBLISH_SCHEDULED = "on";
    delete process.env.SOCIAL_PUBLISH_ENABLED;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => { process.env = { ...env }; vi.restoreAllMocks(); });

  it("approved post: publishScheduledPost goes through the Zernio path and the row becomes published", async () => {
    db.posts.set(50, mk());
    const r = await publishScheduledPost({ id: 50, userId: OWNER });
    expect(r.ok).toBe(true);
    expect(publishViaZernio).toHaveBeenCalledTimes(1);
    expect(publishViaZernio.mock.calls[0][0]).toMatchObject({ platform: "threads", caption: "hello world" });
    const p = db.posts.get(50)!;
    expect(p.status).toBe("published");
    expect(p.externalUrl).toBe("https://threads.net/p1");
    expect(db.outputsPublished).toEqual([9]);
  });

  it("routes Zernio and persists the external URL", async () => {
    process.env.ZERNIO_API_KEY = randomUUID();
    publishViaZernio.mockResolvedValueOnce({ postId: "z1", permalink: "https://example.com/z1" });
    db.posts.set(50, mk());
    expect((await publishScheduledPost({ id: 50, userId: OWNER })).ok).toBe(true);
    expect(publishViaZernio).toHaveBeenCalledWith(expect.objectContaining({ scheduledPostId: 50, brandId: 3, platform: "threads", caption: "hello world", attempt: 1 }));
    expect(db.posts.get(50)?.externalUrl).toBe("https://example.com/z1");
    expect(db.posts.get(50)?.status).toBe("published");
  });

  it.each(["worker", "manual"])("uses a new attempt after a worker failure then %s retry", async retryVia => {
    process.env.ZERNIO_API_KEY = randomUUID();
    db.posts.set(50, mk());
    publishViaZernio.mockRejectedValueOnce(new Error("Zernio partial publish failure"))
      .mockResolvedValueOnce({ postId: "z2", permalink: "https://example.com/z2" });
    expect(await tickScheduledPublish()).toEqual({ published: 0, awaitingApproval: 0 });
    expect(db.posts.get(50)).toMatchObject({ status: "failed", attempts: 1 });
    await retryScheduledPost({ id: 50, userId: OWNER });
    if (retryVia === "worker") expect(await tickScheduledPublish()).toEqual({ published: 1, awaitingApproval: 0 });
    else expect((await publishScheduledPost({ id: 50, userId: OWNER })).ok).toBe(true);
    expect(publishViaZernio.mock.calls.map(([i]) => i.attempt)).toEqual([1, 2]);
    expect(db.posts.get(50)?.status).toBe("published");
    expect(execute.mock.calls.some(([query]) => query.includes("sp.attempts"))).toBe(true);
  });

  it("advances the attempt when a manual publish is retried", async () => {
    process.env.ZERNIO_API_KEY = randomUUID();
    db.posts.set(50, mk());
    publishViaZernio.mockRejectedValueOnce(new Error("Zernio partial publish failure"))
      .mockResolvedValueOnce({ postId: "z2", permalink: "https://example.com/z2" });
    await expect(publishScheduledPost({ id: 50, userId: OWNER })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(db.posts.get(50)).toMatchObject({ status: "pending", attempts: 1 });
    expect((await publishScheduledPost({ id: 50, userId: OWNER })).ok).toBe(true);
    expect(publishViaZernio.mock.calls.map(([i]) => i.attempt)).toEqual([1, 2]);
  });

  it("Zernio reports missing configuration and user-fixable media errors", async () => {
    delete process.env.ZERNIO_API_KEY;
    db.posts.set(50, mk());
    await expect(publishScheduledPost({ id: 50, userId: OWNER })).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: "發布服務尚未啟用，請聯絡 sowork@sowork.ai。" });
    process.env.ZERNIO_API_KEY = randomUUID();
    publishViaZernio.mockRejectedValueOnce(new PublishUserError("需要影片才能發布。"));
    await expect(publishScheduledPost({ id: 50, userId: OWNER })).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: "需要影片才能發布。" });
    publishViaZernio.mockRejectedValueOnce(new Error("zernio 502: unavailable"));
    await expect(publishScheduledPost({ id: 50, userId: OWNER })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(db.posts.get(50)?.status).toBe("pending");
  });

  it("unapproved post is blocked: nothing is sent and the row stays pending", async () => {
    db.posts.set(51, mk({ id: 51, outputId: 10 }));
    await expect(publishScheduledPost({ id: 51, userId: OWNER })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(publishViaZernio).not.toHaveBeenCalled();
    expect(db.posts.get(51)!.status).toBe("pending");
  });

  it("solo user (nobody else to review) is exempt from the gate", async () => {
    db.otherAdminsExist = false;
    db.posts.set(51, mk({ id: 51, outputId: 10 }));
    expect((await publishScheduledPost({ id: 51, userId: OWNER })).ok).toBe(true);
    expect(db.posts.get(51)!.status).toBe("published");
  });

  it("failed -> retry -> pending keeps attempts, clears lastError, and does not publish", async () => {
    db.posts.set(50, mk({ status: "failed", lastError: "boom", attempts: 2 }));
    await retryScheduledPost({ id: 50, userId: OWNER });
    const p = db.posts.get(50)!;
    expect(p.status).toBe("pending");
    expect(p.lastError).toBeNull();
    expect(p.attempts).toBe(2);
    expect(publishViaZernio).not.toHaveBeenCalled();
  });

  it("retry only accepts failed rows", async () => {
    db.posts.set(50, mk({ status: "pending" }));
    await expect(retryScheduledPost({ id: 50, userId: OWNER })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    db.posts.set(52, mk({ id: 52, status: "published" }));
    await expect(retryScheduledPost({ id: 52, userId: OWNER })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("retry permissions: owner and workspace admin yes; stranger gets NOT_FOUND and the row is untouched", async () => {
    db.posts.set(50, mk({ status: "failed", lastError: "boom" }));
    await expect(retryScheduledPost({ id: 50, userId: 99 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.posts.get(50)!.status).toBe("failed");
    db.adminOfOwner = true;
    await retryScheduledPost({ id: 50, userId: ADMIN });
    expect(db.posts.get(50)!.status).toBe("pending");
    await expect(retryScheduledPost({ id: 404, userId: ADMIN })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("a retried post for an unapproved output still cannot publish (retry never bypasses the gate)", async () => {
    db.posts.set(51, mk({ id: 51, outputId: 10, status: "failed", lastError: "boom" }));
    await retryScheduledPost({ id: 51, userId: OWNER });
    await expect(publishScheduledPost({ id: 51, userId: OWNER })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(publishViaZernio).not.toHaveBeenCalled();
  });

  it("reschedule moves a failed row back to pending; published rows and strangers are refused", async () => {
    db.posts.set(50, mk({ status: "failed", lastError: "boom" }));
    await rescheduleScheduledPost({ id: 50, userId: OWNER, scheduledAt: "2030-01-01T10:00:00Z" });
    expect(db.posts.get(50)).toMatchObject({ status: "pending", lastError: null });
    db.posts.set(53, mk({ id: 53, status: "published" }));
    await expect(rescheduleScheduledPost({ id: 53, userId: OWNER, scheduledAt: "2030-01-01T10:00:00Z" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(rescheduleScheduledPost({ id: 50, userId: 99, scheduledAt: "2030-01-01T10:00:00Z" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(rescheduleScheduledPost({ id: 50, userId: OWNER, scheduledAt: "not a date" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("worker tick publishes the approved post and hints the unapproved one", async () => {
    db.posts.set(50, mk());
    db.posts.set(51, mk({ id: 51, outputId: 10 }));
    expect(await tickScheduledPublish()).toEqual({ published: 1, awaitingApproval: 1 });
    expect(db.posts.get(50)!.status).toBe("published");
    expect(db.posts.get(51)).toMatchObject({ status: "pending", lastError: APPROVAL_HINT, attempts: 0 });
    expect(publishViaZernio).toHaveBeenCalledTimes(1);
  });

  it.each([APPROVAL_HINT, "provider error", null])("reschedule clears only the approval hint on pending rows (%s)", async (lastError) => {
    db.posts.set(50, mk({ lastError, attempts: 2 }));
    await rescheduleScheduledPost({ id: 50, userId: OWNER, scheduledAt: "2030-01-01T10:00:00Z" });
    expect(db.posts.get(50)).toMatchObject({
      status: "pending", attempts: 2, scheduledAt: new Date("2030-01-01T10:00:00Z"),
      lastError: lastError === APPROVAL_HINT ? null : lastError,
    });
    expect(await tickScheduledPublish()).toEqual({ published: 0, awaitingApproval: 0 });
    expect(publishViaZernio).not.toHaveBeenCalled();
  });

  it("approval on the next tick publishes and clears the stored hint", async () => {
    db.posts.set(51, mk({ id: 51, outputId: 10 }));
    expect(await tickScheduledPublish()).toEqual({ published: 0, awaitingApproval: 1 });
    expect(db.posts.get(51)).toMatchObject({ status: "pending", lastError: APPROVAL_HINT, attempts: 0 });
    db.review[10] = "approved";
    expect(await tickScheduledPublish()).toEqual({ published: 1, awaitingApproval: 0 });
    expect(db.posts.get(51)).toMatchObject({ status: "published", lastError: null, attempts: 1 });
    expect(publishViaZernio).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["pending", APPROVAL_HINT, true],
    ["pending", null, false],
    ["pending", "provider error", false],
    ["failed", APPROVAL_HINT, false],
    ["published", APPROVAL_HINT, false],
  ])("calendar range returns awaitingApproval for %s / %s", async (status, lastError, awaitingApproval) => {
    execute.mockResolvedValueOnce([[{
      ...postRow(mk()), scheduledAt: new Date(), status, lastError,
    }]]).mockResolvedValueOnce([[]]);
    const items = await calendarRouter.createCaller({ user: { id: OWNER } }).range({
      from: "2026-10-05T00:00:00+08:00", to: "2026-10-12T00:00:00+08:00",
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "scheduled", status, lastError, awaitingApproval });
  });

  it("worker marks a provider failure failed, and a person can then retry it", async () => {
    db.posts.set(50, mk());
    publishViaZernio.mockRejectedValueOnce(new Error("zernio 502: bad gateway"));
    expect(await tickScheduledPublish()).toEqual({ published: 0, awaitingApproval: 0 });
    expect(db.posts.get(50)).toMatchObject({ status: "failed", attempts: 1 });
    expect(db.posts.get(50)!.lastError).toBeTruthy();
    await retryScheduledPost({ id: 50, userId: OWNER });
    expect(db.posts.get(50)!.status).toBe("pending");
    expect(await tickScheduledPublish()).toEqual({ published: 1, awaitingApproval: 0 });
    expect(db.posts.get(50)!.status).toBe("published");
  });
});
