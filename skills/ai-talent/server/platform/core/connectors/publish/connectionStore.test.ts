import { describe, expect, it, vi } from "vitest";
import { getTenant, upsertTenant, getConnection, setConnection, markDisconnected, listConnectedByBrand, listAllConnected } from "./connectionStore";

describe("connection store", () => {
  it("reads only the current connected row in its brand/provider/platform scope", async () => {
    const pool = { execute: vi.fn().mockResolvedValue([[{ accountId: "a" }]]) };
    expect(await getConnection(pool, 3, "zernio", "x")).toEqual({ accountId: "a" });
    expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining("status = 'connected' LIMIT 1"), [3, "zernio", "x"]);
    expect(pool.execute.mock.calls[0]![0]).not.toContain("SELECT *");
    pool.execute.mockResolvedValueOnce([[]]);
    expect(await getConnection(pool, 3, "zernio", "x")).toBeNull();
  });
  it("overwrites the same unique row including its account and metadata", async () => {
    const pool = { execute: vi.fn().mockResolvedValue([[]]) };
    await setConnection(pool, 3, "zernio", "facebook", { accountId: "a", accountLabel: "Page", meta: { profileUrl: "https://example.com" } });
    await setConnection(pool, 3, "zernio", "facebook", { accountId: "b" });
    const sql = pool.execute.mock.calls[0]![0];
    expect(sql).toContain("ON DUPLICATE KEY UPDATE");
    for (const field of ["accountId", "accountLabel", "accountUsername", "meta"]) expect(sql).toContain(`${field} = VALUES(${field})`);
    expect(sql).toContain("status = 'connected', disconnectedAt = NULL");
    expect(pool.execute.mock.calls.map(([, params]) => params)).toEqual([
      [3, "zernio", "facebook", "a", "Page", null, '{"profileUrl":"https://example.com"}'],
      [3, "zernio", "facebook", "b", null, null, null],
    ]);
  });
  it("preserves connectedAt on polling and updates only on account replacement or reconnection", async () => {
    const pool = { execute: vi.fn().mockResolvedValue([[]]) };
    await setConnection(pool, 3, "zernio", "x", { accountId: "a" });
    const update = pool.execute.mock.calls[0]![0].split("ON DUPLICATE KEY UPDATE")[1];
    expect(update).toContain("connectedAt = IF(accountId <> VALUES(accountId) OR status = 'disconnected', NOW(3), connectedAt)");
    // MySQL reads assignment values left-to-right; the condition must see the old id/status.
    expect(update.indexOf("connectedAt = IF")).toBeLessThan(update.indexOf("accountId = VALUES"));
    expect(update.indexOf("connectedAt = IF")).toBeLessThan(update.indexOf("status = 'connected'"));
  });
  it("disconnects the platform without an account id and preserves previous disconnection timestamps", async () => {
    const pool = { execute: vi.fn().mockResolvedValue([[]]) };
    await markDisconnected(pool, 3, "zernio", "x");
    expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining("platform = ? AND status = 'connected'"), [3, "zernio", "x"]);
    expect(pool.execute.mock.calls[0]![0]).not.toContain("accountId =");
  });
  it("lists connected rows by brand or provider for cleanup and reconciliation", async () => {
    const rows = [{ accountId: "a" }];
    const pool = { execute: vi.fn().mockResolvedValue([rows]) };
    expect(await listConnectedByBrand(pool, 3, "zernio")).toBe(rows);
    expect(pool.execute).toHaveBeenLastCalledWith(expect.stringContaining("brandId = ? AND provider = ? AND status = 'connected'"), [3, "zernio"]);
    expect(await listAllConnected(pool, "zernio")).toBe(rows);
    expect(pool.execute).toHaveBeenLastCalledWith(expect.stringContaining("WHERE provider = ? AND status = 'connected'"), ["zernio"]);
  });
  it("reads and stores tenants", async () => {
    const pool = { execute: vi.fn().mockResolvedValue([[]]) };
    expect(await getTenant(pool, 3, "zernio")).toBeNull();
    pool.execute.mockResolvedValueOnce([[{ tenantId: "profile" }]]);
    expect(await getTenant(pool, 3, "zernio")).toBe("profile");
    await upsertTenant(pool, 3, "zernio", "profile");
    expect(pool.execute).toHaveBeenLastCalledWith(expect.stringContaining("ON DUPLICATE KEY UPDATE"), [3, "zernio", "profile"]);
  });
});
