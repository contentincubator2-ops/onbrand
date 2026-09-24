/**
 * Sales Hub — non-tRPC HTTP surface.
 *
 *   POST /line/webhook        LINE Messaging API (raw body; mount before express.json)
 *   GET  /whatsapp/webhook    Meta subscription handshake (echoes hub.challenge)
 *   POST /whatsapp/webhook    WhatsApp Cloud API (raw body, same reason as LINE)
 *   GET  /r/:code             tracked short link → logs the click → /scan/:code
 *   GET  /r/:code/qr.svg      QR for the booth
 *   GET  /api/hub/scan/:code  public attribution card for the scan page
 *   POST /mcp                 MCP (Streamable HTTP, stateless) for Hermes profiles,
 *                             bearer = the rep's own token
 *
 * /r and /mcp are GET-shadowed by the SPA fallback, so index.ts mounts this
 * router before the static block.
 */

import express, { type Request, type Response } from "express";
import { createHash } from "node:crypto";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  exec,
  getOrg,
  getRepByMcpToken,
  listFacts,
  listSolutions,
  logEvent,
  publicBaseUrl,
  q,
  formatPrice,
  type HubRep,
} from "../core/hub/hubStore";
import { processLineEvent, verifyLineSignature } from "../core/hub/lineBot";
import { parseIdentityChanges, parseInbound, verifySubscription, verifyWhatsAppSignature } from "../core/hub/whatsappBot";

// ── LINE webhook ────────────────────────────────────────────────────────────

export async function hubLineWebhookHandler(req: Request, res: Response) {
  const raw = req.body as Buffer;
  if (!Buffer.isBuffer(raw) || !verifyLineSignature(raw, req.header("x-line-signature"))) {
    res.status(401).json({ error: "bad signature" });
    return;
  }
  // Acknowledge first; LINE retries slow webhooks. Reply tokens stay valid ~1 min.
  res.status(200).json({ ok: true });
  let payload: any;
  try { payload = JSON.parse(raw.toString("utf8")); } catch { return; }
  for (const event of payload?.events ?? []) {
    void processLineEvent(event);
  }
}

// ── WhatsApp webhook ────────────────────────────────────────────────────────

/**
 * 2026-09-19 (CJ「WhatsApp 的 Meta 送件今天開始」)。
 *
 * Meta 在你把 callback URL 填進去的當下就會打 GET 過來要 challenge，答不出來
 * 就不讓你存檔——所以這條路由必須先存在，設定才做得下去。對話邏輯還沒接上，
 * 現在收到訊息只記一筆 event；接上之後這裡改成呼叫 handleText / handlePostback。
 */
export function hubWhatsAppVerifyHandler(req: Request, res: Response) {
  const challenge = verifySubscription(req.query as Record<string, unknown>);
  if (challenge === null) {
    res.status(403).send("verification failed");
    return;
  }
  res.status(200).send(challenge);
}

export async function hubWhatsAppWebhookHandler(req: Request, res: Response) {
  const raw = req.body as Buffer;
  if (!Buffer.isBuffer(raw) || !verifyWhatsAppSignature(raw, req.header("x-hub-signature-256"))) {
    res.status(401).json({ error: "bad signature" });
    return;
  }
  // 先回 200。Meta 對慢的 webhook 會重送，重送就會變成重複回覆。
  res.status(200).json({ ok: true });

  let payload: any;
  try { payload = JSON.parse(raw.toString("utf8")); } catch { return; }

  /**
   * BSUID 變更（使用者換手機號碼）。**要先於訊息處理**：同一包 payload 裡可能
   * 既有變更通知又有新 id 寄來的訊息，順序反了就會先把新 id 當成陌生人。
   *
   * 沒有處理的話，已經綁定的人會安靜地變成聯絡不到——舊 id 送不出去，新 id
   * 我們認不得。
   */
  void (async () => {
    for (const change of parseIdentityChanges(payload)) {
      try {
        const org = await getOrg();
        const { rotateExternalId } = await import("../core/hub/channelIdentity");
        if (!change.previous) {
          // 系統訊息沒有結構化的舊值，接不上。記下來讓人看得到，不要猜。
          await logEvent(org.id, null, "whatsapp_id_changed",
            `new BSUID ${change.current} — no previous id in the payload, needs re-binding`);
          continue;
        }
        const r = await rotateExternalId({
          orgId: org.id, channel: "whatsapp", previous: change.previous, current: change.current,
        });
        await logEvent(org.id, r.repId, "whatsapp_id_changed",
          r.linked ? `${change.previous} → ${change.current}` : `${change.current} — unknown previous id`);
      } catch (e: any) {
        console.error("[whatsapp.identity]", e?.message ?? e);
      }
    }
  })();

  for (const inbound of parseInbound(payload)) {
    void (async () => {
      try {
        const org = await getOrg();
        await logEvent(
          org.id,
          null,
          "whatsapp_inbound",
          `${inbound.name ?? inbound.username ?? inbound.from ?? inbound.userId ?? "unknown"}: ${(inbound.postback ?? inbound.text).slice(0, 120)}`,
        );
      } catch (e: any) {
        console.error("[whatsapp.webhook]", e?.message ?? e);
      }
    })();
  }
}

