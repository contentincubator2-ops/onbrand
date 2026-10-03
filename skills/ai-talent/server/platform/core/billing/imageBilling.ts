import { addPoints, costOf } from "./pointsService";
import type { PointAction } from "./plans";
import { NANO_BANANA, resolveStillImageModel } from "../media/stillImageModels";

/** One tier per still-image model: gpt-image-2 (default) and Nano Banana (user's choice). */
export type ImagePointAction = Extract<PointAction, "image_gpt" | "image_imagen">;

export interface BillableImageResult {
  status: "ready" | "failed";
  provider?: string;
  model?: string;
}

/**
 * The model that will run decides the tier — and the model that runs is always
 * the one requested (there is no automatic model swap), so what we prepay is
 * what we keep. A reference photo does not change the tier: gpt-image-2 takes
 * it through the edit endpoint.
 */
export function imageActionForRequest(input: { modelChoice?: string }): ImagePointAction {
  return resolveStillImageModel(input.modelChoice) === NANO_BANANA ? "image_imagen" : "image_gpt";
}

/** Failed generations are refunded in full; a ready one keeps its prepaid charge. */
export function imageRefundAmount(
  prepaidAction: ImagePointAction,
  result: BillableImageResult,
): number {
  return result.status === "failed" ? costOf(prepaidAction) : 0;
}

type RefundPoints = typeof addPoints;

/**
 * Reconcile a pre-authorized image charge without jeopardizing the generated
 * asset when the refund ledger is temporarily unavailable.
 */
export async function reconcileImageCharge(args: {
  userId: number;
  prepaidAction: ImagePointAction;
  result: BillableImageResult;
  refundPoints?: RefundPoints;
}): Promise<number> {
  const amount = imageRefundAmount(args.prepaidAction, args.result);
  if (amount <= 0) return 0;
  try {
    await (args.refundPoints ?? addPoints)(args.userId, amount, "refund", "image_generation_failed");
    return amount;
  } catch (error) {
    console.error("[imageBilling] refund failed:", error instanceof Error ? error.message : String(error));
    return 0;
  }
}
