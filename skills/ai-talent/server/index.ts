/**
 * AI Talent skill — Express entry point
 * Sprint 1: health check + stub for tRPC router (Sprint 2).
 *
 * DEBT-3: Added rate limiting, request logging, and graceful shutdown.
 */

// Load .env before any other imports (dotenv must come first)
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
dotenvConfig({ path: resolve(process.cwd(), ".env") });

import express from "express";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { join } from "path";
import { existsSync } from "fs";
import { ENV } from "./_core/env";
import { getBillingRetryQueueLength, flushBillingRetryQueue, loadBillingFallbackLog } from "./llmWithBilling";
import { createContext } from "./_core/trpc";
import { authRouter } from "./auth/authRouter";
import { streamRouter } from "./routes/streamRoute";
import { exportRouter } from "./routes/exportRoute";
import { a2aStreamRouter } from "./routes/a2aStreamRoute";
import { slackOAuthRouter } from "./routes/slackOAuthRoute";
import { squadChatRouter } from "./routes/squadChatRoute";
import { closeDb, pingDb, pingSoworkDb } from "./db";
import { appRouter } from "./routers";
import { startOrchestratorWorker } from "./queue/orchestratorWorker";
import { startSquadLeaderWorker } from "./queue/squadLeaderWorker";

const app = express();

// SEC-8: Trust reverse-proxy headers (Nginx / Azure Front Door / Cloudflare).
// Required for rate limiter to see the real client IP instead of the proxy IP.
// Only enabled when TRUST_PROXY=1 is explicitly set in environment.
if (process.env.TRUST_PROXY === "1") {
  app.set("trust proxy", 1);
}

// SEC-9: Helmet — HTTP security headers
// Sprint 4: add HTTP security hardening headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://marketing-os.sowork.ai"],
    },
  },
  crossOriginEmbedderPolicy: false,  // allow SPA iframe embeds if needed
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map(s => s.trim())
    : ["http://localhost:5173", "http://localhost:3000"],
  credentials: true,
}));
app.use(express.json());

// DEBT-3: Request logging — minimal, no PII logged
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ─── Serve frontend build (SPA static files) ─────────────────────────────────
// Client builds to ../public (relative to server/ CWD = skills/ai-talent)
const publicDir = join(process.cwd(), "public");
if (existsSync(publicDir)) {
  app.use(express.static(publicDir));
  // SPA fallback — serve index.html for any non-API route
  app.get("*", (req, res, next) => {
    if (
      req.path.startsWith("/trpc") ||
      req.path.startsWith("/api") ||
      req.path === "/health"
    ) {
      return next();
    }
    res.sendFile(join(publicDir, "index.html"));
  });
}

// DEBT-3: Rate limiting — 100 req/min per IP on all /api routes
const limiter = rateLimit({
  windowMs:        60 * 1000, // 1 min window
  max:             100,       // max requests per window per IP
  standardHeaders: true,
  legacyHeaders:   false,
  // SEC-8: validate=false suppresses the X-Forwarded-For warning when
  // running behind Traefik/Nginx reverse proxy with trust proxy enabled.
  validate:        false,
});
app.use("/api", limiter);
app.use("/trpc", limiter);

// SEC-7: Separate, more lenient rate limiter for /health (no version info leaked)
const healthLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, validate: false });

// ─── Auth routes (SEC-1) ─────────────────────────────────────────────────────
app.use("/api/auth", authRouter);
app.use("/api/stream", streamRouter);
app.use("/api/export", exportRouter);
app.use("/api/a2a", a2aStreamRouter);

// ─── Slack OAuth + Events ─────────────────────────────────────────────────────
app.use("/slack", slackOAuthRouter);
app.use("/api/stream", squadChatRouter);

// ─── Health check (SEC-7: no version number) ────────────────────────────────
app.get("/health", healthLimiter, async (_req, res) => {
  const [dbOk, soworkDbOk] = await Promise.all([pingDb(), pingSoworkDb()]);
  const billingQueueLength = getBillingRetryQueueLength();
  res.json({
    status:  dbOk && soworkDbOk && billingQueueLength === 0 ? "ok" : "degraded",
    service: "ai-talent",
    // SEC-7: version intentionally omitted
    db:      dbOk ? "connected" : "unreachable",
    soworkDb: soworkDbOk ? "connected" : "unreachable",
    billingQueueLength,          // monitor: alert if > 10
    ts:      new Date().toISOString(),
  });
});

// Mount tRPC router
app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

const PORT = ENV.PORT;

// P1-2: Periodic billing retry queue flush (every 60s)
setInterval(async () => {
  try {
    const flushed = await flushBillingRetryQueue();
    if (flushed > 0) console.log(`[billing] flushed ${flushed} queued records`);
  } catch (err) {
    console.error("[billing] flush error:", err);
  }
}, 60_000);

const server = app.listen(PORT, async () => {
  console.log(`[server] sowork-enterprise listening on port ${PORT}`);
  console.log(`[server] health: http://localhost:${PORT}/health`);
  startOrchestratorWorker();
  console.log("[A2A] Orchestrator Worker started");
  startSquadLeaderWorker();
  console.log("[A2A] Squad Leader Worker started");
  // STAB-3: Recover any billing records persisted to disk during previous crash
  const recovered = await loadBillingFallbackLog();
  if (recovered > 0) {
    console.log(`[server] recovered ${recovered} billing records from fallback log`);
  }
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[server] FATAL: Port ${PORT} already in use. Set PORT env to a different port.`);
    process.exit(1);
  }
  throw err;
});

// Graceful shutdown handler
const shutdown = async (signal: string) => {
  console.log(`[server] ${signal} received, shutting down gracefully...`);
  server.close(async () => {
    try {
      await closeDb();
      console.log("[server] DB connections closed");
    } catch { /* silent */ }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000); // 10s force exit
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", (err) => {
  console.error("[server] uncaughtException:", err);
  shutdown("uncaughtException");
});
process.on("unhandledRejection", (reason) => {
  console.error("[server] unhandledRejection:", reason);
});

export default app;
