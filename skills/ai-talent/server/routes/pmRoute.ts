/**
 * /api/pm — Marketing OS PM Orchestrator via OpenClaw Gateway HTTP
 *
 * Uses POST /v1/chat/completions to call the OpenClaw Gateway directly.
 * Gateway agents have: 287 skills, web_search, memory, mos_db lookup.
 *
 * Agent routing:
 *   - Default: openclaw/pm (PM Orchestrator, workspace-marketing-pm)
 *   - Squad agents: openclaw/nicole-wang-pm, openclaw/alex-chen-seo, etc.
 */

import { Router, Request, Response } from "express";
import { createConnection } from "mysql2/promise";

const router = Router();

const GATEWAY_HTTP = "http://localhost:18790";
const GATEWAY_TOKEN = "mos-pm-claw-2026";
const DEFAULT_AGENT = "openclaw/pm";

async function queryDbAgents(keyword: string): Promise<string> {
  let conn;
  try {
    // SEC-B-02 (2026-05-05): hardcoded password literal removed.
    const password = process.env.LOCAL_DB_PASSWORD;
    if (!password) throw new Error("[pmRoute] LOCAL_DB_PASSWORD env var is required.");
    conn = await createConnection({
      host: process.env.LOCAL_DB_HOST || "localhost",
      user: process.env.LOCAL_DB_USER || "mos_user",
      password,
      database: process.env.LOCAL_DB_NAME || "mos_db",
      connectTimeout: 3000,
    });
    const kw = `%${keyword}%`;
    const [rows] = await conn.execute(
      `SELECT a.name, a.title, a.specialty,
        JSON_UNQUOTE(JSON_EXTRACT(a.skill_config, '$.primarySkill')) as primarySkill
       FROM agents a
       WHERE a.isAvailable=1 AND (a.specialty LIKE ? OR a.title LIKE ?)
       ORDER BY a.rating DESC LIMIT 3`,
      [kw, kw]
    ) as [any[], any];
    if ((rows as any[]).length === 0) return "";
    return "\n\n【可用 Agents】\n" + (rows as any[]).map((a: any) =>
      `• ${a.name}｜${a.title}（skill: ${a.primarySkill ?? "-"}）：${(a.specialty ?? "").slice(0, 60)}`
    ).join("\n");
  } catch { return ""; }
  finally { if (conn) await conn.end().catch(() => {}); }
}

/**
 * Call OpenClaw Gateway via HTTP chat completions (streaming SSE).
 */
async function streamViaGatewayHTTP(
  agentId: string,
  message: string,
  sessionKey: string,
  onDelta: (text: string) => void,
  onDone: (full: string) => void,
  onError: (err: string) => void
): Promise<void> {
  const body = JSON.stringify({
    model: agentId,
    messages: [{ role: "user", content: message }],
    stream: true,
    user: sessionKey,  // stable session routing
  });

  const resp = await fetch(`${GATEWAY_HTTP}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GATEWAY_TOKEN}`,
      "Content-Type": "application/json",
      "x-openclaw-session-key": sessionKey,
    },
    body,
    // @ts-ignore
    signal: AbortSignal.timeout(180_000),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    onError(`Gateway HTTP ${resp.status}: ${errText.slice(0, 200)}`);
    return;
  }

  const reader = resp.body?.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let buffer = "";

  if (!reader) { onError("No response body"); return; }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") {
        onDone(full);
        return;
      }
      try {
        const chunk = JSON.parse(data);
        const delta = chunk.choices?.[0]?.delta?.content ?? "";
        if (delta) { full += delta; onDelta(delta); }
      } catch { /* ignore parse errors */ }
    }
  }

  onDone(full);
}

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { message, sessionId, brandContext, agentId } = req.body as {
    message?: string; sessionId?: string; brandContext?: string; agentId?: string;
  };
  if (!message) { res.status(400).json({ error: "message required" }); return; }

  const session = sessionId ?? `pm-${Date.now()}`;
  const targetAgent = agentId ? `openclaw/${agentId}` : DEFAULT_AGENT;

  // SSE setup
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (event: string, data: object) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const sendText = (t: string) => send("delta", { text: t });

  // DB context for agent suggestions
  const kw = message.slice(0, 40).replace(/[^\u4e00-\u9fff\w ]/g, "").slice(0, 15);
  const dbCtx = kw ? await queryDbAgents(kw) : "";

  const fullMsg = [
    brandContext ? `[品牌背景：${brandContext}]` : "",
    message,
    dbCtx,
  ].filter(Boolean).join("\n");

  send("step", { step: 1, label: `🚀 ${targetAgent} 開始處理...`, status: "running" });

  try {
    await streamViaGatewayHTTP(
      targetAgent,
      fullMsg,
      session,
      (delta) => { sendText(delta); },
      (full) => {
        send("step", { label: "✅ 完成", status: "done" });
        send("done", { reply: full, sessionId: session, agentId: targetAgent, ok: true });
        res.end();
      },
      (err) => {
        console.error("[PM Gateway HTTP] Error:", err);
        send("error", { error: err });
        res.end();
      }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[PM Route] Uncaught:", msg);
    send("error", { error: msg });
    res.end();
  }
});

export default router;
