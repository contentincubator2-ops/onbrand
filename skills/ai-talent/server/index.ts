/**
 * AI Talent skill — Express entry point
 * Sprint 1: health check + stub for tRPC router (Sprint 2).
 *
 * DEBT-3: Added rate limiting, request logging, and graceful shutdown.
 */

// Load .env before any other imports (dotenv must come first)
import { config as dotenvConfig } from "dotenv";
import { join } from "path";

// Use process.cwd() so PM2 --cwd flag controls where we look for .env.
// CWD is set to skills/ai-talent/ so .env lives right there.
const envPath = join(process.cwd(), ".env");
console.log('[server] Loading .env from:', envPath);
const result = dotenvConfig({ path: envPath });
console.log('[server] dotenv result:', { error: result.error, parsed: result.parsed ? 'YES' : 'NO' });
console.log('[server] JWT_SECRET loaded:', process.env.JWT_SECRET ? 'YES' : 'NO');

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { existsSync } from "fs";
import { ENV } from "./_core/env";
import { getBillingRetryQueueLength, flushBillingRetryQueue, loadBillingFallbackLog } from "./llmWithBilling";
import { createContext } from "./_core/trpc";
import { authRouter } from "./auth/authRouter";
import { exportRouter } from "./routes/exportRoute";
import { a2aStreamRouter } from "./routes/a2aStreamRoute";
import { slackOAuthRouter } from "./routes/slackOAuthRoute";
import { missionChatRouter } from "./routes/missionChatRouter";
import pmRouter from "./routes/pmRoute";
import { brandBrainRouter } from "./routes/brandBrainRoute";
import { exportsRouter } from "./routes/exportsRoute";
import { missionSquadRouter } from "./routes/missionSquadRoute";
import { closeDb, pingDb, pingSoworkDb, getDb } from "./db";
import { sql } from "drizzle-orm";
import { appRouter } from "./routers";
import { startOrchestratorWorker } from "./queue/orchestratorWorker";
import { startSquadLeaderWorker } from "./queue/squadLeaderWorker";
import { computeMissionResources } from "./missionResourceComputer";
import { runReadinessChecks, BUILD_VERSION, BUILD_COMMIT } from "./readiness";

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
app.use(cookieParser());
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
  // Assets (hashed filenames) — cache 1 year
  app.use("/assets", express.static(join(publicDir, "assets"), { maxAge: "1y", immutable: true }));
  // index.html: NO cache（每次都拿最新，確保新 deploy 馬上生效）
  app.get("/", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.sendFile(join(publicDir, "index.html"));
  });
  // Other static files (favicon, etc.) — cache 5 min; index.html always no-cache
  app.use(express.static(publicDir, {
    maxAge: "5m",
    setHeaders: (res, filePath) => {
      // index.html must never be cached — it references hashed asset filenames.
      // A stale index.html + old (still-present) hashed JS = user sees old UI.
      if (filePath.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      }
    },
  }));
  // SPA fallback — serve index.html with no-cache so browser always loads latest
  app.get("*", (req, res, next) => {
    if (
      req.path.startsWith("/trpc") ||
      req.path.startsWith("/api") ||
      req.path === "/health" ||
      req.path === "/ready"
    ) {
      return next();
    }
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
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

// SEC-7: Separate, more lenient rate limiters for probe endpoints
const healthLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, validate: false });
const readyLimiter  = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, validate: false });

// ─── Auth routes (SEC-1) ─────────────────────────────────────────────────────
app.use("/api/auth", authRouter);
app.use("/api/export", exportRouter);
app.use("/api/a2a", a2aStreamRouter);

// ─── Slack OAuth + Events ─────────────────────────────────────────────────────
app.use("/slack", slackOAuthRouter);
app.use("/api/chat", missionChatRouter);  // Mission chat 統一入口 (squad-first routing)
app.use("/api/pm", pmRouter);
app.use("/api/brand-brain", brandBrainRouter);
app.use("/api/exports", exportsRouter);
app.use("/api/missions", missionSquadRouter);

// ─── Liveness probe — fast, no external deps ────────────────────────────────
// GET /health  (<50 ms target)
// Returns: { status: "ok", version, commit }
// version = package.json version; commit = GIT_COMMIT env or git rev-parse HEAD at boot.
app.get("/health", healthLimiter, (_req, res) => {
  res.json({
    status:  "ok",
    version: BUILD_VERSION,
    commit:  BUILD_COMMIT,
  });
});

