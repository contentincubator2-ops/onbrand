import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  providers: {} as Record<string, string>, bundleProviders: {} as Record<string, string>, status: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), lang: "en",
}));
vi.mock("../../../../lib/trpc", () => ({ trpc: {
  bundleConnect: { getProviders: { useQuery: () => ({ data: mocks.bundleProviders }) } },
  zernioConnect: {
    getProviders: { useQuery: () => ({ data: mocks.providers }) },
    getConnectUrl: { useMutation: () => ({ mutateAsync: mocks.connect }) },
    getConnectionStatus: { useMutation: () => ({ mutateAsync: mocks.status }) },
    disconnect: { useMutation: () => ({ mutateAsync: mocks.disconnect }) },
  },
} }));
vi.mock("../../../../lib/i18n", () => ({ useLang: () => ({ lang: mocks.lang }) }));
vi.mock("@pipedream/sdk/browser", () => ({}));
vi.mock("@heroui/react", () => ({
  Modal: () => null, ModalContent: () => null, Input: () => null, Textarea: () => null, Spinner: () => null,
  Button: ({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) => <button onClick={onPress}>{children}</button>,
}));
vi.mock("@fortawesome/react-fontawesome", () => ({ FontAwesomeIcon: () => null }));
vi.mock("../../../platform/components/icons", () => Object.fromEntries(
  ["CloseIcon", "DeleteIcon", "DoneIcon", "ExternalIcon", "ShareIcon", "InfoIcon", "CheckIcon", "WarningIcon", "InboxIcon"].map(name => [name, () => null]),
));
vi.mock("../../../platform/components/Toast", () => ({ showToastGlobal: vi.fn() }));
vi.mock("../../../platform/components/HelpTip", () => ({ HelpTip: () => null }));

import { PublishTab } from "./BrandSettingsSheet";

describe("PublishTab Zernio focus refresh", () => {
  let container: HTMLDivElement;
  let root: Root | null;
  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.bundleProviders = {};
    mocks.lang = "en";
    mocks.disconnect.mockReset().mockResolvedValue(undefined);
    mocks.providers = { facebook: "zernio", linkedin: "zernio", instagram: "pipedream" };
    mocks.status.mockReset().mockResolvedValue({ connected: false, account: null, pendingScheduled: 0, legacyConnected: false });
    mocks.connect.mockReset().mockResolvedValue({ url: "https://example.com/connect" });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root?.unmount());
    container.remove();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/");
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  });
  it("refreshes every Zernio platform on focus and displays the connected account", async () => {
    await act(async () => root!.render(<PublishTab brandId={3} />));
    mocks.status.mockClear().mockResolvedValue({ connected: true, account: { accountId: "a", name: "Authorized Page", username: null }, pendingScheduled: 0, legacyConnected: false });
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(mocks.status.mock.calls.map(([input]) => input)).toEqual([
      { brandId: 3, platform: "facebook" }, { brandId: 3, platform: "linkedin" },
    ]);
    expect(container.textContent).toContain("Authorized Page");
  });
  it("ignores late responses from the previous brand and removes the listener on unmount", async () => {
    await act(async () => root!.render(<PublishTab brandId={3} />));
    let resolveOld!: (value: unknown) => void;
    mocks.status.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    await act(async () => root!.render(<PublishTab brandId={4} />));
    await act(async () => {
      resolveOld({ connected: true, account: { accountId: "old", name: "Previous Brand Page", username: null }, pendingScheduled: 0, legacyConnected: false });
    });
    expect(container.textContent).not.toContain("Previous Brand Page");
    await act(async () => root!.unmount());
    root = null;
    mocks.status.mockClear();
    window.dispatchEvent(new Event("focus"));
    expect(mocks.status).not.toHaveBeenCalled();
  });
  it("does not request Zernio status when every platform uses another provider", async () => {
    mocks.providers = { facebook: "bundle", linkedin: "pipedream" };
    await act(async () => root!.render(<PublishTab brandId={3} />));
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(mocks.status).not.toHaveBeenCalled();
  });
  function click(label: string) {
    const button = Array.from(container.querySelectorAll("button")).find(b => b.textContent === label);
    expect(button).toBeDefined();
    button!.click();
  }
  function connected(pendingScheduled = 0) {
    mocks.providers = { facebook: "zernio" };
    mocks.status.mockResolvedValue({ connected: true, account: { accountId: "a", name: "Page", username: null }, pendingScheduled, legacyConnected: false });
  }
  function popup() {
    const tab = { opener: null, location: { href: "" }, closed: false, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    return tab;
  }
  it("shows the legacy upgrade notice and reconnects using connect mode", async () => {
    vi.useFakeTimers();
    mocks.lang = "zh-TW";
    mocks.providers = { facebook: "zernio" };
    mocks.status.mockResolvedValue({ connected: false, account: null, pendingScheduled: 0, legacyConnected: true });
    const tab = popup();
    await act(async () => root!.render(<PublishTab brandId={3} />));
    expect(container.textContent).toContain("待重新授權");
    expect(container.textContent).toContain("發布服務已升級，請重新授權一次。");
    await act(async () => click("重新授權"));
    expect(tab.location.href).toBe("https://example.com/connect");
    expect(mocks.connect.mock.calls.every(([input]) => (input.mode ?? "connect") === "connect")).toBe(true);
  });
  it("requests a fresh reconnect URL for the current account", async () => {
    vi.useFakeTimers();
    connected();
    const tab = popup();
    await act(async () => root!.render(<PublishTab brandId={3} />));
    mocks.connect.mockClear();
    await act(async () => click("Re-authorize"));
    expect(mocks.connect).toHaveBeenCalledWith(expect.objectContaining({ brandId: 3, platform: "facebook", mode: "reconnect" }));
    expect(tab.location.href).toBe("https://example.com/connect");
    mocks.status.mockClear();
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(mocks.status).toHaveBeenCalledTimes(2);
  });
  it("asks before switching, and uses replace mode only after confirmation", async () => {
    vi.useFakeTimers();
    mocks.lang = "zh-TW";
    connected();
    popup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await act(async () => root!.render(<PublishTab brandId={3} />));
    mocks.connect.mockClear();
    await act(async () => click("換帳號"));
    expect(confirm).toHaveBeenCalledWith("換成其他帳號後，目前的帳號會自動解除並停止計費。");
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await act(async () => click("換帳號"));
    expect(mocks.connect).toHaveBeenCalledWith(expect.objectContaining({ mode: "replace" }));
  });
  it.each([0, 3])("explains billing and pending schedules before disconnecting (%i)", async count => {
    mocks.lang = "zh-TW";
    connected(count);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await act(async () => root!.render(<PublishTab brandId={3} />));
    await act(async () => click("解除連接"));
    expect(confirm).toHaveBeenCalledWith(count > 0
      ? "目前有 3 篇排程，解除後到時間會標記失敗。解除後 Zernio 停止計費，已發出的貼文不受影響。仍要解除？"
      : "解除後 Zernio 停止計費，已發出的貼文不受影響。確定解除？");
    expect(mocks.disconnect).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await act(async () => click("解除連接"));
    expect(mocks.disconnect).toHaveBeenCalledWith({ brandId: 3, platform: "facebook" });
  });
  it("cleans OAuth return parameters and preserves the brand query", async () => {
    mocks.providers = { facebook: "zernio" };
    window.history.replaceState({}, "", "/?b=3&cat=publish&connected=facebook&profileId=p&accountId=a&username=name&request_id=r&stage=done");
    await act(async () => root!.render(<PublishTab brandId={3} />));
    expect(window.location.search).toBe("?b=3&cat=publish");
    expect(mocks.status).toHaveBeenCalledWith({ brandId: 3, platform: "facebook" });
  });

  it.each(["zernio", "bundle", "pipedream"])("shows only the four supported cards and gates Threads for %s", async provider => {
    mocks.providers = { facebook: provider, instagram: provider, linkedin: provider, threads: provider,
      youtube: "zernio", tiktok: "zernio", x: "zernio" };
    mocks.bundleProviders = { threads: provider };
    await act(async () => root!.render(<PublishTab brandId={3} />));
    const connectButtons = Array.from(container.querySelectorAll("button"))
      .map(button => button.textContent).filter(text => text?.startsWith("Connect "));
    expect(connectButtons).toEqual(["Connect Facebook", "Connect Instagram", "Connect LinkedIn",
      ...(provider === "pipedream" ? [] : ["Connect Threads"])]);
    expect(container.textContent).not.toContain("YouTube");
    expect(container.textContent).not.toContain("TikTok");
  });

});
