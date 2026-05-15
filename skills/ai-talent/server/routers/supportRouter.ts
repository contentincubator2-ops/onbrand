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
import { router, protectedProcedure } from "../_core/trpc";
import localPool from "../localDb";
import { callModel } from "../_core/multiModelRouter";

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

  // Brand info
  if (args.brandId) {
    try {
      const [rows]: any = await localPool.execute(
        `SELECT name, industry, description,
                JSON_EXTRACT(soworkAnalysis, '$.executiveSummary') AS exec
           FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
        [args.brandId, args.userId],
      );
      const b = (rows as any[])[0];
      if (b) {
        ctx.push(`品牌：${b.name}${b.industry ? `（${b.industry}）` : ""}`);
        if (b.exec) {
          const summary = typeof b.exec === "string" ? b.exec : JSON.stringify(b.exec);
          ctx.push(`品牌定位摘要：${String(summary).replace(/^"|"$/g, "").slice(0, 240)}`);
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
你：「點下方按鈕進 /60s。
<<action:navigate:/60s>>去 /60s 看任務」

用戶：「幫我開父親節任務」（會花錢）
你：「按下方按鈕確認，會跑 60s 任務（~60 秒，花 ~$0.04）。
<<action:open_task_60s:topic=父親節 · 復華穩健傳承>>幫我開父親節任務」

不要假裝你已經幫用戶觸發了任何後端動作（不要寫「已遠端觸發」「任務 ID #811」這種幻覺）。
你只能：產生「行動按鈕」讓用戶自己點。

關於 OnBrand AI（你必須知道的）：
- 核心：先用「SoWork 14 步品牌定位法」鎖定品牌定位，AI 寫文案才會像用戶的品牌
- 30 秒任務：3 個 caption 變體 + 視覺 brief（不直接生圖，按「用此風格生圖」才生）
- 60 秒任務：5 個 caption + 真的生圖（Flux Schnell）+ 留言模板 + 發文時段建議
- 99 秒任務：60s 內容 + 前端加 web research scout
- 主要頁面：/brands（品牌總覽）/ /brands/edit（編輯品牌定位）/ /30s /60s /99s（任務）/ /projects（產出存放處）/ /calendar（節慶日曆）/ /run/:id（單筆任務結果頁，可手動改文案、生圖、發 FB）

常見痛點 + 你的標準回答：
- 「文案不像我的品牌」→ 先檢查品牌定位有沒有鎖定（/brands/edit → 鎖定按鈕）；不然 AI 還在猜
- 「圖生不出來」→ 30s 任務本來就只寫風格 brief，要按 /run/:id 右側 Step 4「Generate」才會真生
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
      if (url.startsWith("/")) actions.push({ kind: "navigate", url, label: trimmedLabel, auto });
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
    }).optional())
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const conversationId = await ensureOpenConversation(userId, input?.brandId ?? null);
      const messages = await loadMessages(conversationId);
      // Greeting message on a brand-new conversation
      if (messages.length === 0) {
        const greeting = "嗨，我是 Mia，OnBrand AI 的客戶成功經理。\n你卡在哪裡？或哪一步不會用？跟我說。";
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
      const { clean: miaReply, actions } = parseActions(miaReplyRaw);
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
  // CJ's user id is 199 (cjwang@sowork.tw). Hardcoded admin allowlist for
  // simplicity — formal admin role can be added later.
  adminListTickets: protectedProcedure
    .input(z.object({
      status: z.enum(["open", "in_progress", "resolved", "all"]).default("all"),
    }).optional())
    .query(async ({ ctx, input }) => {
      if (!isAdminUser(ctx.user!.id, ctx.user!.email)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "admin only" });
      }
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

  adminGetTicket: protectedProcedure
    .input(z.object({ ticketId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      if (!isAdminUser(ctx.user!.id, ctx.user!.email)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "admin only" });
      }
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

  adminReply: protectedProcedure
    .input(z.object({
      ticketId: z.number().int().positive(),
      content: z.string().min(1).max(2000),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isAdminUser(ctx.user!.id, ctx.user!.email)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "admin only" });
      }
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

  adminUpdateTicket: protectedProcedure
    .input(z.object({
      ticketId: z.number().int().positive(),
      status: z.enum(["open", "in_progress", "resolved"]).optional(),
      tag: z.enum(["bug", "feature", "how-to", "billing"]).optional(),
      priority: z.enum(["low", "normal", "high"]).optional(),
      adminNotes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isAdminUser(ctx.user!.id, ctx.user!.email)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "admin only" });
      }
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

      return { ok: true as const, bugId };
    }),
});

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

// Admin = CJ (userId 199) or any sowork.tw email. Trivial allowlist.
export function isAdminUser(userId: number, email?: string | null): boolean {
  if (userId === 199) return true;
  if (email && /@sowork\.(tw|ai)$/i.test(email)) return true;
  return false;
}
