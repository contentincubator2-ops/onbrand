import { describe, expect, it } from "vitest";
import { friendlyPublishError } from "./publishErrors";

describe("friendlyPublishError", () => {
  it("never leaks raw provider JSON", () => {
    const out = friendlyPublishError(new Error('zernio 400: {"message":"Aspect ratio 1:1 not allowed for REEL","code":"X"}'));
    expect(out).not.toMatch(/[{}]/);
    expect(out).toMatch(/比例/);
  });
  it("maps auth, rate limit, timeout and 5xx to actionable text", () => {
    expect(friendlyPublishError("zernio 401: invalid token")).toMatch(/重新連接/);
    expect(friendlyPublishError("zernio 429: too many requests")).toMatch(/稍後/);
    expect(friendlyPublishError(new Error("The operation was aborted due to timeout"))).toMatch(/逾時/);
    expect(friendlyPublishError("zernio 502: bad gateway")).toMatch(/暫時異常/);
  });
  it.each(["zernio 402: permission denied", "payment_required", "FREE_TIER_EXCEEDED", "analytics_addon_required"])("explains plan activation before auth errors: %s", raw => {
    const result = friendlyPublishError(raw);
    expect(result).toBe("發布服務的方案尚未開通這項功能（需要在 Zernio 綁定付款方式），請聯絡 sowork@sowork.ai。 / The publishing service plan does not include this feature yet (a payment method is required on Zernio). Contact sowork@sowork.ai.");
    expect(friendlyPublishError(result)).toBe(result);
  });
  it("passes already-friendly Chinese messages through untouched (idempotent)", () => {
    const msg = "這篇還沒核准。請先送審並核准，核准後才能發布";
    expect(friendlyPublishError(msg)).toBe(msg);
    const once = friendlyPublishError("zernio 429: x");
    expect(friendlyPublishError(once)).toBe(once);
  });
  it("falls back to a short readable sentence for unknown errors", () => {
    expect(friendlyPublishError('weird {"a":1}')).toMatch(/^發布失敗：weird/);
    expect(friendlyPublishError("")).toMatch(/發布失敗/);
  });
});
