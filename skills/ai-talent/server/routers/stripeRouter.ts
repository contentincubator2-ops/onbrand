/**
 * stripeRouter — Stripe Checkout Sessions for subscriptions + one-time
 * top-up packs. Replaces the deprecated ecpayRouter.
 *
 * 2026-05-14 (CJ「我們使用 Stripe」).
 *
 * ─── Decisions ─────────────────────────────────────────────
 *  - Inline `price_data` (no pre-created Stripe Prices needed).
 *    Subscription amounts come from plans.ts via getEffectivePrice so
 *    grandfathering still works.
 *  - Currency: TWD (matches the prices in plans.ts).
 *  - Webhook is the source of truth: we never trust the redirect's
 *    success param. Plan extension / point credit only happens after
 *    `checkout.session.completed` arrives at /api/stripe/webhook with
 *    a verified signature.
 *
 * ─── ENV required (set on VM .env) ─────────────────────────
 *  STRIPE_SECRET_KEY       — sk_test_... or sk_live_...
 *  STRIPE_WEBHOOK_SECRET   — whsec_... (from `stripe listen` or the
 *                            Stripe Dashboard endpoint config)
 *  APP_URL                 — https://onbrand.sowork.ai
 *
 * ─── Flow ──────────────────────────────────────────────────
 *  1. Frontend calls stripe.createCheckout (subscription) or
 *     stripe.createTopupCheckout (one-time). Server creates a Checkout
 *     Session and returns { url }. Frontend does window.location = url.
 *  2. User pays on Stripe-hosted page.
 *  3. Stripe POSTs to /api/stripe/webhook. We verify signature, look up
 *     our local `invoices` row by session.id, mark paid, and either:
 *       - subscription → bump workspaces.planEndsAt
 *       - topup        → pointsService.addPoints()
 *  4. User is redirected to success_url (/settings/account?paid=1).
 *
 * ─── Idempotency ───────────────────────────────────────────
 * `invoices.merchantTradeNo` stores the Stripe session.id. Webhooks
 * may fire multiple times; second + N attempts noop when status='paid'.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import Stripe from "stripe";

let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "金流服務尚未啟用，請稍後再試或聯絡 sowork@sowork.ai。",
    });
  }
  _stripe = new Stripe(key, { apiVersion: "2024-12-18.acacia" as any });
  return _stripe;
}

const PLAN_LABEL: Record<string, string> = {
  drop_starter: "OnBrand Starter",
  drop_pro:     "OnBrand Solo",
  drop_team:    "OnBrand Studio",
  drop_agency:  "OnBrand Agency",
};

/** Look up the user's billing currency (defaults TWD). */
async function getUserCurrency(userId: number): Promise<"TWD" | "USD"> {
  const { default: localPool } = await import("../localDb");
  const [rows]: any = await localPool.execute(
    `SELECT billingCountry FROM users WHERE id = ? LIMIT 1`,
    [userId],
  );
  const country = (rows as any[])[0]?.billingCountry ?? "TW";
  const { currencyFromCountry } = await import("../_core/plans");
  return currencyFromCountry(country);
}

