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
  earlyBird: number;
  lockedPriceTwdMonthly: number | null;
  billingCountry: string;
}> {
  const { default: localPool } = await import("../localDb");
  const [rows]: any = await localPool.execute(
    `SELECT email, planCode, planStatus, planEndsAt, isActive,
            IFNULL(earlyBird, 0) AS earlyBird,
            lockedPriceTwdMonthly,
            IFNULL(billingCountry, 'TW') AS billingCountry
       FROM users WHERE id = ? LIMIT 1`,
    [userId],
  );
  const r = (rows as any[])[0];
  // 2026-07-26 (CJ「sowork.tw 結尾的信箱，應該都是無限使用」— sowork@
  // sowork.tw 竟跳出訂閱已到期): internal team domain = permanent
  // enterprise, regardless of what the row says. Same domain policy as
  // brand.create's quota bypass (2026-07-07). The DB rows are also
  // upgraded via admin-comp-sowork-team.yml, but this guard means a
  // freshly registered teammate never sees a trial/expired banner.
  const isSoworkTeam = typeof r?.email === "string" && /@sowork\.(tw|ai)$/i.test(r.email);
  if (isSoworkTeam) {
    return {
      planCode: "enterprise" as PlanCode,
      planStatus: "active",
      planEndsAt: null,
      isActive: true,
      earlyBird: Number(r?.earlyBird ?? 0),
      lockedPriceTwdMonthly: r?.lockedPriceTwdMonthly ?? null,
      billingCountry: r?.billingCountry ?? "TW",
    };
  }
  return {
    planCode: (r?.planCode ?? "trial") as PlanCode,
    planStatus: r?.planStatus ?? "trial",
    planEndsAt: r?.planEndsAt instanceof Date ? r.planEndsAt : (r?.planEndsAt ? new Date(r.planEndsAt) : null),
    isActive: Number(r?.isActive ?? 0) === 1,
    earlyBird: Number(r?.earlyBird ?? 0),
    lockedPriceTwdMonthly: r?.lockedPriceTwdMonthly ?? null,
    billingCountry: r?.billingCountry ?? "TW",
  };
}

/**
 * Throw FORBIDDEN if the user's plan is expired/inactive OR if they've
 * hit a per-month quota cap for the given kind.
 *
 * Called from quickTaskRouter / theaterRouter / image.generate / video.generate
 * BEFORE kicking off paid LLM work. After this returns, the caller should
 * recordQuotaUsage() so the count increments.
 *
 * Quota counting uses usage_log rows with kind values:
 *   task_30s | task_60s | task_99s | image_gen
 * tagged at the task entry point. Window = current calendar month
 * (Asia/Taipei, but we accept server-local for simplicity).
 */
const QUOTA_KIND_TO_LOG: Record<string, string | null> = {
  task_30s: "task_30s",
  task_60s: "task_60s",
  task_99s: "task_99s",
  image_gen: "image_gen",
  brands: null,         // counted from brands table directly, not log
  fb_publish: null,     // unlimited on all paid plans; skip
  team_members: null,   // checked in tenantRouter.invite()
  multi_client: null,   // feature flag, not metered
};

export async function assertWithinPlan(
  userId: number,
  kind: keyof import("../_core/plans").PlanQuota,
): Promise<void> {
  const u = await loadUserPlan(userId);
  const now = new Date();

  // Trial expired & not subscribed → block
  if (u.planStatus === "trial" && u.planEndsAt && u.planEndsAt < now) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "免費試用已到期 — 請升級至付費方案繼續使用",
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

  const plan = getPlan(u.planCode);
  const rawCap = plan.quota[kind];
  // multi_client is a boolean feature flag, not a numeric quota — skip
  if (typeof rawCap !== "number") return;
  const cap: number = rawCap;
  if (cap < 0) return; // -1 = unlimited

  const logKind = QUOTA_KIND_TO_LOG[kind as string];
  if (!logKind) return; // not metered via usage_log

  const { default: localPool } = await import("../localDb");
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString().slice(0, 19).replace("T", " ");
  const [rows]: any = await localPool.execute(
    `SELECT COUNT(*) AS used FROM usage_log
      WHERE userId = ? AND kind = ? AND ts >= ?`,
    [userId, logKind, monthStart],
  );
  const used = Number((rows as any[])[0]?.used ?? 0);
  if (used >= cap) {
    const labels: Record<string, string> = {
      task_30s: "30 秒任務",
      task_60s: "60 秒任務",
      task_99s: "99 秒任務",
      image_gen: "AI 圖片",
    };
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `本月 ${labels[logKind] ?? logKind} 額度已用完（${used}/${cap}）— 升級方案或下個月再試`,
    });
  }
}

