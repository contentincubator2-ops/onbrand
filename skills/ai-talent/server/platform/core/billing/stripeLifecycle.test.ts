/**
 * 訂閱在第一次付款之後會發生的事：續約、扣款失敗、取消、退款。
 * 用假的 Stripe 與假的資料庫，檢查每個事件最後寫進我們紀錄的結果。
 */
import { describe, expect, it } from "vitest";
import {
  applyLifecycleAction, cancelSubscriptionNow, classifyStripeEvent,
  findCurrentSubscription, setCancelAtPeriodEnd, type StripeLike,
} from "./stripeLifecycle";

const PERIOD_END = 1_800_000_000; // unix seconds

/** 一位用戶（id 7）、一張已付款的結帳單 cs_1 → 訂閱 sub_1。 */
function world(opts: { paidSessions?: Array<{ id: number; session: string; sub: string }> } = {}) {
  const paid = opts.paidSessions ?? [{ id: 10, session: "cs_1", sub: "sub_1" }];
  const user = { id: 7, planStatus: "active", planEndsAt: null as Date | null, cancelAtPeriodEnd: 0 };
  const receipts: string[] = [];
  const calls: string[] = [];

  const db = {
    async execute(sql: string, params: any[] = []) {
      const q = sql.replace(/\s+/g, " ").trim();
      if (q.startsWith("SELECT userId, workspaceId, planCode, billingCycle FROM invoices")) {
        const hit = paid.find((p) => p.session === params[0]);
        return [hit ? [{ userId: 7, workspaceId: null, planCode: "drop_pro", billingCycle: "monthly" }] : []];
      }
      if (q.startsWith("SELECT merchantTradeNo FROM invoices")) {
        const rows = paid.filter((p) => p.id < params[1]).sort((a, b) => b.id - a.id);
        return [rows.slice(0, 1).map((p) => ({ merchantTradeNo: p.session }))];
      }
      if (q.startsWith("UPDATE users SET cancelAtPeriodEnd")) { user.cancelAtPeriodEnd = params[0]; return [{}]; }
      if (q.startsWith("UPDATE users SET planStatus = 'active', planEndsAt")) {
        user.planStatus = "active";
        const end: Date = params[0];
        user.planEndsAt = user.planEndsAt && user.planEndsAt > end ? user.planEndsAt : end;
        return [{}];
      }
      if (q.startsWith("UPDATE users SET planStatus = ?")) {
        const [status, , onlyFrom] = params;
        if (!onlyFrom || user.planStatus === onlyFrom) user.planStatus = status;
        return [{}];
      }
      if (q.startsWith("UPDATE users SET planEndsAt")) { user.planEndsAt = params[0]; return [{}]; }
      if (q.startsWith("INSERT IGNORE INTO invoices")) {
        if (!receipts.includes(params[2])) receipts.push(params[2]);
        return [{}];
      }
      throw new Error(`unexpected SQL: ${q}`);
    },
  };

  const subs: Record<string, any> = {};
  for (const p of paid) subs[p.sub] = { id: p.sub, status: "active", cancel_at_period_end: false, current_period_end: PERIOD_END, metadata: {} };

  const stripe: StripeLike = {
    checkout: {
      sessions: {
        async retrieve(id) {
          const hit = paid.find((p) => p.session === id);
          return { id, subscription: hit?.sub ?? null, customer: "cus_1" };
        },
        async list({ subscription }) {
          return { data: paid.filter((p) => p.sub === subscription).map((p) => ({ id: p.session })) };
        },
      },
    },
    subscriptions: {
      async retrieve(id) { return subs[id] ?? { id, metadata: {} }; },
      async update(id, params) { calls.push(`update:${id}:${params.cancel_at_period_end}`); Object.assign(subs[id], params); return subs[id]; },
      async cancel(id) { calls.push(`cancel:${id}`); subs[id].status = "canceled"; return subs[id]; },
    },
  };
  return { db, stripe, user, receipts, calls, subs };
}

const ev = (type: string, object: any) => ({ type, data: { object } });
const renewal = (id = "in_2") => ev("invoice.paid", {
  id, subscription: "sub_1", billing_reason: "subscription_cycle", amount_paid: 900000, currency: "twd",
  hosted_invoice_url: "https://stripe.example/in_2", lines: { data: [{ period: { end: PERIOD_END } }] },
});

