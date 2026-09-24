/**
 * whatsappBot — WhatsApp Cloud API 的通道轉接。
 *
 * 2026-09-19 (CJ「而且還要有 whatsapp 版本」，達拉斯展場)：訪客在美國幾乎不用
 * LINE，所以同一套 bot 要能走 WhatsApp。對話邏輯不動——`lineBot.ts` 的
 * BotMessage 模型本來就與通道無關，這支只負責把它 render 成 Cloud API 的
 * payload，以及驗 Meta 的簽章。
 *
 * ── WhatsApp 比 LINE 窄的地方（降轉規則就是從這裡來的） ────────────────
 *   · 互動回覆鈕最多 3 顆（LINE 可以 4 顆，quick reply 甚至 13 顆）
 *     → 4 顆以上改用 list message（最多 10 列）
 *   · 沒有 Flex bubble。card 只能是 header / body / footer 三段文字
 *   · 網址鈕不能跟回覆鈕並存。只有一顆網址鈕且沒有回覆鈕時用 cta_url，
 *     其餘情況把網址寫成 body 裡的一行——寧可醜，也不要整則訊息被 API 打回
 *   · carousel 沒有對應物 → 變成 list message
 *
 * 所有上限都是 Meta 那邊硬性的，超過會整則 400，所以一律先截斷再送。
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { BotAction, BotCard, BotMessage } from "./lineBot";

const GRAPH_VERSION = "v21.0";

/** Meta 的硬上限。超過不是顯示不好看，是整則訊息被打回。 */
const LIMIT = {
  text: 4096,
  bodyText: 1024,
  headerText: 60,
  footerText: 60,
  buttonTitle: 20,
  buttons: 3,
  listRows: 10,
  listRowTitle: 24,
  listRowDescription: 72,
  listButton: 20,
  replyId: 256,
  ctaDisplayText: 20,
} as const;

const clip = (s: string, n: number) => {
  const t = (s ?? "").trim();
  return t.length <= n ? t : `${t.slice(0, Math.max(0, n - 1))}…`;
};

const isUri = (a: BotAction): a is Extract<BotAction, { kind: "uri" }> => a.kind === "uri";
const isPostback = (a: BotAction): a is Extract<BotAction, { kind: "postback" }> => a.kind === "postback";

/** 網址鈕沒地方放的時候，就寫成 body 裡的一行。 */
function linkLines(actions: BotAction[]): string[] {
  return actions.filter(isUri).map((a) => `${a.label}: ${a.uri}`);
}

function replyButton(a: Extract<BotAction, { kind: "postback" }>) {
  return { type: "reply", reply: { id: clip(a.data, LIMIT.replyId), title: clip(a.label, LIMIT.buttonTitle) } };
}

/** 一則純文字，必要時附上網址行。 */
function textMessage(to: Record<string, string>, body: string, extraLines: string[] = []) {
  const full = [body, ...extraLines].filter(Boolean).join("\n");
  return { messaging_product: "whatsapp", ...to, type: "text", text: { preview_url: true, body: clip(full, LIMIT.text) } };
}

function buttonMessage(to: Record<string, string>, body: string, buttons: Array<Extract<BotAction, { kind: "postback" }>>, header?: string, footer?: string) {
  return {
    messaging_product: "whatsapp",
    ...to,
    type: "interactive",
    interactive: {
      type: "button",
      ...(header ? { header: { type: "text", text: clip(header, LIMIT.headerText) } } : {}),
      body: { text: clip(body, LIMIT.bodyText) },
      ...(footer ? { footer: { text: clip(footer, LIMIT.footerText) } } : {}),
      action: { buttons: buttons.slice(0, LIMIT.buttons).map(replyButton) },
    },
  };
}

