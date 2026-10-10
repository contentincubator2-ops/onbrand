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
import { callModel } from "../../platform/core/llm/multiModelRouter";
import localPool from "../../localDb";
import {
  addDays, applyOps, brandPlatforms, cardsFor, isYmd, loadWeekCampaignItems, loadWeekSlots,
  PLANNER_FALLBACK, loadWeekEvents, parsePlannerReply, plannerContext, plannerHistory, plannerSystemPrompt, railStatusOf, validateOps, weekDays,
  type Card, type PlannerCtxArgs, type SlotRow,
} from "../core/planning/weeklyPlanner";
import {
  PLANNER_AXES, advisorSystemPrompt, capAdds, isForkAxis, loadAdvisor, parseAdvisorReply, topicOverlap,
  type AdvisorCard, type ForkAxis,
} from "../core/planning/plannerAdvisors";

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
    return {
      id: Number(m.id), role: m.role === "user" ? "user" : "lead", content: String(m.content),
      choices: (meta?.choices ?? []) as string[],
      failed: !!meta?.failed || String(m.content) === PLANNER_FALLBACK,
      fork: meta?.fork ? publicFork(meta.fork) : null,
    };
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

// ─── 分歧方案卡 ───────────────────────────────────────────────────────

interface ForkOption { advisor: AdvisorCard; stance: string; why: string; ops: any[]; preview: Array<{ date: string; platform: string; topic: string; format: string }> }
interface StoredFork { axis: ForkAxis; weekStart: string; question: string; options: ForkOption[]; chosen: number | null; overlap: number }

/** 給前端看的：不帶 ops（套用時伺服器自己從紀錄拿，前端不能改）。 */
function publicFork(f: StoredFork) {
  return {
    axis: f.axis, weekStart: f.weekStart, question: f.question, chosen: f.chosen ?? null,
    options: (f.options ?? []).map((o) => ({ advisor: o.advisor, stance: o.stance, why: o.why, preview: o.preview })),
  };
}

const previewOf = (ops: any[]) => ops.filter((o) => o.op === "add")
  .map((o) => ({ date: String(o.date), platform: String(o.platform), topic: String(o.topic), format: String(o.format ?? "") }))
  .sort((a, b) => a.date.localeCompare(b.date));

async function runAdvisor(args: {
  ctxArgs: PlannerCtxArgs; context: string; axis: ForkAxis; idx: 0 | 1; advisor: AdvisorCard; avoid?: string[];
}): Promise<{ why: string; ops: any[] } | null> {
  const ax = PLANNER_AXES[args.axis];
  const side = ax.sides[args.idx];
  const other = ax.sides[args.idx === 0 ? 1 : 0];
  const system = advisorSystemPrompt({ advisor: args.advisor, side, other, question: ax.question, context: args.context, avoidTopics: args.avoid });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await callModel([{ role: "system", content: system }, { role: "user", content: "請排你的版本。" }], "general");
      const parsed = parseAdvisorReply(String(r.content ?? ""));
      if (!parsed) continue;
      const ops = capAdds(validateOps({ raw: parsed.ops, weekStart: args.ctxArgs.weekStart, platforms: args.ctxArgs.platforms, cards: args.ctxArgs.cards, slots: args.ctxArgs.slots }));
      if (!ops.some((o) => o.op === "add")) continue;
      return { why: parsed.why, ops };
    } catch { /* retry */ }
  }
  return null;
}

/** 兩位顧問各排一版；第二版跟第一版太像就叫他再排一次（CJ「不要回答太相同的」）。 */
async function buildFork(ctxArgs: PlannerCtxArgs, axis: ForkAxis): Promise<StoredFork | null> {
  const ax = PLANNER_AXES[axis];
  const context = plannerContext(ctxArgs);
  const advisors = await Promise.all([loadAdvisor(ax.sides[0].slug, ax.sides[0].stance), loadAdvisor(ax.sides[1].slug, ax.sides[1].stance)]) as [AdvisorCard, AdvisorCard];
  const [a, b0] = await Promise.all([
    runAdvisor({ ctxArgs, context, axis, idx: 0, advisor: advisors[0] }),
    runAdvisor({ ctxArgs, context, axis, idx: 1, advisor: advisors[1] }),
  ]);
  if (!a || !b0) return null;
  const topicsA = previewOf(a.ops).map((x) => x.topic);
  let b = b0;
  let overlap = topicOverlap(previewOf(b.ops).map((x) => x.topic), topicsA);
  if (overlap > 0.35) {
    const again = await runAdvisor({ ctxArgs, context, axis, idx: 1, advisor: advisors[1], avoid: topicsA });
    if (again) {
      const o2 = topicOverlap(previewOf(again.ops).map((x) => x.topic), topicsA);
      if (o2 < overlap) { b = again; overlap = o2; }
    }
  }
  return {
    axis, weekStart: ctxArgs.weekStart, question: ax.question, chosen: null, overlap: Math.round(overlap * 100) / 100,
    options: ([a, b] as const).map((r, i) => ({ advisor: advisors[i as 0 | 1], stance: ax.sides[i as 0 | 1].stance, why: r.why, ops: r.ops, preview: previewOf(r.ops) })),
  };
}

