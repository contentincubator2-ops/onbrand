/**
 * pointsService — point balance management.
 *
 * 2026-05-14 (CJ「點數系統」).
 *
 * Concepts:
 *   - 1 point = 1 second of task compute (30s = 30 pts, 60s = 60 pts,
 *     99s = 99 pts, Flux image = 30 pts, GPT image = 100 pts).
 *   - Plans define pointsPerCycle (trial: 300/7d, solo: 3000/30d).
 *   - On user action (e.g. start 30s task), check + deduct atomically.
 *   - Refill is lazy: every call to assertPoints() also refills if the
 *     user's lastResetAt + cycleDays is in the past.
 *
 * Public API:
 *   - getBalance(userId) → { balance, nextRefillAt, plan }
 *   - assertPoints(userId, action) → throws TRPCError if insufficient
 *   - deductPoints(userId, action, entity) → updates balance + logs txn
 *   - addPoints(userId, kind, amount, reason) → admin grant / refund
 *   - refillIfDue(userId) → no-op if not due; otherwise refills + logs
 */
import { TRPCError } from "@trpc/server";
import { POINT_COSTS, type PointAction, getPlan, type PlanCode } from "./plans";

export interface PointBalance {
  balance: number;
  pointsPerCycle: number;
  cycleDays: number;
  nextRefillAt: Date | null;
  planCode: PlanCode;
}

async function loadUser(userId: number): Promise<{
  planCode: PlanCode;
  pointsBalance: number;
  pointsLastResetAt: Date | null;
} | null> {
  const { default: localPool } = await import("../../../localDb");
  const [rows]: any = await localPool.execute(
    `SELECT planCode, pointsBalance, pointsLastResetAt
       FROM users WHERE id = ? LIMIT 1`,
    [userId],
  );
  const r = (rows as any[])[0];
  if (!r) return null;
  return {
    planCode: (r.planCode ?? "trial") as PlanCode,
    pointsBalance: Number(r.pointsBalance ?? 0),
    pointsLastResetAt: r.pointsLastResetAt instanceof Date
      ? r.pointsLastResetAt
      : (r.pointsLastResetAt ? new Date(r.pointsLastResetAt) : null),
  };
}

/** Get a user's current balance + cycle info, refilling lazily if due. */
export async function getBalance(userId: number): Promise<PointBalance> {
  // Lazy refill before reading
  await refillIfDue(userId);

  const u = await loadUser(userId);
  const plan = getPlan(u?.planCode ?? "trial");
  const cycleDays = plan.quota.pointsCycleDays ?? 30;
  const nextRefillAt = u?.pointsLastResetAt
    ? new Date(u.pointsLastResetAt.getTime() + cycleDays * 24 * 3600_000)
    : null;
  return {
    balance: u?.pointsBalance ?? 0,
    pointsPerCycle: plan.quota.pointsPerCycle ?? 0,
    cycleDays,
    nextRefillAt,
    planCode: u?.planCode ?? "trial",
  };
}

/** Cost of one specific action (in points). */
export function costOf(action: PointAction): number {
  return POINT_COSTS[action] ?? 0;
}

/**
 * Refill if the user's last reset + cycleDays is in the past. No-op
 * otherwise. Called automatically at the top of getBalance / assertPoints.
 *
 * Refill rule:
 *   - Trial (cycleDays=7): one-time grant. Re-trigger only if pointsLastResetAt is null.
 *   - Paid plans (cycleDays=30): refill if Date.now() > lastReset + cycleDays.
 *
 * Enterprise (pointsPerCycle=-1) bypasses — we set balance to a huge
 * number so checks never block.
 */
export async function refillIfDue(userId: number): Promise<{ refilled: boolean; added: number }> {
  const u = await loadUser(userId);
  if (!u) return { refilled: false, added: 0 };
  const plan = getPlan(u.planCode);
  const allocation = plan.quota.pointsPerCycle ?? 0;
  const cycleDays = plan.quota.pointsCycleDays ?? 30;

  // Enterprise = unlimited
  if (allocation < 0) {
    if (u.pointsBalance < 1_000_000) {
      await topUpRaw(userId, 9_999_999, "refill", "enterprise_unlimited");
      return { refilled: true, added: 9_999_999 };
    }
    return { refilled: false, added: 0 };
  }

  const now = Date.now();
  const lastResetMs = u.pointsLastResetAt?.getTime() ?? 0;

  // Trial: one-time grant (only when lastResetAt is null)
  if (cycleDays === 7) {
    if (lastResetMs === 0) {
      await topUpRaw(userId, allocation, "refill", "trial_grant");
      return { refilled: true, added: allocation };
    }
    return { refilled: false, added: 0 };
  }

  // Paid plan monthly refill
  const dueAt = lastResetMs + cycleDays * 24 * 3600_000;
  if (lastResetMs === 0 || now >= dueAt) {
    // For monthly refills, RESET balance to allocation (don't accumulate
    // leftover points from previous cycle — keeps the unit economics tight).
    // Top-up purchases get added separately and DON'T expire monthly.
    await resetBalanceTo(userId, allocation, "refill", "monthly_refill");
    return { refilled: true, added: allocation };
  }
  return { refilled: false, added: 0 };
}

/**
 * Throw FORBIDDEN if the user can't afford `action`. Returns the action's
 * cost in points on success. Always lazy-refills first.
 */
