import { afterEach, describe, expect, it, vi } from "vitest";
import { imageActionForRequest, reconcileImageCharge } from "./imageBilling";
import { costOf } from "./pointsService";

describe("image billing tier follows the model that will run", () => {
  it("預設（含 auto、舊的已下架選項、有產品照）＝ gpt-image-2 級距", () => {
    for (const modelChoice of [undefined, "auto", "gpt-image-2", "flux-schnell", "ideogram-v3", "gpt-image-1"]) {
      expect(imageActionForRequest({ modelChoice })).toBe("image_gpt");
    }
  });

  it("用戶選 Nano Banana（含舊值 imagen-3）＝ image_imagen 級距", () => {
    expect(imageActionForRequest({ modelChoice: "nano-banana" })).toBe("image_imagen");
    expect(imageActionForRequest({ modelChoice: "imagen-3" })).toBe("image_imagen");
  });

  it("兩個級距的點數：gpt-image-2 100、Nano Banana 50", () => {
    expect(costOf("image_gpt")).toBe(100);
    expect(costOf("image_imagen")).toBe(50);
  });
});

describe("image charge reconciliation", () => {
  afterEach(() => vi.restoreAllMocks());

  it("成功就不退款（不會再有換模型造成的差額）", async () => {
    const refund = vi.fn();

    await expect(reconcileImageCharge({
      userId: 9,
      prepaidAction: "image_gpt",
      result: { status: "ready", provider: "openai", model: "gpt-image-2" },
      refundPoints: refund,
    })).resolves.toBe(0);

    expect(refund).not.toHaveBeenCalled();
  });

  it("失敗全額退款", async () => {
    const refund = vi.fn(async () => ({ balanceAfter: 1_000 }));

    await expect(reconcileImageCharge({
      userId: 9,
      prepaidAction: "image_gpt",
      result: { status: "failed", provider: "openai", model: "gpt-image-2" },
      refundPoints: refund,
    })).resolves.toBe(100);

    expect(refund).toHaveBeenCalledWith(9, 100, "refund", "image_generation_failed");
  });

  it("Nano Banana 失敗退 50 點", async () => {
    const refund = vi.fn(async () => ({ balanceAfter: 1_000 }));
    await expect(reconcileImageCharge({
      userId: 9, prepaidAction: "image_imagen", result: { status: "failed" }, refundPoints: refund,
    })).resolves.toBe(50);
  });

  it("退款帳本暫時壞掉，不會把成功的生圖變成失敗", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const refund = vi.fn(async () => { throw new Error("ledger unavailable"); });

    await expect(reconcileImageCharge({
      userId: 9,
      prepaidAction: "image_gpt",
      result: { status: "failed" },
      refundPoints: refund,
    })).resolves.toBe(0);
  });
});
