import { describe, expect, it, vi } from "vitest";

vi.mock("../../localDb", () => ({ default: { execute: vi.fn(async () => [[]]) } }));

// tRPC 的保留字（apply／call／bind…）在 router 建構期才炸，tsc 與其他測試都看不出來——
// 每個 router 配一支 import 測試。
describe("canvaRouter", () => {
  it("建得起來，三個 procedure 都在", async () => {
    const { canvaRouter } = await import("./canvaRouter");
    expect(Object.keys((canvaRouter as any)._def.procedures).sort()).toEqual(["disconnect", "listDesigns", "status"]);
  }, 60_000);

  it("assetPhoto.importCanvaDesign 掛在素材庫 router 上", async () => {
    const { assetPhotoRouter } = await import("../../strategy/routers/assetPhotoRouter");
    expect(Object.keys((assetPhotoRouter as any)._def.procedures)).toContain("importCanvaDesign");
  }, 60_000);
});
