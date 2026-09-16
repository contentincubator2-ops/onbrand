/**
 * Sales Hub — the rep's LINE bot ("my AI marketing team").
 *
 * Handlers return a small internal message model (BotMessage). The LINE
 * webhook converts it to Messaging API JSON; the admin phone simulator renders
 * it directly — so what the booth screen shows is exactly what the bot sends.
 *
 * Rich menu (2500×1686, 3×2):
 *   write · featured · lookup
 *   share · stats    · ask
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import {
  bindLineUser,
  formatPrice,
  getOrg,
  getRep,
  getRepByLineUser,
  listSolutions,
  logEvent,
  publicBaseUrl,
  q,
  exec,
  type HubRep,
  type HubSolution,
} from "./hubStore";

// ── message model ───────────────────────────────────────────────────────────

export type BotAction =
  | { kind: "postback"; label: string; data: string; displayText?: string }
  | { kind: "uri"; label: string; uri: string };

export interface BotCard {
  title: string;
  subtitle?: string;
  body?: string[];
  footnote?: string;
  buttons: BotAction[];
}

export type BotMessage =
  | { type: "text"; text: string; quickReplies?: BotAction[] }
  | { type: "card"; card: BotCard }
  | { type: "carousel"; cards: BotCard[] };

export type MenuAction = "write" | "featured" | "lookup" | "share" | "stats" | "ask";

export const RICH_MENU_AREAS: Array<{ action: MenuAction; en: string; zh: string }> = [
  { action: "write", en: "Write a post", zh: "寫一篇" },
  { action: "featured", en: "This week's focus", zh: "本週主推" },
  { action: "lookup", en: "Product lookup", zh: "產品快查" },
  { action: "share", en: "Share & report", zh: "發布回報" },
  { action: "stats", en: "My results", zh: "我的成效" },
  { action: "ask", en: "Ask AI", zh: "問 AI 助理" },
];

// Per-LINE-user conversation mode. In-memory is fine for a single-process demo.
const modes = new Map<string, { mode: "ask" | "await_url"; at: number }>();
const MODE_TTL = 10 * 60_000;

function setMode(key: string, mode: "ask" | "await_url" | null) {
  if (mode) modes.set(key, { mode, at: Date.now() });
  else modes.delete(key);
}
function getMode(key: string) {
  const m = modes.get(key);
  if (!m || Date.now() - m.at > MODE_TTL) return null;
  return m.mode;
}

const T = (rep: HubRep | null, zh: string, en: string) => (rep?.market === "US" ? en : zh);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const solName = (rep: HubRep, s: HubSolution) => (rep.market === "US" ? s.nameEn : s.nameZh);

function liffUrl(path: string, params: Record<string, string | number>) {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  const liffId = process.env.LINE_LIFF_ID;
  return liffId ? `https://liff.line.me/${liffId}/${path}?${qs}` : `${publicBaseUrl()}/liff/${path}?${qs}`;
}

// ── handlers ────────────────────────────────────────────────────────────────

export interface BotContext {
  /** Conversation key: LINE userId, or `sim:<repId>` for the simulator. */
  key: string;
  rep: HubRep | null;
  source: "line" | "simulator";
}

