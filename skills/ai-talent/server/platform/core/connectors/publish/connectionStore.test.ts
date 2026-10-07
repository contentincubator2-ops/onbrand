import { describe, expect, it, vi } from "vitest";
import { getTenant, upsertTenant, listConnections, upsertConnections, markDisconnected } from "./connectionStore";

describe("connection store", () => {
  it("defaults to connected and scopes all reads to brand/provider/platform", async () => {
    const pool = { execute: vi.fn().mockResolvedValue([[{ accountId: "a" }]]) };
    expect(await listConnections(pool, 3, "zernio", "x")).toEqual([{ accountId: "a" }]);
    expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining("ORDER BY connectedAt DESC"), [3, "zernio", "x", "connected"]);
    expect(pool.execute.mock.calls[0]![0]).not.toContain("SELECT *");
    await listConnections(pool, 3, "zernio", "x", "disconnected");
    expect(pool.execute.mock.calls[1]![1]).toEqual([3, "zernio", "x", "disconnected"]);
  });
  it("disconnects omitted accounts and upserts incoming accounts", async () => {
    const pool = { execute: vi.fn().mockResolvedValue([[]]) };
    await upsertConnections(pool, 3, "zernio", "facebook", [{ accountId: "a", accountLabel: "Page", meta: { profileUrl: "https://example.com" } }]);
    expect(pool.execute.mock.calls[0]![0]).toContain("accountId NOT IN (?)");
    expect(pool.execute.mock.calls[0]![1]).toEqual([3, "zernio", "facebook", "a"]);
    expect(pool.execute.mock.calls[1]![0]).toContain("ON DUPLICATE KEY UPDATE");
    expect(pool.execute.mock.calls[1]![1]).toEqual([3, "zernio", "facebook", "a", "Page", null, '{"profileUrl":"https://example.com"}']);
    expect(pool.execute.mock.calls[1]![0]).toContain("connectedAt = IF(status = 'disconnected'");
  });
  it("an empty snapshot disconnects all accounts in just that scope", async () => {
    const pool = { execute: vi.fn().mockResolvedValue([[]]) };
    await upsertConnections(pool, 3, "zernio", "x", []);
    expect(pool.execute).toHaveBeenCalledTimes(1);
    expect(pool.execute.mock.calls[0]![0]).not.toContain("NOT IN");
    expect(pool.execute.mock.calls[0]![1]).toEqual([3, "zernio", "x"]);
  });
  it("reads/stores tenants and marks an individual connection", async () => {
    const pool = { execute: vi.fn().mockResolvedValue([[]]) };
    expect(await getTenant(pool, 3, "zernio")).toBeNull();
    pool.execute.mockResolvedValueOnce([[{ tenantId: "profile" }]]);
    expect(await getTenant(pool, 3, "zernio")).toBe("profile");
    await upsertTenant(pool, 3, "zernio", "profile");
    expect(pool.execute).toHaveBeenLastCalledWith(expect.stringContaining("ON DUPLICATE KEY UPDATE"), [3, "zernio", "profile"]);
    await markDisconnected(pool, 3, "zernio", "x", "a");
    expect(pool.execute).toHaveBeenLastCalledWith(expect.stringContaining("accountId = ?"), [3, "zernio", "x", "a"]);
  });
});
