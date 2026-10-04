/**
 * 交易信件：每一封寄給誰、主旨與內文有沒有帶到該帶的資訊，
 * 以及用戶可控的字串（姓名、團隊名）有做 HTML 跳脫。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  sendPaymentFailed, sendSubscriptionCanceled, sendWelcome, sendWorkspaceInvite,
} from "./emailService";

let sent: Array<{ to: string; subject: string; html: string }>;

beforeEach(() => {
  sent = [];
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("OUTBOUND_EMAIL_ENABLED", "true");
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: any) => {
    sent.push(JSON.parse(init.body));
    return { ok: true, text: async () => "" };
  }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("交易信件", () => {
  it("扣款失敗：帶更新付款方式的連結", async () => {
    await sendPaymentFailed({ to: "a@x.co", name: "小明", accountUrl: "https://app/settings/account" });
    expect(sent[0]).toMatchObject({ to: "a@x.co", subject: expect.stringContaining("扣款未成功") });
    expect(sent[0].html).toContain('href="https://app/settings/account"');
    expect(sent[0].html).toContain("更新付款方式");
  });

  it("歡迎信：導向建立品牌", async () => {
    await sendWelcome({ to: "a@x.co", name: "小明", appUrl: "https://app" });
    expect(sent[0].subject).toContain("帳號已開通");
    expect(sent[0].html).toContain("建立第一個品牌");
  });

  it("邀請信：寫出邀請人、團隊名與角色", async () => {
    await sendWorkspaceInvite({
      to: "b@x.co", name: "小華", inviterName: "CJ", workspaceName: "摘星", roleLabel: "Editor", appUrl: "https://app",
    });
    expect(sent[0].subject).toBe("CJ 邀請您加入「摘星」 - onBrand Studio");
    expect(sent[0].html).toContain("<strong>Editor</strong>");
  });

  it("取消確認：有到期日就寫日期，沒有就寫當期到期前", async () => {
    await sendSubscriptionCanceled({ to: "a@x.co", name: "小明", endsOn: "2026年11月30日", accountUrl: "https://app/a" });
    await sendSubscriptionCanceled({ to: "a@x.co", name: "小明", endsOn: null, accountUrl: "https://app/a" });
    expect(sent[0].html).toContain("<strong>2026年11月30日</strong> 之前仍可照常使用");
    expect(sent[1].html).toContain("當期到期前仍可照常使用");
    expect(sent[1].html).toContain("不會再扣款");
  });

  it("姓名與團隊名裡的 HTML 會被跳脫", async () => {
    await sendWorkspaceInvite({
      to: "b@x.co", name: "<b>x</b>", inviterName: "A&B", workspaceName: "<script>1</script>", roleLabel: "Viewer", appUrl: "https://app",
    });
    expect(sent[0].html).not.toContain("<script>");
    expect(sent[0].html).toContain("&lt;script&gt;1&lt;/script&gt;");
    expect(sent[0].html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(sent[0].html).toContain("A&amp;B");
  });
});
