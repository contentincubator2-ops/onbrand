/**
 * strategistChatRouter — 「策略總監」對話。
 *
 * 2026-09-23（CJ「現在雖然不錯，但我覺得策略總監的角色，可以幫忙監測市場
 * 環境還有檢查一致性，所以目前的互動方式，會讓我覺得，這兩件事不是他負責
 * 的，也會讓我覺得，沒有跟策略總監互動。要怎麼設計，可以讓策略總監可以
 * 提供用戶，用對話的方式，問策略總監有關於策略的問題？然後，策略總監也
 * 可以引導進行策略監測和健檢？」）：
 *
 * 上一輪把策略總監／策略監測／策略健檢收成三顆平行的 icon，解決了「按鈕
 * 太多」，卻把三件事拆成互不相干的工具——這輪要把「監測」「健檢」重新
 * 收回策略總監的職責範圍：使用者跟總監聊天，總監在對話裡主動建議「要不要
 * 我?guide 你去看看策略監測／做一次策略健檢」，點一下建議就打開對應的
 * 面板（既有的 StrategyAlertsPanel／StrategyWorkbench，這裡不重做一次那
 * 兩塊 UI，只負責「引導過去」——跟這整個 session 一貫的「提案，不自動
 * 套用」紀律一致：總監只建議，實際掃描/健檢還是使用者在那個面板裡自己按）。
 *
 * 架構完全仿照 server/platform/routers/supportRouter.ts（Mia 客服）：
 * 兩張表（conversations/messages）、gatherContext 組系統提示、
 * <<action:kind>>Label 標記協定、per-user rate limit。刻意不共用
 * supportRouter 的程式碼——人設、grounding 內容、action 種類都不同，
 * 硬共用只會讓兩邊互相牽制。也刻意不用 positioning._xxx JSON 欄位存對話
 * ——對話是無界、只增不減的歷史，跟 _workbench/_aiPrompts 那種有界、
 * 少量更新的結構性資料本質不同，硬塞進 positioning 等於每則訊息都要
 * 讀寫整個品牌定位 JSON。
 *
 * 只有兩種 action（比 Mia 少，也刻意少）：
 *   open_monitor     → 前端打開「策略監測」面板（不直接觸發掃描）
 *   open_healthcheck → 前端打開「策略健檢」面板（不直接觸發健檢——
 *                       健檢需要的錨點選擇只存在 StrategyWorkbench 自己
 *                       的 React state，總監這裡拿不到，硬塞會是編的）
 * 「引導進行」= 帶使用者到那個面板，不是總監自己動手。
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../platform/core/trpc";
import localPool from "../../localDb";
import { callModel } from "../../platform/core/multiModelRouter";

// ── per-user rate limit（跟 supportRouter 同一套數字，同一個理由：LLM 呼叫要花錢）──
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

// ── helpers ──────────────────────────────────────────────────────────────
async function assertBrandOwned(brandId: number, userId: number): Promise<void> {
  const [rows]: any = await localPool.execute(
    `SELECT id FROM brands WHERE id = ? AND userId = ? LIMIT 1`, [brandId, userId],
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "brand not found" });
  }
}

async function ensureOpenConversation(userId: number, brandId: number): Promise<number> {
  const [rows]: any = await localPool.execute(
    `SELECT id FROM strategist_conversations
      WHERE userId = ? AND brandId = ? AND status = 'open'
      ORDER BY updatedAt DESC LIMIT 1`,
    [userId, brandId],
  );
  const existing = (rows as any[])[0]?.id;
  if (existing) return Number(existing);
  const [ins]: any = await localPool.execute(
    `INSERT INTO strategist_conversations (userId, brandId, status) VALUES (?, ?, 'open')`,
    [userId, brandId],
  );
  return Number(ins?.insertId ?? 0);
}

async function loadConversation(conversationId: number, userId: number) {
  const [rows]: any = await localPool.execute(
    `SELECT id, userId, brandId, status FROM strategist_conversations
      WHERE id = ? AND userId = ? LIMIT 1`,
    [conversationId, userId],
  );
  return (rows as any[])[0] ?? null;
}

async function loadMessages(conversationId: number, limit = 100) {
  // 2026-05-13 於 supportRouter 訂下的紀律，這裡照搬：LIMIT 夾在合理範圍，
  // 避免一個爆量的對話串每次 sendMessage 都要撈幾千則訊息。
  const safe = Math.max(1, Math.min(500, Math.floor(limit)));
  const [rows]: any = await localPool.execute(
    `SELECT id, role, content, contextSnapshot, createdAt FROM strategist_messages
      WHERE conversationId = ?
      ORDER BY id DESC
      LIMIT ${safe}`,
    [conversationId],
  );
  return (rows as Array<{ id: number; role: string; content: string; contextSnapshot: any; createdAt: Date }>).reverse();
}

async function insertMessage(args: {
  conversationId: number;
  role: "user" | "strategist";
  content: string;
  contextSnapshot?: any;
}): Promise<number> {
  const [ins]: any = await localPool.execute(
    `INSERT INTO strategist_messages (conversationId, role, content, contextSnapshot)
     VALUES (?, ?, ?, ?)`,
    [args.conversationId, args.role, args.content,
     args.contextSnapshot ? JSON.stringify(args.contextSnapshot) : null],
  );
  await localPool.execute(
    `UPDATE strategist_conversations SET updatedAt = NOW(3) WHERE id = ?`,
    [args.conversationId],
  );
  return Number(ins?.insertId ?? 0);
}

/** 品牌定位摘要——讓總監真的答得出具體問題，不是空話。跟 supportRouter 的
 *  gatherSessionContext 同一種做法（直接 SQL 抓幾個關鍵欄位），但這裡的
 *  角色是「策略顧問」，抓的欄位更完整（受眾/競爭/差異化/標語/語氣）。 */
