import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  providers: {} as Record<string, string>, status: vi.fn(), connect: vi.fn(),
}));
vi.mock("../../../../lib/trpc", () => ({ trpc: {
  zernioConnect: {
    getProviders: { useQuery: () => ({ data: mocks.providers }) },
    getConnectUrl: { useMutation: () => ({ mutateAsync: mocks.connect }) },
    getConnectionStatus: { useMutation: () => ({ mutateAsync: mocks.status }) },
    disconnect: { useMutation: () => ({ mutateAsync: vi.fn() }) },
  },
} }));
vi.mock("../../../../lib/i18n", () => ({ useLang: () => ({ lang: "en" }) }));
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
    mocks.providers = { facebook: "zernio", linkedin: "zernio", instagram: "pipedream" };
    mocks.status.mockReset().mockResolvedValue({ connected: false, accounts: [] });
    mocks.connect.mockReset().mockResolvedValue({ url: "https://example.com/connect" });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root?.unmount());
    container.remove();
    vi.restoreAllMocks();
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  });
  it("refreshes every Zernio platform on focus and displays the connected account", async () => {
    await act(async () => root!.render(<PublishTab brandId={3} />));
    mocks.status.mockClear().mockResolvedValue({ connected: true, accounts: [{ accountId: "a", name: "Authorized Page", username: null }] });
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
      resolveOld({ connected: true, accounts: [{ accountId: "old", name: "Previous Brand Page", username: null }] });
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
});