export async function handleMenu(ctx: BotContext, action: MenuAction): Promise<BotMessage[]> {
  const { rep } = ctx;
  if (!rep) return unboundMessage();
  const org = await getOrg();
  await logEvent(org.id, rep.id, "menu_tap", action);
  setMode(ctx.key, null);

  switch (action) {
    case "write":
    case "featured": {
      const sols = (await listSolutions(org.id)).filter((s) => s.featured).slice(0, 5);
      const intro = action === "write"
        ? T(rep, "要寫哪個方案？選好平台，我 10 秒幫你寫好，而且先幫你過完公司政策。", "Which solution? Pick a channel — I'll draft it in seconds and check it against company policy first.")
        : T(rep, "本週行銷部主推這幾個方案：", "Marketing's focus this week:");
      return [
        { type: "text", text: intro },
        {
          type: "carousel",
          cards: sols.map((s) => ({
            title: solName(rep, s),
            subtitle: s.vendor,
            body: [clip(rep.market === "US" ? s.summaryEn : s.summaryZh, 80)],
            footnote: s.prices[0] ? formatPrice(s.prices[0], rep.market === "US" ? "en-US" : "zh-TW") : undefined,
            buttons: [
              ...(rep.market === "TW"
                ? [{ kind: "postback" as const, label: "Facebook", data: `a=gen&s=${s.id}&c=facebook`, displayText: `寫 Facebook：${s.nameZh}` }]
                : []),
              { kind: "postback", label: "LinkedIn", data: `a=gen&s=${s.id}&c=linkedin`, displayText: T(rep, `寫 LinkedIn：${s.nameZh}`, `LinkedIn post: ${s.nameEn}`) },
              { kind: "uri", label: T(rep, "進階編輯", "Full editor"), uri: liffUrl("write", { s: s.id }) },
            ],
          })),
        },
      ];
    }
    case "lookup": {
      const sols = await listSolutions(org.id);
      return [{
        type: "text",
        text: T(rep, "想查哪個方案？（價格只顯示行銷部核准的版本）", "Which solution? (Only marketing-approved prices are shown.)"),
        quickReplies: sols.slice(0, 13).map((s) => ({
          kind: "postback" as const,
          label: solName(rep, s).slice(0, 20),
          data: `a=lookup&s=${s.id}`,
          displayText: solName(rep, s),
        })),
      }];
    }
    case "share":
      return shareMessages(ctx);
    case "stats":
      return statsMessages(rep);
    case "ask":
      setMode(ctx.key, "ask");
      return [{
        type: "text",
        text: T(rep,
          "我是你的 AI 行銷助理。直接問我，例如：「餐飲業老闆最在意什麼？」「幫我想 3 個 LinkedIn 開頭」「韌性計畫補助怎麼跟客戶說？」",
          "I'm your AI marketing assistant. Ask me anything, e.g. \"What do restaurant owners care about most?\" or \"Give me 3 LinkedIn hooks for Zynkr\"."),
      }];
  }
}

export async function handlePostback(ctx: BotContext, data: string): Promise<BotMessage[]> {
  const params = new URLSearchParams(data);
  const a = params.get("a");
  if (a && (RICH_MENU_AREAS as Array<{ action: string }>).some((m) => m.action === a) && !params.get("s")) {
    return handleMenu(ctx, a as MenuAction);
  }
  const { rep } = ctx;
  if (!rep) return unboundMessage();

  if (a === "lookup" && params.get("s")) {
    const org = await getOrg();
    const s = (await listSolutions(org.id)).find((x) => x.id === Number(params.get("s")));
    if (!s) return [{ type: "text", text: T(rep, "找不到這個方案。", "Solution not found.") }];
    const lang = rep.market === "US" ? "en-US" : "zh-TW";
    return [{
      type: "card",
      card: {
        title: solName(rep, s),
        subtitle: s.vendor,
        body: [
          rep.market === "US" ? s.summaryEn : s.summaryZh,
          ...s.features.slice(0, 4).map((f) => `• ${rep.market === "US" ? f.en : f.zh}`),
          ...s.prices.map((p) => `💰 ${formatPrice(p, lang)}`),
        ],
        footnote: T(rep, "價格來源：ExpertHub 方案頁（2026/9/16）", "Price source: ExpertHub solution page (Sep 16, 2026)"),
        buttons: [
          { kind: "postback", label: T(rep, "寫一篇介紹", "Write a post"), data: `a=gen&s=${s.id}&c=${rep.market === "US" ? "linkedin" : "facebook"}` },
          ...(s.sourceUrl ? [{ kind: "uri" as const, label: T(rep, "看方案頁", "Open page"), uri: s.sourceUrl }] : []),
        ],
      },
    }];
  }

  if (a === "gen") {
    const { generateRepPost } = await import("../../../content/core/hub/generateRepPost");
    const post = await generateRepPost({
      repId: rep.id,
      solutionId: Number(params.get("s")),
      channel: (params.get("c") as any) || "facebook",
      source: ctx.source === "simulator" ? "simulator" : "line",
    });
    return postMessages(rep, post);
  }

  if (a === "shared") {
    const postId = Number(params.get("p"));
    await exec(`UPDATE hub_posts SET status = 'shared', shared_at = NOW(3) WHERE id = ? AND rep_id = ?`, [postId, rep.id]);
    setMode(ctx.key, "await_url");
    const org = await getOrg();
    await logEvent(org.id, rep.id, "post_shared", `post #${postId}`);
    return [{ type: "text", text: T(rep, "太好了！貼上你的貼文網址，我幫你記錄成效（Facebook 沒有開放 API，所以靠你回報）。", "Nice! Paste the post URL so I can track it (Facebook has no API for personal profiles, so it's self-reported).") }];
  }

  return [{ type: "text", text: T(rep, "我看不懂這個指令。", "I didn't understand that.") }];
}

