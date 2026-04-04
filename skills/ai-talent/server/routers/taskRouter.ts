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

  /** 建立並執行任務（呼叫 LLM via model router） */
  createAndExecute: protectedProcedure
    .input(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      brandId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

      const userId = ctx.user.id;

      const insertResult = await (db.insert(tasks) as any).values({
        userId,
        brandId: input.brandId ?? null,
        title: input.title,
        description: input.description ?? null,
        status: "pending",
        createdAt: new Date(),
      });
      const taskId = (insertResult as any)[0]?.insertId ?? (insertResult as any).insertId ?? 0;
      if (!taskId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create task" });

      const { executeTask } = await import("../executeTask");
      const result = await executeTask(taskId, userId, input.brandId);

      return {
        taskId,
        executionId: result.executionId,
        success: result.success,
        output: result.output ?? "",
        error: result.error ?? null,
      };
    }),
});