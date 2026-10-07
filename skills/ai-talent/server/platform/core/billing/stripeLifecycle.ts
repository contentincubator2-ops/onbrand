import { disconnectBrandsForOwner } from "../connectors/publish/zernioLifecycle";

/**
 * stripeLifecycle — everything that happens to a subscription AFTER the first
 * checkout: renewals, failed charges, cancellation, refunds.
 *
 * Before 2026-10 the webhook only understood `checkout.session.completed`, so
 * a renewal never extended planEndsAt, a failed charge never reached us, and
 * 「取消訂閱」 only flipped a DB flag while Stripe kept charging the card.
 *
 * ─── planStatus semantics (unchanged for every existing reader) ─────────
 *   active    paying. May have users.cancelAtPeriodEnd=1 = "cancel is
 *             scheduled, keep access until planEndsAt". We deliberately do
 *             NOT use 'canceled' for that window: assertWithinPlan, getStatus
 *             and addonRouter all treat 'canceled' as "no access".
 *   past_due  a renewal charge failed; Stripe is retrying.
 *   canceled  the subscription has actually ended at Stripe.
 *
 * ─── No stored subscription id ──────────────────────────────────────────
 * We never persisted Stripe's subscription id. `invoices.merchantTradeNo`
 * holds the Checkout Session id, and the session knows its subscription, so
 * the user's current subscription = the session of their latest paid
 * checkout. New subscriptions also carry our ids in subscription metadata.
 *
 * Everything takes `db` and `stripe` as arguments so the tests can pass fakes.
 */

export interface Db {
  execute(sql: string, params?: any[]): Promise<any>;
}

/** The slice of the Stripe SDK this module touches. */
export interface StripeLike {
  checkout: {
    sessions: {
      retrieve(id: string): Promise<any>;
      list(params: { subscription: string; limit?: number }): Promise<{ data: any[] }>;
    };
  };
  subscriptions: {
    retrieve(id: string): Promise<any>;
    update(id: string, params: { cancel_at_period_end: boolean }): Promise<any>;
    cancel(id: string): Promise<any>;
  };
}

export type LifecycleAction =
  | { kind: "ignore" }
  | {
      kind: "renew";
      subscriptionId: string;
      stripeInvoiceId: string;
      periodEnd: Date | null;
      amountMinor: number;
      currency: string;
      receiptUrl: string | null;
    }
  | { kind: "payment_failed"; subscriptionId: string; stripeInvoiceId: string }
  | {
      kind: "sync";
      subscriptionId: string;
      status: string;
      cancelAtPeriodEnd: boolean;
      periodEnd: Date | null;
    }
  | { kind: "ended"; subscriptionId: string }
  | { kind: "refunded"; chargeId: string; amountRefundedMinor: number; full: boolean };

const fromUnix = (s: unknown): Date | null =>
  typeof s === "number" && s > 0 ? new Date(s * 1000) : null;

/** Subscription id of a Stripe invoice — old (`subscription`) and new (`parent`) API shapes. */
function invoiceSubscriptionId(inv: any): string | null {
  const direct = inv?.subscription;
  if (typeof direct === "string") return direct;
  if (direct?.id) return direct.id;
  const nested = inv?.parent?.subscription_details?.subscription;
  if (typeof nested === "string") return nested;
  return nested?.id ?? null;
}

/** When the subscription's paid-for period ends — field moved between API versions. */
export function subscriptionPeriodEnd(sub: any): Date | null {
  return fromUnix(sub?.current_period_end) ?? fromUnix(sub?.items?.data?.[0]?.current_period_end);
}

/** Pure: what, if anything, should this webhook event do to our records. */
export function classifyStripeEvent(event: { type: string; data: { object: any } }): LifecycleAction {
  const obj = event.data.object;
  switch (event.type) {
    case "invoice.paid": {
      const subscriptionId = invoiceSubscriptionId(obj);
      // The first invoice is credited by checkout.session.completed.
      if (!subscriptionId || obj.billing_reason === "subscription_create") return { kind: "ignore" };
      return {
        kind: "renew",
        subscriptionId,
        stripeInvoiceId: obj.id,
        periodEnd: fromUnix(obj.lines?.data?.[0]?.period?.end),
        amountMinor: Number(obj.amount_paid ?? 0),
        currency: String(obj.currency ?? "twd").toUpperCase(),
        receiptUrl: obj.hosted_invoice_url ?? null,
      };
    }
    case "invoice.payment_failed": {
      const subscriptionId = invoiceSubscriptionId(obj);
      // A failed FIRST charge never gave the user a plan — nothing to take away.
      if (!subscriptionId || obj.billing_reason === "subscription_create") return { kind: "ignore" };
      return { kind: "payment_failed", subscriptionId, stripeInvoiceId: obj.id };
    }
    case "customer.subscription.updated":
      return {
        kind: "sync",
        subscriptionId: obj.id,
        status: String(obj.status ?? ""),
        cancelAtPeriodEnd: obj.cancel_at_period_end === true,
        periodEnd: subscriptionPeriodEnd(obj),
      };
    case "customer.subscription.deleted":
      return { kind: "ended", subscriptionId: obj.id };
    case "charge.refunded":
      return {
        kind: "refunded",
        chargeId: obj.id,
        amountRefundedMinor: Number(obj.amount_refunded ?? 0),
        full: obj.refunded === true,
      };
    default:
      return { kind: "ignore" };
  }
}