export async function handleText(ctx: BotContext, text: string): Promise<BotMessage[]> {
  const trimmed = text.trim();

  if (!ctx.rep) {
    const code = trimmed.toUpperCase().match(/^[A-F0-9]{6}$/)?.[0];
    if (code && ctx.source === "line") {
      const rep = await bindLineUser(code, ctx.key);
      if (rep) {
        const org = await getOrg();
        await logEvent(org.id, rep.id, "line_bound", rep.name);
        return [{
          type: "text",
          text: T(rep,
            `綁定完成，${rep.name}！下方選單就是你的 AI 行銷團隊。發文前我會先幫你檢查公司社群政策（揭露身分、價格、用語）。`,
            `You're connected, ${rep.name}! The menu below is your AI marketing team. Every post is checked against company policy before you share it.`),
        }];
      }
    }
    return unboundMessage();
  }

  const rep = ctx.rep;
  const mode = getMode(ctx.key);

  if (mode === "await_url" && /^https?:\/\//i.test(trimmed)) {
    const [last] = await q(`SELECT id FROM hub_posts WHERE rep_id = ? ORDER BY created_at DESC LIMIT 1`, [rep.id]);
    if (last) await exec(`UPDATE hub_posts SET post_url = ?, status = 'reported' WHERE id = ?`, [trimmed.slice(0, 500), last.id]);
    setMode(ctx.key, null);
    const org = await getOrg();
    await logEvent(org.id, rep.id, "post_reported", trimmed.slice(0, 120));
    return [{ type: "text", text: T(rep, "已記錄！追蹤連結的點擊會即時算進「我的成效」。", "Recorded! Clicks on your tracked link count toward My results in real time.") }];
  }

  if (mode === "ask" || trimmed.length > 0) {
    const { askAssistant } = await import("./hermesBridge");
    const org = await getOrg();
    await logEvent(org.id, rep.id, "ask_ai", trimmed.slice(0, 120));
    const answer = await askAssistant(rep, trimmed);
    setMode(ctx.key, "ask");
    return [{ type: "text", text: answer.text }];
  }
  return [];
}

function unboundMessage(): BotMessage[] {
  return [{
    type: "text",
    text: "歡迎使用 ExpertHub 業務 AI 行銷團隊！請輸入總部提供的 6 碼綁定碼。\nWelcome! Please enter the 6-character binding code from HQ.",
  }];
}

function postMessages(rep: HubRep, post: {
  postId: number; caption: string; compliance: any; trackedLink: string; latencyMs: number;
}): BotMessage[] {
  const c = post.compliance;
  const fixed = c.checks.filter((k: any) => k.status === "fixed");
  const verdictLine = c.verdict === "clean"
    ? T(rep, "✅ 已通過公司社群政策檢查（6/6）", "✅ Passed all 6 company policy checks")
    : c.verdict === "auto_fixed"
      ? T(rep, `🛡️ 抓到 ${c.issuesCaught} 個風險並已自動修正`, `🛡️ Caught ${c.issuesCaught} risk(s) and fixed them`)
      : T(rep, "⚠️ 需要行銷部審核後再發", "⚠️ Needs marketing review before posting");
  return [
    { type: "text", text: post.caption },
    {
      type: "card",
      card: {
        title: verdictLine,
        body: [
          `${c.packName}`,
          ...fixed.map((k: any) => `• ${k.title}`),
          T(rep, `專屬追蹤連結：${post.trackedLink}`, `Tracked link: ${post.trackedLink}`),
        ],
        buttons: [
          { kind: "uri", label: T(rep, "分享給 LINE 好友", "Share to LINE friends"), uri: liffUrl("share", { p: post.postId }) },
          { kind: "postback", label: T(rep, "我發好了", "I posted it"), data: `a=shared&p=${post.postId}` },
          { kind: "uri", label: T(rep, "複製／編輯", "Copy / edit"), uri: liffUrl("write", { p: post.postId }) },
        ],
      },
    },
  ];
}

