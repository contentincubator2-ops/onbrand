import { afterEach, describe, expect, it, vi } from "vitest";
import { reconcileImageCharge } from "./imageBilling";

describe("image charge reconciliation", () => {
  afterEach(() => vi.restoreAllMocks());

  it("refunds the difference when a prepaid GPT request succeeds on Flux", async () => {
    const refund = vi.fn(async () => ({ balanceAfter: 970 }));

    await expect(reconcileImageCharge({
      userId: 9,
      prepaidAction: "image_gpt",
      result: { status: "ready", provider: "piapi", model: "piapi/flux-schnell" },
      refundPoints: refund,
    })).resolves.toBe(70);

    expect(refund).toHaveBeenCalledWith(9, 70, "refund", "image_fallback_difference");
  });

  it("does not refund when the successful model matches the prepaid tier", async () => {
    const refund = vi.fn();

    await expect(reconcileImageCharge({
      userId: 9,
      prepaidAction: "image_gpt",
      result: { status: "ready", provider: "openai", model: "gpt-image-2" },
      refundPoints: refund,
    })).resolves.toBe(0);

    expect(refund).not.toHaveBeenCalled();
  });

  it("refunds the full prepaid amount when generation fails", async () => {
    const refund = vi.fn(async () => ({ balanceAfter: 1_000 }));

    await expect(reconcileImageCharge({
      userId: 9,
      prepaidAction: "image_gpt",
      result: { status: "failed", provider: "openai", model: "unknown" },
      refundPoints: refund,
    })).resolves.toBe(100);

    expect(refund).toHaveBeenCalledWith(9, 100, "refund", "image_generation_failed");
  });

  it("does not turn a successful generation into a failure when refunding fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const refund = vi.fn(async () => { throw new Error("ledger unavailable"); });

    await expect(reconcileImageCharge({
      userId: 9,
      prepaidAction: "image_gpt",
      result: { status: "ready", provider: "google", model: "imagen-4.0-generate-001" },
      refundPoints: refund,
    })).resolves.toBe(0);
  });
});