export interface SubscriptionOwner {
  userId: number;
  workspaceId: number | null;
  planCode: string | null;
  billingCycle: string | null;
}

/** Which of our users a Stripe subscription belongs to. */
export async function resolveSubscriptionOwner(
  db: Db,
  stripe: StripeLike,
  subscriptionId: string,
): Promise<SubscriptionOwner | null> {
  // Subscriptions created before metadata was attached: walk back through the
  // Checkout Session that created them to our invoices row.
  const sessions = await stripe.checkout.sessions.list({ subscription: subscriptionId, limit: 1 });
  const sessionId = sessions.data[0]?.id;
  if (sessionId) {
    const [rows]: any = await db.execute(
      `SELECT userId, workspaceId, planCode, billingCycle FROM invoices WHERE merchantTradeNo = ? LIMIT 1`,
      [sessionId],
    );
    const r = (rows as any[])[0];
    if (r) {
      return {
        userId: Number(r.userId),
        workspaceId: r.workspaceId == null ? null : Number(r.workspaceId),
        planCode: r.planCode ?? null,
        billingCycle: r.billingCycle ?? null,
      };
    }
  }
  const md = (await stripe.subscriptions.retrieve(subscriptionId))?.metadata ?? {};
  const userId = Number(md.userId);
  if (!Number.isInteger(userId) || userId <= 0) return null;
  const workspaceId = Number(md.workspaceId);
  return {
    userId,
    workspaceId: Number.isInteger(workspaceId) && workspaceId > 0 ? workspaceId : null,
    planCode: md.planCode ?? null,
    billingCycle: md.billingCycle ?? null,
  };
}

export interface CurrentSubscription {
  subscriptionId: string;
  customerId: string | null;
}

/** The Stripe subscription behind the user's latest paid checkout, or null. */
export async function findCurrentSubscription(
  db: Db,
  stripe: StripeLike,
  userId: number,
  opts: { beforeInvoiceId?: number } = {},
): Promise<CurrentSubscription | null> {
  const [rows]: any = await db.execute(
    `SELECT merchantTradeNo FROM invoices
      WHERE userId = ? AND status = 'paid' AND packType = 'subscription'
        AND merchantTradeNo LIKE 'cs\\_%' AND id < ?
      ORDER BY id DESC LIMIT 1`,
    [userId, opts.beforeInvoiceId ?? Number.MAX_SAFE_INTEGER],
  );
  const sessionId = (rows as any[])[0]?.merchantTradeNo;
  if (!sessionId) return null;
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const sub = session?.subscription;
  const subscriptionId = typeof sub === "string" ? sub : sub?.id;
  if (!subscriptionId) return null;
  const cust = session?.customer;
  return { subscriptionId, customerId: typeof cust === "string" ? cust : cust?.id ?? null };
}

/** users.cancelAtPeriodEnd is a late column; a DB that has not migrated yet must not break billing. */
async function setCancelFlag(db: Db, userId: number, on: boolean): Promise<void> {
  try {
    await db.execute(`UPDATE users SET cancelAtPeriodEnd = ? WHERE id = ?`, [on ? 1 : 0, userId]);
  } catch (e) {
    console.warn("[stripeLifecycle] cancelAtPeriodEnd not written:", (e as Error)?.message);
  }
}

async function setPlanStatus(db: Db, owner: SubscriptionOwner, status: string, onlyFrom?: string): Promise<void> {
  const guard = onlyFrom ? ` AND planStatus = ?` : ``;
  const tail = onlyFrom ? [onlyFrom] : [];
  await db.execute(`UPDATE users SET planStatus = ? WHERE id = ?${guard}`, [status, owner.userId, ...tail]);
  if (owner.workspaceId) {
    await db.execute(`UPDATE workspaces SET planStatus = ? WHERE id = ?${guard}`, [status, owner.workspaceId, ...tail]);
  }
}

export type ApplyResult =
  | { applied: true; kind: LifecycleAction["kind"]; userId: number | null; note?: string }
  | { applied: false; reason: string };

export interface ApplyHooks {
  /** Tell the user (email). Failures are swallowed by the caller of the hook. */
  onPaymentFailed?: (userId: number) => Promise<void>;
  /** Anything a human must look at (refunds, orphans). */
  flagForReview?: (reason: string, userId: number | null) => Promise<void>;
}

