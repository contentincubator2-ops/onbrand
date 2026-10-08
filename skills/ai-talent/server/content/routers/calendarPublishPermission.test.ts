import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";

/**
 * publishScheduledPost permissions: owner, workspace owner/admin on behalf of a
 * teammate, never a stranger or a viewer — and the approval gate always applies.
 * Everything external is mocked; nothing here can post anywhere.
 */

const state = {
  adminOfOwner: false,
  review: "approved" as string | null,
  otherAdminsExist: true,
  row: null as any,
};
const updates: Array<{ sql: string; params: any[] }> = [];
const publishViaZernio = vi.fn();
const assertCanAct = vi.fn(async (_id: number) => {});

const execute = vi.fn(async (sql: string, params: any[] = []) => {
  const q = String(sql);
  if (/^\s*UPDATE/i.test(q)) { updates.push({ sql: q, params }); return [{ affectedRows: 1 }]; }
  if (q.includes("FROM scheduled_posts sp")) return [state.row ? [state.row] : []];
  if (q.includes("own.workspaceId")) return [state.adminOfOwner ? [{ 1: 1 }] : []];       // canPublishFor
  if (q.includes("other.role")) return [state.otherAdminsExist ? [{ 1: 1 }] : []];        // isSoloUser
  if (q.includes("mission_review_queue")) return [state.review ? [{ status: state.review }] : []];
  if (q.includes("FROM mission_outputs")) return [[{ status: "draft" }]];
  return [[]];
});

vi.mock("../../localDb", () => ({ default: { execute: (...a: any[]) => (execute as any)(...a) } }));
vi.mock("../../db", () => ({ getDb: vi.fn() }));
vi.mock("../../platform/core/brandAuth", () => ({ assertBrandOwner: vi.fn() }));
vi.mock("../../platform/core/billing/planGate", () => ({
  assertCanAct: (id: number) => assertCanAct(id),
  isHiddenHistoryItem: () => false,
}));
vi.mock("../../platform/core/connectors/publish/zernioAdapter", () => ({
  createZernioAdapter: () => ({ publish: (...a: any[]) => publishViaZernio(...a) }),
}));

import { publishScheduledPost } from "./calendarRouter";

const OWNER = 2;
const ADMIN = 1;

function makeRow(over: Record<string, unknown> = {}) {
  return {
    id: 50, ownerId: OWNER, outputId: 9, variantIndex: 0, contentKind: null, contentIndex: null,
    planningConfirmed: 0, platform: "threads", status: "pending", brandId: 3,
    outputContent: JSON.stringify([{ caption: "hello" }]), outputMetadata: null, missionSquadSlug: null,
    brandName: "B",
    ...over,
  };
}

describe("publishScheduledPost permissions", () => {
  const env = { ...process.env };
  beforeEach(() => {
    execute.mockClear(); updates.length = 0; publishViaZernio.mockReset(); assertCanAct.mockReset();
    assertCanAct.mockResolvedValue(undefined);
    publishViaZernio.mockResolvedValue({ postId: "p1", permalink: "https://threads.net/p1" });
    state.adminOfOwner = false; state.review = "approved"; state.otherAdminsExist = true; state.row = makeRow();
    process.env.ZERNIO_API_KEY = "test-key-not-real";
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => { process.env = { ...env }; vi.restoreAllMocks(); });

  it("owner publishes their own approved post", async () => {
    const r = await publishScheduledPost({ id: 50, userId: OWNER });
    expect(r.ok).toBe(true);
    expect(publishViaZernio).toHaveBeenCalledTimes(1);
  });

  it("a workspace owner/admin can publish a teammate's approved post", async () => {
    state.adminOfOwner = true;
    const r = await publishScheduledPost({ id: 50, userId: ADMIN });
    expect(r.ok).toBe(true);
    expect(assertCanAct).toHaveBeenCalledWith(ADMIN);
    const published = updates.find((u) => /status = 'published'/.test(u.sql))!;
    expect(published.params[published.params.length - 1]).toBe(50);
  });

  it("a non-admin teammate or stranger gets NOT_FOUND and nothing is published", async () => {
    state.adminOfOwner = false;
    await expect(publishScheduledPost({ id: 50, userId: 99 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(publishViaZernio).not.toHaveBeenCalled();
  });

  it("the approval gate still blocks an admin publishing an unapproved teammate post", async () => {
    state.adminOfOwner = true; state.review = "pending";
    await expect(publishScheduledPost({ id: 50, userId: ADMIN })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(publishViaZernio).not.toHaveBeenCalled();
  });

  it("approval is judged against the post owner, not the admin (owner not solo here)", async () => {
    state.adminOfOwner = true; state.review = null; // never submitted
    await expect(publishScheduledPost({ id: 50, userId: ADMIN })).rejects.toThrow(/還沒核准/);
  });

  it("viewer role stays blocked even when the owner/admin join would match", async () => {
    state.adminOfOwner = true;
    assertCanAct.mockRejectedValueOnce(new TRPCError({ code: "FORBIDDEN", message: "viewer" }));
    await expect(publishScheduledPost({ id: 50, userId: ADMIN })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(publishViaZernio).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("a provider failure on 'publish now' stores a friendly lastError and keeps the row pending", async () => {
    publishViaZernio.mockRejectedValueOnce(new Error('zernio 429: {"message":"slow down"}'));
    await expect(publishScheduledPost({ id: 50, userId: OWNER })).rejects.toThrow(/稍後/);
    const u = updates.find((x) => /SET lastError = \?/.test(x.sql))!;
    expect(u.sql).toMatch(/status = 'pending'/);
    expect(u.params[0]).toMatch(/稍後/);
    expect(u.params[0]).not.toMatch(/[{}]/);
  });

  it("a claimed (worker) failure is left for the worker to record", async () => {
    state.row = makeRow({ status: "publishing" });
    publishViaZernio.mockRejectedValueOnce(new Error("zernio 502: bad gateway"));
    await expect(publishScheduledPost({ id: 50, userId: OWNER, claimed: true })).rejects.toThrow(/暫時異常/);
    expect(updates.find((x) => /SET lastError/.test(x.sql))).toBeUndefined();
  });

  it("unsupported media for the platform is reported, not dropped (user-fixable => PRECONDITION_FAILED)", async () => {
    const { PublishUserError } = await import("../../platform/core/connectors/publish/publishAdapter");
    publishViaZernio.mockRejectedValueOnce(new PublishUserError("X 一則貼文最多 4 張圖 / X allows at most 4 images"));
    await expect(publishScheduledPost({ id: 50, userId: OWNER })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});