// ─── Readiness probe — checks all hard dependencies ─────────────────────────
// GET /ready
// Checks: MySQL SELECT 1 (500 ms timeout), Redis PING, BullMQ worker heartbeats,
//         schema_migrations dirty=0, cached LLM provider probe (60 s TTL).
// LLM probe failures → status "degraded", HTTP 200 (non-fatal).
// All other failures → status "fail", HTTP 503.
app.get("/ready", readyLimiter, async (_req, res) => {
  const result = await runReadinessChecks();
  const httpStatus = result.status === "fail" ? 503 : 200;
  res.status(httpStatus).json(result);
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

// Run idempotent DB migrations on startup (uses server's own DB connection)
async function runStartupMigrations() {
  try {
    const db = await getDb();
    const [colRows] = await db.execute(sql`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'missions' AND COLUMN_NAME = 'description'
    `) as any;
    if ((colRows as any[]).length === 0) {
      await db.execute(sql`ALTER TABLE missions ADD COLUMN description TEXT NULL`);
      console.log("[migrate] missions.description: added");
    }
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS mission_resources (
        id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        missionId   INT          NOT NULL UNIQUE,
        status      VARCHAR(20)  NOT NULL DEFAULT 'pending',
        agents      INT          NOT NULL DEFAULT 0,
        skills      INT          NOT NULL DEFAULT 0,
        providers   INT          NOT NULL DEFAULT 0,
        skillList   LONGTEXT     NULL,
        providerList LONGTEXT    NULL,
        topAgents   LONGTEXT     NULL,
        createdAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] mission_resources: OK");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS squad_usage_log (
        id           INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id      INT          NOT NULL,
        brand_id     INT          NULL,
        workspace    VARCHAR(80)  NULL,
        mission_id   INT          NULL,
        mission_type VARCHAR(100) NULL,
        squad_id     INT          NOT NULL,
        squad_slug   VARCHAR(120) NOT NULL,
        started_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_user    (user_id),
        INDEX idx_brand   (brand_id),
        INDEX idx_mission (mission_id),
        INDEX idx_squad   (squad_slug)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[migrate] squad_usage_log: OK");
  } catch (err) {
    console.error("[migrate] startup migration error:", err);
  }
}

// Background job: compute mission resources for all missions without a 'ready' record.
// Runs once on startup, processes one mission every 2s to avoid hammering the embedding API.
async function backfillMissionResources(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const [rows] = await db.execute(sql`
      SELECT m.id, m.title, m.description, m.workspace, m.brandId,
             b.name AS brandName
      FROM missions m
      LEFT JOIN mission_resources mr ON mr.missionId = m.id
      LEFT JOIN brands b ON b.id = m.brandId
      WHERE mr.id IS NULL OR mr.status != 'ready'
      LIMIT 100
    `) as any;
    const missions = (rows as any[]) ?? [];
    if (missions.length === 0) return;
    console.log(`[backfill] Computing resources for ${missions.length} mission(s)…`);
    for (const m of missions) {
      await computeMissionResources({
        missionId:   m.id,
        title:       m.title       ?? "",
        description: m.description ?? undefined,
        workspace:   m.workspace   ?? "",
        brandName:   m.brandName   ?? undefined,
      }).catch((err: unknown) => console.error(`[backfill] mission ${m.id}:`, err));
      // Pace: 2s between calls so we don't saturate the embedding API
      await new Promise(r => setTimeout(r, 2000));
    }
    console.log("[backfill] Done.");
  } catch (err) {
    console.error("[backfill] error:", err);
  }
}

const server = app.listen(PORT, async () => {
  console.log(`[server] sowork-enterprise listening on port ${PORT}`);
  console.log(`[server] liveness:   http://localhost:${PORT}/health`);
  console.log(`[server] readiness:  http://localhost:${PORT}/ready`);
  await runStartupMigrations();
  startOrchestratorWorker();
  console.log("[A2A] Orchestrator Worker started");
  startSquadLeaderWorker();
  console.log("[A2A] Squad Leader Worker started");
  // STAB-3: Recover any billing records persisted to disk during previous crash
  const recovered = await loadBillingFallbackLog();
  if (recovered > 0) {
    console.log(`[server] recovered ${recovered} billing records from fallback log`);
  }
  // Backfill mission resources for existing missions (fire-and-forget)
  backfillMissionResources();

  // PM2 --wait-ready: signal readiness to the process manager once /ready passes.
  // runReadinessChecks() is called once here; PM2 stops waiting and starts routing
  // traffic only after this signal is sent. LLM probe failures are non-fatal.
  try {
    const readiness = await runReadinessChecks();
    if (readiness.status !== "fail") {
      if (typeof process.send === "function") {
        process.send("ready");
        console.log("[server] sent 'ready' to PM2");
      }
    } else {
      console.warn("[server] readiness check failed at startup — not sending 'ready':", readiness.checks);
    }
  } catch (err) {
    console.error("[server] readiness probe error at startup:", err);
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
