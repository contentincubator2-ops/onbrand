import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), access: vi.fn(), sync: vi.fn() }));
vi.mock("../../localDb", () => ({ default: { execute: mocks.execute } }));
vi.mock("../core/brandAuth", () => ({ assertBrandAccess: mocks.access }));
vi.mock("../core/tenantGuard", () => ({ assertInputScopes: vi.fn() }));
vi.mock("../core/teamAccess", () => ({ isPersonalPath: () => true }));
vi.mock("../core/connectors/publish/zernioAdapter", () => ({ createZernioAdapter: () => ({ syncConnection: mocks.sync }) }));

import { zernioConnectRouter } from "./zernioConnectRouter";
const caller = () => zernioConnectRouter.createCaller({ user: { id: 11 } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SOCIAL_PUBLISH_ENABLED", "true");
  vi.stubEnv("ZERNIO_API_KEY", "test-only");
  mocks.access.mockResolvedValue(undefined);
  mocks.sync.mockResolvedValue(null);
  mocks.execute.mockResolvedValue([[]]);
});
afterEach(() => vi.unstubAllEnvs());

describe("Zernio connection status", () => {
  it("reports Zernio for every platform even with an obsolete environment switch", async () => {
    vi.stubEnv("PUBLISH_PROVIDER", "bundle");
    const providers = await caller().getProviders();
    expect(Object.keys(providers)).toHaveLength(7);
    expect(Object.values(providers).every(provider => provider === "zernio")).toBe(true);
  });

  it.each([
    ["facebook", { fbPageId: "old-page", bundleTeamId: null }, true],
    ["instagram", { fbPageId: "old-page", bundleTeamId: null }, false],
    ["threads", { fbPageId: null, bundleTeamId: "old-team" }, true],
    ["facebook", { fbPageId: null, bundleTeamId: null }, false],
  ] as const)("reads historical bindings only for the upgrade notice (%s)", async (platform, brand, legacyConnected) => {
    mocks.execute.mockImplementation(async (sql: string) => sql.includes("FROM brands") ? [[brand]] : [[{ pendingScheduled: 2 }]]);
    expect(await caller().getConnectionStatus({ brandId: 7, platform }))
      .toMatchObject({ connected: false, account: null, pendingScheduled: 2, legacyConnected });
    expect(mocks.access).toHaveBeenCalledWith(11, 7);
    expect(mocks.sync).toHaveBeenCalledWith({ brandId: 7, platform });
    expect(mocks.execute.mock.calls.every(([sql]) => /^SELECT/.test(sql))).toBe(true);
    mocks.sync.mockResolvedValue({ accountId: "new", accountLabel: "New account", accountUsername: null });
    expect(await caller().getConnectionStatus({ brandId: 7, platform }))
      .toMatchObject({ connected: true, legacyConnected: false, account: { accountId: "new", name: "New account" } });
  });
});
