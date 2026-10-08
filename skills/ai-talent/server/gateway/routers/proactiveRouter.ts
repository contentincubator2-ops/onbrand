/**
 * proactiveRouter — 主動收件匣的 tRPC 介面。事件怎麼來的見 gateway/proactive/。
 *
 * 收件匣是個人的（teamAccess 的 PERSONAL_NAMESPACES）：成員看到的是寄給自己的事件，
 * 不是品牌擁有者的。事件編號不在 tenantGuard 的檢查範圍內，所以每一支都用
 * 「id ＋ 收件人」一起查；會動到品牌資料的動作再檢查一次品牌權限。
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../platform/core/trpc";
import { assertBrandAccess } from "../../platform/core/brandAuth";
import localPool from "../../localDb";
import { addDays, isYmd } from "../../content/core/planning/weeklyPlanner";
import {
  PROACTIVE_KINDS, closeEvent, countOpen, dismissStreak, getOwn, listMuted, listOpen, setMuted, track,
  type ProactiveEventRow, type ProactiveKind,
} from "../proactive/proactiveStore";

/** 每種事件在收件匣上可以按什麼。approve＝照 AI 做好的往下走；open＝帶去處理的那一頁。 */
export const KIND_ACTIONS: Record<ProactiveKind, { approve: boolean; open: boolean }> = {
  week_plan_ready:    { approve: true,  open: true },
  review_overdue:     { approve: false, open: true },
  publish_unapproved: { approve: false, open: true },
  festival_node:      { approve: false, open: true },
};

const ids = (v: unknown): number[] => (Array.isArray(v) ? v.map(Number).filter((n) => Number.isInteger(n) && n > 0) : []);

/** 排定這一週：跟本週企劃的「排定這週」同一件事（那一週的草稿全部變已排定）。 */
async function commitWeek(e: ProactiveEventRow): Promise<number> {
  const weekStart = String(e.payload.weekStart ?? "");
  if (!isYmd(weekStart)) return 0;
  const [r]: any = await localPool.execute(
    `UPDATE planned_slots SET status = 'planned' WHERE brandId = ? AND status = 'draft' AND slotDate >= ? AND slotDate < ?`,
    [e.brandId, weekStart, addDays(weekStart, 7)],
  );
  return Number(r?.affectedRows ?? 0);
}

/** 這週不用：只收掉 AI 這一次排的、而且還是草稿的格子；用戶自己加的或已排定的不碰。 */
async function discardDrafts(e: ProactiveEventRow): Promise<number> {
  const slotIds = ids(e.payload.slotIds);
  if (!slotIds.length) return 0;
  const [r]: any = await localPool.execute(
    `UPDATE planned_slots SET status = 'dismissed'
      WHERE brandId = ? AND status = 'draft' AND id IN (${slotIds.map(() => "?").join(",")})`,
    [e.brandId, ...slotIds],
  );
  return Number(r?.affectedRows ?? 0);
}

export const proactiveRouter = router({
  /** 等我確認的事，急件在前。 */
  inbox: protectedProcedure.query(async ({ ctx }) => {
    const items = await listOpen(ctx.user!.id);
    return {
      items: items.map((e) => ({
        id: e.id, brandId: e.brandId, brandName: e.brandName, aspect: e.aspect, kind: e.kind, urgency: e.urgency,
        title: e.title, body: e.body, navUrl: e.navUrl, createdAtIso: e.createdAtIso, dueAtIso: e.dueAtIso,
        weekItems: e.kind === "week_plan_ready" && Array.isArray(e.payload.items)
          ? (e.payload.items as Array<{ date: string; platform: string; topic: string; format: string }>)
          : [],
        lead: e.kind === "week_plan_ready" ? String(e.payload.lead ?? "") : "",
        festival: e.kind === "festival_node"
          ? { name: String(e.payload.name ?? ""), date: String(e.payload.date ?? ""), angle: String(e.payload.angle ?? ""), ideas: (Array.isArray(e.payload.ideas) ? e.payload.ideas : []).map(String) }
          : null,
        actions: KIND_ACTIONS[e.kind] ?? { approve: false, open: true },
      })),
    };
  }),

  /** 側欄紅點。 */
  count: protectedProcedure.query(async ({ ctx }) => countOpen(ctx.user!.id)),

  /**
   * approve：照做（目前只有「排定這週」）。dismiss：這則不用了。
   * open 不經過這裡——前端直接帶去 navUrl，條件消失後事件自己收掉。
   */
  act: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), action: z.enum(["approve", "dismiss"]) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const e = await getOwn(userId, input.id);
      if (!e) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這則事項" });
      if (e.status !== "open") return { ok: true, already: true, changed: 0, kind: e.kind, suggestMute: false };
      if (input.action === "approve" && !KIND_ACTIONS[e.kind]?.approve) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "這則事項要到對應的頁面處理" });
      }

      let changed = 0;
      if (e.kind === "week_plan_ready") {
        await assertBrandAccess(userId, e.brandId);
        changed = input.action === "approve" ? await commitWeek(e) : await discardDrafts(e);
      }
      const closed = await closeEvent(userId, e.id, input.action === "approve" ? "done" : "dismissed", input.action);
      if (closed) void track("acted", userId, { kind: e.kind, aspect: e.aspect, brandId: e.brandId, action: input.action, changed });
      // 連續三則都說不用：問他要不要整類關掉（由前端問，不替他決定）。
      const suggestMute = closed && input.action === "dismiss" ? await dismissStreak(userId, e.kind).catch(() => false) : false;
      return { ok: true, already: !closed, changed, kind: e.kind, suggestMute };
    }),

  /** 通知偏好：哪幾類關掉了（digest＝每日彙整信）。 */
  prefs: protectedProcedure.query(async ({ ctx }) => {
    const muted = new Set(await listMuted(ctx.user!.id));
    return { kinds: [...PROACTIVE_KINDS, "digest" as const].map((kind) => ({ kind, muted: muted.has(kind) })) };
  }),

  /** 這類不用再提醒／恢復提醒。只影響之後的事件；已經在收件匣裡的留著。 */
  setMuted: protectedProcedure
    .input(z.object({ kind: z.enum(["week_plan_ready", "review_overdue", "publish_unapproved", "festival_node", "digest"]), muted: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await setMuted(ctx.user!.id, input.kind, input.muted);
      void track("acted", ctx.user!.id, { kind: input.kind, action: input.muted ? "mute" : "unmute" });
      return { ok: true };
    }),
});
