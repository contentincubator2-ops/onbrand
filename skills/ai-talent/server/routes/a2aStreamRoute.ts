/**
 * a2aStreamRoute — SSE endpoint for A2A workflow execution
 * GET /api/a2a/stream?workflowId=brand-launch-v1&brandId=123
 *
 * Streams real-time events as Server-Sent Events:
 *   workflow_start → node_start → node_done/node_error → workflow_done → result
 */

import { Router, type Request, type Response } from "express";
import { jwtVerify } from "jose";
import { getJwtSecret } from "../_core/env";
import { executeA2AWorkflow } from "../a2a/a2aOrchestrator";
import { BRAND_LAUNCH_WORKFLOW, MARKET_RESEARCH_WORKFLOW } from "../a2a/a2aTemplates";

export const a2aStreamRouter = Router();

function getSecretBytes(): Uint8Array {
  return new TextEncoder().encode(getJwtSecret());
}

async function verifyToken(token: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretBytes());
    return payload.sub ? parseInt(String(payload.sub), 10) : null;
  } catch {
    return null;
  }
}

const WORKFLOW_MAP: Record<string, typeof BRAND_LAUNCH_WORKFLOW> = {
  "brand-launch-v1": BRAND_LAUNCH_WORKFLOW,
  "market-research-v1": MARKET_RESEARCH_WORKFLOW,
};

// GET /api/a2a/stream?workflowId=...&brandId=...
a2aStreamRouter.get("/stream", async (req: Request, res: Response) => {
  // Auth: Bearer header or ?_token query param (EventSource can't set headers)
  let userId: number | null = null;
  const authHeader = req.headers.authorization;
  const queryToken = req.query._token as string | undefined;
  const rawToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : queryToken;

  if (rawToken) {
    userId = await verifyToken(rawToken);
  }
  // Dev fallback
  if (!userId && process.env.ALLOW_DEV_AUTH === "true" && process.env.NODE_ENV !== "production") {
    userId = parseInt((req.headers["x-user-id"] as string) ?? "0") || null;
  }

  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const workflowId = req.query.workflowId as string;
  const brandId = req.query.brandId ? Number(req.query.brandId) : undefined;

  const workflow = WORKFLOW_MAP[workflowId];
  if (!workflow) {
    res.status(400).json({ error: `Unknown workflowId: ${workflowId}` });
    return;
  }

  // SSE setup
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (data: object) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      (res as any).flush?.();
    } catch { /* client disconnected */ }
  };

  // Keepalive ping every 15s
  const ping = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { clearInterval(ping); }
  }, 15_000);

  try {
    const result = await executeA2AWorkflow(workflow, userId, brandId, (event) => {
      send(event);
    });
    send({ type: "result", result });
  } catch (err) {
    send({ type: "error", message: err instanceof Error ? err.message : String(err) });
  } finally {
    clearInterval(ping);
    res.end();
  }
});
