import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ disconnectAll: vi.fn(), log: vi.fn() }));
vi.mock("./zernioAdapter", () => ({ createZernioAdapter: () => ({ disconnectAll: mocks.disconnectAll }) }));
vi.mock("../../../routers/opsRouter", () => ({ logError: mocks.log }));
import { disconnectBrand, disconnectBrandsForOwner } from "./zernioLifecycle";

describe("Zernio lifecycle cleanup", () => {
  beforeEach(() => {
    vi.stubEnv("ZERNIO_API_KEY", randomUUID());
    mocks.disconnectAll.mockReset().mockResolvedValue({ disconnected: 1, failed: 0 });
    mocks.log.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
  it.each([{ userId: 7, workspaceId: 9 }, { userId: 7, workspaceId: null }])("selects brands belonging to %j", async owner => {
    const pool = { execute: vi.fn().mockResolvedValue([[{ id: 3 }, { id: 4 }]]) };
    await disconnectBrandsForOwner(pool, owner);
    expect(pool.execute).toHaveBeenCalledWith(`SELECT id FROM brands WHERE ${owner.workspaceId ? "workspaceId" : "userId"} = ?`, [owner.workspaceId ?? owner.userId]);
    expect(mocks.disconnectAll.mock.calls).toEqual([[{ brandId: 3 }], [{ brandId: 4 }]]);
    expect(mocks.log).not.toHaveBeenCalled();
  });
  it("skips all work without a configured provider", async () => {
    vi.stubEnv("ZERNIO_API_KEY", "");
    const pool = { execute: vi.fn() };
    await disconnectBrandsForOwner(pool, { userId: 7, workspaceId: 9 });
    await disconnectBrand(pool, 3);
    expect(pool.execute).not.toHaveBeenCalled();
    expect(mocks.disconnectAll).not.toHaveBeenCalled();
  });
  it("continues to the next brand when one throws or reports a partial failure", async () => {
    const pool = { execute: vi.fn().mockResolvedValue([[{ id: 3 }, { id: 4 }, { id: 5 }]]) };
    mocks.disconnectAll.mockRejectedValueOnce(new Error("Unavailable"))
      .mockResolvedValueOnce({ disconnected: 1, failed: 1 });
    await expect(disconnectBrandsForOwner(pool, { userId: 7, workspaceId: 9 })).resolves.toBeUndefined();
    expect(mocks.disconnectAll).toHaveBeenCalledTimes(3);
    expect(mocks.log).toHaveBeenCalledTimes(2);
    for (const [entry] of mocks.log.mock.calls) expect(entry).toMatchObject({ source: "zernio.lifecycle", level: "warn" });
  });
  it("logs a failed brand lookup without blocking termination", async () => {
    const pool = { execute: vi.fn().mockRejectedValue(new Error("DB unavailable")) };
    await expect(disconnectBrandsForOwner(pool, { userId: 7, workspaceId: 9 })).resolves.toBeUndefined();
    expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({ source: "zernio.lifecycle", level: "warn", meta: { userId: 7, workspaceId: 9 } }));
  });
  it("never exposes error contents and does not throw when logging fails", async () => {
    const credential = randomUUID();
    mocks.disconnectAll.mockRejectedValue(new Error(credential));
    mocks.log.mockRejectedValue(new Error(credential));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(disconnectBrand({ execute: vi.fn() }, 3)).resolves.toBeUndefined();
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain(credential);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(credential);
  });
});
