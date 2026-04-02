/**
 * Unified credits deduction helper.
 *
 * Deduction priority:
 *  1. Enterprise shared pool (if the user is an active member of a workspace
 *     AND the workspace has enough pool credits AND the member is within their
 *     monthly limit)
 *  2. User's personal plan credits (planCredits - usedCredits)
 *  3. User's extra purchased credits (extraCredits)
 *
 * Returns the updated remaining credits for display purposes.
 */

import { eq, and, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  userCredits,
  creditsUsageLog,
  enterpriseMembers,
  enterpriseCreditsPool,
  enterpriseCreditsAllocation,
  enterpriseCreditsTx,
} from "../drizzle/schema";
import { getRemainingCredits, PLAN_CREDITS } from "./creditsCalculator";

/** Auto-initialize a trial wallet for a new user if none exists. */
async function ensureWallet(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const existing = await db.select().from(userCredits).where(eq(userCredits.userId, userId)).limit(1);
  if (existing.length > 0) return existing[0];
  const now = new Date();
  const cycleEnd = new Date(now);
  cycleEnd.setMonth(cycleEnd.getMonth() + 1);
  try {
    await db.insert(userCredits).values({
      userId,
      planTier: "trial",
      planCredits: PLAN_CREDITS.trial,
      usedCredits: 0,
      extraCredits: 0,
      cycleStart: now,
      cycleEnd,
    });
  } catch (_) { /* ignore duplicate key */ }
  const created = await db.select().from(userCredits).where(eq(userCredits.userId, userId)).limit(1);
  return created[0] ?? null;
}

export interface DeductCreditsOptions {
  userId: number;
  cost: number;
  agentId?: number;
  actionType?: "adopt_proposal" | "adopt_report" | "adopt_schedule" | "adopt_draft" | "adopt_collaboration" | "manual_task" | "chat_message" | "extra_purchase" | "plan_renewal";
  proposalId?: number;
  description?: string;
  knowledgeDepthFactor?: string;
}

export interface DeductCreditsResult {
  success: boolean;
  creditsDeducted: number;
  remainingCredits: number;
  /** true if the deduction came (fully or partially) from the enterprise pool */
  usedEnterprisePool: boolean;
  /** The enterprise workspace owner's userId, if pool was used */
  enterpriseOwnerId?: number;
}

/**
 * Attempt to deduct `cost` credits from the enterprise shared pool first.
 * Returns the amount actually deducted from the pool (0 if not applicable).
 */