function listMessage(
  to: Record<string, string>,
  body: string,
  rows: Array<{ id: string; title: string; description?: string }>,
  opts: { header?: string; footer?: string; buttonLabel: string },
) {
  return {
    messaging_product: "whatsapp",
    ...to,
    type: "interactive",
    interactive: {
      type: "list",
      ...(opts.header ? { header: { type: "text", text: clip(opts.header, LIMIT.headerText) } } : {}),
      body: { text: clip(body, LIMIT.bodyText) },
      ...(opts.footer ? { footer: { text: clip(opts.footer, LIMIT.footerText) } } : {}),
      action: {
        button: clip(opts.buttonLabel, LIMIT.listButton),
        sections: [{
          rows: rows.slice(0, LIMIT.listRows).map((r) => ({
            id: clip(r.id, LIMIT.replyId),
            title: clip(r.title, LIMIT.listRowTitle),
            ...(r.description ? { description: clip(r.description, LIMIT.listRowDescription) } : {}),
          })),
        }],
      },
    },
  };
}

function ctaMessage(to: Record<string, string>, body: string, action: Extract<BotAction, { kind: "uri" }>, header?: string) {
  return {
    messaging_product: "whatsapp",
    ...to,
    type: "interactive",
    interactive: {
      type: "cta_url",
      ...(header ? { header: { type: "text", text: clip(header, LIMIT.headerText) } } : {}),
      body: { text: clip(body, LIMIT.bodyText) },
      action: {
        name: "cta_url",
        parameters: { display_text: clip(action.label, LIMIT.ctaDisplayText), url: action.uri },
      },
    },
  };
}

function cardBody(card: BotCard): string {
  return [card.subtitle, ...(card.body ?? [])].filter(Boolean).join("\n");
}

/** 一張卡片 → 一則 WhatsApp 訊息。挑哪一種型別全看按鈕長什麼樣。 */
function renderCard(to: Record<string, string>, card: BotCard, listButtonLabel: string) {
  const postbacks = card.buttons.filter(isPostback);
  const uris = card.buttons.filter(isUri);
  const body = cardBody(card) || card.title;

  // 只有一顆網址鈕：cta_url 能給它一顆真的按鈕，比在內文塞連結好。
  const [onlyUri] = uris;
  if (postbacks.length === 0 && uris.length === 1 && onlyUri) {
    return ctaMessage(to, body, onlyUri, card.title);
  }
  // 回覆鈕在 3 顆以內用 button，超過改 list（WhatsApp 不給第 4 顆）。
  if (postbacks.length > 0 && postbacks.length <= LIMIT.buttons) {
    return buttonMessage(to, [body, ...linkLines(uris)].filter(Boolean).join("\n"), postbacks, card.title, card.footnote);
  }
  if (postbacks.length > LIMIT.buttons) {
    return listMessage(
      to,
      [body, ...linkLines(uris)].filter(Boolean).join("\n"),
      postbacks.map((a) => ({ id: a.data, title: a.label })),
      { header: card.title, footer: card.footnote, buttonLabel: listButtonLabel },
    );
  }
  return textMessage(to, [card.title, body, card.footnote].filter(Boolean).join("\n"), linkLines(uris));
}

/**
 * BotMessage[] → Cloud API payload[]。一則進、一則出，順序不變，所以
 * handleMenu / handleText 完全不必知道自己在哪個通道上。
 */
/**
 * 收件人。**電話號碼是可選的。**
 *
 * 2026-09-24（Meta 的 BSUID 文件）：使用者一旦啟用 username，他的電話號碼就
 * 不會出現在 webhook 裡。永遠會有的是 BSUID（`user_id`）。所以整個整合的主鍵
 * 必須是 BSUID，電話號碼只是「有的話比較方便」的附加資料。
 *
 * 送訊息時兩個都可以帶，**電話號碼優先**（文件明講）。我們兩個都帶，因為
 * 帶了電話號碼才會繼續在 webhook 裡收到電話號碼（30 天回看條件）。
 */
export interface WhatsAppRecipient {
  /** 電話號碼。可能沒有。 */
  phone?: string | null;
  /** BSUID 或 parent BSUID。 */
  bsuid?: string | null;
}

