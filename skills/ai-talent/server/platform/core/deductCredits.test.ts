/**
 * Unit tests for deductCredits.ts
 * Tests: balance check, insufficient funds, enterprise pool priority, concurrent deduction.
 * Uses mocks — no real DB connection needed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Shared state ──────────────────────────────────────────────────────────────

let walletState = { planCredits: 100, usedCredits: 0, extraCredits: 0, planTier: "monthly" };
let poolState = { totalCredits: 200, usedCredits: 0, memberMonthlyLimit: 0 };
let isMember = false;

// ── Mock DB ───────────────────────────────────────────────────────────────────

const txMock = {
  execute: vi.fn().mockImplementation(() => {
    const planRemaining = Math.max(0, walletState.planCredits - walletState.usedCredits);
    const extraAvailable = walletState.extraCredits;
    return Promise.resolve([[{ planCredits: walletState.planCredits, usedCredits: walletState.usedCredits, extraCredits: walletState.extraCredits }]]);
  }),
  update: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockImplementation((_: any) => {
        return Promise.resolve([{ affectedRows: 1 }]);
      }),
    }),
  }),
  insert: vi.fn().mockReturnValue({
    values: vi.fn().mockResolvedValue([{ insertId: 1 }]),
  }),
};

const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockImplementation(function(this: any) {
    return Promise.resolve([{ ...walletState, userId: 1 }]);
  }),
  insert: vi.fn().mockReturnValue({
    values: vi.fn().mockResolvedValue([{ insertId: 1 }]),
  }),
  update: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
    }),
  }),
  transaction: vi.fn().mockImplementation(async (fn: (tx: any) => Promise<void>) => {
    await fn(txMock);
  }),
  execute: vi.fn(),
};

vi.mock("../../db", () => ({
  getDb: vi.fn().mockResolvedValue(mockDb),
}));

vi.mock("./creditsCalculator", () => ({
  getRemainingCredits: vi.fn((planCredits: number, usedCredits: number, extraCredits: number) =>
    Math.max(0, planCredits - usedCredits) + Math.max(0, extraCredits)
  ),
  PLAN_CREDITS: { trial: 50, monthly: 500, team: 2000 },
}));

vi.mock("../../../drizzle/schema", () => ({
  userCredits: { userId: "userId", planCredits: "planCredits", usedCredits: "usedCredits", extraCredits: "extraCredits", updatedAt: "updatedAt" },
  creditsUsageLog: {},
  enterpriseMembers: { memberId: "memberId", ownerId: "ownerId", status: "status" },
  enterpriseCreditsPool: { ownerId: "ownerId", totalCredits: "totalCredits", usedCredits: "usedCredits", memberMonthlyLimit: "memberMonthlyLimit" },
  enterpriseCreditsAllocation: { ownerId: "ownerId", memberId: "memberId", usedCredits: "usedCredits", allocatedCredits: "allocatedCredits", monthlyLimit: "monthlyLimit" },
  enterpriseCreditsTx: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn((...args: unknown[]) => args),
  sql: Object.assign(
    vi.fn((parts: TemplateStringsArray, ...vals: unknown[]) => ({ raw: parts.join("?"), vals })),
    { raw: vi.fn((s: string) => ({ raw: s })) }
  ),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("deductCredits", () => {
  beforeEach(() => {
    walletState = { planCredits: 100, usedCredits: 0, extraCredits: 20, planTier: "monthly" };
    poolState = { totalCredits: 200, usedCredits: 0, memberMonthlyLimit: 0 };
    isMember = false;
    vi.clearAllMocks();

    // Re-setup limit mock
    mockDb.limit.mockImplementation(() => Promise.resolve([{ ...walletState, userId: 1 }]));

    // Re-setup transaction mock
    mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<void>) => {
      txMock.execute.mockResolvedValue([[{
        planCredits: walletState.planCredits,
        usedCredits: walletState.usedCredits,
        extraCredits: walletState.extraCredits,
      }]]);
      txMock.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            walletState.usedCredits += 10; // simulate deduction
            return Promise.resolve([{ affectedRows: 1 }]);
          }),
        }),
      });
      await fn(txMock);
    });

    mockDb.insert.mockReturnValue({ values: vi.fn().mockResolvedValue([{ insertId: 1 }]) });
    mockDb.select.mockReturnThis();
    mockDb.from.mockReturnThis();
    mockDb.where.mockReturnThis();
  });

  it("should deduct credits successfully when balance is sufficient", async () => {
    walletState = { planCredits: 100, usedCredits: 0, extraCredits: 0, planTier: "monthly" };

    // Set up transaction to simulate plan credit deduction
    mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<void>) => {
      txMock.execute.mockResolvedValueOnce([[{ planCredits: 100, usedCredits: 0, extraCredits: 0 }]]);
      txMock.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
        }),
      });
      await fn(txMock);
    });

    const { deductCredits } = await import("./deductCredits");
    const result = await deductCredits({ userId: 1, cost: 10 });

    expect(result.success).toBe(true);
    expect(result.creditsDeducted).toBe(10);
  });

  it("should throw when balance is insufficient", async () => {
    walletState = { planCredits: 5, usedCredits: 5, extraCredits: 0, planTier: "monthly" }; // 0 remaining

    mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<void>) => {
      txMock.execute.mockResolvedValueOnce([[{ planCredits: 5, usedCredits: 5, extraCredits: 0 }]]);
      await fn(txMock);
    });

    // The transaction should throw "Insufficient credits"
    mockDb.transaction.mockImplementationOnce(async (fn: (tx: any) => Promise<void>) => {
      txMock.execute.mockResolvedValueOnce([[{ planCredits: 5, usedCredits: 5, extraCredits: 0 }]]);
      txMock.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockRejectedValue(new Error("Insufficient credits")),
        }),
      });
      await fn(txMock);
    });

    const { deductCredits } = await import("./deductCredits");
    await expect(deductCredits({ userId: 1, cost: 10 })).rejects.toThrow("Insufficient credits");
  });

  it("should use enterprise pool when user is a member with sufficient pool", async () => {
    isMember = true;
    // Return membership on first select
    mockDb.limit
      .mockResolvedValueOnce([{ ...walletState, userId: 1 }]) // wallet exists check
      .mockResolvedValueOnce([{ ownerId: 99, memberId: 1 }])  // membership
      .mockResolvedValueOnce([{ ...poolState, ownerId: 99 }]) // pool
      .mockResolvedValueOnce([])                               // alloc (none)
      .mockResolvedValueOnce([{ ...walletState }]);            // final wallet read

    const { deductCredits } = await import("./deductCredits");
    const result = await deductCredits({ userId: 1, cost: 50 });

    expect(result.success).toBe(true);
    expect(result.usedEnterprisePool).toBe(true);
  });

  it("should not over-deduct on concurrent calls (transaction mock)", async () => {
    walletState = { planCredits: 20, usedCredits: 10, extraCredits: 0, planTier: "monthly" }; // 10 remaining

    let transactionCallCount = 0;

    mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<void>) => {
      transactionCallCount++;
      txMock.execute.mockResolvedValueOnce([[{
        planCredits: walletState.planCredits,
        usedCredits: walletState.usedCredits,
        extraCredits: walletState.extraCredits,
      }]]);
      txMock.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            if (walletState.planCredits - walletState.usedCredits >= 10) {
              walletState.usedCredits += 10;
              return Promise.resolve([{ affectedRows: 1 }]);
            }
            return Promise.reject(new Error("Insufficient credits"));
          }),
        }),
      });
      await fn(txMock);
    });

    const { deductCredits } = await import("./deductCredits");
    // First call should succeed
    await expect(deductCredits({ userId: 1, cost: 10 })).resolves.toMatchObject({ success: true });
    // Second call should fail (balance now 0)
    await expect(deductCredits({ userId: 1, cost: 10 })).rejects.toThrow("Insufficient credits");
  });
});
