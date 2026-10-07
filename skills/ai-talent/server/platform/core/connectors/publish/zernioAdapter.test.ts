import { describe, expect, it, vi } from "vitest";
import { createZernioAdapter } from "./zernioAdapter";
import { PublishUserError } from "./publishAdapter";

function setup() {
  const client = {
    createProfile: vi.fn().mockResolvedValue({ _id: "profile" }),
    getConnectUrl: vi.fn().mockResolvedValue({ authUrl: "https://example.com/connect" }),
    listAccounts: vi.fn().mockResolvedValue([]), deleteAccount: vi.fn().mockResolvedValue(undefined),
    createPost: vi.fn().mockResolvedValue({ httpStatus: 201, body: { post: { status: "published", platforms: [{ platform: "facebook", status: "published", platformPostId: "external", platformPostUrl: "https://example.com/post" }] } } }),
  };
  const pool = { execute: vi.fn().mockResolvedValue([[]]) };
  const brandNameOf = vi.fn().mockResolvedValue("Brand");
  return { client, pool, brandNameOf, adapter: createZernioAdapter({ client, pool, brandNameOf }) };
}
const input = { scheduledPostId: 42, brandId: 3, platform: "facebook", caption: "hello", imageUrls: [] };
describe("Zernio adapter", () => {
  it("creates and persists a profile before generating a connect link", async () => {
    const { adapter, client, pool } = setup();
    expect(await adapter.getConnectUrl({ brandId: 3, platform: "x", redirectUrl: "https://example.com" })).toEqual({ url: "https://example.com/connect" });
    expect(client.createProfile).toHaveBeenCalledWith({ name: "onBrand Studio #3 Brand", idempotencyKey: "onbrand-brand-3" });
    expect(pool.execute.mock.calls[1]![1]).toEqual([3, "zernio", "profile"]);
    expect(client.getConnectUrl).toHaveBeenCalledWith({ platform: "twitter", profileId: "profile", redirectUrl: "https://example.com" });
    expect(pool.execute.mock.invocationCallOrder[1]).toBeLessThan(client.getConnectUrl.mock.invocationCallOrder[0]!);
  });
  it("reuses a tenant and bounds new profile names", async () => {
    const { adapter, client, pool, brandNameOf } = setup();
    pool.execute.mockResolvedValueOnce([[{ tenantId: "existing" }]]);
    await adapter.getConnectUrl({ brandId: 3, platform: "fb", redirectUrl: "https://example.com" });
    expect(client.createProfile).not.toHaveBeenCalled();
    expect(client.getConnectUrl.mock.calls[0]![0].profileId).toBe("existing");
    brandNameOf.mockResolvedValue("😀".repeat(100));
    await adapter.getConnectUrl({ brandId: 4, platform: "fb", redirectUrl: "https://example.com" });
    expect(Array.from(client.createProfile.mock.calls[0]![0].name)).toHaveLength(80);
  });
  it("validates media before I/O and rejects an unconnected brand", async () => {
    const { adapter, client, pool } = setup();
    await expect(adapter.publish({ ...input, platform: "youtube" })).rejects.toBeInstanceOf(PublishUserError);
    expect(pool.execute).not.toHaveBeenCalled();
    await expect(adapter.publish(input)).rejects.toThrow("此品牌尚未連接此平台，請先到品牌設定完成連接。");
    expect(client.createPost).not.toHaveBeenCalled();
  });
  it("selects the newest connection and uses the scheduled post id for idempotency", async () => {
    const { adapter, client, pool } = setup();
    pool.execute.mockResolvedValueOnce([[{ id: 1, accountId: "older", connectedAt: "2026-10-01" }, { id: 2, accountId: "latest", connectedAt: "2026-10-07" }]]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await adapter.publish(input)).toEqual({ postId: "external", permalink: "https://example.com/post" });
    expect(client.createPost.mock.calls[0]![0].platforms[0].accountId).toBe("latest");
    expect(client.createPost.mock.calls[0]![1]).toEqual({ idempotencyKey: "onbrand-sp-42" });
    expect(warn).toHaveBeenCalledOnce(); warn.mockRestore();
  });
  it("syncs active accounts using internal x and disconnects only owned accounts", async () => {
    const { adapter, client, pool } = setup();
    pool.execute.mockResolvedValueOnce([[{ tenantId: "profile" }]]);
    client.listAccounts.mockResolvedValueOnce([{ _id: "a", platform: "twitter", displayName: "Name", username: "handle", isActive: true }, { _id: "inactive", platform: "twitter", isActive: false }]);
    await adapter.syncConnections({ brandId: 3, platform: "x" });
    expect(client.listAccounts).toHaveBeenCalledWith({ profileId: "profile", platform: "twitter" });
    expect(pool.execute.mock.calls[2]![1].slice(0, 6)).toEqual([3, "zernio", "x", "a", "Name", "handle"]);
    await expect(adapter.disconnect({ brandId: 3, platform: "x", accountId: "someone-elses" })).rejects.toBeInstanceOf(PublishUserError);
    expect(client.deleteAccount).not.toHaveBeenCalled();
    pool.execute.mockResolvedValueOnce([[{ accountId: "a" }]]);
    await adapter.disconnect({ brandId: 3, platform: "x", accountId: "a" });
    expect(client.deleteAccount).toHaveBeenCalledWith("a");
    expect(pool.execute).toHaveBeenLastCalledWith(expect.stringContaining("disconnectedAt = NOW(3)"), [3, "zernio", "x", "a"]);
  });
});