/**
 * 轉成 API 要的欄位。`to` = 電話，`recipient` = BSUID。
 *
 * 兩個都沒有就丟例外，不要送出一個沒有收件人的請求——那會得到一個很難讀的
 * Meta 錯誤，而真正的問題是我們自己在更早之前就把身分弄丟了。
 */
export function recipientFields(r: WhatsAppRecipient | string): Record<string, string> {
  const rec: WhatsAppRecipient = typeof r === "string" ? { phone: r } : r;
  const out: Record<string, string> = {};
  if (rec.phone) out.to = String(rec.phone);
  if (rec.bsuid) out.recipient = String(rec.bsuid);
  if (!out.to && !out.recipient) {
    throw new Error("WhatsApp recipient needs a phone number or a BSUID — both were empty.");
  }
  return out;
}

/**
 * 這個字串是不是 BSUID。
 *
 * 格式是「兩碼 ISO 國碼 + 句點 + 最多 128 個英數字」，parent BSUID 在國碼後面
 * 多一段 `ENT.`。**整串都要用**——文件明講漏掉或改動國碼、句點、英數字都會讓
 * 請求失敗，所以這裡不做任何正規化，只判斷。
 */
export function isBsuid(v: unknown): boolean {
  return typeof v === "string" && /^[A-Z]{2}\.(ENT\.)?[A-Za-z0-9]{1,128}$/.test(v);
}

/** BSUID 開頭那兩碼國碼。使用者沒有電話號碼的時候，這是唯一的地區線索。 */
export function bsuidCountry(v: string): string | null {
  const m = /^([A-Z]{2})\./.exec(String(v ?? ""));
  return m?.[1] ?? null;
}

export function toWhatsAppMessages(
  messages: BotMessage[],
  to: WhatsAppRecipient | string,
  opts: { listButtonLabel?: string } = {},
): Array<Record<string, unknown>> {
  const target = recipientFields(to);
  const listButtonLabel = opts.listButtonLabel ?? "Choose";
  const out: Array<Record<string, unknown>> = [];

  for (const m of messages) {
    if (m.type === "text") {
      const quick = m.quickReplies ?? [];
      const postbacks = quick.filter(isPostback);
      const uris = quick.filter(isUri);

      const [onlyUri] = uris;
      if (postbacks.length === 0 && uris.length === 1 && onlyUri) {
        out.push(ctaMessage(target, m.text, onlyUri));
      } else if (postbacks.length > 0 && postbacks.length <= LIMIT.buttons) {
        out.push(buttonMessage(target, [m.text, ...linkLines(uris)].filter(Boolean).join("\n"), postbacks));
      } else if (postbacks.length > LIMIT.buttons) {
        out.push(listMessage(
          target,
          [m.text, ...linkLines(uris)].filter(Boolean).join("\n"),
          postbacks.map((a) => ({ id: a.data, title: a.label })),
          { buttonLabel: listButtonLabel },
        ));
      } else {
        out.push(textMessage(target, m.text, linkLines(uris)));
      }
      continue;
    }

    if (m.type === "card") {
      out.push(renderCard(target, m.card, listButtonLabel));
      continue;
    }

    // carousel：WhatsApp 沒有對應物。每張卡一列，選了哪一列再回該卡的內容。
    out.push(listMessage(
      target,
      m.cards[0]?.subtitle ?? m.cards[0]?.title ?? "",
      m.cards.map((c) => ({
        id: c.buttons.find(isPostback)?.data ?? c.title,
        title: c.title,
        description: c.subtitle ?? c.body?.[0],
      })),
      { buttonLabel: listButtonLabel },
    ));
  }
  return out;
}

// ── 進來的事件 ───────────────────────────────────────────────────────────────

