import { describe, expect, it, vi } from "vitest";
import { tickZernioReconcile } from "./zernioReconcileWorker";
import type { ZernioAccount } from "../zernio";

function setup(remote: ZernioAccount[], local: Array<{ brandId: number; platform: string; accountId: string }> = [],
  tenants = [{ brandId: 3, tenantId: "p" }, { brandId: 4, tenantId: "q" }]) {
  const pool = { execute: vi.fn().mockImplementation(async (sql: string) => {
    if (sql.includes("FROM brand_publish_connections")) return [local];
    if (sql.includes("FROM brand_publish_tenants")) return [tenants];
    if (sql.startsWith("UPDATE")) return [{}];
    throw new Error("Unexpected query");
  }) };
  const client = { listAllAccounts: vi.fn().mockResolvedValue(remote), deleteAccount: vi.fn() };
  const log = vi.fn().mockResolvedValue(undefined);
  return { pool, client, log };
}
const account = (id: string, profile = "p", extra: Partial<ZernioAccount> = {}): ZernioAccount =>
  ({ _id: id, platform: "facebook", profileId: { _id: profile }, ...extra });
const connection = (id: string, brandId = 3) => ({ accountId: id, brandId, platform: "facebook" });

describe("Zernio daily reconciliation", () => {
  it.each(["unmapped", "p"])("warns for a billing orphan on profile %s without deleting it", async profile => {
    const deps = setup([account("a", profile)]);
    expect(await tickZernioReconcile(deps)).toEqual({ scanned: 1, orphans: 1, staleLocal: 0, crossBrand: 0 });
    expect(deps.log).toHaveBeenCalledOnce();
    expect(deps.log).toHaveBeenCalledWith(expect.objectContaining({ source: "zernio.reconcile", level: "warn", message: "孤兒帳號，正在計費" }));
    expect(deps.client.deleteAccount).not.toHaveBeenCalled();
    expect(deps.pool.execute.mock.calls.some(([sql]) => sql.startsWith("UPDATE"))).toBe(false);
  });
  it("marks a stale local connection disconnected and logs once", async () => {
    const deps = setup([], [connection("gone")]);
    expect(await tickZernioReconcile(deps)).toEqual({ scanned: 0, orphans: 0, staleLocal: 1, crossBrand: 0 });
    expect(deps.pool.execute).toHaveBeenLastCalledWith(expect.stringContaining("SET status = 'disconnected'"), [3, "zernio", "facebook"]);
    expect(deps.log).toHaveBeenCalledOnce();
    expect(deps.log).toHaveBeenCalledWith(expect.objectContaining({ source: "zernio.reconcile", level: "warn", message: expect.stringContaining("本地連線已失效") }));
    expect(deps.client.deleteAccount).not.toHaveBeenCalled();
  });
  it.each([{ platformUserId: "same" }, { username: "same" }, { platformUserId: "same", username: "same" }])("warns once for a cross-profile identity %j", async identity => {
    const deps = setup([account("a", "p", identity), account("b", "q", identity)], [connection("a"), connection("b", 4)]);
    expect(await tickZernioReconcile(deps)).toEqual({ scanned: 2, orphans: 0, staleLocal: 0, crossBrand: 1 });
    expect(deps.log).toHaveBeenCalledOnce();
    expect(deps.log).toHaveBeenCalledWith(expect.objectContaining({ message: "同帳號跨品牌，計費兩次" }));
    expect(deps.client.deleteAccount).not.toHaveBeenCalled();
  });
  it("also flags an extra remote account when the platform has another current account", async () => {
    const deps = setup([account("a"), account("extra")], [connection("a")]);
    expect(await tickZernioReconcile(deps)).toMatchObject({ orphans: 1, staleLocal: 0 });
  });
  it("matches raw profile ids and maps twitter to internal x", async () => {
    const deps = setup([account("a", "p", { profileId: "p", platform: "twitter" })], [{ accountId: "a", brandId: 3, platform: "x" }]);
    expect(await tickZernioReconcile(deps)).toEqual({ scanned: 1, orphans: 0, staleLocal: 0, crossBrand: 0 });
    expect(deps.log).not.toHaveBeenCalled();
  });
  it("does not confuse equal usernames on different platforms or accounts on the same profile", async () => {
    const deps = setup([account("a", "p", { username: "same" }), account("b", "p", { username: "same" }), account("c", "q", { username: "same", platform: "threads" })]);
    expect(await tickZernioReconcile(deps)).toMatchObject({ crossBrand: 0 });
  });
  it("does not change local rows when the remote snapshot fails", async () => {
    const deps = setup([], [connection("a")]);
    deps.client.listAllAccounts.mockRejectedValue(new Error("page failed"));
    await expect(tickZernioReconcile(deps)).rejects.toThrow("page failed");
    expect(deps.pool.execute.mock.calls.some(([sql]) => sql.startsWith("UPDATE"))).toBe(false);
  });
});
