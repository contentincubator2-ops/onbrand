/**
 * boothRoutes — 展場對話給 Hermes 用的 MCP 介面。
 *
 *   POST /mcp/booth          MCP (Streamable HTTP, stateless)
 *                            bearer = BOOTH_MCP_TOKEN（一場活動一個）
 *
 * 2026-09-19 (CJ)：訪客在 LINE 或 WhatsApp 上被 Hermes 引導，給公司名和網址，
 * 我們盤他的產品、建他的品牌大腦，他再貼一篇自己喜歡的文章，然後開始發文。
 *
 * ── 為什麼 token 是一場活動一個，不是一位訪客一個 ────────────────────
 * 業務那支 `/mcp` 是每位業務一個 token，因為工具回的是「他自己的」資料，
 * 身分必須綁在憑證上。展場這支相反：同一個 Hermes agent 同時招呼很多位訪客，
 * 所以身分是參數（visitor_id），憑證只證明「你是我們的展場 agent」。
 *
 * 每個工具都回一個 `say`：可以直接講出口的話。Hermes 決定講不講、怎麼接。
 */
import express, { type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  BOOTH_PRODUCT_CAP,
  BoothError,
  boothState,
  createBrandBrain,
  discoveryStatus,
  getQuickPulse,
  publishStyleWhenReady,
  styleLink,
  writePost,
} from "../core/booth/boothFlow";
import { ensureBoothTables, getVisitorById, upsertVisitor } from "../core/booth/boothStore";

export const boothPublicRouter = express.Router();

const boothLimiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, validate: false });

function tokenOk(req: Request): boolean {
  const expected = process.env.BOOTH_MCP_TOKEN;
  if (!expected) return false;
  const given = (req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
  // 長度先比，再逐字比 —— 這個 token 不是密碼等級的秘密（一場活動一個、可隨時換），
  // 但也沒有理由讓它可以被一個一個字元試出來。
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function buildBoothMcpServer() {
  const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
  const server = new McpServer({ name: "onbrand-booth", version: "1.0.0" });
  const asText = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
  const asError = (message: string, hint?: string) => ({
    content: [{ type: "text" as const, text: hint ? `${message}\n\nWhat to do: ${hint}` : message }],
    isError: true,
  });

  /** 每個工具都可能丟 BoothError（可以直接講給訪客聽的話），統一轉成 isError。 */
  const guard = <T>(fn: () => Promise<T>) =>
    fn().then(asText).catch((e: any) =>
      e instanceof BoothError ? asError(e.message, e.hint) : asError(e?.message ?? String(e)));

  server.registerTool(
    "identify_visitor",
    {
      description:
        "Look up (or start) the booth visitor behind a chat. Call this FIRST in every conversation — "
        + "every other tool takes the visitor_id it returns. Also tells you what step they're on.",
      inputSchema: {
        channel: z.enum(["line", "whatsapp", "web"]),
        channel_user_id: z.string().min(1).max(120),
        display_name: z.string().max(120).optional(),
      },
    },
    async ({ channel, channel_user_id, display_name }) =>
      guard(async () => {
        const visitor = await upsertVisitor({ channel, channelUserId: channel_user_id, displayName: display_name ?? null });
        // visitorId 已經在 state 裡，這裡再給一個 snake_case 別名就好，
        // 免得同一個數字在回傳裡出現兩次讓模型以為是兩件事。
        const { visitorId, ...state } = await boothState({ visitorId: visitor.id });
        return { visitor_id: visitorId, ...state };
      }),
  );

  server.registerTool(
    "create_brand_brain",
    {
      description:
        "Start a brand brain from a company name and website. Returns immediately; the site crawl and "
        + "product inventory run in the background. Safe to call twice — the same visitor keeps one brand. "
        + "Set `language` to whatever the visitor is speaking — it decides what language their posts come out in.",
      inputSchema: {
        visitor_id: z.number().int().positive(),
        company: z.string().min(1).max(200),
        website: z.string().min(3).max(500),
        language: z.enum(["en-US", "zh-TW"]).optional(),
      },
    },
    async ({ visitor_id, company, website, language }) =>
      guard(() => createBrandBrain({ visitorId: visitor_id, company, website, language })),
  );

  server.registerTool(
    "get_quick_pulse",
    {
      description:
        "Read the visitor's website and summarise it into positioning. Takes about 15-20 seconds, so say "
        + "something to them first. Returns a line you can read out loud. Competitor and trend analysis are "
        + "deliberately NOT included — those need the full run, which is the paid tier.",
      inputSchema: {
        visitor_id: z.number().int().positive(),
        language: z.enum(["zh-TW", "en-US"]).optional(),
      },
    },
    async ({ visitor_id, language }) =>
      guard(() => getQuickPulse({ visitorId: visitor_id, lang: language })),
  );

  server.registerTool(
    "get_discovery_status",
    {
      description:
        `How the product inventory is going, with the product names found so far (up to ${BOOTH_PRODUCT_CAP} at the booth). `
        + "Poll this between messages rather than making the visitor wait.",
      inputSchema: { visitor_id: z.number().int().positive() },
      annotations: { readOnlyHint: true },
    },
    async ({ visitor_id }) => guard(() => discoveryStatus({ visitorId: visitor_id })),
  );

  server.registerTool(
    "get_style_link",
    {
      description:
        "A one-field web page where the visitor pastes a post they've written, so we can learn how they write. "
        + "Send them this link instead of asking them to paste a long post into the chat.",
      inputSchema: { visitor_id: z.number().int().positive() },
    },
    async ({ visitor_id }) => guard(() => styleLink({ visitorId: visitor_id })),
  );

  server.registerTool(
    "write_post",
    {
      description:
        "Write one post in the visitor's own style, about their own product. Leave `topic` out and it picks "
        + "a product we found on their site. Only works once get_state says ready_to_write. Takes 15-30 seconds. "
        + "Returns whether the post landed inside the length range measured from their own writing — if it "
        + "didn't, say so rather than glossing over it.",
      inputSchema: {
        visitor_id: z.number().int().positive(),
        topic: z.string().max(400).optional(),
      },
    },
    async ({ visitor_id, topic }) => guard(() => writePost({ visitorId: visitor_id, topic })),
  );

  server.registerTool(
    "get_state",
    {
      description: "Where this visitor is in the flow. Check it before deciding what to ask next.",
      inputSchema: { visitor_id: z.number().int().positive() },
      annotations: { readOnlyHint: true },
    },
    async ({ visitor_id }) => guard(() => boothState({ visitorId: visitor_id })),
  );

  return server;
}

boothPublicRouter.post("/mcp/booth", boothLimiter, async (req: Request, res: Response) => {
  if (!tokenOk(req)) {
    res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "invalid booth token" }, id: null });
    return;
  }
  try {
    await ensureBoothTables();
    const { StreamableHTTPServerTransport } = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
    const server = await buildBoothMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => { void transport.close(); void server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err: any) {
    console.error("[booth.mcp]", err?.message ?? err);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "booth mcp failed" }, id: null });
    }
  }
});