export interface WhatsAppInbound {
  /**
   * 寄件人的電話號碼。**可能是 null。**
   *
   * 2026-09-24（Meta BSUID 文件）：使用者啟用 username 之後，除非我們最近
   * 30 天內跟他互動過或他在聯絡簿裡，否則 `from` / `wa_id` 都不會出現。
   * 所以這一欄不能拿來當主鍵，只能當附加資料。
   */
  from: string | null;
  /** BSUID。**永遠有**，不管對方有沒有啟用 username。這才是主鍵。 */
  userId: string | null;
  /** parent BSUID，只有啟用跨商業檔案的情況才有。 */
  parentUserId: string | null;
  /** 對方的 username，只有他啟用了才有。 */
  username: string | null;
  messageId: string;
  /** 使用者打的字，或他按的那顆鈕的標題。 */
  text: string;
  /** 按鈕或列表選項帶回來的 id —— 等同 LINE 的 postback data。 */
  postback: string | null;
  name: string | null;
  timestamp: number;
}

/**
 * 從 webhook body 取出訊息。Meta 會把多個 entry / change 包成一包送，
 * 而且狀態回報（sent / delivered / read）跟真的訊息混在同一個 payload 裡，
 * 所以只挑 messages，其餘忽略。
 */
export function parseInbound(body: any): WhatsAppInbound[] {
  const out: WhatsAppInbound[] = [];
  for (const entry of body?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      const contacts: any[] = value?.contacts ?? [];
      for (const msg of value?.messages ?? []) {
        // 用 BSUID 對聯絡人，不要用電話號碼 —— 電話號碼可能兩邊都沒有，
        // 那樣就永遠對不上，名字與 username 會整個掉。
        const userId = msg?.from_user_id ? String(msg.from_user_id) : null;
        const contact =
          contacts.find((c) => userId && String(c?.user_id ?? "") === userId) ??
          contacts.find((c) => msg?.from && String(c?.wa_id ?? "") === String(msg.from)) ??
          null;
        const base = {
          from: msg?.from ? String(msg.from) : null,
          userId,
          parentUserId: msg?.from_parent_user_id ? String(msg.from_parent_user_id) : null,
          username: contact?.profile?.username ? String(contact.profile.username) : null,
          messageId: String(msg.id ?? ""),
          name: contact?.profile?.name ? String(contact.profile.name) : null,
          timestamp: Number(msg.timestamp ?? 0) * 1000,
        };
        if (msg.type === "text") {
          out.push({ ...base, text: String(msg.text?.body ?? ""), postback: null });
        } else if (msg.type === "interactive") {
          const i = msg.interactive ?? {};
          const picked = i.button_reply ?? i.list_reply ?? null;
          out.push({ ...base, text: String(picked?.title ?? ""), postback: picked?.id ? String(picked.id) : null });
        } else if (msg.type === "button") {
          // 範本訊息上的快速回覆鈕走這個型別，payload 才是我們設定的值。
          out.push({ ...base, text: String(msg.button?.text ?? ""), postback: String(msg.button?.payload ?? "") || null });
        }
        // 圖片 / 語音 / 位置等先不處理——展場流程用不到。
      }
    }
  }
  return out;
}

/**
 * Meta 的 X-Hub-Signature-256，HMAC-SHA256(App Secret, raw body)。
 * 跟 LINE 一樣必須用**原始 bytes**——express.json() 解過再 stringify 回來，
 * 鍵的順序和空白都可能變，簽章就對不起來。
 */
