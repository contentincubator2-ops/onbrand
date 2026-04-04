import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { chatMessages } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

export const conversationRouter = router({
  /** 儲存一則對話訊息 */
  saveMessage: protectedProcedure
    .input(
      z.object({
        brandId: z.number().optional(),
        role: z.string(),
        content: z.string(),
        taskId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      const userId = ctx.user.id;
      await (db.insert(chatMessages) as any).values({
        userId,
        brandId: input.brandId ?? null,
        role: input.role,
        content: input.content,
        taskId: input.taskId ?? null,
        createdAt: new Date(),
      });
      return { success: true };
    }),

  /** 載入最近 50 則對話歷史 */
  list: protectedProcedure
    .input(
      z.object({
        brandId: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const userId = ctx.user.id;
      const conditions = [eq(chatMessages.userId, userId)];
      if (input.brandId !== undefined) {
        conditions.push(eq(chatMessages.brandId, input.brandId));
      }
      const rows = await db
        .select()
        .from(chatMessages)
        .where(and(...conditions))
        .orderBy(desc(chatMessages.createdAt))
        .limit(50);
      // 反轉成時間正序
      return rows.reverse();
    }),
});
