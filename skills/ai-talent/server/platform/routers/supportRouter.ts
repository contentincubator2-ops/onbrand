/**
 * supportRouter — Mia · 客戶成功 chat + ticket escalation.
 *
 * Layer 2 (Mia AI agent) + Layer 3 (human escalation) of the 4-layer
 * customer support architecture from 2026-05-13.
 *
 *   support.startConversation   — get or create open thread for current user
 *   support.sendMessage         — user message + LLM reply (session-aware)
 *   support.listMessages        — full thread for the chat drawer
 *   support.escalateToHuman     — open a ticket linking the conversation
 *
 *   support.adminListTickets    — admin only: inbox view
 *   support.adminGetTicket      — admin only: full conversation
 *   support.adminReply          — admin posts a message + updates ticket status
 *   support.adminUpdateTicket   — admin tags / assigns / resolves
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "../core/trpc";
import localPool from "../../localDb";
import { callModel } from "../core/multiModelRouter";

// ── per-user rate limit (in-memory) ────────────────────────────────────────
// Trial users can't spam Mia to burn LLM credits. 20 msgs/hour, 5 msgs/min.
// In-memory is fine for single-instance pm2; if we ever scale horizontally
// move to Redis. Resets on server restart (acceptable for the threat model).
type RateState = { hourCount: number; hourReset: number; minCount: number; minReset: number };
const rateStateByUser = new Map<number, RateState>();
function checkRateLimit(userId: number): { allowed: boolean; reason?: string } {
  const now = Date.now();
  let s = rateStateByUser.get(userId);
  if (!s) { s = { hourCount: 0, hourReset: now + 3600_000, minCount: 0, minReset: now + 60_000 }; rateStateByUser.set(userId, s); }
  if (now >= s.hourReset) { s.hourCount = 0; s.hourReset = now + 3600_000; }
  if (now >= s.minReset)  { s.minCount = 0;  s.minReset  = now + 60_000; }
  if (s.minCount >= 5)  return { allowed: false, reason: "minute_cap" };
  if (s.hourCount >= 20) return { allowed: false, reason: "hour_cap" };
  s.minCount++; s.hourCount++;
  return { allowed: true };
}

// ── helpers ────────────────────────────────────────────────────────────────

export async function ensureOpenConversation(userId: number, brandId?: number | null): Promise<number> {
  const [rows]: any = await localPool.execute(
    `SELECT id FROM support_conversations
      WHERE userId = ? AND status = 'open'
      ORDER BY updatedAt DESC LIMIT 1`,
    [userId],
  );
  const existing = (rows as any[])[0]?.id;
  if (existing) return Number(existing);
  const [ins]: any = await localPool.execute(
    `INSERT INTO support_conversations (userId, brandId, status) VALUES (?, ?, 'open')`,
    [userId, brandId ?? null],
  );
  return Number(ins?.insertId ?? 0);
}

async function loadConversation(conversationId: number, userId: number) {
  const [rows]: any = await localPool.execute(
    `SELECT id, userId, brandId, status, createdAt FROM support_conversations
      WHERE id = ? AND userId = ? LIMIT 1`,
    [conversationId, userId],
  );
  return (rows as any[])[0] ?? null;
}

async function loadMessages(conversationId: number, limit = 100) {
  // 2026-05-13 (security review): cap rows so a spammed conversation
  // doesn't load 10k+ messages per sendMessage call (DoS vector).
  const safe = Math.max(1, Math.min(500, Math.floor(limit)));
  const [rows]: any = await localPool.execute(
    `SELECT id, role, content, contextSnapshot, createdAt FROM support_messages
      WHERE conversationId = ?
      ORDER BY id DESC
      LIMIT ${safe}`,
    [conversationId],
  );
  // We selected DESC for LIMIT; flip back to ASC for caller.
  return (rows as Array<{ id: number; role: string; content: string; contextSnapshot: any; createdAt: Date }>).reverse();
}

export async function insertMessage(args: {
  conversationId: number;
  role: "user" | "mia" | "admin";
  content: string;
  contextSnapshot?: any;
}): Promise<number> {
  const [ins]: any = await localPool.execute(
    `INSERT INTO support_messages (conversationId, role, content, contextSnapshot)
     VALUES (?, ?, ?, ?)`,
    [args.conversationId, args.role, args.content,
     args.contextSnapshot ? JSON.stringify(args.contextSnapshot) : null],
  );
  await localPool.execute(
    `UPDATE support_conversations SET updatedAt = NOW(3) WHERE id = ?`,
    [args.conversationId],
  );
  return Number(ins?.insertId ?? 0);
}

/** Gather context Mia uses to answer (current scope + recent run + brand voice). */
async function gatherSessionContext(args: {
  userId: number;
  currentPath?: string;
  brandId?: number | null;
  productId?: number | null;
  eventId?: number | null;
}): Promise<string> {
  const ctx: string[] = [];
  if (args.currentPath) ctx.push(`當前頁面：${args.currentPath}`);

  // 2026-06-05 (CJ「Mia 給的連結是空白頁」fail-safe):
  // Inject the user's actual brand list so Mia can never hallucinate brand IDs.
  // When user says "幫我看桂冠的定位" Mia must find the matching ID here,
  // not invent one. If the brand isn't in this list, Mia must say so.
  try {
    const [brandRows]: any = await localPool.execute(
      `SELECT id, name FROM brands WHERE userId = ? ORDER BY createdAt DESC LIMIT 20`,
      [args.userId],
    );
    const list = (brandRows as any[]).map((b) => `id=${b.id} 名稱="${b.name}"`).join("、");
    if (list) {
      ctx.push(`用戶擁有的品牌（你必須從這份清單找 brandId，不能自己猜編號；若用戶提到的品牌不在這份清單，直接說「找不到這個品牌」）：${list}`);
    } else {
      ctx.push(`用戶尚未建立任何品牌（先引導去 /brands 建立第一個品牌）`);
    }
  } catch { /* non-fatal */ }

  // Brand info
  if (args.brandId) {
    try {
      // 2026-05-17: brand positioning summary now derives from the
      // canonical positioning.differentiation.summary (or goldenCircle.why).
      const [rows]: any = await localPool.execute(
        `SELECT name, industry, description,
                JSON_UNQUOTE(JSON_EXTRACT(positioning, '$.differentiation.summary')) AS diffSummary,
                JSON_UNQUOTE(JSON_EXTRACT(positioning, '$.goldenCircle.why'))         AS gcWhy
           FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
        [args.brandId, args.userId],
      );
      const b = (rows as any[])[0];
      if (b) {
        ctx.push(`品牌：${b.name}${b.industry ? `（${b.industry}）` : ""}`);
        const summary = b.diffSummary || b.gcWhy;
        if (summary && summary !== "null") {
          ctx.push(`品牌定位摘要：${String(summary).slice(0, 240)}`);
        }
      }
    } catch { /* non-fatal */ }
  }

  // Recent mission output
  try {
    const [rows]: any = await localPool.execute(
      `SELECT o.id, o.platform, o.status,
              JSON_UNQUOTE(JSON_EXTRACT(o.metadata, '$.tier')) AS tier,
              JSON_UNQUOTE(JSON_EXTRACT(o.metadata, '$.taskId')) AS taskId,
              JSON_EXTRACT(o.metadata, '$.errors') AS errs,
              o.createdAt
         FROM mission_outputs o
         JOIN missions m ON m.id = o.missionId
        WHERE m.userId = ?
        ORDER BY o.id DESC LIMIT 1`,
      [args.userId],
    );
    const o = (rows as any[])[0];
    if (o) {
      ctx.push(`最近一筆任務：${o.tier ?? "?"} · ${o.taskId ?? "?"} · ${o.platform ?? "?"} · 狀態 ${o.status} · output id ${o.id}`);
      if (o.errs && o.errs !== "[]" && o.errs !== "null") {
        ctx.push(`該任務 errors: ${String(o.errs).slice(0, 200)}`);
      }
    }
  } catch { /* non-fatal */ }

  return ctx.join("\n");
}

const MIA_SYSTEM_PROMPT = `你是 Mia，OnBrand AI by SoWork 的客戶成功經理。
你說繁體中文，口語、不要客套、不要寫「親愛的」。
你的工作是：
1) 先給可執行的下一步（具體按鈕 / 頁面名稱）
2) 再給簡短原因（最多 1 句）
3) 不確定就老實說「我幫你發給 SoWork 團隊，預計 4 小時內回」並建議用戶點下方「我要找真人 →」

【你可以發送行動按鈕（重要）】
你不能直接幫用戶點按鈕，但你可以在訊息裡塞「行動標記」，前端會渲染成可點按鈕。**只在用戶明確要求「幫我做」「直接帶我去」「給我連結」時才放**，不要每則訊息都塞。

格式（一行一個，可放多個）：
<<action:navigate:/path>>顯示文字                  ← 用戶要點才跳
<<action:navigate:/path:auto>>顯示文字             ← 3 秒後自動跳（可取消）
<<action:open_task_30s:topic=主題文字>>跑 30 秒任務：主題
<<action:open_task_60s:topic=主題文字>>跑 60 秒任務：主題
<<action:open_task_99s:topic=主題文字>>跑 99 秒任務：主題

【auto 何時用】
- ✅ 用戶說「直接帶我去」「幫我切到」「給我連結」「自動跳」這類「主動催促」語氣 → 加 ":auto"
- ✅ 純讀取頁面（/calendar /projects /changelog /brands）→ 可以 auto
- ❌ 用戶只是問「在哪裡」「怎麼去」→ 不要 auto，給按鈕讓他自己決定
- ❌ open_task（會花錢的）→ 永遠不能 auto（server 強制忽略 ":auto" 標記）

範例對話：
用戶：「給我連結」（明確要求）
你：「3 秒後帶你進日曆 →
<<action:navigate:/calendar:auto>>去日曆」

用戶：「我要去哪看任務？」（只是問路）
你：「點下方按鈕進 Facebook 任務牆。
<<action:navigate:/tasks/fb>>去看 FB 任務」

用戶：「幫我開父親節任務」（會花錢）
你：「按下方按鈕確認，會跑一個內容套組任務（約 1 分鐘，花 ~$0.04）。
<<action:open_task_60s:topic=父親節 · 復華穩健傳承>>幫我開父親節任務」

不要假裝你已經幫用戶觸發了任何後端動作（不要寫「已遠端觸發」「任務 ID #811」這種幻覺）。
你只能：產生「行動按鈕」讓用戶自己點。

關於 OnBrand AI（你必須知道的）：
- 核心：先用「SoWork 14 步品牌定位法」鎖定品牌定位，AI 寫文案才會像用戶的品牌
- 任務規格（任務卡右上角標籤，**不要對用戶講 30s/60s/99s 這種秒數代號**）：單篇＝3 個 caption 變體＋視覺 brief（不直接生圖）/ 套組＝5 個 caption＋真的生圖＋留言模板 / 企劃＝再加 web research
- 主要頁面（2026-05-27 起任務改「平台優先」，舊的 /30s /60s /99s 頁面已removed，絕對不要再給）：
  /tasks/fb /tasks/ig /tasks/li /tasks/yt /tasks/tt /tasks/email /tasks/pr（各平台任務牆）
  /theater（七日發布台：一次產好一週跨平台內容）
  /brands（品牌總覽，不需 ?b=）/ /brands/edit?b=<brandId>（編輯特定品牌定位 — brandId 必須來自 session-context 裡的品牌清單，絕對不能自己猜）
  /projects（產出存放處）/ /calendar（節慶日曆）
  /run/:id（單筆產出頁：直接編輯、跟 AI 專家改文案、換人重寫、改圖、排程發布）

【支援平台白名單 — 只有這 7 個，其他都還沒有】
Facebook、Instagram、LinkedIn、YouTube、TikTok、Email 電子報、PR 新聞稿。
LINE、Threads、X/Twitter、小紅書等其他平台目前「沒有」任務入口。用戶問起：老實說還沒上線，
建議先用 FB/IG 任務產文案再手動貼過去，並主動說「我幫你把 LINE 需求回報給 SoWork 團隊」。
絕對不要宣稱支援白名單以外的平台，也不要給白名單頁面以外的連結（不存在的路徑會 404，用戶會更火）。

【brandId 規則 — 違反就會給用戶空白頁，CJ 特別警告】
✅ /brands/edit?b=<id>  ← id 必須是 session-context 裡明確列出的某個品牌 id
✅ /brands              ← 沒指定品牌時用這個（總覽頁）
❌ 不要自己編 brand id（會跳到空白頁）
❌ 用戶提到的品牌名不在清單裡 → 必須說「找不到這個品牌，要不要在 /brands 看你現有的品牌？」，不要硬給連結

常見痛點 + 你的標準回答：
- 「文案不像我的品牌」→ 先檢查品牌定位有沒有鎖定（/brands/edit → 鎖定按鈕）；不然 AI 還在猜
- 「圖生不出來」→ 單篇任務本來就只寫風格 brief，進 /run/:id 點預覽圖上的「點此生成」或右側工具列「改圖」才會真生
- 「定位卡在 13/14」→ 部署中斷造成的，已自動 fail，請按「重試」
- 「Anthropic 額度不足」→ 已自動 fallback 到 azure-foundry / qwen，會慢 3-5 秒但會成功

不要做：
- 編造功能（不確定有沒有的功能直接說「這個功能還沒做，我幫你回報」）
- 編造「已觸發」「任務 ID」（沒有就沒有 — 用行動按鈕代替）
- 講超過 4 句話（用戶在客服面板等你回，越短越好）
- 用 markdown 列表（用「①②③」或直接編號）`;

// ── action marker parsing ──────────────────────────────────────────────────
export type MiaAction =
  | { kind: "navigate"; url: string; label: string; auto?: boolean }
  | { kind: "open_task"; tier: "30s" | "60s" | "99s"; topic?: string; label: string; auto?: boolean };

const ACTION_RE = /<<action:([a-z_0-9]+)(?::([^>]*))?>>\s*([^\n<]*)/gi;

function extractActionsFromSnapshot(snap: any): MiaAction[] {
  try {
    const parsed = typeof snap === "string" ? JSON.parse(snap) : snap;
    return Array.isArray(parsed?.actions) ? (parsed.actions as MiaAction[]) : [];
  } catch { return []; }
}

// 2026-07-14 (CJ「Mia 給的連結失效」— it handed out the removed /60s tier
// route and claimed a nonexistent LINE feature): hard server-side allowlist
// for navigate actions. A stale/hallucinated path is dropped here so it never
// renders as a 404 button, regardless of what the LLM writes.
const NAVIGATE_ALLOW_RE = new RegExp(
  "^(?:" +
    "/tasks/(?:fb|ig|li|yt|tt|email|pr)" +
    "|/theater" +
    "|/brands(?:/edit)?" +
    "|/projects" +
    "|/calendar" +
    "|/run/\\d+" +
    "|/changelog" +
    "|/account" +
  ")(?:[?#]|$)",
);

function parseActions(raw: string): { clean: string; actions: MiaAction[] } {
  if (!raw) return { clean: "", actions: [] };
  const actions: MiaAction[] = [];
  const clean = raw.replace(ACTION_RE, (_full, kind: string, payload: string | undefined, label: string) => {
    const trimmedLabel = (label ?? "").trim() || _full;
    const lower = kind.toLowerCase();
    // 2026-05-14: optional `:auto` trailing flag → 3-sec auto-navigate
    // on client. Only honored for read-only actions (navigate).
    let payloadStr = (payload ?? "").trim();
    let auto = false;
    if (payloadStr.endsWith(":auto")) {
      payloadStr = payloadStr.slice(0, -":auto".length);
      auto = true;
    }
    if (lower === "navigate") {
      const url = payloadStr;
      if (url.startsWith("/") && NAVIGATE_ALLOW_RE.test(url)) {
        actions.push({ kind: "navigate", url, label: trimmedLabel, auto });
      }
      // Not on the allowlist → marker is stripped, no dead-link button rendered.
    } else if (lower === "open_task_30s" || lower === "open_task_60s" || lower === "open_task_99s") {
      const tier = (lower.replace("open_task_", "") as "30s" | "60s" | "99s");
      const topicMatch = /topic=([^]*)$/.exec(payloadStr);
      const topic = topicMatch ? topicMatch[1]!.trim() : undefined;
      // open_task spends LLM credits → NEVER auto, always require user click.
      actions.push({ kind: "open_task", tier, topic, label: trimmedLabel, auto: false });
    }
    return ""; // strip the marker from displayed text
  });
  // Clean up any stray double newlines from removed markers
  return { clean: clean.replace(/\n{3,}/g, "\n\n").trim(), actions };
}

// ── router ─────────────────────────────────────────────────────────────────

export const supportRouter = router({
  startConversation: protectedProcedure
    .input(z.object({
      brandId: z.number().nullable().optional(),
      /** When true, close existing open conversation and create a fresh one. */
      fresh: z.boolean().optional(),
    }).optional())
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;

      // If fresh=true: close existing open conversation so we get a clean slate
      if (input?.fresh) {
        await localPool.execute(
          `UPDATE support_conversations SET status = 'closed', updatedAt = NOW()
           WHERE userId = ? AND status = 'open'`,
          [userId],
        );
      }

      const conversationId = await ensureOpenConversation(userId, input?.brandId ?? null);
      const messages = await loadMessages(conversationId);
      // Greeting message on a brand-new conversation
      if (messages.length === 0) {
        // 2026-07-25 (CJ「不要一出來就問別人卡在哪裡，應該要自我介紹，
        // 讓別人知道怎麼運用它」): lead with who Mia is + what she can do,
        // with concrete example asks — not an interrogation.
        const greeting =
          "嗨，我是 Mia，OnBrand AI 的客戶成功經理 👋\n" +
          "你可以這樣用我：\n" +
          "① 教你操作 — 例如問「七日發布台怎麼用？」「怎麼讓文案更像我的品牌？」\n" +
          "② 排除問題 — 例如「定位跑不完」「圖生不出來」，我會幫你診斷並給解法\n" +
          "③ 帶路 — 跟我說你想做什麼，我直接給你捷徑按鈕，一鍵到對的頁面\n" +
          "直接輸入你的問題就可以開始。";
        const id = await insertMessage({
          conversationId, role: "mia", content: greeting,
        });
        return {
          conversationId,
          messages: [{ id, role: "mia", content: greeting, createdAt: new Date().toISOString() }],
        };
      }
      return {
        conversationId,
        messages: messages.map((m) => ({
          ...m,
          actions: extractActionsFromSnapshot(m.contextSnapshot),
          createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt),
        })),
      };
    }),

  /** List past conversations for the history panel. */
  listConversations: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.user!.id;
      const [rows]: any = await localPool.execute(
        `SELECT c.id, c.status, c.createdAt, c.updatedAt,
                (SELECT LEFT(content, 80) FROM support_messages
                 WHERE conversationId = c.id AND role = 'user'
                 ORDER BY id ASC LIMIT 1) AS firstUserMsg,
                (SELECT COUNT(*) FROM support_messages WHERE conversationId = c.id) AS msgCount
         FROM support_conversations c
         WHERE c.userId = ?
         ORDER BY c.updatedAt DESC
         LIMIT 30`,
        [userId],
      );
      return (rows as any[]).map((r: any) => ({
        id: Number(r.id),
        status: String(r.status ?? ""),
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
        updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
        firstUserMsg: r.firstUserMsg ?? null,
        msgCount: Number(r.msgCount ?? 0),
      }));
    }),

  /** Load a specific conversation by ID (for history view). */
  getConversation: protectedProcedure
    .input(z.object({ conversationId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const conv = await loadConversation(input.conversationId, userId);
      if (!conv) throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
      const messages = await loadMessages(input.conversationId);
      return {
        conversationId: input.conversationId,
        messages: messages.map((m) => ({
          ...m,
          actions: extractActionsFromSnapshot(m.contextSnapshot),
          createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt),
        })),
      };
    }),

  sendMessage: protectedProcedure
    .input(z.object({
      conversationId: z.number().int().positive(),
      content: z.string().min(1).max(2000),
      currentPath: z.string().max(200).optional(),
      brandId: z.number().nullable().optional(),
      productId: z.number().nullable().optional(),
      eventId: z.number().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      // 2026-05-13 (security review): per-user rate limit. Each LLM call
      // costs $; without this a malicious trial user can burn the wallet.
      const rate = checkRateLimit(userId);
      if (!rate.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: rate.reason === "minute_cap"
            ? "1 分鐘只能聊 5 次，先喘口氣再問。"
            : "1 小時上限 20 則。如果還沒解決，請點下方「我要找真人 →」直接開單。",
        });
      }
      const conv = await loadConversation(input.conversationId, userId);
      if (!conv) throw new TRPCError({ code: "NOT_FOUND", message: "conversation not found" });

      // Persist user message with snapshot
      const sessionCtx = await gatherSessionContext({
        userId,
        currentPath: input.currentPath,
        brandId: input.brandId,
        productId: input.productId,
        eventId: input.eventId,
      });
      const userMsgId = await insertMessage({
        conversationId: input.conversationId,
        role: "user",
        content: input.content,
        contextSnapshot: {
          path: input.currentPath ?? null,
          brandId: input.brandId ?? null,
          productId: input.productId ?? null,
          eventId: input.eventId ?? null,
        },
      });

      // Build chat history for the LLM (last 10 messages)
      const history = await loadMessages(input.conversationId);
      const llmMessages = [
        { role: "system" as const, content: MIA_SYSTEM_PROMPT + (sessionCtx ? `\n\n[session-context]\n${sessionCtx}\n[/session-context]` : "") },
        ...history.slice(-10).map((m) => ({
          role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
          content: m.content,
        })),
      ];

      let miaReplyRaw = "";
      try {
        const r = await callModel(llmMessages, "general");
        miaReplyRaw = (r.content ?? "").trim();
      } catch (e: any) {
        miaReplyRaw = `我這邊 LLM 出了狀況（${String(e?.message ?? e).slice(0, 80)}）。先點下方「我要找真人 →」直接給 SoWork 團隊看看。`;
      }
      if (!miaReplyRaw) {
        miaReplyRaw = "我不太確定怎麼回答這個。請點下方「我要找真人 →」，SoWork 會在 4 小時內回。";
      }
      // 2026-05-14 (CJ「他直接幫我切換頁面」): parse <<action:...>> markers
      // out of Mia's reply into structured action buttons. Stored content
      // is the clean version; actions ride on the response payload only.
      const parsed = parseActions(miaReplyRaw);
      // 2026-06-05 (CJ「Mia 給的連結是空白頁」fail-safe): scrub navigate
      // URLs whose ?b=<id> doesn't exist in this user's brand list. Mia
      // can hallucinate brand IDs from chat history; the only reliable
      // defense is post-validation here.
      const validBrandIds = await (async () => {
        try {
          const [rows]: any = await localPool.execute(
            `SELECT id FROM brands WHERE userId = ?`,
            [ctx.user!.id],
          );
          return new Set<number>((rows as any[]).map((r: any) => Number(r.id)));
        } catch { return new Set<number>(); }
      })();
      const actions = parsed.actions.filter((a) => {
        if (a.kind !== "navigate") return true;
        // Check for ?b=<digits> in url
        const m = a.url.match(/[?&]b=(\d+)/);
        if (!m) return true; // no brand-id constraint
        const bid = Number(m[1]);
        if (validBrandIds.has(bid)) return true;
        console.warn(`[mia] dropping action with invalid brandId=${bid}: ${a.url}`);
        return false;
      });
      const miaReply = parsed.clean;
      const miaMsgId = await insertMessage({
        conversationId: input.conversationId,
        role: "mia",
        content: miaReply,
        contextSnapshot: actions.length > 0 ? { actions } : undefined,
      });

      return {
        userMessage: { id: userMsgId, role: "user", content: input.content, createdAt: new Date().toISOString() },
        miaMessage:  { id: miaMsgId, role: "mia",  content: miaReply, createdAt: new Date().toISOString(), actions },
      };
    }),

  listMessages: protectedProcedure
    .input(z.object({ conversationId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const conv = await loadConversation(input.conversationId, userId);
      if (!conv) throw new TRPCError({ code: "NOT_FOUND", message: "conversation not found" });
      const messages = await loadMessages(input.conversationId);
      return messages.map((m) => ({
        ...m,
        actions: extractActionsFromSnapshot(m.contextSnapshot),
        createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt),
      }));
    }),

  escalateToHuman: protectedProcedure
    .input(z.object({
      conversationId: z.number().int().positive(),
      summary: z.string().min(1).max(500),
      currentPath: z.string().max(200).optional(),
      brandId: z.number().nullable().optional(),
      productId: z.number().nullable().optional(),
      eventId: z.number().nullable().optional(),
      browser: z.string().max(200).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const conv = await loadConversation(input.conversationId, userId);
      if (!conv) throw new TRPCError({ code: "NOT_FOUND", message: "conversation not found" });

      const sessionCtx = await gatherSessionContext({
        userId,
        currentPath: input.currentPath,
        brandId: input.brandId,
        productId: input.productId,
        eventId: input.eventId,
      });

      // Naive tag classification (LLM-improved later)
      const lc = input.summary.toLowerCase();
      const tag = /bug|error|失敗|跑不|當掉|壞|出錯/i.test(input.summary) ? "bug"
                : /想要|希望|建議|增加|可以加/i.test(input.summary)      ? "feature"
                : /怎麼|如何|哪裡|是什麼/i.test(input.summary)            ? "how-to"
                : /付費|帳單|方案|價格|計費|invoice/i.test(input.summary)  ? "billing"
                : /^(bug|err)/.test(lc) ? "bug"
                : "how-to";

      const [userRow]: any = await localPool.execute(
        `SELECT email FROM users WHERE id = ? LIMIT 1`,
        [userId],
      );
      const userEmail = (userRow as any[])[0]?.email ?? null;

      const [ins]: any = await localPool.execute(
        `INSERT INTO support_tickets
           (conversationId, userId, userEmail, status, tag, subject, autoContext)
         VALUES (?, ?, ?, 'open', ?, ?, ?)`,
        [
          input.conversationId, userId, userEmail, tag,
          input.summary.slice(0, 240),
          JSON.stringify({
            sessionCtx,
            path: input.currentPath ?? null,
            brandId: input.brandId ?? null,
            productId: input.productId ?? null,
            eventId: input.eventId ?? null,
            browser: input.browser ?? null,
          }),
        ],
      );
      const ticketId = Number(ins?.insertId ?? 0);

      // Mia confirmation message
      await insertMessage({
        conversationId: input.conversationId,
        role: "mia",
        content: `已開單給 SoWork（#${ticketId}, tag: ${tag}）。\n你會在 4 小時內收到回覆（用 ${userEmail ?? "你註冊的信箱"}）。`,
      });

      // Push notify the SoWork inbox (best-effort, non-blocking).
      void notifyAdminNewTicket({
        kind: "ticket", refId: ticketId, userEmail,
        subject: input.summary.slice(0, 120), tag,
      });

      return { ticketId, tag };
    }),

  myTickets: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.user!.id;
      const [rows]: any = await localPool.execute(
        `SELECT id, status, tag, subject, createdAt, updatedAt
           FROM support_tickets
          WHERE userId = ?
          ORDER BY id DESC LIMIT 50`,
        [userId],
      );
      return (rows as any[]).map((r) => ({
        ...r,
        createdAt: r.createdAt?.toISOString?.() ?? String(r.createdAt),
        updatedAt: r.updatedAt?.toISOString?.() ?? String(r.updatedAt),
      }));
    }),

  // ── Admin ────────────────────────────────────────────────────────────────
  // Use the shared DB-backed admin gate so cookie sessions (whose JWT does
  // not carry email) still recognize role='admin' and @sowork.tw/.ai users.
  adminListTickets: adminProcedure
    .input(z.object({
      status: z.enum(["open", "in_progress", "resolved", "all"]).default("all"),
    }).optional())
    .query(async ({ input }) => {
      const status = input?.status ?? "all";
      const where = status === "all" ? "1=1" : "status = ?";
      const params = status === "all" ? [] : [status];
      const [rows]: any = await localPool.execute(
        `SELECT t.id, t.userId, t.userEmail, t.status, t.tag, t.priority,
                t.subject, t.assignedTo, t.createdAt, t.updatedAt,
                t.conversationId
           FROM support_tickets t
          WHERE ${where}
          ORDER BY (t.status = 'open') DESC, t.updatedAt DESC
          LIMIT 100`,
        params,
      );
      return (rows as any[]).map((r) => ({
        ...r,
        createdAt: r.createdAt?.toISOString?.() ?? String(r.createdAt),
        updatedAt: r.updatedAt?.toISOString?.() ?? String(r.updatedAt),
      }));
    }),

  adminGetTicket: adminProcedure
    .input(z.object({ ticketId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const [rows]: any = await localPool.execute(
        `SELECT * FROM support_tickets WHERE id = ? LIMIT 1`,
        [input.ticketId],
      );
      const ticket = (rows as any[])[0];
      if (!ticket) throw new TRPCError({ code: "NOT_FOUND", message: "ticket not found" });
      const messages = await loadMessages(ticket.conversationId);
      let autoContext: any = null;
      try { autoContext = ticket.autoContext ? (typeof ticket.autoContext === "string" ? JSON.parse(ticket.autoContext) : ticket.autoContext) : null; } catch {/* */}
      return {
        ticket: {
          ...ticket,
          autoContext,
          createdAt: ticket.createdAt?.toISOString?.() ?? String(ticket.createdAt),
          updatedAt: ticket.updatedAt?.toISOString?.() ?? String(ticket.updatedAt),
        },
        messages: messages.map((m) => ({
          ...m,
          createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt),
        })),
      };
    }),

  adminReply: adminProcedure
    .input(z.object({
      ticketId: z.number().int().positive(),
      content: z.string().min(1).max(2000),
    }))
    .mutation(async ({ input }) => {
      const [rows]: any = await localPool.execute(
        `SELECT conversationId FROM support_tickets WHERE id = ? LIMIT 1`,
        [input.ticketId],
      );
      const t = (rows as any[])[0];
      if (!t) throw new TRPCError({ code: "NOT_FOUND" });
      await insertMessage({
        conversationId: t.conversationId,
        role: "admin",
        content: input.content,
      });
      await localPool.execute(
        `UPDATE support_tickets SET status = 'in_progress', updatedAt = NOW(3) WHERE id = ?`,
        [input.ticketId],
      );
      return { ok: true };
    }),

  adminUpdateTicket: adminProcedure
    .input(z.object({
      ticketId: z.number().int().positive(),
      status: z.enum(["open", "in_progress", "resolved"]).optional(),
      tag: z.enum(["bug", "feature", "how-to", "billing"]).optional(),
      priority: z.enum(["low", "normal", "high"]).optional(),
      adminNotes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input }) => {
      const fields: string[] = [];
      const params: any[] = [];
      if (input.status)     { fields.push("status = ?");     params.push(input.status); }
      if (input.tag)        { fields.push("tag = ?");        params.push(input.tag); }
      if (input.priority)   { fields.push("priority = ?");   params.push(input.priority); }
      if (input.adminNotes != null) { fields.push("adminNotes = ?"); params.push(input.adminNotes); }
      if (fields.length === 0) return { ok: true };
      params.push(input.ticketId);
      await localPool.execute(
        `UPDATE support_tickets SET ${fields.join(", ")} WHERE id = ?`,
        params,
      );
      return { ok: true };
    }),

  /**
   * 2026-05-16 (CJ「用戶可以透過客服 report bug，有 bug 就多送點數」):
   * Structured bug report. Creates a bug_reports row + a support ticket
   * + drops a confirmation line into the chat. Bounty points are NOT
   * granted here — only after an admin (or triage) confirms it's a real
   * bug, to stop farming. Returns the bug id.
   */
  reportBug: protectedProcedure
    .input(z.object({
      title: z.string().min(3).max(200),
      body: z.string().min(5).max(4000),
      pageUrl: z.string().max(512).optional(),
      conversationId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const [uRow]: any = await localPool.execute(
        `SELECT email FROM users WHERE id = ? LIMIT 1`, [userId],
      );
      const userEmail = (uRow as any[])[0]?.email ?? null;
      const convId = input.conversationId ?? await ensureOpenConversation(userId, null);

      const [ins]: any = await localPool.execute(
        `INSERT INTO bug_reports
           (userId, userEmail, conversationId, title, body, pageUrl, status)
         VALUES (?, ?, ?, ?, ?, ?, 'reported')`,
        [userId, userEmail, convId, input.title.slice(0, 200),
         input.body.slice(0, 4000), input.pageUrl ?? null],
      );
      const bugId = Number(ins?.insertId ?? 0);

      // Mirror into the support ticket queue (tag=bug) so it shows in
      // the existing admin support inbox too.
      await localPool.execute(
        `INSERT INTO support_tickets
           (conversationId, userId, userEmail, status, tag, subject, autoContext)
         VALUES (?, ?, ?, 'open', 'bug', ?, ?)`,
        [convId, userId, userEmail, input.title.slice(0, 240),
         JSON.stringify({ bugReportId: bugId, pageUrl: input.pageUrl ?? null })],
      );

      await insertMessage({
        conversationId: convId,
        role: "mia",
        content:
          `收到你的 Bug 回報 #${bugId}：「${input.title.slice(0, 60)}」。\n` +
          `我們會先判定是不是真的 bug。如果確認是系統問題，會自動進入修復流程，` +
          `修好後在這裡通知你，並加贈點數作為感謝 🙏`,
      });

      void notifyAdminNewTicket({
        kind: "bug", refId: bugId, userEmail,
        subject: input.title, body: input.body, tag: "bug",
      });

      return { ok: true as const, bugId };
    }),

  /**
   * 2026-06-12 (CJ「Mia 細緻化 — LLM 個人化下一步建議」):
   * Resolve an "llm" kind contextual nudge against the user's brand brain.
   * Frontend fires a nudge with kind="llm" → posts here with the prompt
   * template (already interpolated client-side) + nudge ID. We run the
   * prompt through the multi-model router with a short token budget and
   * return the personalised message back. Frontend swaps it into the
   * queued nudge entry. On failure, client keeps the static fallback.
   *
   * Rate-limited so a hot-loop in the client (or a malicious actor)
   * can't burn LLM credits.
   */
  contextNudge: protectedProcedure
    .input(z.object({
      nudgeId: z.string().min(1).max(80),
      prompt: z.string().min(1).max(2000),
      lang: z.enum(["zh-TW", "en"]).default("zh-TW"),
      contextVars: z.record(z.string(), z.any()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Rate limit: reuse the existing per-user rate state so a chat-spamming
      // user can't bypass Mia message limits by spamming contextNudge.
      const rate = checkRateLimit(ctx.user.id);
      if (!rate.allowed) {
        // Don't error — return the empty result so the static fallback stays.
        return { ok: false as const, reason: rate.reason ?? "rate_limited", message: null };
      }

      // Personalize system prompt with brand context if available.
      // We don't bail when no brand is found — the frontend already passes
      // {brandName} / {brandVoice} in the prompt for the common case.
      const systemPrompt = input.lang === "en"
        ? "You are Mia, OnBrand's customer success manager. Respond in natural English. " +
          "No greetings or sign-offs — just the actionable next-step text. " +
          "Maximum 80 words. Never invent metrics or features."
        : "你是 Mia，OnBrand 客戶成功經理。用自然口語繁體中文回應。" +
          "不要打招呼或結尾——直接給可執行的下一步建議。" +
          "最多 80 字。不要編造數字或功能。";

      try {
        const result = await callModel({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: input.prompt },
          ],
          // Short budget keeps response snappy + cheap. 80 words ≈ 200 tokens.
          maxTokens: 280,
          temperature: 0.7,
          purpose: "support_mia_nudge",
          userId: ctx.user.id,
        } as any);
        const message = String((result as any)?.text ?? (result as any)?.content ?? "").trim();
        if (message.length === 0) {
          return { ok: false as const, reason: "empty_llm_response", message: null };
        }
        return { ok: true as const, message };
      } catch (e: any) {
        // Eat the error — frontend keeps the static fallback. We log to
        // stderr so PM2 captures it; no need to throw upstream.
        console.warn(
          `[support.contextNudge] ${input.nudgeId} LLM call failed:`,
          e?.message ?? e,
        );
        return { ok: false as const, reason: "llm_error", message: null };
      }
    }),
});

