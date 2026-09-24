/**
 * 這支測的是降轉規則。WhatsApp 的上限是硬的——第 4 顆按鈕、第 21 個字的標題，
 * 都不是顯示不好看，是整則 400 被打回，展場上就是一則訊息憑空消失。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BotMessage } from "./lineBot";
import {
  parseInbound,
  toWhatsAppMessages,
  verifySubscription,
  verifyWhatsAppSignature,
  recipientFields,
  isBsuid,
  bsuidCountry,
  parseIdentityChanges,
} from "./whatsappBot";
import { createHmac } from "node:crypto";

const TO = "886912345678";
const pb = (label: string, data: string) => ({ kind: "postback" as const, label, data });
const uri = (label: string, u: string) => ({ kind: "uri" as const, label, uri: u });

describe("toWhatsAppMessages", () => {
  it("keeps one message per BotMessage, in order", () => {
    const msgs: BotMessage[] = [
      { type: "text", text: "one" },
      { type: "text", text: "two" },
    ];
    const out = toWhatsAppMessages(msgs, TO);
    expect(out).toHaveLength(2);
    expect((out[0] as any).text.body).toBe("one");
    expect((out[1] as any).text.body).toBe("two");
    expect(out.every((m: any) => m.to === TO && m.messaging_product === "whatsapp")).toBe(true);
  });

  it("renders up to three quick replies as buttons", () => {
    const out: any = toWhatsAppMessages(
      [{ type: "text", text: "pick", quickReplies: [pb("A", "a"), pb("B", "b"), pb("C", "c")] }],
      TO,
    )[0];
    expect(out.interactive.type).toBe("button");
    expect(out.interactive.action.buttons).toHaveLength(3);
    expect(out.interactive.action.buttons[0].reply).toEqual({ id: "a", title: "A" });
  });

  it("switches to a list at four replies instead of dropping the fourth", () => {
    const out: any = toWhatsAppMessages(
      [{ type: "text", text: "pick", quickReplies: [pb("A", "a"), pb("B", "b"), pb("C", "c"), pb("D", "d")] }],
      TO,
    )[0];
    expect(out.interactive.type).toBe("list");
    expect(out.interactive.action.sections[0].rows.map((r: any) => r.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("caps a list at ten rows", () => {
    const many = Array.from({ length: 14 }, (_, i) => pb(`Option ${i}`, `o${i}`));
    const out: any = toWhatsAppMessages([{ type: "text", text: "pick", quickReplies: many }], TO)[0];
    expect(out.interactive.action.sections[0].rows).toHaveLength(10);
  });

  it("gives a lone link a real button via cta_url", () => {
    const out: any = toWhatsAppMessages(
      [{ type: "text", text: "your post", quickReplies: [uri("Open", "https://x.test/r/ab12")] }],
      TO,
    )[0];
    expect(out.interactive.type).toBe("cta_url");
    expect(out.interactive.action.parameters.url).toBe("https://x.test/r/ab12");
  });

  it("puts links in the body when reply buttons take the slots", () => {
    // WhatsApp won't render a URL button beside reply buttons, so the link has
    // to survive as text rather than vanish.
    const out: any = toWhatsAppMessages(
      [{ type: "text", text: "your post", quickReplies: [pb("More", "more"), uri("Open", "https://x.test/r/ab12")] }],
      TO,
    )[0];
    expect(out.interactive.type).toBe("button");
    expect(out.interactive.body.text).toContain("https://x.test/r/ab12");
  });

  it("truncates a button title to twenty characters", () => {
    const out: any = toWhatsAppMessages(
      [{ type: "text", text: "pick", quickReplies: [pb("A very long button label that Meta will reject", "a")] }],
      TO,
    )[0];
    const title = out.interactive.action.buttons[0].reply.title;
    expect(title.length).toBeLessThanOrEqual(20);
    expect(title.endsWith("…")).toBe(true);
  });

  it("renders a card as header / body / footer", () => {
    const out: any = toWhatsAppMessages(
      [{
        type: "card",
        card: {
          title: "ExpertHub Starter",
          subtitle: "For teams under 50",
          body: ["NT$1,065 per seat", "Includes onboarding"],
          footnote: "Prices approved by marketing",
          buttons: [pb("Write a post", "write:1"), pb("See details", "detail:1")],
        },
      }],
      TO,
    )[0];
    expect(out.interactive.header.text).toBe("ExpertHub Starter");
    expect(out.interactive.body.text).toContain("NT$1,065 per seat");
    expect(out.interactive.footer.text).toBe("Prices approved by marketing");
    expect(out.interactive.action.buttons).toHaveLength(2);
  });

  it("turns a carousel into one list, since WhatsApp has no carousel", () => {
    const card = (n: string) => ({ title: n, subtitle: `about ${n}`, buttons: [pb("Pick", `pick:${n}`)] });
    const out: any = toWhatsAppMessages([{ type: "carousel", cards: [card("One"), card("Two")] }], TO)[0];
    expect(out.interactive.type).toBe("list");
    expect(out.interactive.action.sections[0].rows).toEqual([
      { id: "pick:One", title: "One", description: "about One" },
      { id: "pick:Two", title: "Two", description: "about Two" },
    ]);
  });

  it("never emits a payload missing the fields Meta requires", () => {
    const msgs: BotMessage[] = [
      { type: "text", text: "plain" },
      { type: "text", text: "buttons", quickReplies: [pb("A", "a")] },
      { type: "card", card: { title: "T", buttons: [uri("Open", "https://x.test")] } },
      { type: "carousel", cards: [{ title: "C", buttons: [] }] },
    ];
    for (const payload of toWhatsAppMessages(msgs, TO) as any[]) {
      expect(payload.messaging_product).toBe("whatsapp");
      expect(payload.to).toBe(TO);
      expect(payload.type).toBeTruthy();
      if (payload.type === "interactive") expect(payload.interactive.body.text.length).toBeGreaterThan(0);
    }
  });
});

describe("parseInbound", () => {
  const wrap = (messages: any[], contacts: any[] = []) => ({
    entry: [{ changes: [{ value: { messages, contacts } }] }],
  });

  it("reads a plain text message with the sender's name", () => {
    const [m] = parseInbound(wrap(
      [{ from: "886912", id: "wamid.1", type: "text", text: { body: "DALLAS" }, timestamp: "1750000000" }],
      [{ wa_id: "886912", profile: { name: "Maria" } }],
    ));
    expect(m).toMatchObject({ from: "886912", text: "DALLAS", postback: null, name: "Maria" });
    expect(m.timestamp).toBe(1750000000000);
  });

  it("reads the id behind a button or list reply", () => {
    const [button] = parseInbound(wrap([{
      from: "1", id: "wamid.2", type: "interactive", timestamp: "1",
      interactive: { type: "button_reply", button_reply: { id: "menu:write", title: "Write a post" } },
    }]));
    expect(button).toMatchObject({ postback: "menu:write", text: "Write a post" });

    const [list] = parseInbound(wrap([{
      from: "1", id: "wamid.3", type: "interactive", timestamp: "1",
      interactive: { type: "list_reply", list_reply: { id: "sol:7", title: "Starter" } },
    }]));
    expect(list.postback).toBe("sol:7");
  });

  it("ignores delivery receipts and unsupported media", () => {
    expect(parseInbound({ entry: [{ changes: [{ value: { statuses: [{ status: "delivered" }] } }] }] })).toEqual([]);
    expect(parseInbound(wrap([{ from: "1", id: "w", type: "image", timestamp: "1", image: {} }]))).toEqual([]);
    expect(parseInbound({})).toEqual([]);
    expect(parseInbound(null)).toEqual([]);
  });

  it("flattens several entries into one list", () => {
    const body = {
      entry: [
        { changes: [{ value: { messages: [{ from: "1", id: "a", type: "text", text: { body: "one" }, timestamp: "1" }] } }] },
        { changes: [{ value: { messages: [{ from: "2", id: "b", type: "text", text: { body: "two" }, timestamp: "1" }] } }] },
      ],
    };
    expect(parseInbound(body).map((m) => m.text)).toEqual(["one", "two"]);
  });
});

describe("verifyWhatsAppSignature", () => {
  const raw = Buffer.from(JSON.stringify({ hello: "world" }));

  beforeEach(() => {
    vi.stubEnv("WHATSAPP_APP_SECRET", "s3cr3t");
  });

  it("accepts a signature made with the app secret", () => {
    const sig = createHmac("sha256", "s3cr3t").update(raw).digest("hex");
    expect(verifyWhatsAppSignature(raw, `sha256=${sig}`)).toBe(true);
  });

  it("rejects a wrong signature, wrong body, or missing header", () => {
    const sig = createHmac("sha256", "s3cr3t").update(raw).digest("hex");
    expect(verifyWhatsAppSignature(Buffer.from("tampered"), `sha256=${sig}`)).toBe(false);
    expect(verifyWhatsAppSignature(raw, "sha256=" + "0".repeat(64))).toBe(false);
    expect(verifyWhatsAppSignature(raw, undefined)).toBe(false);
    expect(verifyWhatsAppSignature(raw, "not-a-signature")).toBe(false);
  });

  it("fails closed when no secret is configured", () => {
    vi.stubEnv("WHATSAPP_APP_SECRET", "");
    const sig = createHmac("sha256", "s3cr3t").update(raw).digest("hex");
    expect(verifyWhatsAppSignature(raw, `sha256=${sig}`)).toBe(false);
  });
});

describe("verifySubscription", () => {
  beforeEach(() => vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "tok"));

  it("echoes the challenge when the token matches", () => {
    expect(verifySubscription({ "hub.mode": "subscribe", "hub.verify_token": "tok", "hub.challenge": "1234" })).toBe("1234");
  });

  it("refuses a wrong token, wrong mode, or unset token", () => {
    expect(verifySubscription({ "hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "1234" })).toBeNull();
    expect(verifySubscription({ "hub.mode": "unsubscribe", "hub.verify_token": "tok", "hub.challenge": "1234" })).toBeNull();
    vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "");
    expect(verifySubscription({ "hub.mode": "subscribe", "hub.verify_token": "", "hub.challenge": "1234" })).toBeNull();
  });
});

// ── BSUID（Meta 2026-09-24 文件）────────────────────────────────────────────
//
// 這一組全部圍繞同一件事：**電話號碼可能不存在。** 使用者啟用 username 之後，
// webhook 裡只保證有 BSUID。整合如果以電話號碼為主鍵，那些人的訊息就處理不了，
// 而文件明說沒有補救措施。

describe("recipientFields", () => {
  it("sends a phone number as `to`", () => {
    expect(recipientFields({ phone: "16505551234" })).toEqual({ to: "16505551234" });
  });

  it("sends a BSUID as `recipient`", () => {
    expect(recipientFields({ bsuid: "US.13491208655302741918" })).toEqual({
      recipient: "US.13491208655302741918",
    });
  });

  // 兩個都帶是刻意的：帶了電話號碼才會繼續在 webhook 裡收到電話號碼。
  it("sends both when both are known", () => {
    expect(recipientFields({ phone: "16505551234", bsuid: "US.134912086553027419" })).toEqual({
      to: "16505551234",
      recipient: "US.134912086553027419",
    });
  });

  it("refuses to build a request with no recipient at all", () => {
    expect(() => recipientFields({})).toThrow(/phone number or a BSUID/);
    expect(() => recipientFields({ phone: null, bsuid: null })).toThrow();
  });

  it("still accepts a bare phone string, so existing callers keep working", () => {
    expect(recipientFields("16505551234")).toEqual({ to: "16505551234" });
  });
});

describe("isBsuid / bsuidCountry", () => {
  it("accepts the documented shapes", () => {
    expect(isBsuid("US.13491208655302741918")).toBe(true);
    expect(isBsuid("TW.ENT.11815799212886844830")).toBe(true);
  });

  it("rejects things that are not BSUIDs", () => {
    expect(isBsuid("16505551234")).toBe(false);      // 電話號碼
    expect(isBsuid("us.123")).toBe(false);           // 國碼要大寫
    expect(isBsuid("USA.123")).toBe(false);          // 兩碼
    expect(isBsuid("US.")).toBe(false);              // 沒有識別碼
    expect(isBsuid(undefined)).toBe(false);
  });

  it("reads the country code, which is the only locale hint when there is no phone number", () => {
    expect(bsuidCountry("TW.13491208655302741918")).toBe("TW");
    expect(bsuidCountry("US.ENT.118157992128868")).toBe("US");
    expect(bsuidCountry("16505551234")).toBeNull();
  });
});

describe("parseInbound with usernames", () => {
  const wrap = (value: any) => ({ entry: [{ changes: [{ value, field: "messages" }] }] });

  it("reads a message from someone whose phone number is not in the payload", () => {
    const [msg] = parseInbound(wrap({
      contacts: [{
        profile: { name: "Sheena Nelson", username: "realsheenanelson" },
        user_id: "US.13491208655302741918",
      }],
      messages: [{
        from_user_id: "US.13491208655302741918",
        id: "wamid.X", timestamp: "1749416383",
        type: "text", text: { body: "Does it come in another color?" },
      }],
    }));
    expect(msg.from).toBeNull();
    expect(msg.userId).toBe("US.13491208655302741918");
    expect(msg.username).toBe("realsheenanelson");
    // 名字要對得上 —— 用 BSUID 比對聯絡人，不是電話號碼。
    expect(msg.name).toBe("Sheena Nelson");
    expect(msg.text).toBe("Does it come in another color?");
  });

  it("still reads a message that does carry a phone number", () => {
    const [msg] = parseInbound(wrap({
      contacts: [{ profile: { name: "Pablo" }, wa_id: "16505551234", user_id: "US.abc123" }],
      messages: [{
        from: "16505551234", from_user_id: "US.abc123",
        id: "wamid.Y", timestamp: "1749416383", type: "text", text: { body: "hi" },
      }],
    }));
    expect(msg.from).toBe("16505551234");
    expect(msg.userId).toBe("US.abc123");
    expect(msg.name).toBe("Pablo");
    expect(msg.username).toBeNull();
  });

  it("picks up a parent BSUID when the portfolio has them enabled", () => {
    const [msg] = parseInbound(wrap({
      contacts: [{ profile: { name: "P" }, user_id: "US.abc", parent_user_id: "US.ENT.xyz" }],
      messages: [{
        from_user_id: "US.abc", from_parent_user_id: "US.ENT.xyz",
        id: "wamid.Z", timestamp: "1", type: "text", text: { body: "hi" },
      }],
    }));
    expect(msg.parentUserId).toBe("US.ENT.xyz");
  });
});

describe("parseIdentityChanges", () => {
  // 沒有處理的話，換過號碼的人會安靜地變成聯絡不到。
  it("reads a user_id_update webhook", () => {
    const [c] = parseIdentityChanges({
      entry: [{ changes: [{ field: "user_id_update", value: {
        user_id_update: [{
          detail: "User id for X has been updated.",
          user_id: { previous: "US.old", current: "US.new" },
          parent_user_id: { previous: "US.ENT.old", current: "US.ENT.new" },
        }],
      } }] }],
    });
    expect(c).toEqual({
      previous: "US.old", current: "US.new",
      parentPrevious: "US.ENT.old", parentCurrent: "US.ENT.new",
    });
  });

  it("reads the system message form too", () => {
    const [c] = parseIdentityChanges({
      entry: [{ changes: [{ field: "messages", value: {
        messages: [{
          type: "system", id: "wamid.S", timestamp: "1",
          system: { body: "User Pablo changed from US.old to US.new", type: "user_changed_user_id", user_id: "US.new" },
        }],
      } }] }],
    });
    expect(c.current).toBe("US.new");
    // 舊值只存在於一句自由文字裡。不從那裡挖 —— 挖錯會改到別人的綁定。
    expect(c.previous).toBeNull();
  });

  it("ignores ordinary messages", () => {
    expect(parseIdentityChanges({
      entry: [{ changes: [{ value: { messages: [{ type: "text", text: { body: "hi" } }] } }] }],
    })).toEqual([]);
  });
});
