/**
 * lineClient — LINE Messaging API 的最小客戶端。
 *
 * 2026-09-18 (CJ「幫媽爹作一個 LINE OFFICIAL 帳號，可以直接在該帳號 access
 * onbrand 的方法論，去產貼文」).
 *
 * 只包三件事：驗簽、reply、push。刻意不引入官方 SDK —— 我們用到的就是三個
 * REST 呼叫，而 @line/bot-sdk 會把 express 中介層一起拖進來，跟現有的
 * raw-body 掛載方式（見 index.ts 的 stripe webhook）打架。
 *
 * 為什麼 reply 跟 push 兩個都要：LINE 的 replyToken 只能用一次、約一分鐘內有效，
 * 而一個任務要跑 30–130 秒。所以流程被時間限制決定了 ——
 *   收到訊息 → 立刻用 reply 回「收到，正在寫」→ 跑完用 push 送結果。
 * push 有月額度（免費方案 200 則），這是真實成本，不是實作細節。
 */
import crypto from "crypto";

const API = "https://api.line.me/v2/bot";

export interface LineTextMessage { type: "text"; text: string }
export interface LineImageMessage {
  type: "image";
  originalContentUrl: string;
  previewImageUrl: string;
}
export type LineMessage = LineTextMessage | LineImageMessage | { type: string; [k: string]: unknown };

function accessToken(): string {
  const t = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!t) throw new Error("[line] LINE_CHANNEL_ACCESS_TOKEN 未設定");
  return t;
}

/**
 * LINE 的簽章是「channel secret 當 key，對『原始 body 位元組』做 HMAC-SHA256
 * 再 base64」。必須是原始位元組 —— 一旦讓 express.json() 先解析過再
 * JSON.stringify 回去，鍵的順序與空白都可能不同，驗簽就會永遠失敗。
 * 這也是 index.ts 要把這條路由掛在 express.json() 之前的原因。
 *
 * 用 timingSafeEqual 比對，避免以回應時間逐位元組猜出簽章。
 */
export function verifyLineSignature(rawBody: Buffer, signature: string | undefined): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest();
  let got: Buffer;
  try { got = Buffer.from(signature, "base64"); } catch { return false; }
  if (got.length !== expected.length) return false;
  return crypto.timingSafeEqual(got, expected);
}

async function call(path: string, body: unknown): Promise<void> {
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken()}`,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    // LINE 的錯誤訊息很具體（哪一則、哪個欄位），原樣留在 log 裡才查得動。
    const detail = await r.text().catch(() => "");
    throw new Error(`[line] ${path} ${r.status}: ${detail.slice(0, 400)}`);
  }
}

/** 一次最多 5 則，超過 LINE 會整批退回，所以在這裡先截斷。 */
function capped(messages: LineMessage[]): LineMessage[] {
  return messages.slice(0, 5);
}

export async function replyMessage(replyToken: string, messages: LineMessage[]): Promise<void> {
  await call("/message/reply", { replyToken, messages: capped(messages) });
}

export async function pushMessage(to: string, messages: LineMessage[]): Promise<void> {
  await call("/message/push", { to, messages: capped(messages) });
}

/** LINE 單則文字上限 5000 字；超過就切成多則（最多 5 則，等於 25000 字）。 */
export function textMessages(text: string): LineTextMessage[] {
  const t = (text ?? "").trim();
  if (!t) return [];
  const LIMIT = 4800; // 留一點餘裕給收尾標記
  if (t.length <= LIMIT) return [{ type: "text", text: t }];
  const out: LineTextMessage[] = [];
  for (let i = 0; i < t.length && out.length < 5; i += LIMIT) {
    out.push({ type: "text", text: t.slice(i, i + LIMIT) });
  }
  return out;
}

/**
 * 只有公開的 https 圖片 LINE 才收得到（它是從 LINE 的伺服器去抓，不是從使用者
 * 的手機）。orchestra 產出的圖是存在 onbrand 自己的 /static 底下並公開服務的，
 * 所以可以直接送；但生圖失敗時 url 會是 null，這裡一併濾掉。
 */
export function imageMessages(urls: Array<string | null | undefined>): LineImageMessage[] {
  return urls
    .filter((u): u is string => typeof u === "string" && u.startsWith("https://"))
    .map((u) => ({ type: "image", originalContentUrl: u, previewImageUrl: u }));
}