/**
 * Record one quota-counter row in usage_log. Cost is 0 — this is a
 * counter, not a billing row (the real LLM cost rows are inserted by
 * deeper layers with their own `kind` like `positioning_step`).
 */
export async function recordQuotaUsage(
  userId: number,
  kind: "task_30s" | "task_60s" | "task_99s" | "image_gen",
  entityKind: string | null = null,
  entityId: number | null = null,
): Promise<void> {
  try {
    const { default: localPool } = await import("../localDb");
    await localPool.execute(
      `INSERT INTO usage_log (userId, entityKind, entityId, kind, model, inputTokens, outputTokens, costUsd)
        VALUES (?, ?, ?, ?, 'counter', 0, 0, 0)`,
      [userId, entityKind, entityId, kind],
    );
  } catch (e) {
    // counter best-effort; never block real work
    console.warn("[billing] recordQuotaUsage failed:", e);
  }
}

export const billingRouter = router({
  /** Plan + days-left + per-quota usage for top-bar trial countdown + /settings/account quota bar */
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
      // 2026-05-14 (CJ「美金為準，每天匯率動」): USD = truth, TWD = USD × rate.
      const { getEffectivePrice, currencyFromCountry } = await import("../_core/plans");
      const { getUsdToTwd } = await import("../_core/fx");
      const currency = currencyFromCountry(u.billingCountry);
      const usdToTwdRate = await getUsdToTwd();
      const eff = getEffectivePrice(plan, {
        earlyBird: u.earlyBird,
        lockedPriceTwdMonthly: u.lockedPriceTwdMonthly,
        currency,
        usdToTwd: usdToTwdRate,
      });
      const effTwd = getEffectivePrice(plan, {
        earlyBird: u.earlyBird,
        lockedPriceTwdMonthly: u.lockedPriceTwdMonthly,
        currency: "TWD",
        usdToTwd: usdToTwdRate,
      });

      // Current calendar month usage counts (matches assertWithinPlan window)
      const { default: localPool } = await import("../localDb");
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString().slice(0, 19).replace("T", " ");
      const [usageRows]: any = await localPool.execute(
        `SELECT kind, COUNT(*) AS used FROM usage_log
          WHERE userId = ? AND ts >= ?
            AND kind IN ('task_30s','task_60s','task_99s','image_gen')
          GROUP BY kind`,
        [ctx.user!.id, monthStart],
      );
      const usage: Record<string, number> = {
        task_30s: 0, task_60s: 0, task_99s: 0, image_gen: 0,
      };
      for (const r of usageRows as any[]) {
        usage[r.kind] = Number(r.used ?? 0);
      }

      // 2026-05-14: points balance + cycle info (replaces fixed quota counts)
      const { getBalance } = await import("../_core/pointsService");
      const points = await getBalance(ctx.user!.id);

      // 2026-05-14 (CJ「我們使用 Stripe」): expose the user's primary
      // workspace so PricingPage can call stripe.createCheckout without
      // an extra round-trip.
      // 2026-05-14 (CJ「Unknown column 'ownerUserId'」): defensive — if
      // the migration hasn't run yet (or table predates ownerUserId),
      // skip silently instead of 500.
      let workspaceId: number | null = null;
      try {
        const [wsRows]: any = await localPool.execute(
          `SELECT id FROM workspaces WHERE ownerUserId = ? ORDER BY id ASC LIMIT 1`,
          [ctx.user!.id],
        );
        workspaceId = (wsRows as any[])[0]?.id ?? null;

        // 2026-05-21 (CJ「找不到 workspace」): auto-provision workspace for
        // users who registered after the backfill migration ran.
        if (!workspaceId) {
          const uid  = ctx.user!.id;
          const slug = `ws-${uid}-${Math.random().toString(36).slice(2, 8)}`;
          const name = (ctx.user as any)?.name ?? `Workspace #${uid}`;
          // 2026-05-21: prod workspaces may have a legacy `organizationId INT NOT NULL`
          // column. Until the migrate makes it nullable we skip that column entirely —
          // the INSERT IGNORE + minimal column list avoids the "Field has no default" error.
          // We re-select after INSERT so we also pick up any row the backfill already created.
          try {
            await localPool.execute(
              `INSERT IGNORE INTO workspaces (slug, name, ownerUserId, planCode, planStatus, billingMode)
               VALUES (?, ?, ?, ?, ?, 'solo')`,
              [slug, name, uid, u.planCode ?? "trial", u.planStatus ?? "trial"],
            );
          } catch (insertErr) {
            console.warn(`[billing.getStatus] workspace INSERT failed for user ${uid}:`, (insertErr as Error).message);
          }
          // Re-select regardless of INSERT outcome — the backfill may have beaten us.
          const [wsRows2]: any = await localPool.execute(
            `SELECT id FROM workspaces WHERE ownerUserId = ? ORDER BY id ASC LIMIT 1`,
            [uid],
          );
          workspaceId = (wsRows2 as any[])[0]?.id ?? null;
          if (workspaceId) {
            await localPool.execute(
              `INSERT IGNORE INTO workspace_members (workspaceId, userId, role, joinedAt)
               VALUES (?, ?, 'owner', NOW(3))`,
              [workspaceId, uid],
            );
            console.log(`[billing.getStatus] auto-created workspace ${workspaceId} for user ${uid}`);
          } else {
            console.warn(`[billing.getStatus] workspace still null after INSERT attempt for user ${uid}`);
          }
        }
      } catch (e) {
        console.warn("[billing.getStatus] workspace lookup skipped:", (e as Error).message);
      }

      return {
        planCode: u.planCode,
        planName: plan.name,
        planStatus: u.planStatus,
        planEndsAt: u.planEndsAt?.toISOString() ?? null,
        daysLeft,
        expired,
        // 2026-05-14 (CJ「TWD + USD 雙幣」): `price{Monthly,Annually}` is
        // now in the user's currency. Keep priceTwdMonthly for back-compat.
        currency,
        billingCountry: u.billingCountry,
        usdToTwd: usdToTwdRate,
        priceMonthly:  eff.monthly,
        priceAnnually: eff.annually,
        standardPriceMonthly: currency === "USD"
          ? (plan.standardPriceUsdMonthly ?? plan.priceUsdMonthly ?? 0)
          : Math.round((plan.standardPriceUsdMonthly ?? plan.priceUsdMonthly ?? 0) * usdToTwdRate),
        // Legacy TWD-only fields (kept so old clients don't crash)
        priceTwdMonthly:  effTwd.monthly,
        priceTwdAnnually: effTwd.annually,
        // Use the plan's hardcoded standard TWD price (not exchange-rate derived).
        standardPriceTwdMonthly: plan.standardPriceTwdMonthly ?? Math.round((plan.standardPriceUsdMonthly ?? plan.priceUsdMonthly ?? 0) * usdToTwdRate),
        isEarlyBird: eff.isEarlyBird,
        isLocked:    eff.isLocked,
        workspaceId,
        // Points (new primary gating signal)
        points: {
          balance: points.balance,
          perCycle: points.pointsPerCycle,
          cycleDays: points.cycleDays,
          nextRefillAt: points.nextRefillAt?.toISOString() ?? null,
          // Per-action costs so UI can preview "this 60s task = 60 pts"
          costs: {
            task_30s: 30,
            task_60s: 60,
            task_99s: 99,
            image_flux: 30,
            image_gpt: 100,
            image_imagen: 50,
            image_ideogram: 50,
          },
        },
        // Legacy quota object kept for back-compat (some old UI reads it)
        quota: plan.quota,
        usage,
      };
    }),

  /** All public plans for /pricing page */
  listPlans: protectedProcedure
    .query(async () => Object.values(PLANS)),

  /**
   * 2026-05-14 (CJ「TWD + USD 雙幣」): let the user flip their billing
   * country. Only allowed if they currently have no active paid
   * subscription — Stripe won't switch currency on an existing
   * subscription, so we'd have to cancel + resub, which is messy.
   */
  setBillingCountry: protectedProcedure
    .input(z.object({ country: z.string().length(2) }))
    .mutation(async ({ ctx, input }) => {
      const country = input.country.toUpperCase();
      const { default: localPool } = await import("../localDb");
      const [rows]: any = await localPool.execute(
        `SELECT planStatus FROM users WHERE id = ? LIMIT 1`,
        [ctx.user!.id],
      );
      const ps = (rows as any[])[0]?.planStatus ?? "trial";
      if (ps === "active") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "目前訂閱中無法變更計費國家 — 請先取消訂閱、待當期結束後再變更。",
        });
      }
      await localPool.execute(
        `UPDATE users SET billingCountry = ? WHERE id = ?`,
        [country, ctx.user!.id],
      );
      return { ok: true, country };
    }),

  /**
   * Manual subscribe stub — dev/staging ONLY. Stripe is the real path.
   * Guard: requires NODE_ENV !== 'production' AND literal confirm string.
   * This endpoint must never be callable in production.
   */
  manualSubscribe: protectedProcedure
    .input(z.object({ confirm: z.literal("yes-test-mode-only") }))
    .mutation(async ({ ctx }) => {
      if (process.env.NODE_ENV === "production") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not available in production" });
      }
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
        `SELECT id, invoiceNumber, amount, amountTwd,
                IFNULL(currency,'TWD') AS currency,
                status, taxId, companyName,
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