export function verifyWhatsAppSignature(rawBody: Buffer, signature: string | undefined): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return false;
  const provided = (signature ?? "").replace(/^sha256=/i, "");
  if (!/^[0-9a-f]{64}$/i.test(provided)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(provided.toLowerCase(), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** GET 的訂閱握手：verify token 對了就把 challenge 原樣回去。 */
export function verifySubscription(query: Record<string, unknown>): string | null {
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!token) return null;
  const mode = String(query["hub.mode"] ?? "");
  const provided = String(query["hub.verify_token"] ?? "");
  if (mode !== "subscribe" || provided !== token) return null;
  return String(query["hub.challenge"] ?? "");
}

// ── 送出去 ───────────────────────────────────────────────────────────────────

export function whatsappStatus() {
  return {
    configured: Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
    webhookReady: Boolean(process.env.WHATSAPP_APP_SECRET && process.env.WHATSAPP_VERIFY_TOKEN),
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? null,
  };
}

async function send(payload: Record<string, unknown>): Promise<void> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) throw new Error("WhatsApp is not configured");

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    // Meta 的錯誤訊息很具體（哪個欄位太長、哪個型別不合），原樣往上拋，
    // 不要吞掉——這是展場上唯一能知道訊息為什麼沒送出去的線索。
    const detail = await res.text().catch(() => "");
    throw new Error(`WhatsApp send failed ${res.status}: ${detail.slice(0, 400)}`);
  }
}

/**
 * 依序送出。WhatsApp 沒有 LINE 那種 reply token，每一則都是主動送出，
 * 而且同一個收件人要照順序送，不能 Promise.all——會亂序。
 */
export async function whatsappSend(
  to: WhatsAppRecipient | string,
  messages: BotMessage[],
  opts?: { listButtonLabel?: string },
): Promise<void> {
  for (const payload of toWhatsAppMessages(messages, to, opts ?? {})) {
    await send(payload);
  }
}

/** 已讀，讓對方看到我們收到了——長工作要跑的時候特別需要。 */
export async function whatsappMarkRead(messageId: string): Promise<void> {
  await send({ messaging_product: "whatsapp", status: "read", message_id: messageId });
}

// ── 身分變更 ────────────────────────────────────────────────────────────────

export interface WhatsAppIdentityChange {
  /** 舊的 BSUID，如果 payload 有帶。 */
  previous: string | null;
  /** 新的 BSUID。 */
  current: string;
  parentPrevious: string | null;
  parentCurrent: string | null;
}

/**
 * 使用者換了電話號碼 → BSUID 會重新產生。
 *
 * 2026-09-24（Meta BSUID 文件）：這件事會用兩種方式通知——`user_id_update`
 * webhook，以及 type 為 `user_changed_user_id` 的系統訊息。**沒有處理的話，
 * 已經綁定的人會安靜地變成聯絡不到**：舊的 BSUID 從此送不出去，而新的 BSUID
 * 我們認不得，看起來就是一個全新的陌生人。
 *
 * 兩種來源都解析，因為文件兩邊都會送，而漏掉一種的代價是一樣的。
 */
export function parseIdentityChanges(body: any): WhatsAppIdentityChange[] {
  const out: WhatsAppIdentityChange[] = [];
  for (const entry of body?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;

      // user_id_update webhook
      for (const u of value?.user_id_update ?? []) {
        const current = u?.user_id?.current ? String(u.user_id.current) : "";
        if (!current) continue;
        out.push({
          previous: u?.user_id?.previous ? String(u.user_id.previous) : null,
          current,
          parentPrevious: u?.parent_user_id?.previous ? String(u.parent_user_id.previous) : null,
          parentCurrent: u?.parent_user_id?.current ? String(u.parent_user_id.current) : null,
        });
      }

      // 系統訊息（type: user_changed_user_id）
      for (const msg of value?.messages ?? []) {
        if (msg?.type !== "system" || msg?.system?.type !== "user_changed_user_id") continue;
        const current = msg?.system?.user_id ? String(msg.system.user_id) : "";
        if (!current) continue;
        out.push({
          // 系統訊息沒有結構化的舊值，只有一句 body。不從自由文字裡挖舊 id——
          // 挖錯會把別人的綁定改掉，比認不得這一筆糟得多。
          previous: null,
          current,
          parentPrevious: null,
          parentCurrent: msg?.system?.parent_user_id ? String(msg.system.parent_user_id) : null,
        });
      }
    }
  }
  return out;
}
