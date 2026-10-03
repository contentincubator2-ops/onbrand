import { describe, expect, it } from "vitest";
import { friendlyPublishError } from "./publishErrors";

describe("friendlyPublishError", () => {
  it("never leaks raw provider JSON", () => {
    const out = friendlyPublishError(new Error('bundle.social 400: {"message":"Aspect ratio 1:1 not allowed for REEL","code":"X"}'));
    expect(out).not.toMatch(/[{}]/);
    expect(out).toMatch(/比例/);
  });
  it("maps auth, rate limit, timeout and 5xx to actionable text", () => {
    expect(friendlyPublishError("bundle.social 401: invalid token")).toMatch(/重新連接/);
    expect(friendlyPublishError("bundle.social 429: too many requests")).toMatch(/稍後/);
    expect(friendlyPublishError(new Error("The operation was aborted due to timeout"))).toMatch(/逾時/);
    expect(friendlyPublishError("bundle.social 502: bad gateway")).toMatch(/暫時異常/);
  });
  it("passes already-friendly Chinese messages through untouched (idempotent)", () => {
    const msg = "這篇還沒核准。請先送審並核准，核准後才能發布";
    expect(friendlyPublishError(msg)).toBe(msg);
    const once = friendlyPublishError("bundle.social 429: x");
    expect(friendlyPublishError(once)).toBe(once);
  });
  it("falls back to a short readable sentence for unknown errors", () => {
    expect(friendlyPublishError('weird {"a":1}')).toMatch(/^發布失敗：weird/);
    expect(friendlyPublishError("")).toMatch(/發布失敗/);
  });
});
