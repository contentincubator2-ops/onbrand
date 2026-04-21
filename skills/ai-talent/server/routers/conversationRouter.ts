import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { chatMessages } from "../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";

export const conversationRouter = router({
  /** 儲存一則對話訊息 */
  saveMessage: protectedProcedure
    .input(
      z.object({
        brandId: z.number().optional(),
        missionId: z.number().optional(),
        conversationTitle: z.string().optional(),
        role: z.string(),
        content: z.string(),
        taskId: z.number().optional(),
        phaseOrder: z.number().optional(), // Scheme B: defaults to 0 (intake)
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      const userId = ctx.user.id;
      await (db.insert(chatMessages) as any).values({
        userId,
        brandId: input.brandId ?? null,
        missionId: input.missionId ?? null,
        conversationTitle: input.conversationTitle ?? null,
        role: input.role,
        content: input.content,
        taskId: input.taskId ?? null,
        phaseOrder: input.phaseOrder ?? 0,
        createdAt: new Date(),
      });
      return { success: true };
    }),

  /** 載入最近 50 則對話歷史 */
  list: protectedProcedure
    .input(
      z.object({
        brandId: z.number().optional(),
        missionId: z.number().optional(),
        phaseOrder: z.number().optional(), // Scheme B: filter by phase; omit = all phases
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
      if (input.missionId !== undefined) {
        conditions.push(eq(chatMessages.missionId, input.missionId));
      }
      if (input.phaseOrder !== undefined) {
        conditions.push(eq((chatMessages as any).phaseOrder, input.phaseOrder));
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

  /** 列出某 missionId 底下所有不重複的 conversationTitle + 最新訊息時間 */
  listConversations: protectedProcedure
    .input(
      z.object({
        missionId: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const userId = ctx.user.id;
      const rows = await (db as any)
        .select({
          conversationTitle: (chatMessages as any).conversationTitle,
          latestAt: sql<string>`MAX(${chatMessages.createdAt})`,
        })
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.userId, userId),
            eq(chatMessages.missionId, input.missionId)
          )
        )
        .groupBy((chatMessages as any).conversationTitle)
        .orderBy(sql`MAX(${chatMessages.createdAt}) DESC`);
      return rows as { conversationTitle: string | null; latestAt: string }[];
    }),
});
