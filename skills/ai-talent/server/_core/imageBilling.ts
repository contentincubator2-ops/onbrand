import { addPoints, costOf } from "./pointsService";
import type { PointAction } from "./plans";

export type ImagePointAction = Extract<
  PointAction,
  "image_flux" | "image_gpt" | "image_imagen" | "image_ideogram"
>;

export interface BillableImageResult {
  status: "ready" | "failed";
  provider?: string;
  model?: string;
}

export function imageActionForRequest(input: {
  subjectImageUrl?: string;
  modelChoice?: string;
}): ImagePointAction {
  // 2026-09-21 (CJ「生圖，正式環境的生圖，都採用 gpt image 2」): subject
  // mode runs gpt-image-2 /images/edits now, not Nano Banana. Pre-authorizing
  // the old image_imagen tier (50) would under-charge a 100-point generation —
  // imageRefundAmount never bills the difference upward, it only refunds.
  if (input.subjectImageUrl) return "image_gpt";
  if (input.modelChoice === "flux-schnell" || input.modelChoice === "flux-realism") return "image_flux";
  if (input.modelChoice === "imagen-3") return "image_imagen";
  if (input.modelChoice === "ideogram-v3") return "image_ideogram";
  // "auto" / undefined / gpt-image-* — the production default is gpt-image-2,
  // so the default pre-authorization is the gpt tier. It used to fall through
  // to image_flux (30), which under-charged every default request by 70 points
  // from the day gpt-image-2 became the default.
  return "image_gpt";
}

export function imageActionForActualResult(result: BillableImageResult): ImagePointAction {
  const identity = `${result.provider ?? ""}/${result.model ?? ""}`.toLowerCase();
  if (identity.includes("ideogram")) return "image_ideogram";
  if (identity.includes("gpt-image")) return "image_gpt";
  if (identity.includes("imagen") || identity.includes("nano-banana")) return "image_imagen";
  return "image_flux";
}

export function imageRefundAmount(
  prepaidAction: ImagePointAction,
  result: BillableImageResult,
): number {
  const prepaid = costOf(prepaidAction);
  if (result.status === "failed") return prepaid;
  const actual = costOf(imageActionForActualResult(result));
  return Math.max(0, prepaid - actual);
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
    await (args.refundPoints ?? addPoints)(
      args.userId,
      amount,
      "refund",
      args.result.status === "failed" ? "image_generation_failed" : "image_fallback_difference",
    );
    return amount;
  } catch (error) {
    console.error("[imageBilling] refund failed:", error instanceof Error ? error.message : String(error));
    return 0;
  }
}
