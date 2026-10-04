/**
 * conversationLog — 業務與 AI 行銷團隊的逐則對話紀錄（hub_messages）。
 *
 * 2026-10-04 (CJ「人設卡上還可以查到對話紀錄，按下去後會模擬出 WhatsApp 的
 * 對話介面」)。
 *
 * 存的時候不管通道：進來的存文字或 postback data，出去的存 BotMessage[]。
 * 讀的時候用 toWhatsAppMessages 當場轉成 Cloud API payload——跟真的送出去
 * 走同一支程式，所以模擬畫面上的按鈕數、清單、網址鈕怎麼降轉，就是 WhatsApp
 * 實際會收到的樣子，不是另外畫一份「大概長這樣」。
 *
 * 紀錄失敗絕對不能讓 bot 回不了話：record* 一律吞錯、只記 log。
 */

import { exec, q } from "./hubStore";
import { RICH_MENU_AREAS, type BotAction, type BotMessage } from "./lineBot";
import { toWhatsAppMessages } from "./whatsappBot";

export type MessageChannel = "line" | "whatsapp" | "simulator";

export async function recordInbound(args: {
  orgId: number; repId: number; channel: MessageChannel; kind: "text" | "postback" | "menu" | "follow"; text: string;
}): Promise<void> {
  try {
    await exec(
      `INSERT INTO hub_messages (org_id, rep_id, channel, direction, kind, text) VALUES (?, ?, ?, 'in', ?, ?)`,
      [args.orgId, args.repId, args.channel, args.kind, args.text.slice(0, 4000)],
    );
  } catch (e: any) {
    console.warn("[hub.messages] inbound:", e?.message ?? e);
  }
}

export async function recordOutbound(args: {
  orgId: number; repId: number; channel: MessageChannel; messages: BotMessage[];
}): Promise<void> {
  if (!args.messages.length) return;
  try {
    await exec(
      `INSERT INTO hub_messages (org_id, rep_id, channel, direction, kind, payload) VALUES (?, ?, ?, 'out', 'bot', ?)`,
      [args.orgId, args.repId, args.channel, JSON.stringify(args.messages)],
    );
  } catch (e: any) {
    console.warn("[hub.messages] outbound:", e?.message ?? e);
  }
}

// ── read side ───────────────────────────────────────────────────────────────

export interface TranscriptLine {
  id: number;
  at: string;
  direction: "in" | "out";
  /** 進來的：業務看得到的那句話（postback 已換成按鈕上的字）。 */
  text?: string;
  /** 進來的：是點按鈕／選單，不是打字。畫面上用來加一個小標示。 */
  tapped?: boolean;
  /** 出去的：WhatsApp Cloud API payload（已拿掉收件人欄位）。 */
  whatsapp?: Array<Record<string, any>>;
}

export interface ConversationSession {
  id: number;
  channel: MessageChannel;
  startedAt: string;
  endedAt: string;
  count: number;
  preview: string;
  isDemo: boolean;
  lines: TranscriptLine[];
}

/** 兩則之間超過這麼久就算新的一段對話。 */
const SESSION_GAP_MS = 45 * 60_000;

function actionsOf(messages: BotMessage[]): BotAction[] {
  const out: BotAction[] = [];
  for (const m of messages) {
    if (m.type === "text") out.push(...(m.quickReplies ?? []));
    else if (m.type === "card") out.push(...m.card.buttons);
    else for (const c of m.cards) out.push(...c.buttons);
  }
  return out;
}

/**
 * postback 的 data（a=gen&s=3&c=linkedin）換成業務當下看到、點下去的字。
 * 從前面最近一則 bot 訊息的按鈕裡找；找不到就用選單名稱；都沒有才露出原始值。
 */
export function postbackLabel(data: string, previous: BotMessage[] | null, market: "TW" | "US"): string {
  const hit = previous ? actionsOf(previous).find((a) => a.kind === "postback" && a.data === data) : undefined;
  if (hit && hit.kind === "postback") return hit.displayText || hit.label;
  const a = new URLSearchParams(data).get("a");
  const menu = RICH_MENU_AREAS.find((m) => m.action === a);
  if (menu) return market === "US" ? menu.en : menu.zh;
  return data;
}

const toWhatsApp = (messages: BotMessage[], market: "TW" | "US") =>
  toWhatsAppMessages(messages, { phone: "0" }, { listButtonLabel: market === "US" ? "Choose" : "選擇" })
    .map(({ to: _to, recipient: _r, messaging_product: _p, ...rest }) => rest as Record<string, any>);

