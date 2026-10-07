import { describe, expect, it } from "vitest";
import {
  APPROVAL_TOKEN_RE, approvalLinkState, approvalProgress, asDecision, cleanAuthorName, createWriteLimiter,
  decisionAfterEdit, eventKindForDecision, newApprovalToken, normalizeApprovalPlatform, sameCaption,
} from "./approvalLink";

describe("approvalLink", () => {
  it("token 夠長、網址安全、每次不同", () => {
    const a = newApprovalToken(), b = newApprovalToken();
    expect(a).toMatch(APPROVAL_TOKEN_RE);
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(a).not.toBe(b);
  });

  it("連結狀態：撤銷優先於到期", () => {
    const now = new Date("2026-10-07T00:00:00Z");
    expect(approvalLinkState({ expiresAt: "2026-10-08T00:00:00Z", revokedAt: null }, now)).toBe("active");
    expect(approvalLinkState({ expiresAt: "2026-10-06T00:00:00Z", revokedAt: null }, now)).toBe("expired");
    expect(approvalLinkState({ expiresAt: "2026-10-08T00:00:00Z", revokedAt: "2026-10-01T00:00:00Z" }, now)).toBe("revoked");
    expect(approvalLinkState({ expiresAt: new Date("2026-10-07T00:00:00Z"), revokedAt: null }, now)).toBe("expired");
  });

  it("進度：核准／要修改／還沒看，加起來等於總數", () => {
    const p = approvalProgress([{ decision: "approved" }, { decision: "changes_requested" }, { decision: "pending" }, { decision: null }, {}]);
    expect(p).toEqual({ total: 5, approved: 1, changes: 1, pending: 3 });
  });

  it("客戶自己改不動狀態；團隊改一律回到待確認", () => {
    expect(decisionAfterEdit("approved", "client")).toBe("approved");
    expect(decisionAfterEdit("changes_requested", "client")).toBe("changes_requested");
    expect(decisionAfterEdit("approved", "team")).toBe("pending");
    expect(decisionAfterEdit("changes_requested", "team")).toBe("pending");
    expect(decisionAfterEdit("pending", "team")).toBe("pending");
  });

  it("認不得的決定一律當成待確認", () => {
    expect(asDecision("approved")).toBe("approved");
    expect(asDecision("changes_requested")).toBe("changes_requested");
    expect(asDecision("whatever")).toBe("pending");
    expect(asDecision(null)).toBe("pending");
    expect(eventKindForDecision("pending")).toBe("reopened");
    expect(eventKindForDecision("approved")).toBe("approved");
  });

  it("名字：壓成單行、去控制字元、空的不收", () => {
    expect(cleanAuthorName("  王小明\n")).toBe("王小明");
    expect(cleanAuthorName("A\u0000B\tC")).toBe("A B C");
    expect(cleanAuthorName("   ")).toBeNull();
    expect(cleanAuthorName(42)).toBeNull();
    expect(cleanAuthorName("x".repeat(200))!.length).toBe(40);
  });

  it("比對起始版本：只忽略換行寫法與結尾空白", () => {
    expect(sameCaption("a\r\nb", "a\nb")).toBe(true);
    expect(sameCaption("a\nb  \n", "a\nb")).toBe(true);
    expect(sameCaption("a b", "a  b")).toBe(false);
    expect(sameCaption("新品上市", "新品上市！")).toBe(false);
  });

  it("平台代號收成一種寫法", () => {
    expect(normalizeApprovalPlatform("fb")).toBe("facebook");
    expect(normalizeApprovalPlatform("IG")).toBe("instagram");
    expect(normalizeApprovalPlatform("threads")).toBe("threads");
    expect(normalizeApprovalPlatform("generic")).toBe("other");
    expect(normalizeApprovalPlatform(null)).toBe("other");
  });

  it("節流：超過上限就擋，時間過了再放行，不同連結互不影響", () => {
    const lim = createWriteLimiter(2, 1000);
    expect(lim.allow("a", 0)).toBe(true);
    expect(lim.allow("a", 10)).toBe(true);
    expect(lim.allow("a", 20)).toBe(false);
    expect(lim.allow("b", 20)).toBe(true);
    expect(lim.allow("a", 1011)).toBe(true);
  });
});
