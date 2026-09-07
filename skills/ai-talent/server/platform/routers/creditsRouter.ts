import { z } from "zod";
import { router, protectedProcedure } from "../core/trpc";
import { getDb } from "../../db";
import { sql } from "drizzle-orm";

export const creditsRouter = router({
  /** 查詢餘額 — 對應真實 user_credits 表 */
  getBalance: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { planCredits: 0, extraCredits: 0, usedCredits: 0, planTier: "trial" };
    const res = await db.execute(sql`
      SELECT planCredits, extraCredits, usedCredits, planTier
      FROM user_credits
      WHERE userId = ${ctx.user.id}
      LIMIT 1
    `) as any;
    const rows: any[] = Array.isArray(res[0]) ? res[0] : (Array.isArray(res) ? res : []);
    if (!rows.length) return { planCredits: 0, extraCredits: 0, usedCredits: 0, planTier: "trial" };
    const r = rows[0];
    return {
      planCredits:  r.planCredits  ?? 0,
      extraCredits: r.extraCredits ?? 0,
      usedCredits:  r.usedCredits  ?? 0,
      planTier:     r.planTier     ?? "trial",
    };
  }),

  /** 查詢交易記錄 — 對應真實 credit_transactions 表 */
  getTransactions: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const res = await db.execute(sql`
        SELECT id, type, description, amount, feature_name, createdAt
        FROM credit_transactions
        WHERE user_id = ${ctx.user.id}
        ORDER BY createdAt DESC
        LIMIT ${input.limit}
      `) as any;
      const rows: any[] = Array.isArray(res[0]) ? res[0] : (Array.isArray(res) ? res : []);
      return rows.map((r: any) => ({
        id:            r.id,
        actionType:    r.type,
        description:   r.description ?? r.feature_name ?? null,
        creditsAmount: r.amount,
        createdAt:     r.createdAt,
      }));
    }),
});
