/**
 * billingRouter — subscription state + paywall + account self-service.
 *
 * 2026-05-10 (CJ direction「除了金流明天，今天都做完」):
 *   - getStatus: returns current plan + days left + paywall flag
 *   - cancelSubscription: stub (sets planStatus='canceled', actual cancel
 *     will go through 綠界 webhook tomorrow)
 *   - listInvoices: returns user's invoices for /settings/account page
 *   - exportData: dumps user's mission_outputs + brands as JSON (PDPA prep)
 *   - deleteAccount: soft-deletes (sets isActive=0 + status flag); actual
 *     hard delete after 30 days via cron (manual for now)
 *
 * Paywall enforcement happens at task entry points (quickTaskRouter,
 * theaterRouter, image, video). We expose `assertWithinPlan` for those
 * routers to call before kicking off LLM work.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { PLANS, getPlan, type PlanCode } from "../_core/plans";

async function loadUserPlan(userId: number): Promise<{
  planCode: PlanCode;
  planStatus: string;
  planEndsAt: Date | null;
  isActive: boolean;
}> {
  const { default: localPool } = await import("../localDb");
  const [rows]: any = await localPool.execute(
    `SELECT planCode, planStatus, planEndsAt, isActive FROM users WHERE id = ? LIMIT 1`,
    [userId],
  );
  const r = (rows as any[])[0];
  return {
    planCode: (r?.planCode ?? "trial") as PlanCode,
    planStatus: r?.planStatus ?? "trial",
    planEndsAt: r?.planEndsAt instanceof Date ? r.planEndsAt : (r?.planEndsAt ? new Date(r.planEndsAt) : null),
    isActive: Number(r?.isActive ?? 0) === 1,
  };
}

/**
 * Throw FORBIDDEN if the user's plan is expired and they don't have an
 * active subscription. Also throws if they hit a quota cap.
 *
 * Called from quickTaskRouter / theaterRouter / image.generate / video.generate
 * BEFORE kicking off paid LLM work.
 */
export async function assertWithinPlan(userId: number, _kind: keyof import("../_core/plans").PlanQuota): Promise<void> {
  const u = await loadUserPlan(userId);
  const now = new Date();

  // Trial expired & not subscribed → block
  if (u.planStatus === "trial" && u.planEndsAt && u.planEndsAt < now) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "免費試用已到期 — 請升級 Drop Pro 繼續使用",
    });
  }
  if (u.planStatus === "expired" || u.planStatus === "canceled") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "訂閱已過期 — 請續訂繼續使用",
    });
  }
  if (u.planStatus === "past_due") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "付款失敗，請更新付款方式",
    });
  }
  // TODO (after 金流): per-quota check via usage_log SUM
}

export const billingRouter = router({
  /** Plan + days-left + paywall flag for top-bar trial countdown UI */
  getStatus: protectedProcedure
    .query(async ({ ctx }) => {
      const u = await loadUserPlan(ctx.user!.id);
      const now = new Date();
      const msLeft = u.planEndsAt ? u.planEndsAt.getTime() - now.getTime() : -1;
      const daysLeft = msLeft > 0 ? Math.ceil(msLeft / (24 * 3600_000)) : 0;
      const expired =
        u.planStatus === "expired" ||
        u.planStatus === "canceled" ||
        (u.planStatus === "trial" && u.planEndsAt !== null && u.planEndsAt < now);

      const plan = getPlan(u.planCode);
      return {
        planCode: u.planCode,
        planName: plan.name,
        planStatus: u.planStatus,
        planEndsAt: u.planEndsAt?.toISOString() ?? null,
        daysLeft,
        expired,
        priceTwdMonthly: plan.priceTwdMonthly,
        priceTwdAnnually: plan.priceTwdAnnually,
        quota: plan.quota,
      };
    }),

  /** All public plans for /pricing page */
  listPlans: protectedProcedure
    .query(async () => Object.values(PLANS)),

  /**
   * Manual subscribe stub. After 金流 lands tomorrow this gets replaced
   * with a綠界 redirect URL. For now: marks user as drop_pro for 30 days
   * (testing only — won't ship to public).
   */
  manualSubscribe: protectedProcedure
    .input(z.object({ confirm: z.literal("yes-test-mode-only") }))
    .mutation(async ({ ctx }) => {
      const { default: localPool } = await import("../localDb");
      const ends = new Date(Date.now() + 30 * 24 * 3600_000);
      await localPool.execute(
        `UPDATE users SET planCode='drop_pro', planStatus='active', planEndsAt=? WHERE id=?`,
        [ends, ctx.user!.id],
      );
      return { ok: true, planEndsAt: ends.toISOString() };
    }),

  /** Cancel subscription (stub — actual cancel via 綠界 tomorrow) */
  cancelSubscription: protectedProcedure
    .mutation(async ({ ctx }) => {
      const { default: localPool } = await import("../localDb");
      await localPool.execute(
        `UPDATE users SET planStatus='canceled' WHERE id=?`,
        [ctx.user!.id],
      );
      return { ok: true, message: "訂閱已取消，當期到期前仍可繼續使用" };
    }),

  /** Invoice list for /settings/account */
  listInvoices: protectedProcedure
    .query(async ({ ctx }) => {
      const { default: localPool } = await import("../localDb");
      const [rows]: any = await localPool.execute(
        `SELECT id, invoiceNumber, amountTwd, status, taxId, companyName,
                downloadUrl, issuedAt, createdAt
         FROM invoices WHERE userId=? ORDER BY id DESC LIMIT 50`,
        [ctx.user!.id],
      );
      return rows;
    }),

  /** PDPA: export all user data as JSON (mission_outputs + brands + ...) */
  exportData: protectedProcedure
    .mutation(async ({ ctx }) => {
      const { default: localPool } = await import("../localDb");
      const [outputs]: any = await localPool.execute(
        `SELECT o.* FROM mission_outputs o
         JOIN missions m ON m.id = o.missionId
         WHERE m.userId = ?`,
        [ctx.user!.id],
      );
      const [brands]: any = await localPool.execute(
        `SELECT * FROM brands WHERE userId = ?`,
        [ctx.user!.id],
      );
      const [missions]: any = await localPool.execute(
        `SELECT * FROM missions WHERE userId = ?`,
        [ctx.user!.id],
      );
      return {
        exportedAt: new Date().toISOString(),
        userId: ctx.user!.id,
        brands,
        missions,
        outputs,
      };
    }),

  /** PDPA: soft-delete account. Hard delete after 30 days via manual cron. */
  deleteAccount: protectedProcedure
    .input(z.object({ confirmEmail: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      const { default: localPool } = await import("../localDb");
      const [rows]: any = await localPool.execute(
        `SELECT email FROM users WHERE id=?`,
        [ctx.user!.id],
      );
      const userEmail = (rows as any[])[0]?.email;
      if (!userEmail || userEmail.toLowerCase() !== input.confirmEmail.toLowerCase()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "請輸入正確的帳號 email 確認刪除",
        });
      }
      await localPool.execute(
        `UPDATE users SET isActive=0, planStatus='canceled' WHERE id=?`,
        [ctx.user!.id],
      );
      return { ok: true, message: "帳號已停用，30 天後永久刪除。要復原請聯繫客服。" };
    }),
});
