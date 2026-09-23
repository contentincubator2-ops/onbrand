import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";

const mocks = vi.hoisted(() => ({ generate: vi.fn(), owner: vi.fn(), deduct: vi.fn(), refund: vi.fn() }));
vi.mock("../_core/imageGen", () => ({
  generateImage: mocks.generate, resolveBrandVisualContext: vi.fn(async () => ({})),
}));
vi.mock("../db", () => ({ getDb: vi.fn() }));
vi.mock("../_core/brandAuth", () => ({ assertBrandOwner: mocks.owner }));
vi.mock("../_core/pointsService", () => ({
  assertPoints: vi.fn(), deductPoints: mocks.deduct, addPoints: mocks.refund,
  costOf: (action: string) => action === "image_gpt" ? 100 : 50,
}));
import { imageRouter } from "./imageRouter";

const caller = imageRouter.createCaller({ user: { id: 1 } });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.owner.mockResolvedValue(undefined);
  mocks.generate.mockResolvedValue({ status: "failed", url: null, errorMsg: "provider secret details" });
});
describe("image failure API contract", () => {
  it("refunds a failed GPT attempt and offers a choice without calling another model", async () => {
    const result = await caller.generate({ brandId: 2958, prompt: "A desk", modelChoice: "gpt-image-2" });
    expect(result).toMatchObject({ status: "failed", canSwitchTo: "nano-banana", url: null });
    expect(result.errorMsg).not.toContain("secret");
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.refund).toHaveBeenCalledWith(1, 100, "refund", "image_generation_failed");
  });
  it("accepts explicit Nano Banana with the same product reference and refunds its own tier", async () => {
    const result = await caller.generate({ brandId: 2958, prompt: "A desk", modelChoice: "nano-banana", subjectImageUrl: "https://example.com/product.png" });
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ modelChoice: "nano-banana", subjectImageUrl: "https://example.com/product.png" }));
    expect(result.canSwitchTo).toBeUndefined();
    expect(mocks.deduct).toHaveBeenCalledWith(1, "image_imagen", { kind: "brand", id: 2958 });
    expect(mocks.refund).toHaveBeenCalledWith(1, 50, "refund", "image_generation_failed");
  });
  it("does not turn ownership failures into a retryable model failure", async () => {
    mocks.owner.mockRejectedValue(new TRPCError({ code: "FORBIDDEN" }));
    await expect(caller.generate({ brandId: 2958, prompt: "A desk", modelChoice: "nano-banana" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.deduct).not.toHaveBeenCalled();
  });
});