async function gatherBrandContext(brandId: number, userId: number): Promise<string> {
  const ctx: string[] = [];
  try {
    const [rows]: any = await localPool.execute(
      `SELECT name, industry,
              JSON_UNQUOTE(JSON_EXTRACT(positioning, '$.tagline.zhTagline'))          AS tagline,
              JSON_UNQUOTE(JSON_EXTRACT(positioning, '$.goldenCircle.why'))           AS gcWhy,
              JSON_UNQUOTE(JSON_EXTRACT(positioning, '$.audience.primary'))           AS audience,
              JSON_UNQUOTE(JSON_EXTRACT(positioning, '$.differentiation.summary'))    AS diffSummary,
              JSON_UNQUOTE(JSON_EXTRACT(positioning, '$.differentiation.discriminator')) AS discriminator,
              JSON_UNQUOTE(JSON_EXTRACT(positioning, '$._workbench.healthCheck.checkedAt')) AS hcCheckedAt
         FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
      [brandId, userId],
    );
    const b = (rows as any[])[0];
    if (!b) return "";
    ctx.push(`品牌：${b.name}${b.industry ? `（${b.industry}）` : ""}`);
    if (b.tagline && b.tagline !== "null") ctx.push(`標語：${b.tagline}`);
    if (b.gcWhy && b.gcWhy !== "null") ctx.push(`WHY 信念：${String(b.gcWhy).slice(0, 200)}`);
    if (b.audience && b.audience !== "null") ctx.push(`主受眾：${String(b.audience).slice(0, 200)}`);
    const diff = b.discriminator && b.discriminator !== "null" ? b.discriminator : b.diffSummary;
    if (diff && diff !== "null") ctx.push(`差異化：${String(diff).slice(0, 200)}`);
    ctx.push(b.hcCheckedAt && b.hcCheckedAt !== "null"
      ? `上次策略健檢時間：${b.hcCheckedAt}（可以主動問要不要再檢查一次）`
      : `這個品牌還沒做過策略健檢`);
  } catch { /* non-fatal */ }
  return ctx.join("\n");
}

const STRATEGIST_SYSTEM_PROMPT = `你是 OnBrand 的策略總監，繁體中文，口語、直接、不要客套、不要講「親愛的」。

你的職責只有兩件事：
1. 回答用戶關於這個品牌策略的問題——定位、受眾、競爭、差異化、標語、語氣，
   任何策略相關的疑問都可以問你。根據下方的品牌定位摘要具體回答，講得出
   「為什麼」，不要講空泛的行銷場面話。摘要沒提到的東西，誠實說你不知道，
   不要編。
2. 判斷用戶現在適合用哪個工具，主動建議並引導過去（不是你自己動手做）：
   - 策略監測：看外部市場——競爭者的新動作、受眾偏好的轉變。適合回答
     「外面是不是有什麼變化該注意」。
   - 策略健檢：看內部一致性——不看外面，只憑品牌自己的研究資料獨立判斷，
     跟用戶目前選的策略工作台錨點比對是否一致。適合回答「我自己選的策略，
     跟我品牌的故事是不是同一件事」。

覺得某個工具真的能幫上忙，就在建議句子最後面加一個標記（使用者看到的是
一顆按鈕，不是這串文字本身），標記後面接的是按鈕上要顯示的字（≤12字）：
  <<action:open_monitor>>看看外部有什麼變化
  <<action:open_healthcheck>>帶我去做健檢
沒有工具幫得上忙就正常聊天，不要為了用而用、硬塞標記。一次最多建議一個。`;

const ACTION_RE = /<<action:([a-z_0-9]+)>>\s*([^\n<]*)/gi;
export type StrategistAction =
  | { kind: "open_monitor"; label: string }
  | { kind: "open_healthcheck"; label: string };

function parseActions(raw: string): { clean: string; actions: StrategistAction[] } {
  if (!raw) return { clean: "", actions: [] };
  const actions: StrategistAction[] = [];
  const clean = raw.replace(ACTION_RE, (_full, kind: string, label: string) => {
    const trimmedLabel = (label ?? "").trim().slice(0, 24) || _full;
    const lower = kind.toLowerCase();
    if (lower === "open_monitor") actions.push({ kind: "open_monitor", label: trimmedLabel });
    else if (lower === "open_healthcheck") actions.push({ kind: "open_healthcheck", label: trimmedLabel });
    return "";
  });
  return { clean: clean.replace(/\n{3,}/g, "\n\n").trim(), actions: actions.slice(0, 1) };
}

/**
 * 2026-09-23（CJ「策略總監也可以...主動發問」）：新對話第一次開啟時，與其
 * 讓使用者面對一個空面板，不如讓總監先開口——用「品牌現在缺什麼」決定
 * 開場白，不叫 LLM（省一次呼叫，也不會因為 LLM 亂猜而失真）：沒做過健檢
 * 就建議健檢，有未讀的策略監測提醒就提一下，兩者都沒有就給一句帶品牌
 * 名字的一般問候。只在對話「第一次建立、還沒有任何訊息」時算一次，之後
 * 不會每次開面板都重講一次開場白。
 */
async function buildProactiveOpening(brandId: number, userId: number, brandName: string, en: boolean):
  Promise<{ content: string; actions: StrategistAction[] }> {
  try {
    const [rows]: any = await localPool.execute(
      `SELECT JSON_UNQUOTE(JSON_EXTRACT(positioning, '$._workbench.healthCheck.checkedAt')) AS hcCheckedAt
         FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
      [brandId, userId],
    );
    const hcDone = !!(rows as any[])[0]?.hcCheckedAt && (rows as any[])[0].hcCheckedAt !== "null";
    if (!hcDone) {
      return {
        content: en
          ? `Hi, I'm ${brandName}'s Strategy Director. You haven't run a Strategy Health Check yet — want me to take you there? I'll independently read your brand's own research and see if it agrees with what you picked in the workbench.`
          : `嗨，我是${brandName}的策略總監。你還沒做過策略健檢——要我帶你去看看嗎？我會獨立看一次品牌自己的研究資料，看跟你在工作台選的是不是一致。`,
        actions: [{ kind: "open_healthcheck", label: en ? "Take me there" : "帶我去看看" }],
      };
    }
    // brandId（不是 scope/scopeId）——這樣品牌底下的產品層提醒也算得到，
    // 跟 idx_strategy_alerts_brand 這個既有索引對得上。
    const [alertRows]: any = await localPool.execute(
      `SELECT COUNT(*) AS c FROM strategy_alerts WHERE brandId = ? AND status = 'new'`,
      [brandId],
    );
    const unread = Number((alertRows as any[])[0]?.c ?? 0);
    if (unread > 0) {
      return {
        content: en
          ? `Hi, I'm ${brandName}'s Strategy Director. There ${unread === 1 ? "is" : "are"} ${unread} unread strategy alert${unread === 1 ? "" : "s"} waiting — want to take a look?`
          : `嗨，我是${brandName}的策略總監。有 ${unread} 則策略監測提醒還沒看——要看一下嗎？`,
        actions: [{ kind: "open_monitor", label: en ? "Show me" : "看一下" }],
      };
    }
  } catch { /* non-fatal — fall through to generic greeting */ }
  return {
    content: en
      ? `Hi, I'm ${brandName}'s Strategy Director. Ask me anything about this brand's positioning — or I can point you to Strategy Monitoring or a Health Check.`
      : `嗨，我是${brandName}的策略總監。問我任何跟這個品牌定位有關的問題，或者我可以帶你去看看策略監測或做一次健檢。`,
    actions: [],
  };
}

