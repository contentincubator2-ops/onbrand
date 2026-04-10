import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

export const campaignRouter = router({
  /** 列出用戶所有活動 */
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const res = await db.execute(sql`
      SELECT id, name, status, startDate, endDate, createdAt
      FROM campaigns
      WHERE userId = ${ctx.user.id}
      ORDER BY createdAt DESC
    `) as any;
    const rows: any[] = Array.isArray(res[0]) ? res[0] : (Array.isArray(res) ? res : []);
    return rows.map((r: any) => ({
      id:        r.id,
      name:      r.name,
      status:    r.status,
      startDate: r.startDate,
      endDate:   r.endDate,
      createdAt: r.createdAt,
    }));
  }),

  /** 建立新活動 */
  create: protectedProcedure
    .input(z.object({
      name:           z.string().min(1),
      theme:          z.string().optional(),
      targetAudience: z.string().optional(),
      brandId:        z.number().optional(),
      startDate:      z.string().optional(),
      endDate:        z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.execute(sql`
        INSERT INTO campaigns
          (userId, name, theme, targetAudience, brandId, startDate, endDate, status, createdAt, updatedAt)
        VALUES (
          ${ctx.user.id},
          ${input.name},
          ${input.theme ?? null},
          ${input.targetAudience ?? null},
          ${input.brandId ?? null},
          ${input.startDate ?? null},
          ${input.endDate ?? null},
          'planning',
          NOW(),
          NOW()
        )
      `);
      return { success: true };
    }),

  /** 取得單一活動 */
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const res = await db.execute(sql`
        SELECT *
        FROM campaigns
        WHERE id = ${input.id} AND userId = ${ctx.user.id}
        LIMIT 1
      `) as any;
      const rows: any[] = Array.isArray(res[0]) ? res[0] : (Array.isArray(res) ? res : []);
      return rows[0] ?? null;
    }),
});
