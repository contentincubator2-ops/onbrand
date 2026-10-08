import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { save, update, set, where } = vi.hoisted(() => ({ save: vi.fn(), update: vi.fn(), set: vi.fn(), where: vi.fn() }));
vi.mock("../../platform/core/tenantGuard", () => ({ assertInputScopes: vi.fn() }));
vi.mock("../../platform/core/brandAuth", () => ({ assertBrandOwner: vi.fn(), assertBrandAccess: vi.fn() }));
vi.mock("../../platform/core/media/mediaGen", async (original) => ({
  ...await original<typeof import("../../platform/core/media/mediaGen")>(), saveCoverFile: save,
}));
vi.mock("../../db", async (original) => ({
  ...await original<typeof import("../../db")>(), getDb: vi.fn(async () => ({ update })),
}));
import { brandRouter } from "./brandRouter";

const url = "https://media.example.com/onbrand-media/covers/brand-logo.jpg";
const bytes = Buffer.alloc(256, 1);
const caller = brandRouter.createCaller({ user: { id: 1 }, actor: { id: 1 } } as any);
beforeEach(() => {
  vi.clearAllMocks();
  update.mockReturnValue({ set });
  set.mockReturnValue({ where });
  save.mockResolvedValue(url);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true, url: "https://images.example.com/facebook-avatar.jpg", arrayBuffer: async () => bytes,
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("brandRouter Facebook avatar media storage", () => {
  it("persists the avatar through saveCoverFile and writes its resolved Blob URL to the brand", async () => {
    await expect(caller.fetchFacebookAvatar({ brandId: 7, handleOrUrl: "test-page" }))
      .resolves.toMatchObject({ ok: true, logoUrl: url, bytes: bytes.length });
    expect(save).toHaveBeenCalledWith(bytes, expect.stringMatching(/^brand-7-fb-\d+\.jpg$/));
    expect(set).toHaveBeenCalledWith({ logoUrl: url });
    expect(where).toHaveBeenCalledOnce();
  });

  it("does not update the logo if storage fails", async () => {
    save.mockRejectedValue(new Error("storage unavailable"));
    await expect(caller.fetchFacebookAvatar({ brandId: 7, handleOrUrl: "test-page" }))
      .rejects.toThrow("storage unavailable");
    expect(update).not.toHaveBeenCalled();
  });
});
