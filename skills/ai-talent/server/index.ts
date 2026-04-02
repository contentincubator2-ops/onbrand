/**
 * AI Talent skill — Express entry point
 * Sprint 1: health check + stub for tRPC router (Sprint 2).
 *
 * DEBT-3: Added rate limiting, request logging, and graceful shutdown.
 */

import express from "express";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import { ENV } from "./_core/env";
import { closeDb, pingDb } from "./db";

const app = express();

// SEC-8: Trust reverse-proxy headers (Nginx / Azure Front Door / Cloudflare).
// Required for rate limiter to see the real client IP instead of the proxy IP.
// Set TRUST_PROXY=1 in production; leave unset in local dev.
app.set("trust proxy", process.env.TRUST_PROXY ?? 1);

app.use(cors());
app.use(express.json());

// DEBT-3: Request logging — minimal, no PII logged
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// DEBT-3: Rate limiting — 100 req/min per IP on all /api routes
const limiter = rateLimit({
  windowMs:        60 * 1000, // 1 min window
  max:             100,       // max requests per window per IP
  standardHeaders: true,
  legacyHeaders:   false,
});
app.use("/api", limiter);

// ─── Health check ────────────────────────────────────────────────────────────
app.get("/health", async (_req, res) => {
  const dbOk = await pingDb();
  res.json({
    status:  dbOk ? "ok" : "degraded",
    service: "ai-talent",
    version: "0.1.0",
    db:      dbOk ? "connected" : "unreachable",
    ts:      new Date().toISOString(),
  });
});

// TODO Sprint 2: mount tRPC router
// import { appRouter } from "./routers";
// import { createExpressMiddleware } from "@trpc/server/adapters/express";
// app.use("/trpc", createExpressMiddleware({ router: appRouter }));

const PORT = ENV.PORT;
app.listen(PORT, () => {
  console.log(`[ai-talent] listening on :${PORT}`);
});

// DEBT-3: Graceful shutdown — drain DB pool before exiting
process.on("SIGTERM", async () => {
  console.log("[server] SIGTERM received, shutting down...");
  await closeDb();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[server] SIGINT received, shutting down...");
  await closeDb();
  process.exit(0);
});

export default app;
