/**
 * ecpayRouter — 綠界 (ECPay) credit-card subscription + 電子發票 scaffold.
 *
 * 2026-05-11 (CJ「金流明天串」+「4 個 P0 都要完成」). Phase 1 = scaffold.
 *
 * ─── Flow ──────────────────────────────────────────────────
 *   1. Frontend calls `ecpay.createCheckout` with { planCode, workspaceId,
 *      annual? }. Server builds the redirect form params, computes
 *      CheckMacValue, returns the URL + params.
 *   2. Frontend renders an auto-submit <form action={url}> POST'ing the
 *      params (ECPay requires POST form, not GET).
 *   3. User pays on ECPay hosted checkout.
 *   4. ECPay POSTs the result to /api/ecpay/callback with CheckMacValue.
 *      `verifyAndProcess` checks the hash + idempotently updates the
 *      workspace's planCode + planEndsAt + records to `invoices` table.
 *   5. 電子發票 auto-fires via ECPay's invoicing module (configured in
 *      the ECPay dashboard, no extra code).
 *
 * ─── ENV required (CJ to set on VM .env) ───────────────────
 *   ECPAY_MERCHANT_ID      — e.g. 3002607 (stage) / your prod ID
 *   ECPAY_HASH_KEY         — provided by 綠界
 *   ECPAY_HASH_IV          — provided by 綠界
 *   ECPAY_API_BASE         — https://payment-stage.ecpay.com.tw (stage)
 *                            https://payment.ecpay.com.tw (prod)
 *   APP_URL                — https://drop.sowork.ai
 *
 * ─── Idempotency ───────────────────────────────────────────
 * The callback endpoint may fire multiple times for the same MerchantTradeNo.
 * We use `invoices.merchantTradeNo` as the dedupe key — second + N attempts
 * become noops.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import * as crypto from "crypto";

const PLAN_TO_AMOUNT: Record<string, { monthly: number; annual: number }> = {
  drop_pro:    { monthly: 990,   annual: 9900   },
  drop_team:   { monthly: 4990,  annual: 49900  },
  drop_agency: { monthly: 14990, annual: 149900 },
};

export const ecpayRouter = router({
  /**
   * Build an ECPay AioCheckout redirect. Returns { actionUrl, fields }.
   * Frontend renders an auto-submitting hidden form with these fields.
   */
  createCheckout: protectedProcedure
    .input(z.object({
      planCode: z.enum(["drop_pro", "drop_team", "drop_agency"]),
      workspaceId: z.number().int().positive(),
      annual: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const env = process.env;
      const merchantId = env.ECPAY_MERCHANT_ID;
      const hashKey    = env.ECPAY_HASH_KEY;
      const hashIv     = env.ECPAY_HASH_IV;
      const apiBase    = env.ECPAY_API_BASE ?? "https://payment-stage.ecpay.com.tw";
      const appUrl     = env.APP_URL ?? "https://drop.sowork.ai";
      if (!merchantId || !hashKey || !hashIv) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "綠界尚未設定。請在 VM .env 加 ECPAY_MERCHANT_ID / ECPAY_HASH_KEY / ECPAY_HASH_IV。",
        });
      }

      // Verify workspace ownership.
      const { default: localPool } = await import("../localDb");
      const [wRows]: any = await localPool.execute(
        `SELECT id, name FROM workspaces WHERE id = ? AND ownerUserId = ? LIMIT 1`,
        [input.workspaceId, ctx.user.id],
      );
      if (!(wRows as any[])[0]) {
        throw new TRPCError({ code: "FORBIDDEN", message: "只有 workspace owner 可以訂閱" });
      }

      const amount = PLAN_TO_AMOUNT[input.planCode]?.[input.annual ? "annual" : "monthly"];
      if (!amount) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown plan" });

      // MerchantTradeNo must be unique per shop, max 20 chars alphanumeric.
      const tradeNo = `D${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`.slice(0, 20);
      const tradeDate = new Date().toLocaleString("zh-TW", {
        timeZone: "Asia/Taipei",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false,
      }).replace(/\//g, "/").replace(",", "");

      // Record pending invoice. We update planCode + planEndsAt only on callback success.
      await localPool.execute(
        `INSERT INTO invoices (userId, workspaceId, merchantTradeNo, planCode, amount, billingCycle, status, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW(3))
         ON DUPLICATE KEY UPDATE status = 'pending'`,
        [ctx.user.id, input.workspaceId, tradeNo, input.planCode, amount, input.annual ? "annual" : "monthly"],
      );

      // Build ECPay params per their AIO checkout spec.
      const params: Record<string, string> = {
        MerchantID:        merchantId,
        MerchantTradeNo:   tradeNo,
        MerchantTradeDate: tradeDate,
        PaymentType:       "aio",
        TotalAmount:       String(amount),
        TradeDesc:         encodeURIComponent(`Drop ${input.planCode} ${input.annual ? "年繳" : "月繳"}`),
        ItemName:          `Drop ${input.planCode} 訂閱`,
        ReturnURL:         `${appUrl}/api/ecpay/callback`,
        ClientBackURL:     `${appUrl}/settings/account?plan=${input.planCode}`,
        OrderResultURL:    `${appUrl}/settings/account?paid=1`,
        ChoosePayment:     "Credit",
        EncryptType:       "1",
      };
      params.CheckMacValue = computeCheckMacValue(params, hashKey, hashIv);
      return {
        actionUrl: `${apiBase}/Cashier/AioCheckOut/V5`,
        fields: params,
      };
    }),

  /** Read status of a tradeNo (frontend polls after redirect). */
  getInvoiceStatus: protectedProcedure
    .input(z.object({ merchantTradeNo: z.string().min(1).max(32) }))
    .query(async ({ ctx, input }) => {
      const { default: localPool } = await import("../localDb");
      const [rows]: any = await localPool.execute(
        `SELECT status, planCode, amount, billingCycle, paidAt
         FROM invoices
         WHERE merchantTradeNo = ? AND userId = ? LIMIT 1`,
        [input.merchantTradeNo, ctx.user.id],
      );
      return (rows as any[])[0] ?? null;
    }),
});