/** Write a classified event into our records. Every branch is safe to replay. */
export async function applyLifecycleAction(
  db: Db,
  stripe: StripeLike,
  action: LifecycleAction,
  hooks: ApplyHooks = {},
): Promise<ApplyResult> {
  if (action.kind === "ignore") return { applied: false, reason: "ignored" };

  if (action.kind === "refunded") {
    // Whether a refund also ends access is a human call (goodwill vs. churn).
    await hooks.flagForReview?.(
      `refund ${action.full ? "full" : "partial"} ${action.amountRefundedMinor} on ${action.chargeId}: review plan access`,
      null,
    );
    return { applied: true, kind: "refunded", userId: null };
  }

  const owner = await resolveSubscriptionOwner(db, stripe, action.subscriptionId);
  if (!owner) {
    await hooks.flagForReview?.(`${action.kind}: no local owner for subscription ${action.subscriptionId}`, null);
    return { applied: false, reason: "unknown subscription" };
  }

  switch (action.kind) {
    case "renew": {
      // Setting (not adding) the end date makes a replayed event a no-op.
      const end = action.periodEnd;
      if (end) {
        await db.execute(
          `UPDATE users SET planStatus = 'active', planEndsAt = GREATEST(COALESCE(planEndsAt, ?), ?) WHERE id = ?`,
          [end, end, owner.userId],
        );
        if (owner.workspaceId) {
          await db.execute(
            `UPDATE workspaces SET planStatus = 'active', planEndsAt = GREATEST(COALESCE(planEndsAt, ?), ?) WHERE id = ?`,
            [end, end, owner.workspaceId],
          );
        }
      } else {
        await setPlanStatus(db, owner, "active");
      }
      // A receipt row for /settings/account. merchantTradeNo is UNIQUE, so replays are ignored.
      const amount = Math.round(action.amountMinor / 100);
      await db.execute(
        `INSERT IGNORE INTO invoices
           (userId, workspaceId, merchantTradeNo, planCode, amount, amountTwd, billingCycle, packType, currency, status, downloadUrl, paidAt, issuedAt, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'subscription', ?, 'paid', ?, NOW(3), NOW(3), NOW(3))`,
        [
          owner.userId, owner.workspaceId, action.stripeInvoiceId, owner.planCode, amount, amount,
          owner.billingCycle, action.currency.slice(0, 3), action.receiptUrl?.slice(0, 512) ?? null,
        ],
      );
      return { applied: true, kind: "renew", userId: owner.userId };
    }

    case "payment_failed": {
      // Only an active plan can fall past due; never resurrect a canceled one.
      await setPlanStatus(db, owner, "past_due", "active");
      try { await hooks.onPaymentFailed?.(owner.userId); } catch (e) {
        console.warn("[stripeLifecycle] payment-failed notice not sent:", (e as Error)?.message);
      }
      return { applied: true, kind: "payment_failed", userId: owner.userId };
    }

    case "sync": {
      await setCancelFlag(db, owner.userId, action.cancelAtPeriodEnd);
      // Stripe recovered the charge (card updated in the portal).
      if (action.status === "active") await setPlanStatus(db, owner, "active", "past_due");
      return { applied: true, kind: "sync", userId: owner.userId };
    }

    case "ended": {
      // Upgrading replaces the old subscription; its "deleted" event must not
      // end the access the new one just paid for.
      const current = await findCurrentSubscription(db, stripe, owner.userId);
      if (current && current.subscriptionId !== action.subscriptionId) {
        return { applied: true, kind: "ended", userId: owner.userId, note: "superseded by a newer subscription" };
      }
      await setPlanStatus(db, owner, "canceled");
      await setCancelFlag(db, owner.userId, false);
      await disconnectBrandsForOwner(db, { userId: owner.userId, workspaceId: owner.workspaceId });
      return { applied: true, kind: "ended", userId: owner.userId };
    }
  }
}

/**
 * 「取消訂閱」/「恢復訂閱」: flip cancel_at_period_end at Stripe, then mirror it.
 * Stripe goes first — if it refuses, our records must not claim the card is safe.
 */
export async function setCancelAtPeriodEnd(
  db: Db,
  stripe: StripeLike,
  userId: number,
  cancel: boolean,
): Promise<{ hasSubscription: boolean; periodEnd: Date | null }> {
  const current = await findCurrentSubscription(db, stripe, userId);
  if (!current) return { hasSubscription: false, periodEnd: null };
  const sub = await stripe.subscriptions.update(current.subscriptionId, { cancel_at_period_end: cancel });
  const periodEnd = subscriptionPeriodEnd(sub);
  await setCancelFlag(db, userId, cancel);
  if (periodEnd) {
    // The first checkout credited a flat 30/365 days; this is the real boundary.
    await db.execute(`UPDATE users SET planEndsAt = ? WHERE id = ? AND planStatus = 'active'`, [periodEnd, userId]);
  }
  return { hasSubscription: true, periodEnd };
}

/** Stop billing now (account deletion, or the old plan after an upgrade). */
export async function cancelSubscriptionNow(stripe: StripeLike, subscriptionId: string): Promise<void> {
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  if (sub?.status === "canceled" || sub?.status === "incomplete_expired") return;
  await stripe.subscriptions.cancel(subscriptionId);
}