/**
 * 2026-05-16 (CJ「客服有人接：工單升級時通知你」): email the SoWork
 * inbox the moment a ticket / bug is filed, so escalations aren't
 * silently sitting in /admin/support waiting for someone to look.
 * Best-effort — never throws, never blocks the user's request.
 */
export async function notifyAdminNewTicket(args: {
  kind: "ticket" | "bug";
  refId: number;
  userEmail: string | null;
  subject: string;
  body?: string;
  tag?: string | null;
}): Promise<void> {
  try {
    const to = process.env.SUPPORT_NOTIFY_TO || "sowork@sowork.ai";
    const { sendEmail } = await import("../auth/emailService");
    const label = args.kind === "bug" ? "🐛 Bug 回報" : "🎧 客服升級";
    await sendEmail({
      to,
      subject: `[OnBrand] ${label} #${args.refId}：${args.subject.slice(0, 80)}`,
      html: `
        <div style="font-family:-apple-system,sans-serif;line-height:1.6;color:#333">
          <h2 style="margin:0 0 8px">${label} #${args.refId}</h2>
          <p><b>來自：</b>${args.userEmail ?? "(未知)"}</p>
          ${args.tag ? `<p><b>分類：</b>${args.tag}</p>` : ""}
          <p><b>主旨：</b>${args.subject}</p>
          ${args.body ? `<p><b>內容：</b><br>${String(args.body).slice(0, 1500).replace(/\n/g, "<br>")}</p>` : ""}
          <hr>
          <p><a href="https://onbrand.sowork.ai/admin/support">→ 開啟客服收件匣</a></p>
        </div>`,
    });
  } catch (e) {
    console.error("[support] notifyAdminNewTicket failed:", e);
  }
}

/**
 * Push a system-authored message into the user's open support
 * conversation (role 'mia'). Used by the bug pipeline to tell the
 * reporter their issue was fixed. Best-effort — never throws.
 */
export async function pushSystemSupportMessage(userId: number, content: string): Promise<void> {
  try {
    const convId = await ensureOpenConversation(userId, null);
    await insertMessage({ conversationId: convId, role: "mia", content });
  } catch (e) {
    console.error("[support] pushSystemSupportMessage failed:", e);
  }
}