// ── public router ───────────────────────────────────────────────────────────

export const hubPublicRouter = express.Router();

const clickLimiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, validate: false });
const mcpLimiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, validate: false });

hubPublicRouter.get("/r/:code/qr.svg", clickLimiter, async (req, res) => {
  const code = String(req.params.code).slice(0, 12);
  const QRCode = (await import("qrcode")).default;
  const svg = await QRCode.toString(`${publicBaseUrl()}/r/${code}`, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(svg);
});

hubPublicRouter.get("/r/:code", clickLimiter, async (req, res) => {
  const code = String(req.params.code).slice(0, 12);
  try {
    const [link] = await q(`SELECT code, org_id, rep_id, post_id, channel FROM hub_links WHERE code = ? LIMIT 1`, [code]);
    if (!link) {
      res.redirect(302, "/scan/unknown");
      return;
    }
    // Hash only — no raw IP or user agent is stored.
    const day = new Date().toISOString().slice(0, 10);
    const visitor = createHash("sha256")
      .update(`${req.ip ?? ""}|${req.header("user-agent") ?? ""}|${day}`)
      .digest("hex")
      .slice(0, 16);
    await exec(
      `INSERT INTO hub_clicks (org_id, code, rep_id, post_id, visitor_hash, is_demo) VALUES (?, ?, ?, ?, ?, 0)`,
      [link.org_id, code, link.rep_id, link.post_id, visitor],
    );
    await logEvent(link.org_id, link.rep_id, "link_click", `${link.channel ?? "link"} · /r/${code}`);
    res.redirect(302, `/scan/${code}`);
  } catch (err: any) {
    console.error("[hub.r] click failed:", err?.message ?? err);
    res.redirect(302, "/scan/unknown");
  }
});

/** LIFF id is public by design (it's in every liff.line.me URL). */
hubPublicRouter.get("/api/hub/liff-config", (_req, res) => {
  res.json({ liffId: process.env.LINE_LIFF_ID ?? null });
});

hubPublicRouter.get("/api/hub/scan/:code", clickLimiter, async (req, res) => {
  const code = String(req.params.code).slice(0, 12);
  try {
    const org = await getOrg();
    const [row] = await q(
      `SELECT l.code, l.channel, r.name rep_name, r.title rep_title, r.market, r.avatar_seed,
              s.name_en, s.name_zh, s.source_url,
              (SELECT COUNT(*) FROM hub_clicks c WHERE c.code = l.code) clicks,
              (SELECT COUNT(*) FROM hub_clicks c WHERE c.rep_id = l.rep_id AND c.is_demo = 0) rep_live_clicks
         FROM hub_links l
         JOIN hub_reps r ON r.id = l.rep_id
         LEFT JOIN hub_posts p ON p.id = l.post_id
         LEFT JOIN hub_solutions s ON s.id = p.solution_id
        WHERE l.code = ? LIMIT 1`,
      [code],
    );
    res.json({
      found: Boolean(row),
      disclaimer: org.disclaimer,
      landingUrl: org.landingUrl,
      ...(row
        ? {
            repName: row.rep_name, repTitle: row.rep_title, market: row.market, avatarSeed: row.avatar_seed,
            channel: row.channel, solutionEn: row.name_en, solutionZh: row.name_zh, solutionUrl: row.source_url,
            clicks: Number(row.clicks), repLiveClicks: Number(row.rep_live_clicks),
          }
        : {}),
    });
  } catch (err: any) {
    res.status(500).json({ found: false, error: "scan lookup failed" });
  }
});

// ── MCP (for Hermes profiles) ───────────────────────────────────────────────

async function buildMcpServer(rep: HubRep) {
  const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
  const server = new McpServer({ name: "onbrand-sales-hub", version: "1.0.0" });
  const org = await getOrg();
  const lang = rep.market === "US" ? "en-US" : "zh-TW";
  const asText = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });

  server.registerTool(
    "list_solutions",
    {
      description: "List ExpertHub solutions the rep may promote, with marketing-approved prices only.",
      inputSchema: { category: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ category }) => {
      const sols = (await listSolutions(org.id)).filter((s) => !category || s.category === category);
      return asText(sols.map((s) => ({
        slug: s.slug, name: lang === "en-US" ? s.nameEn : s.nameZh, vendor: s.vendor, category: s.category,
        summary: lang === "en-US" ? s.summaryEn : s.summaryZh, featured: s.featured,
        approvedPrices: s.prices.map((p) => formatPrice(p, lang)),
      })));
    },
  );

  server.registerTool(
    "get_market_facts",
    {
      description: "Approved, cited market facts. Only these statistics may be quoted in posts.",
      inputSchema: { kind: z.enum(["market", "subsidy", "platform"]).optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ kind }) => {
      const facts = (await listFacts(org.id)).filter(
        (f) => f.confidence !== "needs_verification" && ["market", "subsidy", "platform"].includes(f.kind) && (!kind || f.kind === kind),
      );
      return asText(facts.map((f) => ({
        kind: f.kind, statement: lang === "en-US" ? f.statementEn : f.statementZh, source: f.sourceName, url: f.sourceUrl,
      })));
    },
  );

  server.registerTool(
    "draft_compliant_post",
    {
      description: "Write ONE social post for this rep about a solution, checked and auto-fixed against company policy. Returns the post, the compliance report and the rep's tracked link.",
      inputSchema: {
        solution_slug: z.string(),
        channel: z.enum(["linkedin", "facebook", "instagram", "line"]),
        angle: z.string().max(500).optional(),
      },
    },
    async ({ solution_slug, channel, angle }) => {
      const sol = (await listSolutions(org.id)).find((s) => s.slug === solution_slug);
      if (!sol) return { content: [{ type: "text" as const, text: `Unknown solution '${solution_slug}'. Call list_solutions first.` }], isError: true };
      const { generateRepPost } = await import("../../content/core/hub/generateRepPost");
      const post = await generateRepPost({ repId: rep.id, solutionId: sol.id, channel, angle: angle ?? null, source: "hermes" });
      return asText({
        post: post.caption,
        compliance: { verdict: post.compliance.verdict, issuesCaught: post.compliance.issuesCaught, checks: post.compliance.checks.map((c) => `${c.status}: ${c.title}`) },
        trackedLink: post.trackedLink,
      });
    },
  );

  server.registerTool(
    "check_my_draft",
    {
      description: "Check a post the rep wrote themselves against company policy and return a fixed version.",
      inputSchema: { text: z.string().max(5000) },
    },
    async ({ text }) => {
      const { checkOwnDraft } = await import("../../content/core/hub/generateRepPost");
      const r = await checkOwnDraft({ repId: rep.id, text });
      return asText({ fixed: r.fixed, verdict: r.compliance.verdict, checks: r.compliance.checks.map((c) => `${c.status}: ${c.title} — ${c.detail}`) });
    },
  );

  server.registerTool(
    "get_my_results",
    { description: "The rep's own posting results for the last 21 days, with data grades.", inputSchema: {}, annotations: { readOnlyHint: true } },
    async () => {
      const { getRepStats } = await import("../../performance/core/hub/hubStats");
      return asText(await getRepStats(rep.id));
    },
  );

  return server;
}

hubPublicRouter.post("/mcp", mcpLimiter, async (req, res) => {
  const token = (req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const rep = token ? await getRepByMcpToken(token) : null;
  if (!rep) {
    res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "invalid rep token" }, id: null });
    return;
  }
  try {
    const { StreamableHTTPServerTransport } = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
    const server = await buildMcpServer(rep);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err: any) {
    console.error("[hub.mcp] failed:", err?.message ?? err);
    if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "internal error" }, id: null });
  }
});

hubPublicRouter.get("/mcp", (_req, res) => {
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed (stateless server)" }, id: null });
});