export const stripeRouter = router({
  /** Subscription checkout — monthly or annual. */
  createCheckout: protectedProcedure
    .input(z.object({
      planCode: z.enum(["drop_starter", "drop_pro", "drop_agency"]),
      workspaceId: z.number().int().positive(),
      annual: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const stripe = getStripe();
      const appUrl = process.env.APP_URL ?? "https://onbrand.sowork.ai";

      // Verify workspace ownership.
      const { default: localPool } = await import("../localDb");
      let wRows: any[] = [];
      try {
        const [rows]: any = await localPool.execute(
          `SELECT id, name FROM workspaces WHERE id = ? AND ownerUserId = ? LIMIT 1`,
          [input.workspaceId, ctx.user.id],
        );
        wRows = rows as any[];
      } catch (e) {
        console.warn("[stripe.createCheckout] workspace lookup failed:", (e as Error).message);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "工作空間資料未就緒，請稍後再試或聯絡 SoWork",
        });
      }
      if (!wRows[0]) {
        throw new TRPCError({ code: "FORBIDDEN", message: "只有工作空間擁有者可以訂閱" });
      }

      // 2026-05-14 (CJ「美金為準，每天匯率動」): USD is the truth, TWD derives
      // from today's FX rate. Resolve currency, fetch rate, then run the
      // pricing helper with both.
      const currency = await getUserCurrency(ctx.user.id);
      const { getPlan, getEffectivePrice, toStripeUnitAmount } = await import("../_core/plans");
      const { getUsdToTwd } = await import("../_core/fx");
      const usdToTwdRate = await getUsdToTwd();
      const [uRows]: any = await localPool.execute(
        `SELECT IFNULL(earlyBird,0) AS earlyBird, lockedPriceTwdMonthly FROM users WHERE id = ? LIMIT 1`,
        [ctx.user.id],
      );
      const flags = (uRows as any[])[0] ?? { earlyBird: 0, lockedPriceTwdMonthly: null };
      const eff = getEffectivePrice(getPlan(input.planCode), {
        earlyBird: Number(flags.earlyBird),
        lockedPriceTwdMonthly: flags.lockedPriceTwdMonthly,
        currency,
        usdToTwd: usdToTwdRate,
      });
      const amount = input.annual ? eff.annually : eff.monthly;
      if (!amount || amount <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown plan" });

      const interval: "month" | "year" = input.annual ? "year" : "month";

      // Pending invoice (placeholder tradeNo — replaced with session.id once Stripe returns).
      const tempTradeNo = `pending_${Date.now()}_${ctx.user.id}`;
      // `amountTwd` is a legacy column — we keep storing the human-readable
      // amount the user paid (which may be USD); old reports just read `amount`.
      const [r]: any = await localPool.execute(
        `INSERT INTO invoices (userId, workspaceId, merchantTradeNo, planCode, amount, amountTwd, billingCycle, packType, currency, status, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'subscription', ?, 'pending', NOW(3))`,
        [ctx.user.id, input.workspaceId, tempTradeNo, input.planCode, amount, amount, interval === "year" ? "annual" : "monthly", currency],
      );
      const invoiceId = (r as any).insertId;

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{
          quantity: 1,
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: PLAN_LABEL[input.planCode] ?? input.planCode,
              description: input.annual ? "年繳 / Annual" : "月繳 / Monthly",
            },
            unit_amount: toStripeUnitAmount(amount, currency),
            recurring: { interval },
          },
        }],
        customer_email: (ctx.user as any).email ?? undefined,
        client_reference_id: String(invoiceId),
        // 2026-05-16 (CJ「只用 Stripe」): B2B 統編 + 帳單地址，讓 Stripe
        // 自動產生帶統編的 invoice/收據（取代綠界）。subscription mode
        // 本來就會自動開 invoice;這裡補上台灣 B2B 需要的稅籍欄位。
        billing_address_collection: "required",
        tax_id_collection: { enabled: true },
        metadata: {
          invoiceId: String(invoiceId),
          userId: String(ctx.user.id),
          workspaceId: String(input.workspaceId),
          planCode: input.planCode,
          billingCycle: interval === "year" ? "annual" : "monthly",
          packType: "subscription",
          currency,
        },
        success_url: `${appUrl}/settings/account?paid=1&plan=${input.planCode}`,
        cancel_url:  `${appUrl}/pricing?canceled=1`,
      });

      // Replace placeholder tradeNo with the real session.id so the
      // webhook can match it.
      await localPool.execute(
        `UPDATE invoices SET merchantTradeNo = ? WHERE id = ?`,
        [session.id, invoiceId],
      );

      return { url: session.url, sessionId: session.id };
    }),

  /** One-time top-up: 1000 / 5000 / 10000 points. */
  createTopupCheckout: protectedProcedure
    .input(z.object({
      packId: z.enum(["small", "medium", "large"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const stripe = getStripe();
      const appUrl = process.env.APP_URL ?? "https://onbrand.sowork.ai";
      const { TOPUP_PACKS, toStripeUnitAmount, topupAmountIn } = await import("../_core/plans");
      const { getUsdToTwd } = await import("../_core/fx");
      const pack = TOPUP_PACKS[input.packId];
      if (!pack) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown topup pack" });

      const currency = await getUserCurrency(ctx.user.id);
      const rate = await getUsdToTwd();
      const { amount } = topupAmountIn(pack, currency, rate);

      const { default: localPool } = await import("../localDb");
      const tempTradeNo = `pending_topup_${Date.now()}_${ctx.user.id}`;
      const [r]: any = await localPool.execute(
        `INSERT INTO invoices
            (userId, merchantTradeNo, amount, amountTwd, packType, pointsGranted, currency, status, createdAt)
         VALUES (?, ?, ?, ?, 'topup', ?, ?, 'pending', NOW(3))`,
        [ctx.user.id, tempTradeNo, amount, amount, pack.points, currency],
      );
      const invoiceId = (r as any).insertId;

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [{
          quantity: 1,
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: currency === "TWD"
                ? `OnBrand 點數加購 · ${pack.labelZh}`
                : `OnBrand Top-up · ${pack.labelEn}`,
              description: currency === "TWD"
                ? `${pack.points.toLocaleString()} 點 · 永不過期`
                : `${pack.points.toLocaleString()} points · never expire`,
            },
            unit_amount: toStripeUnitAmount(amount, currency),
          },
        }],
        customer_email: (ctx.user as any).email ?? undefined,
        client_reference_id: String(invoiceId),
        // 2026-05-16 (CJ「只用 Stripe」): one-time top-up — payment mode
        // doesn't auto-invoice, so explicitly enable it + collect 統編.
        billing_address_collection: "required",
        tax_id_collection: { enabled: true },
        invoice_creation: { enabled: true },
        metadata: {
          invoiceId: String(invoiceId),
          userId: String(ctx.user.id),
          packType: "topup",
          packId: pack.id,
          pointsGranted: String(pack.points),
          currency,
        },
        success_url: `${appUrl}/settings/account?paid=1&topup=ok`,
        cancel_url:  `${appUrl}/settings/account?topup=canceled`,
      });

      await localPool.execute(
        `UPDATE invoices SET merchantTradeNo = ? WHERE id = ?`,
        [session.id, invoiceId],
      );

      return { url: session.url, sessionId: session.id };
    }),

  /** List top-up packs in the caller's billing currency at today's FX rate. */
  listTopupPacks: protectedProcedure.query(async ({ ctx }) => {
    const { TOPUP_PACKS, topupAmountIn } = await import("../_core/plans");
    const { getUsdToTwd } = await import("../_core/fx");
    const currency = await getUserCurrency(ctx.user.id);
    const rate = await getUsdToTwd();
    return {
      currency,
      usdToTwd: rate,
      packs: Object.values(TOPUP_PACKS).map((p) => {
        const { amount, perPoint } = topupAmountIn(p, currency, rate);
        return {
          id: p.id,
          points: p.points,
          labelZh: p.labelZh,
          labelEn: p.labelEn,
          discountPct: p.discountPct,
          amount,
          perPoint,
          currency,
        };
      }),
    };
  }),

  /** Frontend can poll this after redirect to confirm status. */
  getInvoiceStatus: protectedProcedure
    .input(z.object({ sessionId: z.string().min(1).max(255) }))
    .query(async ({ ctx, input }) => {
      const { default: localPool } = await import("../localDb");
      const [rows]: any = await localPool.execute(
        `SELECT status, planCode, amount, billingCycle, packType, pointsGranted, paidAt
         FROM invoices
         WHERE merchantTradeNo = ? AND userId = ? LIMIT 1`,
        [input.sessionId, ctx.user.id],
      );
      return (rows as any[])[0] ?? null;
    }),
});