export const plannerRouter = router({
  week: protectedProcedure
    .input(weekInput)
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertBrandAccess(userId, input.brandId);
      const [slots, campaign, messages, platforms, events] = await Promise.all([
        loadWeekSlots(input.brandId, input.weekStart),
        loadWeekCampaignItems(input.brandId, input.weekStart).catch(() => []),
        loadMessages(input.brandId, userId),
        brandPlatforms(input.brandId),
        loadWeekEvents(input.brandId, input.weekStart).catch(() => []),
      ]);
      return { days: weekDays(input.weekStart), slots, campaign, events, messages, platforms, cards: cardsFor(platforms), hasDrafts: slots.some((s) => s.status === "draft") };
    }),

  /** 側欄儀表：這週排了幾篇、寫好幾篇、各平台還有幾篇沒寫。 */
  railStatus: protectedProcedure
    .input(weekInput)
    .query(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const [slots, campaign] = await Promise.all([
        loadWeekSlots(input.brandId, input.weekStart),
        loadWeekCampaignItems(input.brandId, input.weekStart).catch(() => []),
      ]);
      return railStatusOf(slots, campaign);
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
      const ctxArgs: PlannerCtxArgs = { brandName, brandCtx, weekStart: input.weekStart, platforms, cards, slots, campaign, scheduled };
      const system = plannerSystemPrompt(ctxArgs);

      // 2026-10-07（CJ「常常出現我沒接好」）：原本失敗原因整個吞掉，查不到是模型掛了還是回覆解不開。
      // 每次失敗都記下來（哪一次、花多久、是丟錯還是解不開、回覆開頭長怎樣），/admin/errors 看得到。
      let parsed: ReturnType<typeof parsePlannerReply> = null;
      const turns = plannerHistory(history);
      const failures: Array<Record<string, unknown>> = [];
      for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
        const t0 = Date.now();
        try {
          const r = await callModel([{ role: "system", content: system }, ...turns], "general");
          const raw = String(r.content ?? "");
          parsed = parsePlannerReply(raw);
          if (!parsed) failures.push({ attempt, kind: "unparseable", ms: Date.now() - t0, provider: r.provider, model: r.model, chars: raw.length, head: raw.slice(0, 300), tail: raw.slice(-120) });
        } catch (e: any) {
          failures.push({ attempt, kind: "threw", ms: Date.now() - t0, error: String(e?.message ?? e).slice(0, 400) });
        }
      }
      if (failures.length) {
        const { logError } = await import("../../platform/routers/opsRouter");
        await logError({
          source: "planner.send", route: "planner.send", userId, level: parsed ? "warn" : "error",
          message: `本週企劃總監${parsed ? "第一次沒接好、重試成功" : "兩次都沒接好"}：${failures.map((f) => f.kind).join("、")}`,
          meta: { brandId: input.brandId, systemChars: system.length, turns: turns.length, failures },
        }).catch(() => {});
      }
      if (!parsed) {
        const reply = PLANNER_FALLBACK;
        await localPool.execute(`INSERT INTO planner_messages (userId, brandId, role, content, meta) VALUES (?, ?, 'lead', ?, ?)`,
          [userId, input.brandId, reply, JSON.stringify({ failed: true })]);
        return { reply, choices: [] as string[], touched: [] as number[], repaired: 0, fork: null, messageId: 0 };
      }
      // 分歧：總監不自己選，請兩位立場相反的顧問各排一版。
      // 上一則總監訊息就是還沒選的方案卡時，不再開新的一組（使用者已經往下聊就可以）。
      const lastLead = [...history].reverse().find((m) => m.role === "lead");
      if (isForkAxis(parsed.fork) && !(lastLead?.fork && lastLead.fork.chosen == null)) {
        const fork = await buildFork(ctxArgs, parsed.fork);
        if (fork) {
          const [ins]: any = await localPool.execute(
            `INSERT INTO planner_messages (userId, brandId, role, content, meta) VALUES (?, ?, 'lead', ?, ?)`,
            [userId, input.brandId, parsed.reply, JSON.stringify({ choices: [], fork })],
          );
          return { reply: parsed.reply, choices: [] as string[], touched: [] as number[], repaired: 0, fork: publicFork(fork), messageId: Number(ins.insertId) };
        }
        // 顧問都沒排出來：退回總監自己的回覆（下面照常處理）。
      }
      const ops = validateOps({ raw: parsed.ops, weekStart: input.weekStart, platforms, cards, slots });
      const touched = await applyOps({ userId, brandId: input.brandId, ops, cards });
      await localPool.execute(
        `INSERT INTO planner_messages (userId, brandId, role, content, meta) VALUES (?, ?, 'lead', ?, ?)`,
        [userId, input.brandId, parsed.reply, JSON.stringify({ choices: parsed.choices, touched })],
      );
      const repaired = ops.filter((o) => (o as any).repaired).length;
      return { reply: parsed.reply, choices: parsed.choices, touched, repaired, fork: null, messageId: 0 };
    }),

  /** 用某位顧問的方案：套用那一版（ops 從紀錄拿，重新檢查一次——期間格子可能被改過）。 */
  pickFork: protectedProcedure
    .input(weekInput.extend({ messageId: z.number().int().positive(), index: z.union([z.literal(0), z.literal(1)]) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertBrandAccess(userId, input.brandId);
      const [rows]: any = await localPool.execute(
        `SELECT meta FROM planner_messages WHERE id = ? AND brandId = ? AND userId = ? AND role = 'lead' LIMIT 1`,
        [input.messageId, input.brandId, userId],
      );
      let meta: any = null;
      try { const m = (rows as any[])[0]?.meta; meta = typeof m === "string" ? JSON.parse(m) : m; } catch { meta = null; }
      const fork: StoredFork | undefined = meta?.fork;
      if (!fork?.options?.[input.index]) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這組方案" });
      if (fork.chosen != null) throw new TRPCError({ code: "BAD_REQUEST", message: "這組方案已經選過了" });
      const opt = fork.options[input.index]!;

      const platforms = await brandPlatforms(input.brandId);
      const cards: Card[] = cardsFor(platforms);
      // 方案是替哪一週排的就套到哪一週——使用者可能已經翻到別週才按。
      const weekStart = fork.weekStart || input.weekStart;
      const slots: SlotRow[] = await loadWeekSlots(input.brandId, weekStart);
      const ops = validateOps({ raw: opt.ops, weekStart, platforms, cards, slots });
      const touched = await applyOps({ userId, brandId: input.brandId, ops, cards });

      fork.chosen = input.index;
      await localPool.execute(`UPDATE planner_messages SET meta = ? WHERE id = ?`, [JSON.stringify({ ...meta, fork }), input.messageId]);
      const said = `用${opt.advisor.name}的方案（${opt.stance}）`;
      const reply = `好，照${opt.advisor.name}的「${opt.stance}」排了。`;
      await localPool.execute(`INSERT INTO planner_messages (userId, brandId, role, content) VALUES (?, ?, 'user', ?)`, [userId, input.brandId, said]);
      await localPool.execute(`INSERT INTO planner_messages (userId, brandId, role, content, meta) VALUES (?, ?, 'lead', ?, ?)`,
        [userId, input.brandId, reply, JSON.stringify({ choices: [], touched })]);
      return { touched, weekStart };
    }),

  /**
   * 成品頁按「放棄」：這一格退回「已排定、還沒寫」，跟那篇產出脫鉤。產出本身不刪（留在專案）。
   * 只有格子目前連的就是這篇時才退，避免舊分頁把後來寫好的另一篇解掉。
   */
  releaseSlot: protectedProcedure
    .input(z.object({ slotId: z.number().int().positive(), outputId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const [rows]: any = await localPool.execute(`SELECT brandId FROM planned_slots WHERE id = ? LIMIT 1`, [input.slotId]);
      const brandId = Number((rows as any[])[0]?.brandId ?? 0);
      if (!brandId) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這一格" });
      await assertBrandAccess(ctx.user!.id, brandId);
      await localPool.execute(
        `UPDATE planned_slots SET status = 'planned', outputId = NULL WHERE id = ? AND status = 'written' AND outputId = ?`,
        [input.slotId, input.outputId],
      );
      return { ok: true };
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
        // 已寫好的格子也能刪（2026-10-11）：只是從本週企劃拿掉，產出還留在專案裡。
        `UPDATE planned_slots SET status = 'dismissed' WHERE id = ? AND brandId = ? AND status IN ('draft','planned','written')`,
        [input.id, input.brandId],
      );
      return { ok: true };
    }),

  /** 拖到另一天（2026-10-11 CJ「貼文可以拖拉，切換到不同時間」）：只改日期，其他欄位不動。 */
  moveSlot: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), id: z.number().int().positive(), date: z.string().refine(isYmd, "date 要是 YYYY-MM-DD") }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      await localPool.execute(
        `UPDATE planned_slots SET slotDate = ? WHERE id = ? AND brandId = ? AND status IN ('draft','planned','written')`,
        [input.date, input.id, input.brandId],
      );
      return { ok: true };
    }),

  /**
   * 活動企劃的一篇拖到另一天。只改那一篇的 date，企劃本身的定稿狀態不動（跟 setInPlanner 一樣是排程）。
   * 已發布的不能搬；不能搬出活動檔期（有填開始／結束日時）。
   */
  moveCampaignItem: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(), eventId: z.number().int().positive(),
      itemId: z.string().min(1).max(80), date: z.string().refine(isYmd, "date 要是 YYYY-MM-DD"),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const [rows]: any = await localPool.execute(
        `SELECT startAt, endAt, positioning FROM events WHERE id = ? AND brandId = ? LIMIT 1`, [input.eventId, input.brandId],
      );
      const row = (rows as any[])[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這個活動" });
      let pos: any = row.positioning;
      if (typeof pos === "string") { try { pos = JSON.parse(pos); } catch { pos = null; } }
      const item = pos?.campaignPlan?.items?.find((i: any) => String(i?.id) === input.itemId);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "企劃上找不到這一篇" });
      if (item.publishedUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "已經發布的不能改日期" });
      const day = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : null);
      const s = day(row.startAt), e = day(row.endAt);
      if ((s && input.date < s) || (e && input.date > e)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `這一篇要排在活動檔期內（${s ?? "…"} ～ ${e ?? "…"}）` });
      }
      item.date = input.date;
      await localPool.execute(`UPDATE events SET positioning = ? WHERE id = ? AND brandId = ?`, [JSON.stringify(pos), input.eventId, input.brandId]);
      return { ok: true };
    }),

  /**
   * 用戶自己指定這一格用哪張任務卡（不經總監）。只能換成同平台、目前可用的卡；
   * 已寫好的格子不能換（成品跟格子會對不上）。
   */
  setSlotCard: protectedProcedure
    .input(z.object({ slotId: z.number().int().positive(), taskId: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const [rows]: any = await localPool.execute(`SELECT brandId, platform, status FROM planned_slots WHERE id = ? LIMIT 1`, [input.slotId]);
      const slot = (rows as any[])[0];
      if (!slot) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這一格" });
      await assertBrandAccess(ctx.user!.id, Number(slot.brandId));
      if (slot.status !== "draft" && slot.status !== "planned") throw new TRPCError({ code: "BAD_REQUEST", message: "這一篇已經寫好，不能換任務卡" });
      const card = cardsFor(await brandPlatforms(Number(slot.brandId))).find((c) => c.id === input.taskId && c.platform === slot.platform);
      if (!card) throw new TRPCError({ code: "BAD_REQUEST", message: "這張任務卡不適用這個平台" });
      await localPool.execute(
        `UPDATE planned_slots SET taskId = ?, taskLabel = ? WHERE id = ? AND status IN ('draft','planned')`,
        [card.id, card.labelZh, input.slotId],
      );
      return { ok: true, taskId: card.id, taskLabel: card.labelZh };
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
