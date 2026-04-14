import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

export const messageRouter = router({
  // 取得任務的所有訊息
  list: protectedProcedure
    .input(z.object({ missionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      // 確認此 mission 屬於此用戶
      const [missionCheck] = await db.execute(
        sql`SELECT id FROM missions WHERE id=${input.missionId} AND userId=${ctx.user.id} LIMIT 1`
      ) as any;
      if (!missionCheck?.[0]) return [];

      const [rows] = await db.execute(
        sql`SELECT id, missionId, role, content, metadata, createdAt
            FROM mission_messages
            WHERE missionId=${input.missionId}
            ORDER BY createdAt ASC`
      ) as any;
      return rows ?? [];
    }),

  // 儲存訊息（user 或 assistant）
  save: protectedProcedure
    .input(z.object({
      missionId: z.number(),
      role: z.enum(["user", "assistant", "system"]),
      content: z.string().min(1),
      metadata: z.record(z.any()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // 確認此 mission 屬於此用戶
      const [missionCheck] = await db.execute(
        sql`SELECT id FROM missions WHERE id=${input.missionId} AND userId=${ctx.user.id} LIMIT 1`
      ) as any;
      if (!missionCheck?.[0]) throw new TRPCError({ code: "FORBIDDEN" });

      await db.execute(
        sql`INSERT INTO mission_messages (missionId, userId, role, content, metadata)
            VALUES (${input.missionId}, ${ctx.user.id}, ${input.role}, ${input.content}, ${input.metadata ? JSON.stringify(input.metadata) : null})`
      );
      return { success: true };
    }),

  // 清除任務所有訊息（重新開始）
  clear: protectedProcedure
    .input(z.object({ missionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.execute(
        sql`DELETE FROM mission_messages WHERE missionId=${input.missionId} AND userId=${ctx.user.id}`
      );
      return { success: true };
    }),
});
