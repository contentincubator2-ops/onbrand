/**
 * router 建得起來、procedure 名字沒撞 tRPC 保留字（見 project_trpc_reserved_words），
 * 以及正式站金鑰防護。
 */
import { describe, expect, it } from "vitest";
import { stripeKeyAllowed, stripeRouter } from "./stripeRouter";
import { billingRouter } from "./billingRouter";

describe("stripeRouter / billingRouter", () => {
  it("建得起來，付款相關 procedure 都在", () => {
    expect(Object.keys((stripeRouter as any)._def.procedures).sort())
      .toEqual(["createCheckout", "createPortalSession", "getInvoiceStatus"]);
    const billing = Object.keys((billingRouter as any)._def.procedures);
    expect(billing).toEqual(expect.arrayContaining(["cancelSubscription", "resumeSubscription", "deleteAccount"]));
  });

  it("procedure 名稱不可以撞 Function.prototype 上的東西", () => {
    for (const r of [stripeRouter, billingRouter]) {
      for (const n of Object.keys((r as any)._def.procedures)) {
        expect(Object.getOwnPropertyNames(Function.prototype), `「${n}」tRPC 會拒絕`).not.toContain(n);
      }
    }
  });
});

describe("stripeKeyAllowed", () => {
  it("沒開 STRIPE_REQUIRE_LIVE 時測試金鑰可用（dev 站）", () => {
    expect(stripeKeyAllowed("sk_test_abc", undefined)).toBe(true);
    expect(stripeKeyAllowed("sk_test_abc", "false")).toBe(true);
  });

  it("開了之後只接受正式金鑰", () => {
    expect(stripeKeyAllowed("sk_test_abc", "true")).toBe(false);
    expect(stripeKeyAllowed("rk_test_abc", "1")).toBe(false);
    expect(stripeKeyAllowed("sk_live_abc", "true")).toBe(true);
    expect(stripeKeyAllowed("rk_live_abc", "TRUE")).toBe(true);
  });
});
