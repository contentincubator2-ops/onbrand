import { afterEach, describe, expect, it, vi } from "vitest";
import { imageActionForRequest, reconcileImageCharge } from "./imageBilling";

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

  // 2026-09-21 (CJ「生圖，正式環境的生圖，都採用 gpt image 2」): product-faithful
  // runs moved from Nano Banana (image_imagen, 50) to gpt-image-2 (image_gpt,
  // 100). Pre-authorizing the old tier would under-charge by 50 points a run,
  // because reconciliation only ever refunds — it never bills upward.
  it("pre-authorizes a product-reference run at the gpt tier", () => {
    expect(imageActionForRequest({ subjectImageUrl: "https://example.com/product.png" }))
      .toBe("image_gpt");
  });

  // The dropdown only offers gpt-image-2, but an "auto"/omitted choice still
  // arrives from older clients and the API — it runs gpt-image-2 too, so it
  // must not be pre-authorized at the Flux tier.
  it("pre-authorizes an auto request at the gpt tier", () => {
    expect(imageActionForRequest({})).toBe("image_gpt");
    expect(imageActionForRequest({ modelChoice: "auto" })).toBe("image_gpt");
    expect(imageActionForRequest({ modelChoice: "gpt-image-2" })).toBe("image_gpt");
  });

  // Legacy values stored on old variants still resolve to their own tier.
  it("keeps the legacy per-model tiers for stored choices", () => {
    expect(imageActionForRequest({ modelChoice: "flux-schnell" })).toBe("image_flux");
    expect(imageActionForRequest({ modelChoice: "imagen-3" })).toBe("image_imagen");
    expect(imageActionForRequest({ modelChoice: "ideogram-v3" })).toBe("image_ideogram");
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