describe("classifyStripeEvent", () => {
  it("第一期的 invoice 由結帳完成事件處理，這裡不重複加天數", () => {
    expect(classifyStripeEvent(ev("invoice.paid", { id: "in_1", subscription: "sub_1", billing_reason: "subscription_create" })).kind).toBe("ignore");
  });

  it("續約 invoice 帶出訂閱、期末與金額", () => {
    expect(classifyStripeEvent(renewal())).toEqual({
      kind: "renew", subscriptionId: "sub_1", stripeInvoiceId: "in_2",
      periodEnd: new Date(PERIOD_END * 1000), amountMinor: 900000, currency: "TWD",
      receiptUrl: "https://stripe.example/in_2",
    });
  });

  it("新版 API 把訂閱放在 parent.subscription_details 也讀得到", () => {
    const a = classifyStripeEvent(ev("invoice.payment_failed", {
      id: "in_3", billing_reason: "subscription_cycle", parent: { subscription_details: { subscription: "sub_1" } },
    }));
    expect(a).toEqual({ kind: "payment_failed", subscriptionId: "sub_1", stripeInvoiceId: "in_3" });
  });

  it("首次扣款失敗不動任何方案", () => {
    expect(classifyStripeEvent(ev("invoice.payment_failed", { id: "in_1", subscription: "sub_1", billing_reason: "subscription_create" })).kind).toBe("ignore");
  });

  it("不認得的事件一律忽略", () => {
    expect(classifyStripeEvent(ev("customer.created", { id: "cus_1" })).kind).toBe("ignore");
  });
});

describe("applyLifecycleAction", () => {
  it("續約把到期日設成 Stripe 的期末，重送同一事件結果不變", async () => {
    const w = world();
    for (let i = 0; i < 2; i++) await applyLifecycleAction(w.db, w.stripe, classifyStripeEvent(renewal()));
    expect(w.user.planEndsAt).toEqual(new Date(PERIOD_END * 1000));
    expect(w.user.planStatus).toBe("active");
    expect(w.receipts).toEqual(["in_2"]);
  });

  it("續約不會把比較晚的到期日往回拉", async () => {
    const w = world();
    const later = new Date((PERIOD_END + 86400) * 1000);
    w.user.planEndsAt = later;
    await applyLifecycleAction(w.db, w.stripe, classifyStripeEvent(renewal()));
    expect(w.user.planEndsAt).toEqual(later);
  });

  it("扣款失敗 → past_due 並通知用戶；之後扣款成功 → 回到 active", async () => {
    const w = world();
    const notified: number[] = [];
    await applyLifecycleAction(
      w.db, w.stripe,
      classifyStripeEvent(ev("invoice.payment_failed", { id: "in_2", subscription: "sub_1", billing_reason: "subscription_cycle" })),
      { onPaymentFailed: async (id) => { notified.push(id); } },
    );
    expect(w.user.planStatus).toBe("past_due");
    expect(notified).toEqual([7]);

    await applyLifecycleAction(w.db, w.stripe, classifyStripeEvent(renewal()));
    expect(w.user.planStatus).toBe("active");
  });

  it("通知信寄不出去不影響狀態更新", async () => {
    const w = world();
    const r = await applyLifecycleAction(
      w.db, w.stripe,
      classifyStripeEvent(ev("invoice.payment_failed", { id: "in_2", subscription: "sub_1", billing_reason: "subscription_cycle" })),
      { onPaymentFailed: async () => { throw new Error("smtp down"); } },
    );
    expect(r).toMatchObject({ applied: true });
    expect(w.user.planStatus).toBe("past_due");
  });

  it("已結束的方案不會被扣款失敗事件改成 past_due", async () => {
    const w = world();
    w.user.planStatus = "canceled";
    await applyLifecycleAction(w.db, w.stripe, { kind: "payment_failed", subscriptionId: "sub_1", stripeInvoiceId: "in_2" });
    expect(w.user.planStatus).toBe("canceled");
  });

  it("在 Stripe 後台排定取消 → 同步旗標，方案仍是 active", async () => {
    const w = world();
    await applyLifecycleAction(w.db, w.stripe, classifyStripeEvent(
      ev("customer.subscription.updated", { id: "sub_1", status: "active", cancel_at_period_end: true, current_period_end: PERIOD_END }),
    ));
    expect(w.user).toMatchObject({ planStatus: "active", cancelAtPeriodEnd: 1 });
  });

  it("訂閱真的結束 → canceled", async () => {
    const w = world();
    w.user.cancelAtPeriodEnd = 1;
    await applyLifecycleAction(w.db, w.stripe, classifyStripeEvent(ev("customer.subscription.deleted", { id: "sub_1" })));
    expect(w.user).toMatchObject({ planStatus: "canceled", cancelAtPeriodEnd: 0 });
  });

  it("升級後舊訂閱的結束事件，不會把新方案關掉", async () => {
    const w = world({ paidSessions: [{ id: 10, session: "cs_1", sub: "sub_1" }, { id: 11, session: "cs_2", sub: "sub_2" }] });
    const r = await applyLifecycleAction(w.db, w.stripe, classifyStripeEvent(ev("customer.subscription.deleted", { id: "sub_1" })));
    expect(r).toMatchObject({ applied: true, note: "superseded by a newer subscription" });
    expect(w.user.planStatus).toBe("active");
  });

  it("找不到對應用戶的訂閱 → 不改資料，留給人工", async () => {
    const w = world();
    const flagged: string[] = [];
    const r = await applyLifecycleAction(
      w.db, w.stripe, { kind: "ended", subscriptionId: "sub_unknown" },
      { flagForReview: async (reason) => { flagged.push(reason); } },
    );
    expect(r).toEqual({ applied: false, reason: "unknown subscription" });
    expect(flagged).toHaveLength(1);
    expect(w.user.planStatus).toBe("active");
  });

  it("沒有結帳單可回查時，改用訂閱上的 metadata 找用戶", async () => {
    const w = world();
    w.subs.sub_meta = { id: "sub_meta", metadata: { userId: "7", planCode: "drop_starter", billingCycle: "annual" } };
    await applyLifecycleAction(w.db, w.stripe, { kind: "payment_failed", subscriptionId: "sub_meta", stripeInvoiceId: "in_9" });
    expect(w.user.planStatus).toBe("past_due");
  });

  it("退款只留紀錄給人工，不自動動方案", async () => {
    const w = world();
    const flagged: string[] = [];
    await applyLifecycleAction(
      w.db, w.stripe,
      classifyStripeEvent(ev("charge.refunded", { id: "ch_1", amount_refunded: 900000, refunded: true })),
      { flagForReview: async (reason) => { flagged.push(reason); } },
    );
    expect(flagged[0]).toContain("refund full 900000 on ch_1");
    expect(w.user.planStatus).toBe("active");
  });
});