async function shareMessages(ctx: BotContext): Promise<BotMessage[]> {
  const rep = ctx.rep!;
  const [last] = await q(
    `SELECT id, caption, compliance, short_code FROM hub_posts WHERE rep_id = ? AND is_demo = 0 ORDER BY created_at DESC LIMIT 1`,
    [rep.id],
  );
  if (!last) {
    return [{ type: "text", text: T(rep, "你還沒有產出貼文，先按「寫一篇」吧！", "No posts yet — tap \"Write a post\" first!") }];
  }
  return [
    { type: "text", text: T(rep, "這是你最新的一篇，長按即可複製：", "Your latest post — long-press to copy:") },
    { type: "text", text: last.caption },
    {
      type: "card",
      card: {
        title: T(rep, "發到哪裡？", "Where to post?"),
        buttons: [
          { kind: "uri", label: "LinkedIn", uri: "https://www.linkedin.com/feed/?shareActive=true" },
          { kind: "uri", label: "Facebook", uri: "https://www.facebook.com/" },
          { kind: "uri", label: T(rep, "分享給 LINE 好友", "Share to LINE friends"), uri: liffUrl("share", { p: last.id }) },
          { kind: "postback", label: T(rep, "我發好了，回報網址", "Posted — report URL"), data: `a=shared&p=${last.id}` },
        ],
      },
    },
  ];
}

async function statsMessages(rep: HubRep): Promise<BotMessage[]> {
  const { getRepStats } = await import("../../../performance/core/hub/hubStats");
  const s = await getRepStats(rep.id);
  return [{
    type: "card",
    card: {
      title: T(rep, `近 ${s.windowDays} 天成效`, `Last ${s.windowDays} days`),
      subtitle: T(rep, `團隊排名 #${s.rank} / ${s.teamSize}`, `Team rank #${s.rank} of ${s.teamSize}`),
      body: [
        T(rep, `📝 發文 ${s.posts} 篇`, `📝 ${s.posts} posts`),
        T(rep, `🔗 追蹤連結點擊 ${s.clicks}`, `🔗 ${s.clicks} tracked clicks`),
        T(rep, `👀 已驗證曝光 ${s.verifiedImpressions.toLocaleString()}（LinkedIn／IG API）`, `👀 ${s.verifiedImpressions.toLocaleString()} verified impressions (LinkedIn/IG API)`),
        T(rep, `💬 互動 ${s.engagements}`, `💬 ${s.engagements} engagements`),
        T(rep, `🎯 診斷名單 ${s.leads}`, `🎯 ${s.leads} diagnosis leads`),
      ],
      footnote: T(rep, "Facebook 個人帳號沒有官方 API，曝光為估算或自行回報。", "Facebook personal profiles have no API — those numbers are estimated or self-reported."),
      buttons: [{ kind: "postback", label: T(rep, "再寫一篇", "Write another"), data: "a=write" }],
    },
  }];
}

// ── LINE Messaging API ──────────────────────────────────────────────────────

