import { TRPCError } from "@trpc/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), access: vi.fn(), summary: vi.fn(), fresh: vi.fn(), social: vi.fn() }));
vi.mock("../../localDb", () => ({ default: { execute: mocks.execute } }));
vi.mock("../../platform/core/brandAuth", () => ({ assertBrandAccess: mocks.access }));
vi.mock("../../platform/core/tenantGuard", () => ({ assertInputScopes: vi.fn() }));
vi.mock("../../platform/core/teamAccess", () => ({ isPersonalPath: () => true }));
vi.mock("../core/perfStore", async importOriginal => ({ ...await importOriginal<typeof import("../core/perfStore")>(), sourceSummary: mocks.summary }));
vi.mock("../core/zernioAnalyticsSync", async importOriginal => ({ ...await importOriginal<typeof import("../core/zernioAnalyticsSync")>(), ensureFreshZernioAnalytics: mocks.fresh, syncBrandZernioAnalytics: mocks.social }));

import { performanceRouter } from "./performanceRouter";
import { ZernioAnalyticsSyncError } from "../core/zernioAnalyticsSync";

const caller = () => performanceRouter.createCaller({ user: { id: 11 } });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue(undefined);
  mocks.fresh.mockResolvedValue({ started: false, reason: "fresh" });
  mocks.execute.mockResolvedValue([[]]);
  mocks.summary.mockResolvedValue({});
  mocks.social.mockResolvedValue({ platforms: [{ platform: "threads", posts: 2, tagged: 1, onbrand: 2, skipped: 0 }] });
});
afterEach(() => vi.unstubAllEnvs());

describe("performance social connections", () => {
  it.each(["started", "in_flight", "fresh", "disabled", "no_connection"])("reports auto sync state for %s", async reason => {
    mocks.fresh.mockResolvedValue({ started: reason === "started", reason });
    const conns = await caller().connections({ brandId: 7 });
    expect(mocks.fresh).toHaveBeenCalledWith(7);
    expect(conns[0]?.syncing).toBe(reason === "started" || reason === "in_flight");
    expect(conns.slice(1).every(c => c.syncing === undefined)).toBe(true);
  });
  it("still returns connections when the freshness check fails", async () => {
    mocks.fresh.mockRejectedValueOnce(new Error("database unavailable"));
    const conns = await caller().connections({ brandId: 7 });
    expect(conns).toHaveLength(3);
    expect(conns[0]).toMatchObject({ id: "meta_page", syncing: false });
  });
  it("includes the origin builtin dimension and social source labels in the workspace", async () => {
    const workspace = await caller().workspace({ brandId: 7, tray: "fanpage_monthly" });
    expect(workspace.builtinDims).toContainEqual({ key: "origin", label: "發布來源" });
    expect(workspace.sourceLabels).toMatchObject({
      fb_page: "粉專貼文", ig_account: "Instagram 貼文", threads_account: "Threads 貼文", linkedin_page: "LinkedIn 貼文",
    });
  });
  it.each([true, false])("workspace uses Zernio connection and runtime gates (connected: %s)", async connected => {
    vi.stubEnv("ZERNIO_API_KEY", "test-only");
    vi.stubEnv("SOCIAL_PUBLISH_ENABLED", "true");
    mocks.execute.mockImplementation(async (sql: string) => sql.includes("FROM brand_publish_connections") && connected
      ? [[{ platform: "instagram", accountId: "ig" }]] : [[]]);
    expect(await caller().workspace({ brandId: 7, tray: "fanpage_monthly" }))
      .toMatchObject({ socialConnected: connected, socialSyncEnabled: true });
    vi.stubEnv("SOCIAL_PUBLISH_ENABLED", "false");
    expect(await caller().workspace({ brandId: 7, tray: "fanpage_monthly" }))
      .toMatchObject({ socialConnected: connected, socialSyncEnabled: false });
  });
  it("reports Zernio-only connections, account names and the sum of four fact sources", async () => {
    mocks.execute.mockImplementation(async (sql: string) => sql.includes("FROM brand_publish_connections") ? [[
      { platform: "facebook", accountLabel: "SoWork 粉專", connectedAt: "2026-10-08T01:00:00Z" },
      { platform: "threads", accountUsername: "@sowork_tw", connectedAt: "2026-10-08T02:00:00Z" },
      { platform: "youtube", accountLabel: "Excluded", connectedAt: "2026-10-08T03:00:00Z" },
    ]] : [[]]);
    mocks.summary.mockResolvedValue({ fb_page: { facts: 1 }, ig_account: { facts: 2 }, threads_account: { facts: 3 }, linkedin_page: { facts: 4 }, youtube: { facts: 99 } });
    const [connection] = await caller().connections({ brandId: 7 });
    expect(connection).toMatchObject({ id: "meta_page", status: "connected", label: "SoWork 粉專、@sowork_tw", connectedAt: "2026-10-08T02:00:00.000Z" });
    expect(connection?.howZh).toContain("已回填 10 篇");
    expect(connection?.howZh).toContain("Facebook／Instagram／Threads／LinkedIn");
    expect(mocks.access).toHaveBeenCalledWith(11, 7);
    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining("status = 'connected'"), [7, "zernio"]);
  });
  it("ignores historical connections and excludes unsupported Zernio platforms", async () => {
    mocks.execute.mockImplementation(async (sql: string) => sql.includes("FROM brand_publish_connections") ? [[{ platform: "youtube" }]] : [[]]);
    expect((await caller().connections({ brandId: 7 }))[0]?.status).toBe("not_connected");
    expect(mocks.execute.mock.calls.every(([sql]) => !/brand_integrations|fbPageId/.test(sql))).toBe(true);
  });
  it("requires brand access before reading connections or syncing", async () => {
    mocks.access.mockRejectedValue(new TRPCError({ code: "FORBIDDEN" }));
    for (const method of ["connections", "syncSocial"] as const) {
      await expect(caller()[method]({ brandId: 7 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.social).not.toHaveBeenCalled();
    expect(mocks.fresh).not.toHaveBeenCalled();
  });
});
describe("performance social sync routes", () => {
  it("syncSocial defaults to 120 days and forwards platform outcomes", async () => {
    expect(await caller().syncSocial({ brandId: 7 })).toEqual({ platforms: [{ platform: "threads", posts: 2, tagged: 1, onbrand: 2, skipped: 0 }] });
    expect(mocks.social).toHaveBeenCalledWith(7, 120);
  });
  it("reports disabled sync as a precondition and validates date range", async () => {
    mocks.social.mockRejectedValue(new ZernioAnalyticsSyncError("此環境尚未啟用社群成效同步。"));
    await expect(caller().syncSocial({ brandId: 7 })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(caller().syncSocial({ brandId: 7, days: 366 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