export const strategistChatRouter = router({
  /** 取得（或建立）這個品牌的開放對話串 + 歷史訊息，聊天面板開啟時呼叫一次。
   *  全新對話（還沒有任何訊息）會先幫使用者寫好一則開場白——見
   *  buildProactiveOpening()。 */
  getConversation: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertBrandOwned(input.brandId, userId);
      const conversationId = await ensureOpenConversation(userId, input.brandId);
      let messages = await loadMessages(conversationId, 60);
      if (messages.length === 0) {
        const [brandRows]: any = await localPool.execute(
          `SELECT name FROM brands WHERE id = ? AND userId = ? LIMIT 1`, [input.brandId, userId],
        );
        const brandName = (brandRows as any[])[0]?.name ?? "";
        const opening = await buildProactiveOpening(input.brandId, userId, brandName, false);
        await insertMessage({
          conversationId, role: "strategist", content: opening.content,
          contextSnapshot: opening.actions.length > 0 ? { actions: opening.actions } : undefined,
        });
        messages = await loadMessages(conversationId, 60);
      }
      return {
        conversationId,
        messages: messages.map((m) => ({
          id: m.id, role: m.role, content: m.content,
          actions: m.contextSnapshot
            ? (() => { try { return (typeof m.contextSnapshot === "string" ? JSON.parse(m.contextSnapshot) : m.contextSnapshot)?.actions ?? []; } catch { return []; } })()
            : [],
          createdAt: m.createdAt,
        })),
      };
    }),

  sendMessage: protectedProcedure
    .input(z.object({
      conversationId: z.number().int().positive(),
      brandId: z.number().int().positive(),
      content: z.string().min(1).max(2000),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const rate = checkRateLimit(userId);
      if (!rate.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: rate.reason === "minute_cap" ? "1 分鐘只能聊 5 次，先喘口氣再問。" : "1 小時上限 20 則，明天再聊。",
        });
      }
      const conv = await loadConversation(input.conversationId, userId);
      if (!conv) throw new TRPCError({ code: "NOT_FOUND", message: "conversation not found" });
      if (Number(conv.brandId) !== input.brandId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "conversation belongs to a different brand" });
      }

      const userMsgId = await insertMessage({ conversationId: input.conversationId, role: "user", content: input.content });

      const brandCtx = await gatherBrandContext(input.brandId, userId);
      const history = await loadMessages(input.conversationId);
      const llmMessages = [
        { role: "system" as const, content: STRATEGIST_SYSTEM_PROMPT + (brandCtx ? `\n\n[品牌定位摘要]\n${brandCtx}\n[/品牌定位摘要]` : "") },
        ...history.slice(-10).map((m) => ({
          role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
          content: m.content,
        })),
      ];

      let replyRaw = "";
      try {
        const r = await callModel(llmMessages, "general");
        replyRaw = (r.content ?? "").trim();
      } catch (e: any) {
        replyRaw = `我這邊剛剛斷線了（${String(e?.message ?? e).slice(0, 80)}），再問我一次看看。`;
      }
      if (!replyRaw) replyRaw = "這題我答不太上來，換個問法試試？";

      const { clean, actions } = parseActions(replyRaw);
      const strategistMsgId = await insertMessage({
        conversationId: input.conversationId, role: "strategist", content: clean,
        contextSnapshot: actions.length > 0 ? { actions } : undefined,
      });

      return {
        userMessage: { id: userMsgId, role: "user" as const, content: input.content },
        strategistMessage: { id: strategistMsgId, role: "strategist" as const, content: clean, actions },
      };
    }),
});
