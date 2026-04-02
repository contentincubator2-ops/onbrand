import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { userCredits, creditsUsageLog } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";

export const creditsRouter = router({
  /** 查詢餘額 */
  getBalance: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { planCredits: 0, extraCredits: 0, usedCredits: 0, planTier: "trial" };
    const result = await db
      .select()
      .from(userCredits)
      .where(eq(userCredits.userId, ctx.user.id))
      .limit(1);
    return result[0] ?? { planCredits: 0, extraCredits: 0, usedCredits: 0, planTier: "trial" };
  }),

  /** 查詢交易記錄（使用 creditsUsageLog 表） */
  getTransactions: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(creditsUsageLog)
        .where(eq(creditsUsageLog.userId, ctx.user.id))
        .orderBy(desc(creditsUsageLog.createdAt))
        .limit(input.limit);
    }),
});
