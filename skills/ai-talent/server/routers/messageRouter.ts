import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";

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

  // ChatDrawer mutation (v2 D4) — save the user message, ask the LLM
  // for a reply with mission + methodology context, persist that
  // reply, and return both rows so the drawer can render without an
  // extra refetch.
  //
  // Best-effort: if OPENAI_API_KEY is missing the assistant reply is
  // a static "未連接 LLM" string so the drawer still works in
  // demo / disconnected mode.
  sendAndReply: protectedProcedure
    .input(z.object({
      missionId: z.number(),
      content: z.string().min(1).max(8000),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Auth + mission + methodology lookup in one round-trip
      const [missionRows]: any = await db.execute(sql`
        SELECT m.id, m.title, m.description, m.workspace, m.methodology, m.squadSlug,
               s.name AS squadName, s.description AS squadDesc
          FROM missions m
          LEFT JOIN squads s ON s.slug COLLATE utf8mb4_unicode_ci
                              = m.squadSlug COLLATE utf8mb4_unicode_ci
         WHERE m.id=${input.missionId} AND m.userId=${ctx.user.id} LIMIT 1
      `);
      const mission = (missionRows as any[])?.[0];
      if (!mission) throw new TRPCError({ code: "FORBIDDEN" });

      // Save user message
      await db.execute(sql`
        INSERT INTO mission_messages (missionId, userId, role, content)
        VALUES (${input.missionId}, ${ctx.user.id}, 'user', ${input.content})
      `);

      // Build assistant reply via core invokeLLM (picks up the
      // LLM_DEFAULT_PROVIDER env — currently azure-foundry on prod).
      let assistantContent = "(未連接 LLM)";
      try {
        const recent: any = await db.execute(sql`
          SELECT role, content FROM mission_messages
           WHERE missionId=${input.missionId}
           ORDER BY createdAt DESC LIMIT 12
        `);
        const recentRows = Array.isArray(recent) ? recent[0] : (recent as any).rows ?? recent;
        const history = (recentRows as any[]).reverse().map((r) => ({
          role: r.role as "user" | "assistant" | "system", content: r.content as string,
        }));
        const sysParts = [
          `你是 SoWork Marketing OS 的 squad lead，正在協助任務「${mission.title}」。`,
          mission.description ? `任務需求：${mission.description}` : "",
          mission.squadName ? `當前套用方法論：${mission.squadName}。${mission.squadDesc ?? ""}` : "尚未套用任何方法論，可建議用戶從型錄選一個。",
          "回覆精簡、可執行、繁體中文。",
        ].filter(Boolean).join("\n\n");

        const result = await invokeLLM({
          messages: [{ role: "system", content: sysParts }, ...history],
          maxTokens: 1024,
        });
        const content = result.choices?.[0]?.message?.content;
        if (typeof content === "string") {
          assistantContent = content;
        } else if (Array.isArray(content)) {
          assistantContent = content
            .map((p: any) => (p?.type === "text" ? p.text : ""))
            .join("");
        }
      } catch (e: any) {
        assistantContent = `(LLM 例外：${String(e?.message ?? e).slice(0, 200)})`;
      }

      const [insRes]: any = await db.execute(sql`
        INSERT INTO mission_messages (missionId, userId, role, content)
        VALUES (${input.missionId}, ${ctx.user.id}, 'assistant', ${assistantContent})
      `);
      const assistantId = (insRes as any).insertId ?? null;

      return {
        assistant: {
          id: assistantId,
          role: "assistant" as const,
          content: assistantContent,
        },
      };
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