export function verifyLineSignature(rawBody: Buffer, signature: string | undefined): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const given = Buffer.from(signature, "base64");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function lineApi(path: string, body: unknown, host = "api.line.me") {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN not set");
  const res = await fetch(`https://${host}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`LINE ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

function toLineAction(a: BotAction) {
  return a.kind === "uri"
    ? { type: "uri", label: a.label.slice(0, 20), uri: a.uri }
    : { type: "postback", label: a.label.slice(0, 20), data: a.data, ...(a.displayText ? { displayText: a.displayText.slice(0, 300) } : {}) };
}

function toBubble(card: BotCard) {
  return {
    type: "bubble",
    size: "kilo",
    body: {
      type: "box", layout: "vertical", spacing: "sm",
      contents: [
        { type: "text", text: card.title.slice(0, 120), weight: "bold", size: "md", wrap: true },
        ...(card.subtitle ? [{ type: "text", text: card.subtitle, size: "xs", color: "#6B7280", wrap: true }] : []),
        ...(card.body ?? []).map((line) => ({ type: "text", text: line.slice(0, 400), size: "sm", wrap: true })),
        ...(card.footnote ? [{ type: "text", text: card.footnote, size: "xxs", color: "#9CA3AF", wrap: true }] : []),
      ],
    },
    ...(card.buttons.length
      ? {
          footer: {
            type: "box", layout: "vertical", spacing: "xs",
            contents: card.buttons.slice(0, 4).map((b, i) => ({
              type: "button", height: "sm", style: i === 0 ? "primary" : "secondary", color: i === 0 ? "#111827" : undefined,
              action: toLineAction(b),
            })),
          },
        }
      : {}),
  };
}

export function toLineMessages(messages: BotMessage[]) {
  return messages.slice(0, 5).map((m) => {
    if (m.type === "text") {
      return {
        type: "text",
        text: m.text.slice(0, 5000),
        ...(m.quickReplies?.length
          ? { quickReply: { items: m.quickReplies.slice(0, 13).map((a) => ({ type: "action", action: toLineAction(a) })) } }
          : {}),
      };
    }
    if (m.type === "card") return { type: "flex", altText: m.card.title.slice(0, 400), contents: toBubble(m.card) };
    return { type: "flex", altText: m.cards[0]?.title ?? "Solutions", contents: { type: "carousel", contents: m.cards.slice(0, 12).map(toBubble) } };
  });
}

export async function lineReply(replyToken: string, messages: BotMessage[]) {
  if (!messages.length) return;
  await lineApi("/v2/bot/message/reply", { replyToken, messages: toLineMessages(messages) });
}

export async function linePush(to: string, messages: BotMessage[]) {
  if (!messages.length) return;
  await lineApi("/v2/bot/message/push", { to, messages: toLineMessages(messages) });
}

export async function lineLoading(chatId: string, seconds = 20) {
  await lineApi("/v2/bot/chat/loading/start", { chatId, loadingSeconds: seconds }).catch(() => undefined);
}

/** Processes one webhook event end-to-end. Never throws. */
export async function processLineEvent(event: any): Promise<void> {
  const userId: string | undefined = event?.source?.userId;
  if (!userId || event?.source?.type !== "user") return;
  const rep = await getRepByLineUser(userId);
  const ctx: BotContext = { key: userId, rep, source: "line" };
  const started = Date.now();
  try {
    let messages: BotMessage[] = [];
    if (event.type === "follow") {
      messages = rep ? await handleMenu(ctx, "write") : unboundMessage();
    } else if (event.type === "postback") {
      if (rep) await lineLoading(userId, 30);
      messages = await handlePostback(ctx, String(event.postback?.data ?? ""));
    } else if (event.type === "message" && event.message?.type === "text") {
      if (rep) await lineLoading(userId, 30);
      messages = await handleText(ctx, String(event.message.text ?? ""));
    } else {
      return;
    }
    // Reply tokens last about a minute; slow generations fall back to push.
    if (Date.now() - started < 50_000 && event.replyToken) await lineReply(event.replyToken, messages);
    else await linePush(userId, messages);
  } catch (err: any) {
    console.error("[hub.line] event failed:", err?.message ?? err);
    const fallback: BotMessage[] = [{ type: "text", text: T(rep, "抱歉，剛剛處理失敗了，請再試一次。", "Sorry, that failed — please try again.") }];
    try {
      if (event.replyToken && Date.now() - started < 50_000) await lineReply(event.replyToken, fallback);
      else await linePush(userId, fallback);
    } catch { /* nothing more to do */ }
  }
}

/** Creates the 6-area rich menu from an image on disk and makes it the default. */
export async function setupRichMenu(imagePath: string) {
  const { readFile } = await import("node:fs/promises");
  const W = 2500, H = 1686, colW = Math.floor(W / 3), rowH = Math.floor(H / 2);
  const menu = await lineApi("/v2/bot/richmenu", {
    size: { width: W, height: H },
    selected: true,
    name: "ExpertHub rep menu",
    chatBarText: "AI 行銷團隊 · Menu",
    areas: RICH_MENU_AREAS.map((a, i) => ({
      bounds: { x: (i % 3) * colW, y: Math.floor(i / 3) * rowH, width: colW, height: rowH },
      action: { type: "postback", data: `a=${a.action}`, displayText: `${a.zh} ${a.en}` },
    })),
  });
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN!;
  const img = await readFile(imagePath);
  const up = await fetch(`https://api-data.line.me/v2/bot/richmenu/${menu.richMenuId}/content`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": imagePath.endsWith(".png") ? "image/png" : "image/jpeg" },
    body: img,
  });
  if (!up.ok) throw new Error(`rich menu image upload ${up.status}: ${(await up.text()).slice(0, 200)}`);
  const def = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${menu.richMenuId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!def.ok) throw new Error(`set default rich menu ${def.status}`);
  return { richMenuId: menu.richMenuId as string };
}

export async function simulatorContext(repId: number): Promise<BotContext> {
  const rep = await getRep(repId);
  return { key: `sim:${repId}`, rep, source: "simulator" };
}