function previewOf(line: TranscriptLine | undefined): string {
  if (!line) return "";
  if (line.text) return line.text;
  const first = line.whatsapp?.[0];
  return String(first?.text?.body ?? first?.interactive?.header?.text ?? first?.interactive?.body?.text ?? "");
}

export async function listRepConversations(repId: number, market: "TW" | "US", limit = 400): Promise<ConversationSession[]> {
  const rows = await q(
    `SELECT id, channel, direction, kind, text, payload, is_demo, created_at
       FROM hub_messages WHERE rep_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
    [repId, limit],
  );
  rows.reverse();

  const sessions: ConversationSession[] = [];
  let lastOut: BotMessage[] | null = null;
  let current: ConversationSession | null = null;
  let lastAt = 0;

  for (const r of rows) {
    const at = new Date(r.created_at).getTime();
    if (!current || at - lastAt > SESSION_GAP_MS || current.channel !== r.channel) {
      current = {
        id: Number(r.id), channel: r.channel, startedAt: new Date(at).toISOString(), endedAt: "",
        count: 0, preview: "", isDemo: Boolean(r.is_demo), lines: [],
      };
      sessions.push(current);
      lastOut = null;
    }
    lastAt = at;

    let line: TranscriptLine;
    if (r.direction === "out") {
      const payload: BotMessage[] = typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload ?? [];
      lastOut = payload;
      line = { id: Number(r.id), at: new Date(at).toISOString(), direction: "out", whatsapp: toWhatsApp(payload, market) };
    } else {
      const tapped = r.kind === "postback" || r.kind === "menu";
      const raw = String(r.text ?? "");
      const isData = r.kind === "postback" || (r.kind === "menu" && raw.startsWith("a="));
      const text = isData ? postbackLabel(raw, lastOut, market) : raw;
      line = { id: Number(r.id), at: new Date(at).toISOString(), direction: "in", text, tapped };
    }
    current.lines.push(line);
    current.count++;
    current.endedAt = new Date(at).toISOString();
  }
  // 預覽用每段的第一則：業務開口的就是他問了什麼，bot 主動推的就是推了什麼。
  for (const s of sessions) s.preview = previewOf(s.lines[0]).split("\n")[0]!;
  return sessions.reverse();
}

// ── demo transcripts ────────────────────────────────────────────────────────

type DemoStep = { in: string; kind?: "text" | "postback" | "menu" } | { out: BotMessage[] };
interface DemoSession { channel: MessageChannel; minutesAgo: number; steps: DemoStep[] }

const LINK = "https://experthub.onbrand.sowork.ai/r/demo";

/**
 * 示範業務的對話。內容照著 lineBot 真的會回的形狀寫（選單文字、卡片按鈕、
 * postback data），只有 AI 寫的貼文與回答是預先寫好的。不含任何沒出處的數字。
 */
function demoSessions(seed: string, sol: (slug: string) => { id: number; en: string; zh: string; vendor: string } | null): DemoSession[] {
  const z = sol("zynkr"), lo = sol("lightning-order"), gf = sol("gogoform");
  if (!z || !lo || !gf) return [];
  const card = (s: NonNullable<typeof z>, en: boolean, fb = false): any => ({
    title: en ? s.en : s.zh,
    subtitle: s.vendor,
    buttons: [
      ...(fb ? [{ kind: "postback", label: "Facebook", data: `a=gen&s=${s.id}&c=facebook`, displayText: `寫 Facebook：${s.zh}` }] : []),
      { kind: "postback", label: "LinkedIn", data: `a=gen&s=${s.id}&c=linkedin`, displayText: en ? `LinkedIn post: ${s.en}` : `寫 LinkedIn：${s.zh}` },
      { kind: "uri", label: en ? "Full editor" : "進階編輯", uri: `${LINK.replace("/r/demo", "")}/liff/write?s=${s.id}` },
    ],
  });

  if (seed === "priya") {
    return [
      {
        channel: "whatsapp", minutesAgo: 2 * 1440 + 300,
        steps: [
          { in: "Write a post", kind: "menu" },
          { out: [
            { type: "text", text: "Which solution? Pick a channel — I'll draft it in seconds and check it against company policy first." },
            { type: "carousel", cards: [card(z, true), card(lo, true), card(gf, true)] },
          ] },
          { in: `a=gen&s=${z.id}&c=linkedin`, kind: "postback" },
          { out: [
            { type: "text", text: `What's the one follow-up you meant to send last week and didn't?\n\nI ask every new client what software they stopped using last year, and why. The answer is almost never "it was missing a feature." It's that nobody had time to keep it fed.\n\nThat's why I like how ${z.en} works: it drafts the follow-up for the rep, so the habit doesn't depend on a free afternoon.\n\nOne practical first step: pick the deals that went quiet this month and let it suggest the next message. Curious what you'd find.\n\nDisclosure: I work at ExpertHub.\n${LINK}\n\nPriya ✨` },
            { type: "card", card: {
              title: "✅ Passed all 6 company policy checks",
              body: ["United States · FTC Endorsement Guides", `Tracked link: ${LINK}`],
              buttons: [
                { kind: "postback", label: "I posted it", data: "a=shared&p=0" },
                { kind: "uri", label: "Copy / edit", uri: `${LINK.replace("/r/demo", "")}/liff/write?p=0` },
              ],
            } },
          ] },
          { in: "a=shared&p=0", kind: "postback" },
          { out: [{ type: "text", text: "Recorded! Clicks on your tracked link count toward My results in real time." }] },
        ],
      },
      {
        channel: "whatsapp", minutesAgo: 1440 + 95,
        steps: [
          { in: "Ask AI", kind: "menu" },
          { out: [{ type: "text", text: "I'm your AI marketing assistant. Ask me anything, e.g. \"What do restaurant owners care about most?\" or \"Give me 3 LinkedIn hooks for Zynkr\"." }] },
          { in: "A bakery owner told me AI feels too complicated for her. How should I answer without sounding pushy?" },
          { out: [{ type: "text", text: "Start from her week, not from the tool:\n\n1. Ask which task she'd happily never do again — usually answering the same customer questions.\n2. Offer the free online diagnosis instead of a demo, so the first step is about her shop.\n3. Promise one small change she can see, not a transformation.\n\nAvoid \"game-changer\" — it's on the company's banned list, and it's on yours too." }] },
          { in: `Give me 3 LinkedIn hooks for ${lo.en}` },
          { out: [{ type: "text", text: `Three openers in your voice:\n\n• "Which order did you miss last Friday night?"\n• "A shop owner told me the phone was her busiest employee. Here's what we changed."\n• "What if every channel's orders landed in one place before the rush?"\n\nWant me to turn one into a full post? Tap Write a post and pick ${lo.en}.` }] },
        ],
      },
      {
        channel: "whatsapp", minutesAgo: 210,
        steps: [
          { out: [{ type: "card", card: {
            title: "📣 For your clients this week",
            body: ["Marketing opened new free online diagnosis slots for restaurants and retailers. Worth forwarding to owners who asked about online ordering."],
            footnote: "Reply \"stop market updates\" to opt out",
            buttons: [
              { kind: "postback", label: "Write a post", data: `a=gen&s=${lo.id}&c=linkedin`, displayText: `LinkedIn post: ${lo.en}` },
              { kind: "postback", label: "My results", data: "a=stats" },
            ],
          } }] },
          { in: "a=stats", kind: "postback" },
          { out: [{ type: "card", card: {
            title: "Last 21 days",
            subtitle: "Team rank #2 of 11",
            body: ["📝 14 posts", "🔗 96 tracked clicks", "👀 verified impressions from LinkedIn API", "🎯 4 diagnosis leads"],
            footnote: "Facebook personal profiles have no API — those numbers are estimated or self-reported.",
            buttons: [{ kind: "postback", label: "Write another", data: "a=write" }],
          } }] },
        ],
      },
    ];
  }

  if (seed === "jordan") {
    return [{
      channel: "whatsapp", minutesAgo: 1440 * 3 + 40,
      steps: [
        { in: "Product lookup", kind: "menu" },
        { out: [{
          type: "text",
          text: "Which solution? (Only marketing-approved prices are shown.)",
          quickReplies: [z, lo, gf].map((s) => ({ kind: "postback" as const, label: s.en.slice(0, 20), data: `a=lookup&s=${s.id}`, displayText: s.en })),
        }] },
        { in: `a=lookup&s=${gf.id}`, kind: "postback" },
        { out: [{ type: "card", card: {
          title: gf.en, subtitle: gf.vendor,
          body: ["Digital forms and approvals that replace paper sign-off chains.", "• Mobile approvals", "• Audit trail for every form"],
          footnote: "Price source: ExpertHub solution page",
          buttons: [{ kind: "postback", label: "Write a post", data: `a=gen&s=${gf.id}&c=linkedin` }],
        } }] },
        { in: "Can I tell an MSP partner this is the cheapest option?" },
        { out: [{ type: "text", text: "I'd avoid \"cheapest\" — the company wording is \"affordable\", and price comparisons with other vendors aren't allowed in posts. Try: \"an affordable way to retire paper approvals, with implementation support after go-live.\"" }] },
      ],
    }];
  }

  if (seed === "amy") {
    return [
      {
        channel: "line", minutesAgo: 1440 + 600,
        steps: [
          { in: "寫一篇", kind: "menu" },
          { out: [
            { type: "text", text: "要寫哪個方案？選好平台，我 10 秒幫你寫好，而且先幫你過完公司政策。" },
            { type: "carousel", cards: [card(lo, false, true), card(z, false, true), card(gf, false, true)] },
          ] },
          { in: `a=gen&s=${lo.id}&c=facebook`, kind: "postback" },
          { out: [
            { type: "text", text: `上週去一家手搖飲店，老闆說她每天收工都要對到半夜，因為外送、官網、現場三邊的單對不起來。\n\n後來我們先做了一次免費線上診斷，才發現她缺的不是新系統，是讓所有通路的單落在同一個地方。${lo.zh}做的就是這件事。\n\n如果你也是收工最晚走的那個人，歡迎聊聊你的狀況 🙂\n\n（我在 ExpertHub 工作）\n${LINK}\n\n— Amy 🙂` },
            { type: "card", card: {
              title: "✅ 已通過公司社群政策檢查（6/6）",
              body: ["Taiwan · Fair Trade Act & endorsement rules", `專屬追蹤連結：${LINK}`],
              buttons: [
                { kind: "uri", label: "分享給 LINE 好友", uri: `${LINK.replace("/r/demo", "")}/liff/share?p=0` },
                { kind: "postback", label: "我發好了", data: "a=shared&p=0" },
                { kind: "uri", label: "複製／編輯", uri: `${LINK.replace("/r/demo", "")}/liff/write?p=0` },
              ],
            } },
          ] },
          { in: "a=shared&p=0", kind: "postback" },
          { out: [{ type: "text", text: "已記錄！追蹤連結的點擊會即時算進「我的成效」。" }] },
        ],
      },
      {
        channel: "line", minutesAgo: 180,
        steps: [
          { in: "問 AI 助理", kind: "menu" },
          { out: [{ type: "text", text: "我是你的 AI 行銷助理。直接問我，例如：「餐飲業老闆最在意什麼？」「幫我想 3 個 LinkedIn 開頭」「韌性計畫補助怎麼跟客戶說？」" }] },
          { in: "客戶問可不可以保證一個月內看到成效，我要怎麼回？" },
          { out: [{ type: "text", text: "不要說「保證」或「立即見效」——這兩個是公司的禁用詞，也會踩到公平法的誇大不實。\n\n可以這樣回：「我們會先做免費線上診斷，一起訂出第一個月要看的指標，讓你逐步看到成效。」\n\n這樣講有承諾、但承諾的是過程，不是結果。" }] },
        ],
      },
    ];
  }
  return [];
}

/**
 * 示範業務的對話種子。只寫給還沒有任何對話紀錄的人——展場上真的跟 bot 講過
 * 話的業務，不會被假資料混進去。
 */
export async function seedDemoConversations(orgId: number): Promise<number> {
  const reps = await q(`SELECT id, avatar_seed FROM hub_reps WHERE org_id = ? AND is_demo = 1`, [orgId]);
  const sols = await q(`SELECT id, slug, name_en, name_zh, vendor FROM hub_solutions WHERE org_id = ?`, [orgId]);
  const sol = (slug: string) => {
    const s = sols.find((x: any) => x.slug === slug);
    return s ? { id: Number(s.id), en: s.name_en, zh: s.name_zh, vendor: s.vendor } : null;
  };
  let inserted = 0;
  for (const rep of reps) {
    const sessions = demoSessions(String(rep.avatar_seed), sol);
    if (!sessions.length) continue;
    const [has] = await q(`SELECT 1 x FROM hub_messages WHERE rep_id = ? LIMIT 1`, [rep.id]);
    if (has) continue;
    for (const s of sessions) {
      let t = Date.now() - s.minutesAgo * 60_000;
      for (const step of s.steps) {
        // 業務打字比 bot 回得慢；bot 寫貼文大約 10 秒。
        t += "in" in step ? 25_000 : 9_000;
        const at = new Date(t);
        if ("in" in step) {
          await exec(
            `INSERT INTO hub_messages (org_id, rep_id, channel, direction, kind, text, is_demo, created_at) VALUES (?, ?, ?, 'in', ?, ?, 1, ?)`,
            [orgId, rep.id, s.channel, step.kind ?? "text", step.in, at],
          );
        } else {
          await exec(
            `INSERT INTO hub_messages (org_id, rep_id, channel, direction, kind, payload, is_demo, created_at) VALUES (?, ?, ?, 'out', 'bot', ?, 1, ?)`,
            [orgId, rep.id, s.channel, JSON.stringify(step.out), at],
          );
        }
        inserted++;
      }
    }
  }
  return inserted;
}
