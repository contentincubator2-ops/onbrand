/**
 * plannerRouter — 「本週企劃」的 tRPC 介面。邏輯與規則在 core/weeklyPlanner.ts。
 *
 * week：這一週的規劃格子＋活動企劃格子＋對話紀錄（已排程／已發布由前端另外用 calendar.range 取）。
 * send：跟總主管說一句 → 回一兩句話、選擇按鈕、改動過的格子。
 * commit：「排定這週」——草稿變成已排定。
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../platform/core/trpc";
import { assertBrandAccess } from "../../platform/core/brandAuth";
import { callModel } from "../../platform/core/multiModelRouter";
import localPool from "../../localDb";
import {
  addDays, applyOps, brandPlatforms, cardsFor, isYmd, loadWeekCampaignItems, loadWeekSlots,
  parsePlannerReply, plannerSystemPrompt, validateOps, weekDays,
} from "../core/weeklyPlanner";

const weekInput = z.object({
  brandId: z.number().int().positive(),
  weekStart: z.string().refine(isYmd, "weekStart 要是 YYYY-MM-DD"),
});

// 每位使用者：每分鐘 6 次、每小時 40 次（LLM 要花錢）。
const rate = new Map<number, number[]>();
function checkRate(userId: number): void {
  const now = Date.now();
  const hits = (rate.get(userId) ?? []).filter((t) => now - t < 3_600_000);
  if (hits.filter((t) => now - t < 60_000).length >= 6) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "講太快了，等一下再說。" });
  if (hits.length >= 40) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "這一小時問太多次了，晚點再來。" });
  hits.push(now);
  rate.set(userId, hits);
}

async function loadMessages(brandId: number, userId: number) {
  const [rows]: any = await localPool.execute(
    `SELECT id, role, content, meta, createdAt FROM planner_messages WHERE brandId = ? AND userId = ?
      ORDER BY createdAt DESC, id DESC LIMIT 30`,
    [brandId, userId],
  );
  return (rows as any[]).reverse().map((m) => {
    let meta: any = null;
    try { meta = typeof m.meta === "string" ? JSON.parse(m.meta) : m.meta; } catch { meta = null; }
    return { id: Number(m.id), role: m.role === "user" ? "user" : "lead", content: String(m.content), choices: (meta?.choices ?? []) as string[] };
  });
}

async function weekScheduled(userId: number, brandId: number, weekStart: string) {
  try {
    const [rows]: any = await localPool.execute(
      `SELECT sp.scheduledAt AS at, sp.platform, m.title FROM scheduled_posts sp
         LEFT JOIN mission_outputs o ON o.id = sp.outputId LEFT JOIN missions m ON m.id = o.missionId
        WHERE sp.userId = ? AND sp.brandId = ? AND sp.scheduledAt >= ? AND sp.scheduledAt < ? AND sp.status <> 'cancelled'`,
      [userId, brandId, weekStart, addDays(weekStart, 7)],
    );
    return (rows as any[]).map((r) => ({ date: new Date(r.at).toISOString().slice(0, 10), platform: String(r.platform), title: String(r.title ?? "") }));
  } catch { return []; }
}

export const plannerRouter = router({
  week: protectedProcedure
    .input(weekInput)
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertBrandAccess(userId, input.brandId);
      const [slots, campaign, messages, platforms] = await Promise.all([
        loadWeekSlots(input.brandId, input.weekStart),
        loadWeekCampaignItems(input.brandId, input.weekStart).catch(() => []),
        loadMessages(input.brandId, userId),
        brandPlatforms(input.brandId),
      ]);
      return { days: weekDays(input.weekStart), slots, campaign, messages, platforms, hasDrafts: slots.some((s) => s.status === "draft") };
    }),

  send: protectedProcedure
    .input(weekInput.extend({ content: z.string().trim().min(1).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertBrandAccess(userId, input.brandId);
      checkRate(userId);
      await localPool.execute(`INSERT INTO planner_messages (userId, brandId, role, content) VALUES (?, ?, 'user', ?)`, [userId, input.brandId, input.content]);

      const [bRows]: any = await localPool.execute(`SELECT name FROM brands WHERE id = ? LIMIT 1`, [input.brandId]);
      const brandName = String((bRows as any[])[0]?.name ?? "");
      const platforms = await brandPlatforms(input.brandId);
      const cards = cardsFor(platforms);
      const [slots, campaign, scheduled, history] = await Promise.all([
        loadWeekSlots(input.brandId, input.weekStart),
        loadWeekCampaignItems(input.brandId, input.weekStart).catch(() => []),
        weekScheduled(userId, input.brandId, input.weekStart),
        loadMessages(input.brandId, userId),
      ]);
      const { gatherBrandContext } = await import("../../strategy/routers/strategistChatRouter");
      const brandCtx = await gatherBrandContext(input.brandId, userId).catch(() => "");
      const system = plannerSystemPrompt({ brandName, brandCtx, weekStart: input.weekStart, platforms, cards, slots, campaign, scheduled });

      let parsed: ReturnType<typeof parsePlannerReply> = null;
      for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
        try {
          const r = await callModel([
            { role: "system", content: system },
            ...history.slice(-10).map((m) => ({ role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant", content: m.content })),
          ], "general");
          parsed = parsePlannerReply(String(r.content ?? ""));
        } catch { parsed = null; }
      }
      if (!parsed) {
        const reply = "我這邊剛剛沒接好，再說一次看看？";
        await localPool.execute(`INSERT INTO planner_messages (userId, brandId, role, content) VALUES (?, ?, 'lead', ?)`, [userId, input.brandId, reply]);
        return { reply, choices: [] as string[], touched: [] as number[], repaired: 0 };
      }
      const ops = validateOps({ raw: parsed.ops, weekStart: input.weekStart, platforms, cards, slots });
      const touched = await applyOps({ userId, brandId: input.brandId, ops, cards });
      await localPool.execute(
        `INSERT INTO planner_messages (userId, brandId, role, content, meta) VALUES (?, ?, 'lead', ?, ?)`,
        [userId, input.brandId, parsed.reply, JSON.stringify({ choices: parsed.choices, touched })],
      );
      const repaired = ops.filter((o) => (o as any).repaired).length;
      return { reply: parsed.reply, choices: parsed.choices, touched, repaired };
    }),

  /** 排定這週：草稿 → 已排定。 */
  commit: protectedProcedure
    .input(weekInput)
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const [r]: any = await localPool.execute(
        `UPDATE planned_slots SET status = 'planned' WHERE brandId = ? AND status = 'draft' AND slotDate >= ? AND slotDate < ?`,
        [input.brandId, input.weekStart, addDays(input.weekStart, 7)],
      );
      return { count: Number(r.affectedRows ?? 0) };
    }),

  removeSlot: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      await localPool.execute(
        `UPDATE planned_slots SET status = 'dismissed' WHERE id = ? AND brandId = ? AND status IN ('draft','planned')`,
        [input.id, input.brandId],
      );
      return { ok: true };
    }),

  /** 任務卡寫完這一格：回填產出、標成已寫。失敗不擋使用者（前端吞掉）。 */
  markWritten: protectedProcedure
    .input(z.object({ slotId: z.number().int().positive(), outputId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const [rows]: any = await localPool.execute(`SELECT brandId FROM planned_slots WHERE id = ? LIMIT 1`, [input.slotId]);
      const brandId = Number((rows as any[])[0]?.brandId ?? 0);
      if (!brandId) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這一格" });
      await assertBrandAccess(ctx.user!.id, brandId);
      await localPool.execute(`UPDATE planned_slots SET status = 'written', outputId = ? WHERE id = ?`, [input.outputId, input.slotId]);
      return { ok: true };
    }),

});