export async function assertPoints(userId: number, action: PointAction): Promise<number> {
  await refillIfDue(userId);
  const u = await loadUser(userId);
  if (!u) throw new TRPCError({ code: "NOT_FOUND", message: "找不到用戶" });

  const plan = getPlan(u.planCode);
  // Enterprise unlimited — bypass
  if ((plan.quota.pointsPerCycle ?? 0) < 0) return costOf(action);

  const cost = costOf(action);
  if (cost <= 0) return 0; // unknown action — fail safe
  if (u.pointsBalance < cost) {
    const labelMap: Record<PointAction, string> = {
      task_30s:        "30s 單品",
      task_60s:        "60s 套組",
      task_99s:        "99s 檔期",
      image_gpt:       "AI 圖片（GPT Image-2）",
      image_imagen:    "AI 圖片（Nano Banana）",
    };
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `點數不足 — 還剩 ${u.pointsBalance} 點，這個動作（${labelMap[action]}）需要 ${cost} 點。請等下個週期補滿，或升級方案。`,
    });
  }
  return cost;
}

/**
 * Deduct points for an action. Caller should have called assertPoints
 * first; this is the side-effect commit. Logs to point_transactions.
 */
export async function deductPoints(
  userId: number,
  action: PointAction,
  entity?: { kind: string; id: number | null },
): Promise<{ balanceAfter: number; deducted: number }> {
  const cost = costOf(action);
  if (cost <= 0) return { balanceAfter: 0, deducted: 0 };

  const { default: localPool } = await import("../../../localDb");
  // Atomic: decrement balance + insert ledger row in a transaction.
  const conn = await localPool.getConnection();
  try {
    await conn.beginTransaction();
    // Lock the row
    const [rows]: any = await conn.execute(
      `SELECT pointsBalance, planCode FROM users WHERE id = ? FOR UPDATE`,
      [userId],
    );
    const r = (rows as any[])[0];
    if (!r) throw new Error("user not found");

    const plan = getPlan(r.planCode ?? "trial");
    // Enterprise unlimited — log but don't actually decrement
    if ((plan.quota.pointsPerCycle ?? 0) < 0) {
      await conn.execute(
        `INSERT INTO point_transactions (userId, kind, delta, balanceAfter, reason, entityKind, entityId)
              VALUES (?, 'deduct', ?, ?, ?, ?, ?)`,
        [userId, -cost, Number(r.pointsBalance ?? 0), action, entity?.kind ?? null, entity?.id ?? null],
      );
      await conn.commit();
      return { balanceAfter: Number(r.pointsBalance ?? 0), deducted: cost };
    }

    const current = Number(r.pointsBalance ?? 0);
    if (current < cost) {
      await conn.rollback();
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `點數不足（剩 ${current}，需要 ${cost}）`,
      });
    }
    const next = current - cost;
    await conn.execute(
      `UPDATE users SET pointsBalance = ? WHERE id = ?`,
      [next, userId],
    );
    await conn.execute(
      `INSERT INTO point_transactions (userId, kind, delta, balanceAfter, reason, entityKind, entityId)
            VALUES (?, 'deduct', ?, ?, ?, ?, ?)`,
      [userId, -cost, next, action, entity?.kind ?? null, entity?.id ?? null],
    );
    await conn.commit();
    return { balanceAfter: next, deducted: cost };
  } catch (e) {
    try { await conn.rollback(); } catch {}
    throw e;
  } finally {
    conn.release();
  }
}

/** Add points (top-up purchase, admin grant, refund). */
export async function addPoints(
  userId: number,
  amount: number,
  kind: "topup" | "grant" | "refund",
  reason: string,
): Promise<{ balanceAfter: number }> {
  return topUpRaw(userId, amount, kind, reason);
}

// Internal: credit balance + log txn (no refill check).
async function topUpRaw(
  userId: number,
  amount: number,
  kind: "topup" | "grant" | "refund" | "refill",
  reason: string,
): Promise<{ balanceAfter: number }> {
  const { default: localPool } = await import("../../../localDb");
  const conn = await localPool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows]: any = await conn.execute(
      `SELECT pointsBalance FROM users WHERE id = ? FOR UPDATE`,
      [userId],
    );
    const r = (rows as any[])[0];
    if (!r) throw new Error("user not found");
    const next = Number(r.pointsBalance ?? 0) + amount;
    await conn.execute(
      `UPDATE users SET pointsBalance = ? WHERE id = ?`,
      [next, userId],
    );
    await conn.execute(
      `INSERT INTO point_transactions (userId, kind, delta, balanceAfter, reason)
            VALUES (?, ?, ?, ?, ?)`,
      [userId, kind, amount, next, reason.slice(0, 64)],
    );
    await conn.commit();
    return { balanceAfter: next };
  } catch (e) {
    try { await conn.rollback(); } catch {}
    throw e;
  } finally {
    conn.release();
  }
}

// Internal: hard-reset balance to a specific value (used for monthly refills).
async function resetBalanceTo(
  userId: number,
  newBalance: number,
  kind: "refill",
  reason: string,
): Promise<void> {
  const { default: localPool } = await import("../../../localDb");
  const conn = await localPool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows]: any = await conn.execute(
      `SELECT pointsBalance FROM users WHERE id = ? FOR UPDATE`,
      [userId],
    );
    const r = (rows as any[])[0];
    if (!r) throw new Error("user not found");
    const prev = Number(r.pointsBalance ?? 0);
    const delta = newBalance - prev;
    await conn.execute(
      `UPDATE users SET pointsBalance = ?, pointsLastResetAt = NOW(3) WHERE id = ?`,
      [newBalance, userId],
    );
    await conn.execute(
      `INSERT INTO point_transactions (userId, kind, delta, balanceAfter, reason)
            VALUES (?, ?, ?, ?, ?)`,
      [userId, kind, delta, newBalance, reason.slice(0, 64)],
    );
    await conn.commit();
  } catch (e) {
    try { await conn.rollback(); } catch {}
    throw e;
  } finally {
    conn.release();
  }
}