/** 給 /booth/style 頁用的：token 換成「這是誰、他的品牌叫什麼」。 */
boothPublicRouter.get("/api/booth/style/:token", boothLimiter, async (req: Request, res: Response) => {
  try {
    await ensureBoothTables();
    const { getVisitorByStyleToken } = await import("../core/booth/boothStore");
    const visitor = await getVisitorByStyleToken(String(req.params.token));
    if (!visitor || !visitor.brandId) {
      res.status(404).json({ found: false });
      return;
    }
    res.json({
      found: true,
      company: visitor.company,
      displayName: visitor.displayName,
      // 已經貼過就讓頁面知道，不要讓人以為沒存到又貼一次。
      submitted: Boolean(await hasStyleCard(visitor.brandId)),
    });
  } catch (err: any) {
    console.error("[booth.style]", err?.message ?? err);
    res.status(500).json({ found: false });
  }
});

/**
 * 貼上的文章 → 一張自建任務卡。
 *
 * 走 brandTaskCardRouter.create 而不是自己寫入，是為了拿到它後面整套：
 * 字數從範例量出來、SKILL 背景反推、方案張數上限、事實洩漏檢查。試用方案
 * 剛好是 1 張，等於每位訪客就是「你的寫法」這一張。
 */
boothPublicRouter.post("/api/booth/style/:token", boothLimiter, express.json({ limit: "64kb" }), async (req: Request, res: Response) => {
  try {
    await ensureBoothTables();
    const { getVisitorByStyleToken } = await import("../core/booth/boothStore");
    const visitor = await getVisitorByStyleToken(String(req.params.token));
    if (!visitor || !visitor.brandId || !visitor.userId) {
      res.status(404).json({ ok: false, error: "That link has expired." });
      return;
    }

    const parsed = z.object({
      sample: z.string().min(80).max(8_000),
      channel: z.enum(["facebook", "instagram", "threads", "linkedin", "tiktok", "youtube", "email", "pr", "website"]).default("facebook"),
    }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: "Paste a bit more — I need at least a short paragraph to work out how you write.",
      });
      return;
    }

    if (await hasStyleCard(visitor.brandId)) {
      res.json({ ok: true, alreadyDone: true });
      return;
    }

    const { appRouter } = await import("../../routers");
    const caller = appRouter.createCaller({ user: { id: visitor.userId } } as any);
    const created = await caller.brandTaskCard.create({
      brandId: visitor.brandId,
      name: "My style",
      channel: parsed.data.channel,
      samples: [parsed.data.sample.trim()],
      primaryQuestion: "What is this post about?",
      primaryPlaceholder: "",
      askFields: [],
      variants: 1,
      agentId: null,
    });

    // SKILL 在背景生成，生完就替他上架——訪客不會回網頁按「上架」那顆按鈕。
    void publishStyleWhenReady({ brandId: visitor.brandId, userId: visitor.userId, cardId: created.cardId });

    res.json({ ok: true, cardId: created.cardId, measured: created.card.measured });
  } catch (err: any) {
    console.error("[booth.style.submit]", err?.message ?? err);
    res.status(500).json({ ok: false, error: "Something went wrong saving that. Try again in a moment." });
  }
});

async function hasStyleCard(brandId: number): Promise<boolean> {
  const { listBrandTaskCards } = await import("../../strategy/core/brandTaskCards");
  return (await listBrandTaskCards(brandId)).length > 0;
}

export { getVisitorById };