/**
 * Verify + process an ECPay callback POST. Called from express.ts route
 * (not via tRPC because ECPay POSTs application/x-www-form-urlencoded).
 *
 * Returns the plain string "1|OK" that ECPay expects on success, or
 * "0|ErrorMessage" on failure.
 */
export async function verifyAndProcess(body: Record<string, string>): Promise<string> {
  const env = process.env;
  const hashKey = env.ECPAY_HASH_KEY;
  const hashIv  = env.ECPAY_HASH_IV;
  if (!hashKey || !hashIv) return "0|ECPay not configured";

  const incomingMac = body.CheckMacValue;
  if (!incomingMac) return "0|Missing CheckMacValue";
  // Recompute hash from all fields except CheckMacValue itself.
  const { CheckMacValue: _drop, ...rest } = body;
  const computed = computeCheckMacValue(rest, hashKey, hashIv);
  if (computed !== incomingMac) return "0|CheckMacValue mismatch";

  const tradeNo = body.MerchantTradeNo ?? "";
  if (!tradeNo) return "0|Missing trade number";
  const status  = body.RtnCode === "1" ? "paid" : "failed";

  const { default: localPool } = await import("../localDb");
  // Idempotent — second callback for same tradeNo no-ops if already paid.
  const [inv]: any = await localPool.execute(
    `SELECT id, userId, workspaceId, planCode, billingCycle, status
     FROM invoices WHERE merchantTradeNo = ? LIMIT 1`,
    [tradeNo],
  );
  const invoice = (inv as any[])[0];
  if (!invoice) return "0|Unknown trade";
  if (invoice.status === "paid") return "1|OK";

  await localPool.execute(
    `UPDATE invoices SET status = ?, paidAt = NOW(3), rawPayload = ? WHERE id = ?`,
    [status, JSON.stringify(body), invoice.id],
  );

  if (status === "paid") {
    // Extend the workspace's planEndsAt.
    const isAnnual = invoice.billingCycle === "annual";
    const days = isAnnual ? 365 : 30;
    await localPool.execute(
      `UPDATE workspaces
       SET planCode = ?, planStatus = 'active',
           planEndsAt = GREATEST(COALESCE(planEndsAt, NOW(3)), NOW(3)) + INTERVAL ? DAY
       WHERE id = ?`,
      [invoice.planCode, days, invoice.workspaceId],
    );
  }
  return "1|OK";
}

/**
 * ECPay's CheckMacValue algorithm (per 全方位金流 V5 docs):
 *   1. Sort params alphabetically by key (case-insensitive)
 *   2. Concat as HashKey=...&k1=v1&...&kN=vN&HashIV=...
 *   3. URL-encode the whole thing (urlencode like .NET HttpUtility)
 *   4. Lowercase
 *   5. SHA-256
 *   6. Uppercase the hex digest
 */
function computeCheckMacValue(params: Record<string, string>, hashKey: string, hashIv: string): string {
  const sorted = Object.keys(params).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const pairs  = sorted.map((k) => `${k}=${params[k]}`).join("&");
  const raw    = `HashKey=${hashKey}&${pairs}&HashIV=${hashIv}`;
  const encoded = encodeECPay(raw).toLowerCase();
  return crypto.createHash("sha256").update(encoded).digest("hex").toUpperCase();
}

/** .NET HttpUtility.UrlEncode behaviour — ECPay spec quirk. */
function encodeECPay(s: string): string {
  return encodeURIComponent(s)
    .replace(/%20/g, "+")
    .replace(/'/g, "%27")
    .replace(/!/g, "%21")
    .replace(/\*/g, "%2A")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}