async function tryDeductFromEnterprisePool(
  userId: number,
  cost: number
): Promise<{ deducted: number; ownerId?: number }> {
  const db = await getDb();
  if (!db) return { deducted: 0 };

  // 1. Is this user an active member of any workspace?
  const membership = await db
    .select({
      ownerId: enterpriseMembers.ownerId,
      memberId: enterpriseMembers.memberId,
    })
    .from(enterpriseMembers)
    .where(
      and(
        eq(enterpriseMembers.memberId, userId),
        eq(enterpriseMembers.status, "active")
      )
    )
    .limit(1);

  if (membership.length === 0) return { deducted: 0 };
  const { ownerId } = membership[0];

  // 2. Does the workspace have a pool with enough balance?
  const poolRows = await db
    .select()
    .from(enterpriseCreditsPool)
    .where(eq(enterpriseCreditsPool.ownerId, ownerId))
    .limit(1);

  if (poolRows.length === 0) return { deducted: 0 };
  const pool = poolRows[0];
  const poolAvailable = pool.totalCredits - pool.usedCredits;
  if (poolAvailable <= 0) return { deducted: 0 };

  // 3. Check per-member monthly limit
  const allocRows = await db
    .select()
    .from(enterpriseCreditsAllocation)
    .where(
      and(
        eq(enterpriseCreditsAllocation.ownerId, ownerId),
        eq(enterpriseCreditsAllocation.memberId, userId)
      )
    )
    .limit(1);

  const alloc = allocRows[0] ?? null;
  // Effective limit: member override > pool default > 0 (unlimited)
  const effectiveLimit =
    alloc?.monthlyLimit && alloc.monthlyLimit > 0
      ? alloc.monthlyLimit
      : pool.memberMonthlyLimit;

  const memberUsed = alloc?.usedCredits ?? 0;

  // If there's a limit, check remaining
  if (effectiveLimit > 0) {
    const memberRemaining = effectiveLimit - memberUsed;
    if (memberRemaining <= 0) return { deducted: 0 };
    // Can only deduct up to the member's remaining limit
    const canDeduct = Math.min(cost, poolAvailable, memberRemaining);
    if (canDeduct <= 0) return { deducted: 0 };

    // Deduct from pool
    await db
      .update(enterpriseCreditsPool)
      .set({ usedCredits: sql`${enterpriseCreditsPool.usedCredits} + ${canDeduct}` })
      .where(eq(enterpriseCreditsPool.ownerId, ownerId));

    // Update or create allocation record
    if (alloc) {
      await db
        .update(enterpriseCreditsAllocation)
        .set({ usedCredits: sql`${enterpriseCreditsAllocation.usedCredits} + ${canDeduct}` })
        .where(
          and(
            eq(enterpriseCreditsAllocation.ownerId, ownerId),
            eq(enterpriseCreditsAllocation.memberId, userId)
          )
        );
    } else {
      await db.insert(enterpriseCreditsAllocation).values({
        ownerId,
        memberId: userId,
        usedCredits: canDeduct,
        allocatedCredits: 0,
        monthlyLimit: 0,
      });
    }

    // Log the pool transaction
    await db.insert(enterpriseCreditsTx).values({
      ownerId,
      memberId: userId,
      type: "deduct",
      amount: -canDeduct,
      note: `成員消耗：${canDeduct} 點`,
    });

    return { deducted: canDeduct, ownerId };
  } else {
    // No limit — deduct up to pool available
    const canDeduct = Math.min(cost, poolAvailable);
    if (canDeduct <= 0) return { deducted: 0 };

    await db
      .update(enterpriseCreditsPool)
      .set({ usedCredits: sql`${enterpriseCreditsPool.usedCredits} + ${canDeduct}` })
      .where(eq(enterpriseCreditsPool.ownerId, ownerId));

    if (alloc) {
      await db
        .update(enterpriseCreditsAllocation)
        .set({ usedCredits: sql`${enterpriseCreditsAllocation.usedCredits} + ${canDeduct}` })
        .where(
          and(
            eq(enterpriseCreditsAllocation.ownerId, ownerId),
            eq(enterpriseCreditsAllocation.memberId, userId)
          )
        );
    } else {
      await db.insert(enterpriseCreditsAllocation).values({
        ownerId,
        memberId: userId,
        usedCredits: canDeduct,
        allocatedCredits: 0,
        monthlyLimit: 0,
      });
    }

    await db.insert(enterpriseCreditsTx).values({
      ownerId,
      memberId: userId,
      type: "deduct",
      amount: -canDeduct,
      note: `成員消耗：${canDeduct} 點`,
    });

    return { deducted: canDeduct, ownerId };
  }
}

/**
 * Main deduction function. Call this instead of manually updating userCredits.
 *
 * ⚠️  RACE CONDITION WARNING (Sprint 4):
 * The multi-step read-modify-write pattern here (read wallet → check balance → update)
 * is NOT atomic and can double-spend under high concurrency.
 *
 * Sprint 4 fix: wrap the entire deduction in a MySQL transaction + SELECT ... FOR UPDATE:
 *   await db.transaction(async (tx) => {
 *     const wallet = await tx.select().from(userCredits)
 *       .where(eq(userCredits.userId, userId))
 *       .for("update")  // row-level lock
 *       .limit(1);
 *     // ... rest of deduction logic
 *   });
 *
 * Until then: acceptable for low-concurrency (<100 req/s). Do NOT go to high-traffic
 * production without the transaction fix.
 */
