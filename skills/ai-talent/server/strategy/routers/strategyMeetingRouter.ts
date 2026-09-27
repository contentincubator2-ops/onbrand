/**
 * strategyMeetingRouter — 策略會議的 tRPC 介面。邏輯在 core/strategyMeetings.ts。
 *
 * 閘門比照策略監測：list 不擋（基礎用戶要看得到範例與「這裡有東西，但要升級」），
 * 建立／修改／開會／決定才用 assertStrategyMonitoringAllowed——會議是 N+1 次 LLM 呼叫。
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../platform/core/trpc";
import { assertStrategyMonitoringAllowed, planQuotaFor } from "../../platform/core/planGate";
import localPool from "../../localDb";
import { isPositioningLocked } from "../core/positioningLock";
import {
  MANUAL_RUN_COOLDOWN_HOURS, MAX_ATTENDEES, MEETING_FREQUENCIES,
  computeNextRunAt, pendingDecisionCount, rowToMeeting, rowToRun, startMeetingInBackground,
  type Decision, type MeetingFrequency,
} from "../core/strategyMeetings";
import { commitWriteback, previewWriteback, revertWriteback } from "../core/meetingWriteback";

async function assertBrandOwner(userId: number, brandId: number): Promise<void> {
  const [rows]: any = await localPool.execute(
    `SELECT id FROM brands WHERE id = ? AND userId = ? LIMIT 1`, [brandId, userId],
  );
  if (!(rows as any[])[0]) throw new TRPCError({ code: "NOT_FOUND", message: `品牌 #${brandId} 不存在或不屬於這個帳號` });
}

async function loadMeetingOwned(userId: number, id: number) {
  const [rows]: any = await localPool.execute(
    `SELECT * FROM strategy_meetings WHERE id = ? AND userId = ? LIMIT 1`, [id, userId],
  );
  const r = (rows as any[])[0];
  if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這場會議" });
  return rowToMeeting(r);
}

async function loadRunWithMeeting(userId: number, runId: number) {
  const [rows]: any = await localPool.execute(
    `SELECT * FROM strategy_meeting_runs WHERE id = ? AND userId = ? LIMIT 1`, [runId, userId],
  );
  const r = (rows as any[])[0];
  if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這份會議紀錄" });
  const run = rowToRun(r);
  // 會議設定被刪了也要能處理舊紀錄：範圍從設定讀，設定沒了就不能寫入。
  const meeting = await loadMeetingOwned(userId, run.meetingId);
  return { run, meeting };
}

async function assertScopeOwned(userId: number, brandId: number, scope: "brand" | "product", scopeId: number): Promise<void> {
  if (scope === "brand") {
    if (scopeId !== brandId) throw new TRPCError({ code: "BAD_REQUEST", message: "品牌會議的 scopeId 必須是品牌本身" });
    return;
  }
  const [rows]: any = await localPool.execute(
    `SELECT id FROM products WHERE id = ? AND brandId = ? AND userId = ? LIMIT 1`, [scopeId, brandId, userId],
  );
  if (!(rows as any[])[0]) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這個產品" });
}

const attendeeSchema = z.object({
  agentId: z.number().int().positive(),
  name: z.string().min(1).max(40),
  title: z.string().max(80),
});

const meetingInput = z.object({
  brandId: z.number().int().positive(),
  scope: z.enum(["brand", "product"]),
  scopeId: z.number().int().positive(),
  topic: z.string().trim().min(2).max(120),
  agenda: z.string().max(1000).optional(),
  attendees: z.array(attendeeSchema).min(1).max(MAX_ATTENDEES),
  frequency: z.enum(MEETING_FREQUENCIES as unknown as [MeetingFrequency, ...MeetingFrequency[]]),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  dayOfMonth: z.number().int().min(1).max(28).nullable().optional(),
  enabled: z.boolean().optional(),
});

export const strategyMeetingRouter = router({
  /** 這個品牌的所有會議＋每場最新一次紀錄的摘要。基礎方案回 locked:true（仍可看範例）。 */
  list: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertBrandOwner(userId, input.brandId);
      let locked = false;
      try { locked = !(await planQuotaFor(userId)).strategyMonitoring; } catch { locked = false; }
      const [rows]: any = await localPool.execute(
        `SELECT * FROM strategy_meetings WHERE brandId = ? AND userId = ? ORDER BY createdAt ASC`, [input.brandId, userId],
      );
      const meetings = (rows as any[]).map(rowToMeeting);
      const [pRows]: any = await localPool.execute(
        `SELECT id, name FROM products WHERE brandId = ? AND userId = ? ORDER BY id LIMIT 50`, [input.brandId, userId],
      );
      const products = (pRows as any[]).map((p) => ({ id: Number(p.id), name: String(p.name ?? "") }));
      const [runRows]: any = meetings.length
        ? await localPool.execute(
          `SELECT * FROM strategy_meeting_runs WHERE brandId = ? AND userId = ? ORDER BY createdAt DESC LIMIT 200`,
          [input.brandId, userId],
        )
        : [[]];
      const runs = (runRows as any[]).map((r) => rowToRun(r));
      let pendingTotal = 0;
      const out = meetings.map((m) => {
        const mine = runs.filter((r) => r.meetingId === m.id);
        const pending = mine.reduce((n, r) => n + pendingDecisionCount(r), 0);
        pendingTotal += pending;
        return {
          ...m,
          runCount: mine.length,
          pending,
          latestRun: mine[0] ? { id: mine[0].id, status: mine[0].status, note: mine[0].note, createdAt: mine[0].createdAt } : null,
        };
      });
      return { locked, meetings: out, products, pendingTotal, manualCooldownHours: MANUAL_RUN_COOLDOWN_HOURS, maxAttendees: MAX_ATTENDEES };
    }),

  create: protectedProcedure
    .input(meetingInput)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertBrandOwner(userId, input.brandId);
      await assertStrategyMonitoringAllowed(userId);
      await assertScopeOwned(userId, input.brandId, input.scope, input.scopeId);
      const next = computeNextRunAt({ frequency: input.frequency, dayOfWeek: input.dayOfWeek, dayOfMonth: input.dayOfMonth });
      const [ins]: any = await localPool.execute(
        `INSERT INTO strategy_meetings (userId, brandId, scope, scopeId, topic, agenda, attendees, frequency, dayOfWeek, dayOfMonth, enabled, nextRunAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, input.brandId, input.scope, input.scopeId, input.topic, input.agenda ?? "", JSON.stringify(input.attendees),
         input.frequency, input.dayOfWeek ?? null, input.dayOfMonth ?? null, input.enabled === false ? 0 : 1, next],
      );
      return { id: Number(ins.insertId), nextRunAt: next.toISOString() };
    }),

  update: protectedProcedure
    .input(meetingInput.extend({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertStrategyMonitoringAllowed(userId);
      const cur = await loadMeetingOwned(userId, input.id);
      if (cur.brandId !== input.brandId) throw new TRPCError({ code: "BAD_REQUEST", message: "會議屬於別的品牌" });
      await assertScopeOwned(userId, input.brandId, input.scope, input.scopeId);
      const next = computeNextRunAt({
        frequency: input.frequency, dayOfWeek: input.dayOfWeek, dayOfMonth: input.dayOfMonth,
        lastRunAt: cur.lastRunAt ? new Date(cur.lastRunAt) : null,
      });
      await localPool.execute(
        `UPDATE strategy_meetings SET scope = ?, scopeId = ?, topic = ?, agenda = ?, attendees = ?, frequency = ?,
           dayOfWeek = ?, dayOfMonth = ?, enabled = ?, nextRunAt = ? WHERE id = ? AND userId = ?`,
        [input.scope, input.scopeId, input.topic, input.agenda ?? "", JSON.stringify(input.attendees), input.frequency,
         input.dayOfWeek ?? null, input.dayOfMonth ?? null, input.enabled === false ? 0 : 1, next, input.id, userId],
      );
      return { ok: true, nextRunAt: next.toISOString() };
    }),

  /** 刪掉會議設定。過去的會議紀錄保留（紀錄是歷史，不跟著設定一起消失）。 */
  remove: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await loadMeetingOwned(userId, input.id);
      await localPool.execute(`DELETE FROM strategy_meetings WHERE id = ? AND userId = ?`, [input.id, userId]);
      return { ok: true };
    }),

  /** 現在開一次（背景跑，回 runId 讓前台輪詢）。每場會 6 小時一次。 */
  runNow: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertStrategyMonitoringAllowed(userId);
      const m = await loadMeetingOwned(userId, input.id);
      const [last]: any = await localPool.execute(
        `SELECT createdAt, status FROM strategy_meeting_runs WHERE meetingId = ? AND trigger_kind = 'manual'
          ORDER BY createdAt DESC LIMIT 1`, [m.id],
      );
      const lr = (last as any[])[0];
      if (lr && lr.status !== "failed") {
        const elapsed = Date.now() - new Date(lr.createdAt).getTime();
        if (elapsed < MANUAL_RUN_COOLDOWN_HOURS * 3_600_000) {
          const hrs = Math.ceil((MANUAL_RUN_COOLDOWN_HOURS * 3_600_000 - elapsed) / 3_600_000);
          throw new TRPCError({ code: "BAD_REQUEST", message: `同一場會 ${MANUAL_RUN_COOLDOWN_HOURS} 小時內只能手動開一次，還要等 ${hrs} 小時。` });
        }
      }
      const runId = await startMeetingInBackground(m, userId);
      return { runId };
    }),

  /** 一場會的所有紀錄（新到舊）——會議紀錄時間軸。 */
  runs: protectedProcedure
    .input(z.object({ meetingId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const meeting = await loadMeetingOwned(userId, input.meetingId);
      const [rows]: any = await localPool.execute(
        `SELECT * FROM strategy_meeting_runs WHERE meetingId = ? AND userId = ? ORDER BY createdAt DESC LIMIT 50`,
        [input.meetingId, userId],
      );
      return { meeting, runs: (rows as any[]).map((r) => rowToRun(r)) };
    }),

  getRun: protectedProcedure
    .input(z.object({ runId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const [rows]: any = await localPool.execute(
        `SELECT * FROM strategy_meeting_runs WHERE id = ? AND userId = ? LIMIT 1`, [input.runId, ctx.user!.id],
      );
      const r = (rows as any[])[0];
      if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這份會議紀錄" });
      return rowToRun(r);
    }),

  /**
   * 採用前的預覽：這項調整寫進品牌大腦會改哪幾個欄位、前後各是什麼、會影響哪裡。
   * 什麼都不寫。text＝建議原文，或用戶「修改後採用」改過的文字。
   */
  previewAdopt: protectedProcedure
    .input(z.object({
      runId: z.number().int().positive(),
      anchorId: z.string().min(1).max(40),
      text: z.string().trim().min(2).max(1200),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertStrategyMonitoringAllowed(userId);
      const { run, meeting } = await loadRunWithMeeting(userId, input.runId);
      const check = run.minutes?.checks.find((c) => c.anchorId === input.anchorId && c.verdict === "adjust");
      if (!check) throw new TRPCError({ code: "BAD_REQUEST", message: "這一格沒有建議調整" });
      return await previewWriteback({
        userId, brandId: meeting.brandId, scope: meeting.scope, scopeId: meeting.scopeId,
        anchorId: input.anchorId, anchorLabel: check.label, text: input.text,
      });
    }),

  /**
   * 採用。write=true 時把預覽過的 patch 寫進品牌大腦（伺服器再驗一次白名單）並存版本；
   * 定案鎖定的品牌要 confirmLocked=true。write=false＝只記決定（研究證據類、或用戶選擇不寫入）。
   */
  adopt: protectedProcedure
    .input(z.object({
      runId: z.number().int().positive(),
      anchorId: z.string().min(1).max(40),
      status: z.enum(["adopted", "modified"]),
      note: z.string().max(1200).optional(),
      write: z.boolean(),
      patch: z.record(z.union([z.string().max(1200), z.array(z.string().max(200)).max(12)])).optional(),
      confirmLocked: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertStrategyMonitoringAllowed(userId);
      const { run, meeting } = await loadRunWithMeeting(userId, input.runId);
      if (!run.minutes?.checks.some((c) => c.anchorId === input.anchorId && c.verdict === "adjust")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "這一格沒有建議調整" });
      }
      if (run.decisions[input.anchorId]) throw new TRPCError({ code: "BAD_REQUEST", message: "這一格已經決定過了，先撤回再重新決定" });
      const decision: Decision = { status: input.status, note: input.note ?? "", at: new Date().toISOString() };
      if (input.write) {
        if (meeting.scope === "brand" && !input.confirmLocked && await isPositioningLocked("brand", meeting.brandId, userId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "品牌定位已定案（鎖定），請勾選「我確認要修改已定案的定位」再寫入" });
        }
        try {
          const r = await commitWriteback({
            userId, brandId: meeting.brandId, scope: meeting.scope, scopeId: meeting.scopeId,
            anchorId: input.anchorId, runId: run.id, patch: input.patch ?? {},
          });
          decision.versionId = r.versionId;
          decision.written = r.diffs.map((d) => d.label);
        } catch (e) {
          const m = String((e as Error)?.message ?? e);
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: m === "empty_patch" ? "沒有要寫入的變更（內容跟目前一樣）" : m === "not_writable" ? "這一格不能寫入品牌大腦" : `寫入失敗：${m.slice(0, 120)}`,
          });
        }
      }
      const decisions = { ...run.decisions, [input.anchorId]: decision };
      await localPool.execute(`UPDATE strategy_meeting_runs SET decisions = ? WHERE id = ? AND userId = ?`,
        [JSON.stringify(decisions), run.id, userId]);
      return { ok: true, decision };
    }),

  /** 對一條「建議調整」下決定。不改定位——實際修改在定位頁做。 */
  decide: protectedProcedure
    .input(z.object({
      runId: z.number().int().positive(),
      anchorId: z.string().min(1).max(40),
      /** rejected＝不採用；null＝撤回決定（若當初有寫入品牌大腦，會一併復原）。採用請走 adopt。 */
      status: z.enum(["rejected"]).nullable(),
      note: z.string().max(600).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertStrategyMonitoringAllowed(userId);
      const [rows]: any = await localPool.execute(
        `SELECT * FROM strategy_meeting_runs WHERE id = ? AND userId = ? LIMIT 1`, [input.runId, userId],
      );
      const r = (rows as any[])[0];
      if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這份會議紀錄" });
      const run = rowToRun(r);
      if (!run.minutes?.checks.some((c) => c.anchorId === input.anchorId && c.verdict === "adjust")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "這一格沒有建議調整" });
      }
      const decisions: Record<string, Decision> = { ...run.decisions };
      const prev = decisions[input.anchorId];
      if (input.status === null && prev?.versionId) {
        try { await revertWriteback({ userId, versionId: prev.versionId }); }
        catch (e) {
          if (String((e as Error)?.message) !== "already_reverted") {
            throw new TRPCError({ code: "BAD_REQUEST", message: `復原失敗：${String((e as Error)?.message ?? e).slice(0, 120)}` });
          }
        }
      }
      if (input.status === null) delete decisions[input.anchorId];
      else decisions[input.anchorId] = { status: input.status, note: input.note ?? "", at: new Date().toISOString() };
      await localPool.execute(
        `UPDATE strategy_meeting_runs SET decisions = ? WHERE id = ? AND userId = ?`,
        [JSON.stringify(decisions), input.runId, userId],
      );
      return { ok: true, decisions };
    }),
});
