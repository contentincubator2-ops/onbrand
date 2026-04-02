import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { tasks } from "../../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const taskRouter = router({
  /** 查詢任務列表 */
  list: protectedProcedure
    .input(
      z.object({
        limit:  z.number().default(10),
        status: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [eq(tasks.userId, ctx.user.id)];
      if (input.status) {
        conditions.push(
          eq(
            tasks.status,
            input.status as
              | "pending"
              | "in_progress"
              | "review"
              | "completed"
              | "cancelled"
          )
        );
      }
      return db
        .select()
        .from(tasks)
        .where(and(...conditions))
        .orderBy(desc(tasks.createdAt))
        .limit(input.limit);
    }),

  /** 查詢單一任務 */
  get: protectedProcedure
    .input(z.object({ taskId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const result = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, input.taskId))
        .limit(1);
      if (!result[0] || result[0].userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return result[0];
    }),
});