export async function deductCredits(opts: DeductCreditsOptions): Promise<DeductCreditsResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { userId, cost, agentId, actionType = "manual_task", proposalId, description, knowledgeDepthFactor } = opts;

  // Load wallet
  const walletRows = await db
    .select()
    .from(userCredits)
    .where(eq(userCredits.userId, userId))
    .limit(1);

  if (walletRows.length === 0) {
    // Auto-create trial wallet for new users
    const autoWallet = await ensureWallet(userId);
    if (!autoWallet) throw new Error("用戶點數錢包不存在");
    walletRows.push(autoWallet);
  }
  const wallet = walletRows[0];

  let remainingCost = cost;
  let usedEnterprisePool = false;
  let enterpriseOwnerId: number | undefined;

  // ── Step 1: Try enterprise pool first ────────────────────────────────────────
  if (remainingCost > 0) {
    const { deducted, ownerId } = await tryDeductFromEnterprisePool(userId, remainingCost);
    if (deducted > 0) {
      remainingCost -= deducted;
      usedEnterprisePool = true;
      enterpriseOwnerId = ownerId;
    }
  }

  // ── Step 2: Deduct from personal wallet (planCredits → extraCredits) ─────────
  let newUsedCredits = wallet.usedCredits;
  let newExtraCredits = wallet.extraCredits;

  if (remainingCost > 0) {
    const planRemaining = Math.max(0, wallet.planCredits - wallet.usedCredits);
    if (planRemaining >= remainingCost) {
      newUsedCredits += remainingCost;
    } else {
      newUsedCredits += planRemaining;
      newExtraCredits -= remainingCost - planRemaining;
    }
    remainingCost = 0;

    await db
      .update(userCredits)
      .set({ usedCredits: newUsedCredits, extraCredits: newExtraCredits })
      .where(eq(userCredits.userId, userId));
  }

  // ── Step 3: Log to creditsUsageLog ───────────────────────────────────────────
  await db.insert(creditsUsageLog).values({
    userId,
    agentId: agentId ?? null,
    actionType,
    creditsAmount: -cost,
    knowledgeDepthFactor: knowledgeDepthFactor ?? "1.00",
    proposalId: proposalId ?? null,
    description: description ?? `消耗 ${cost} 點${usedEnterprisePool ? "（企業池）" : ""}`,
  });

  const newRemaining = getRemainingCredits(wallet.planCredits, newUsedCredits, newExtraCredits);

  return {
    success: true,
    creditsDeducted: cost,
    remainingCredits: newRemaining,
    usedEnterprisePool,
    enterpriseOwnerId,
  };
}

/**
 * Authoritative server-side credit check — queries the database AND enterprise pool.
 * Use this before executing any billable action.
 *
 * For quick non-DB estimation (e.g. client-side preview), use
 * `hasEnoughCredits()` from `creditsCalculator.ts` instead.
 */
export async function checkEnoughCredits(userId: number, cost: number): Promise<{
  enough: boolean;
  personalRemaining: number;
  poolAvailable: number;
  totalAvailable: number;
}> {
  const db = await getDb();
  if (!db) return { enough: false, personalRemaining: 0, poolAvailable: 0, totalAvailable: 0 };

  const walletRows = await db
    .select()
    .from(userCredits)
    .where(eq(userCredits.userId, userId))
    .limit(1);

  // Auto-initialize trial wallet for new users
  let wallet = walletRows[0];
  if (!wallet) {
    wallet = await ensureWallet(userId) ?? undefined as any;
  }
  const personalRemaining = wallet
    ? Math.max(0, wallet.planCredits - wallet.usedCredits) + Math.max(0, wallet.extraCredits)
    : 0;

  // Check pool
  const membership = await db
    .select({ ownerId: enterpriseMembers.ownerId })
    .from(enterpriseMembers)
    .where(and(eq(enterpriseMembers.memberId, userId), eq(enterpriseMembers.status, "active")))
    .limit(1);

  let poolAvailable = 0;
  if (membership.length > 0) {
    const poolRows = await db
      .select()
      .from(enterpriseCreditsPool)
      .where(eq(enterpriseCreditsPool.ownerId, membership[0].ownerId))
      .limit(1);
    if (poolRows.length > 0) {
      const pool = poolRows[0];
      poolAvailable = Math.max(0, pool.totalCredits - pool.usedCredits);
    }
  }

  const totalAvailable = personalRemaining + poolAvailable;
  return { enough: totalAvailable >= cost, personalRemaining, poolAvailable, totalAvailable };
}