/**
 * Verify + process a Stripe webhook POST. Called from express.ts
 * (NOT via tRPC — Stripe needs the raw body for signature verification).
 *
 * The express route MUST use `express.raw({ type: 'application/json' })`
 * for this path BEFORE the json body parser. Otherwise the signature
 * check will always fail.
 */
/** 2026-05-15: persist failed/anomalous webhooks for audit + replay. */
async function logFailedWebhook(args: {
  eventId?: string | null;
  sessionId?: string | null;
  eventType?: string | null;
  reason: string;
  rawPayload?: string;
  userId?: number | null;
}): Promise<void> {
  try {
    const { default: localPool } = await import("../localDb");
    await localPool.execute(
      `INSERT INTO failed_stripe_events
         (eventId, sessionId, eventType, reason, rawPayload, userId)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        args.eventId ?? null,
        args.sessionId ?? null,
        args.eventType ?? null,
        args.reason.slice(0, 200),
        args.rawPayload ? args.rawPayload.slice(0, 50_000) : null,
        args.userId ?? null,
      ],
    );
  } catch (e) {
    // DB failure to log shouldn't crash webhook ack flow
    console.error("[stripe.webhook] failed to log failed_stripe_events:", (e as Error)?.message);
  }
}

export async function handleStripeWebhook(rawBody: Buffer, signature: string): Promise<{ ok: boolean; message?: string }> {
  const stripe = getStripe();
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!whSecret) {
    console.error("[stripe.webhook] STRIPE_WEBHOOK_SECRET not set");
    await logFailedWebhook({ reason: "STRIPE_WEBHOOK_SECRET not set", rawPayload: rawBody.toString("utf-8") });
    return { ok: false, message: "webhook secret not configured" };
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, whSecret);
  } catch (e: any) {
    console.error("[stripe.webhook] signature verification failed:", e?.message);
    await logFailedWebhook({
      reason: `signature verification failed: ${e?.message ?? ""}`.slice(0, 200),
      rawPayload: rawBody.toString("utf-8"),
    });
    return { ok: false, message: "signature verification failed" };
  }

  // Only act on completed checkouts.
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return { ok: true }; // ignored, but ack
  }

  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== "paid") {
    return { ok: true }; // still pending
  }
  const sessionId = session.id;

  const { default: localPool } = await import("../localDb");
  const [inv]: any = await localPool.execute(
    `SELECT id, userId, workspaceId, planCode, billingCycle, status, packType, pointsGranted
     FROM invoices WHERE merchantTradeNo = ? LIMIT 1`,
    [sessionId],
  );
  const invoice = (inv as any[])[0];
  if (!invoice) {
    console.error("[stripe.webhook] no local invoice for session", sessionId);
    await logFailedWebhook({
      eventId: event.id,
      sessionId,
      eventType: event.type,
      reason: "no local invoice for session (orphan webhook)",
    });
    return { ok: false, message: "unknown session" };
  }
  if (invoice.status === "paid") return { ok: true }; // idempotent noop

  // 2026-05-14 (P1): CAS update — if a duplicate webhook race-arrives
  // between the SELECT above and this UPDATE, only ONE of them gets
  // affectedRows=1. The loser bails before crediting points.
  const [upd]: any = await localPool.execute(
    `UPDATE invoices SET status = 'paid', paidAt = NOW(3), rawPayload = ?
       WHERE id = ? AND status != 'paid'`,
    [JSON.stringify({ event: event.type, sessionId, amount_total: session.amount_total }), invoice.id],
  );
  const affected = Number((upd as any)?.affectedRows ?? 0);
  if (affected === 0) {
    // Another concurrent webhook won the CAS race — it already credited
    // points/extended plan. Ack and exit so Stripe stops retrying.
    console.log("[stripe.webhook] duplicate event lost CAS race; idempotent noop", { sessionId });
    return { ok: true };
  }

  if (invoice.packType === "topup") {
    const pts = Number(invoice.pointsGranted) || 0;
    if (pts > 0) {
      try {
        const { addPoints } = await import("../_core/pointsService");
        await addPoints(invoice.userId, pts, "topup", `stripe:${sessionId}`);
      } catch (err) {
        console.error("[stripe.webhook] addPoints failed", { sessionId, err });
        await logFailedWebhook({
          eventId: event.id,
          sessionId,
          eventType: event.type,
          reason: `addPoints failed: ${(err as Error)?.message ?? err}`.slice(0, 200),
          userId: invoice.userId,
        });
        return { ok: false, message: "failed to credit points" };
      }
    }
  } else {
    // Subscription — extend planEndsAt.
    const isAnnual = invoice.billingCycle === "annual";
    const days = isAnnual ? 365 : 30;
    await localPool.execute(
      `UPDATE workspaces
       SET planCode = ?, planStatus = 'active',
           planEndsAt = GREATEST(COALESCE(planEndsAt, NOW(3)), NOW(3)) + INTERVAL ? DAY
       WHERE id = ?`,
      [invoice.planCode, days, invoice.workspaceId],
    );
    // 2026-05-16 (CJ「金流＋試用到期」audit): CRITICAL — every enforcement
    // path + the points engine read users.planCode/planStatus/planEndsAt,
    // NOT workspaces.*. Without this the customer pays and stays on the
    // trial plan (300 pts, planStatus='trial') — they get nothing.
    // Flipping users.planCode to a paid plan auto-unlocks unlimited
    // points (drop_pro/drop_team pointsPerCycle = -1 → refillIfDue
    // bypass), so no explicit points grant is needed here.
    await localPool.execute(
      `UPDATE users
       SET planCode = ?, planStatus = 'active',
           planEndsAt = GREATEST(COALESCE(planEndsAt, NOW(3)), NOW(3)) + INTERVAL ? DAY
       WHERE id = ?`,
      [invoice.planCode, days, invoice.userId],
    );
    console.log("[stripe.webhook] subscription activated", {
      sessionId, userId: invoice.userId, planCode: invoice.planCode, days,
    });
  }
  return { ok: true };
}
