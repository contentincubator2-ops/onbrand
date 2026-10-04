/**
 * cancelRefund — abort a running task and give back the points it was charged
 * when nothing had been delivered yet.
 *
 * Policy: points are charged up front (deductPoints) as a flat price per task.
 * If the user cancels before the run persisted any output (captions not yet
 * delivered), the whole charge is refunded exactly once. Once an output row
 * exists the user holds usable work, so there is no refund. Unlimited
 * (enterprise) wallets are never touched: deductPoints only logs for them.
 */
import { cancelRunByKey } from "../llm/runCancel";

export interface CancelDeps {
  isUnlimited: (userId: number) => Promise<boolean>;
  refund: (userId: number, points: number, reason: string) => Promise<void>;
}

async function defaultDeps(): Promise<CancelDeps> {
  const { addPoints } = await import("./pointsService");
  const { getPlan } = await import("./plans");
  const { default: localPool } = await import("../../../localDb");
  return {
    isUnlimited: async (userId) => {
      const [rows]: any = await localPool.execute(`SELECT planCode FROM users WHERE id = ? LIMIT 1`, [userId]);
      const plan = getPlan((rows as any[])[0]?.planCode ?? "trial");
      return (plan.quota.pointsPerCycle ?? 0) < 0;
    },
    refund: async (userId, points, reason) => { await addPoints(userId, points, "refund", reason); },
  };
}

export async function cancelRunAndRefund(
  runKey: string,
  userId: number,
  deps?: CancelDeps,
): Promise<{ cancelled: boolean; refundedPoints: number }> {
  const out = cancelRunByKey(runKey, userId);
  if (!out.found) return { cancelled: false, refundedPoints: 0 };
  if (out.refundPoints <= 0) return { cancelled: true, refundedPoints: 0 };
  const d = deps ?? (await defaultDeps());
  try {
    if (await d.isUnlimited(userId)) return { cancelled: true, refundedPoints: 0 };
    await d.refund(userId, out.refundPoints, `cancel_refund:${out.refundAction ?? "task"}`);
    return { cancelled: true, refundedPoints: out.refundPoints };
  } catch (e) {
    console.error("[cancelRunAndRefund] refund failed:", (e as Error)?.message);
    return { cancelled: true, refundedPoints: 0 };
  }
}