describe("取消與恢復訂閱", () => {
  it("取消：先叫 Stripe 停止續扣，方案留到期末", async () => {
    const w = world();
    const out = await setCancelAtPeriodEnd(w.db, w.stripe, 7, true);
    expect(w.calls).toEqual(["update:sub_1:true"]);
    expect(out).toEqual({ hasSubscription: true, periodEnd: new Date(PERIOD_END * 1000) });
    expect(w.user).toMatchObject({ planStatus: "active", cancelAtPeriodEnd: 1, planEndsAt: new Date(PERIOD_END * 1000) });
  });

  it("Stripe 拒絕時，我們的紀錄不能顯示已取消", async () => {
    const w = world();
    w.stripe.subscriptions.update = async () => { throw new Error("stripe down"); };
    await expect(setCancelAtPeriodEnd(w.db, w.stripe, 7, true)).rejects.toThrow("stripe down");
    expect(w.user.cancelAtPeriodEnd).toBe(0);
  });

  it("恢復：把續扣開回來", async () => {
    const w = world();
    await setCancelAtPeriodEnd(w.db, w.stripe, 7, true);
    await setCancelAtPeriodEnd(w.db, w.stripe, 7, false);
    expect(w.calls).toEqual(["update:sub_1:true", "update:sub_1:false"]);
    expect(w.user.cancelAtPeriodEnd).toBe(0);
  });

  it("沒有 Stripe 訂閱的帳號（贈送方案）不呼叫 Stripe", async () => {
    const w = world({ paidSessions: [] });
    expect(await setCancelAtPeriodEnd(w.db, w.stripe, 7, true)).toEqual({ hasSubscription: false, periodEnd: null });
    expect(w.calls).toEqual([]);
  });

  it("升級時只回查這張結帳單之前的訂閱", async () => {
    const w = world({ paidSessions: [{ id: 10, session: "cs_1", sub: "sub_1" }, { id: 11, session: "cs_2", sub: "sub_2" }] });
    expect((await findCurrentSubscription(w.db, w.stripe, 7, { beforeInvoiceId: 11 }))?.subscriptionId).toBe("sub_1");
    expect((await findCurrentSubscription(w.db, w.stripe, 7))?.subscriptionId).toBe("sub_2");
  });

  it("立即取消：已經結束的訂閱不再呼叫一次", async () => {
    const w = world();
    await cancelSubscriptionNow(w.stripe, "sub_1");
    await cancelSubscriptionNow(w.stripe, "sub_1");
    expect(w.calls).toEqual(["cancel:sub_1"]);
  });
});
