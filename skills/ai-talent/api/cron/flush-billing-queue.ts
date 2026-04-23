/**
 * Vercel Cron — replaces the 60s setInterval in server/index.ts for
 * flushing the billing retry queue. Invoked every 5 minutes per
 * vercel.json `crons`.
 *
 * Vercel sends a Bearer token in the Authorization header. Set
 * CRON_SECRET in the Vercel project env to verify.
 *
 * Uses raw IncomingMessage/ServerResponse so we don't need to add
 * @vercel/node as a dependency.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { flushBillingRetryQueue, loadBillingFallbackLog } from "../../server/llmWithBilling";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const auth = req.headers.authorization;
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    res.statusCode = 401;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }

  try {
    const recovered = await loadBillingFallbackLog();
    const flushed = await flushBillingRetryQueue();
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true, recovered, flushed, ts: new Date().toISOString() }));
  } catch (err) {
    console.error("[cron/flush-billing-queue] error:", err);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: false, error: String(err) }));
  }
}
