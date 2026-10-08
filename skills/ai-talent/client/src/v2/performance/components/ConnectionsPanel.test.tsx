import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lang: "zh", conns: [] as any[], mutate: vi.fn(), reset: vi.fn(), pending: false,
  data: undefined as any, error: null as any, options: {} as any,
  connections: vi.fn(), workspace: vi.fn(), report: vi.fn(), campaignReport: vi.fn(),
}));
vi.mock("../../../lib/trpc", () => ({ trpc: {
  useUtils: () => ({ performance: Object.fromEntries(["connections", "workspace", "report", "campaignReport"].map(key => [key, { invalidate: (mocks as any)[key] }])) }),
  performance: {
    connections: { useQuery: () => ({ data: mocks.conns }) },
    syncSocial: { useMutation: (options: any) => {
      mocks.options = options;
      return { mutate: mocks.mutate, reset: mocks.reset, isPending: mocks.pending, data: mocks.data, error: mocks.error };
    } },
  },
} }));
vi.mock("../../../lib/i18n", () => ({ useLang: () => ({ lang: mocks.lang }) }));
vi.mock("../../platform/components/HelpTip", () => ({ HelpTip: () => null }));
vi.mock("../../platform/components/icons", () => Object.fromEntries(
  ["CampaignIcon", "DoneIcon", "DotIcon", "SetupBySoWorkIcon", "ShopIcon", "TextIcon"].map(name => [name, () => null]),
));
import ConnectionsPanel from "./ConnectionsPanel";

describe("ConnectionsPanel social performance", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    mocks.lang = "zh";
    mocks.pending = false; mocks.error = null; mocks.data = undefined;
    mocks.conns = [{ id: "meta_page", status: "connected", label: "My Threads", connectedAt: null, howZh: "伺服器的授權說明", howEn: "Server authorization guidance", selfServe: true }];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  });
  it("renders platform subtitle, server guidance and the syncSocial action", async () => {
    await act(async () => root.render(<ConnectionsPanel brandId={7} />));
    expect(container.textContent).toContain("社群貼文成效");
    expect(container.textContent).toContain("Facebook / Instagram / Threads / LinkedIn");
    expect(container.textContent).toContain("伺服器的授權說明");
    const button = container.querySelector("button")!;
    expect(button.textContent).toBe("同步成效");
    await act(async () => button.click());
    expect(mocks.mutate).toHaveBeenCalledWith({ brandId: 7 });
    mocks.options.onSuccess();
    for (const invalidate of [mocks.connections, mocks.workspace, mocks.report, mocks.campaignReport]) expect(invalidate).toHaveBeenCalledOnce();
  });
  it("disables pending requests, shows partial failures and uses English server guidance", async () => {
    mocks.lang = "en"; mocks.pending = true;
    mocks.data = { platforms: [{ platform: "threads", posts: 2 }, { platform: "facebook", posts: 0, error: "Reauthorize" }] };
    await act(async () => root.render(<ConnectionsPanel brandId={7} />));
    expect(container.textContent).toContain("Server authorization guidance");
    expect(container.querySelector("button")?.disabled).toBe(true);
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Backfilled 2 posts.");
    expect(container.querySelector('[role="status"]')?.textContent).toContain("facebook: Reauthorize");
  });
  it("hides sync without a connected account or selected brand", async () => {
    mocks.conns[0].status = "not_connected";
    await act(async () => root.render(<ConnectionsPanel brandId={7} />));
    expect(container.querySelector("button")).toBeNull();
    mocks.conns[0].status = "connected";
    await act(async () => root.render(<ConnectionsPanel brandId={null} />));
    expect(container.querySelector("button")).toBeNull();
  });
  it("shows errors and resets mutation state when the brand changes", async () => {
    mocks.error = { message: "Sync unavailable" };
    await act(async () => root.render(<ConnectionsPanel brandId={7} />));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Sync unavailable");
    mocks.reset.mockClear();
    await act(async () => root.render(<ConnectionsPanel brandId={8} />));
    expect(mocks.reset).toHaveBeenCalledOnce();
  });
});
