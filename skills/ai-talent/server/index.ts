/**
 * AI Talent skill — Express entry point
 * Sprint 1: health check + stub for tRPC router (Sprint 2).
 *
 * DEBT-3: Added rate limiting, request logging, and graceful shutdown.
 */

// SEC-B-03 (2026-05-05): load .env via a side-effect module that runs
// BEFORE any other import. Putting dotenvConfig() as a top-level statement
// here doesn't work — ESM evaluates all imports depth-first, so
// `import { ENV } from "./_core/env"` lower in this file would trigger
// env.ts's zod validation BEFORE the dotenv call ran. The only way to
// guarantee .env is loaded first is from a side-effect module imported
// at the top.
import "./bootstrap-env";

import { join } from "path";
import { existsSync } from "fs";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
// existsSync already imported at top for env path resolution
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
import { projectSyncCallbackRouter } from "./routes/projectSyncCallbackRoute";
import { squadSearchRouter } from "./routers/squadSearchRouter";
import { entitySearchRouter } from "./routers/entitySearchRouter";
import { intakeRouter } from "./routers/intakeRouter";
import { missionStepStreamRouter } from "./routes/missionStepStreamRoute";
import { closeDb, pingDb, pingSoworkDb, getDb } from "./db";
import { sql } from "drizzle-orm";
import { appRouter } from "./routers";
import { startOrchestratorWorker } from "./queue/orchestratorWorker";
import { startSquadLeaderWorker } from "./queue/squadLeaderWorker";
import { computeMissionResources } from "./missionResourceComputer";

const app = express();

// SEC-8: Trust reverse-proxy headers (Nginx / Azure Front Door / Cloudflare).
// Required for rate limiter to see the real client IP instead of the proxy IP.
// Only enabled when TRUST_PROXY=1 is explicitly set in environment.
if (process.env.TRUST_PROXY === "1") {
  app.set("trust proxy", 1);
}

// SEC-9: Helmet — HTTP security headers
// Sprint 4: add HTTP security hardening headers
// SEC-S-06 (2026-05-04): explicit HSTS preload-eligible config (default off in helmet).
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // 'unsafe-inline' / 'unsafe-eval' tracked as S-05 in SECURITY-AUDIT.md
      // — needed by Vite + HeroUI runtime; migration to nonce-based CSP is
      // a separate workstream.
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://marketing-os.sowork.ai"],
    },
  },
  hsts: {
    maxAge: 31536000,        // 1 year
    includeSubDomains: true,
    preload: true,
  },
  crossOriginEmbedderPolicy: false,  // allow SPA iframe embeds if needed
}));

// SEC-S-07 (2026-05-04): production no longer falls back to localhost (a
// misconfig that would have allowed cross-origin writes). If CORS_ORIGIN is
// unset in prod, we default to the real public domain only — never localhost.
const isProd = process.env.NODE_ENV === "production";
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map(s => s.trim())
  : isProd
    ? ["https://marketing-os.sowork.ai"]
    : ["http://localhost:5173", "http://localhost:3000"];
app.use(cors({
  origin: corsOrigin,
  credentials: true,
}));
console.log(`[server] CORS origin: ${Array.isArray(corsOrigin) ? corsOrigin.join(",") : corsOrigin}`);
app.use(cookieParser());
// SEC-B-08 (2026-05-04): cap JSON body size to 1MB. Default was unbounded
// (express's 100KB default applies only when limit is set explicitly via the
// option), creating a DoS vector via giant payloads. 1MB covers all legit
// inputs including markdown / brief / prompt strings; raise for specific
// upload routes if/when needed.
app.use(express.json({ limit: '1mb' }));

// SEC-B-08 v2 (2026-05-05): per-field string cap. The 1MB body limit alone
// allowed e.g. a 999KB string in a single field to slip through and burn
// memory in zod / db / LLM downstream. We recursively walk req.body and
// reject any string > MAX_FIELD_CHARS chars. 50000 is generous for the
// largest legit input we have (markdown / prompt / brief) — easily 10x
// any realistic content while still preventing pathological payloads.
const MAX_FIELD_CHARS = 50_000;
function deepCheckStringLengths(obj: any, path: string = ""): string | null {
  if (obj == null) return null;
  if (typeof obj === "string") {
    if (obj.length > MAX_FIELD_CHARS) {
      return `${path || "(root)"} string is ${obj.length} chars (max ${MAX_FIELD_CHARS})`;
    }
    return null;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const r = deepCheckStringLengths(obj[i], `${path}[${i}]`);
      if (r) return r;
    }
    return null;
  }
  if (typeof obj === "object") {
    for (const k of Object.keys(obj)) {
      const r = deepCheckStringLengths(obj[k], path ? `${path}.${k}` : k);
      if (r) return r;
    }
  }
  return null;
}
app.use((req, res, next): void => {
  if (req.body && typeof req.body === "object") {
    const violation = deepCheckStringLengths(req.body);
    if (violation) {
      res.status(413).json({
        error: "PAYLOAD_FIELD_TOO_LARGE",
        detail: violation,
      });
      return;
    }
  }
  next();
});

// DEBT-3: Request logging — minimal, no PII logged
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ─── Serve frontend build (SPA static files) ─────────────────────────────────
// Client builds to ../public (relative to server/ CWD = skills/ai-talent)
// Boardroom deliverable exports (generated PDFs) — served as downloadable files.
// Must be registered BEFORE the SPA fallback so the catch-all doesn't swallow these URLs.
const boardroomDir = process.env.BOARDROOM_EXPORT_DIR
  ?? join(process.cwd(), "storage", "boardroom-exports");
const boardroomPrefix = process.env.BOARDROOM_EXPORT_URL_PREFIX ?? "/static/boardroom-exports";
app.use(boardroomPrefix, express.static(boardroomDir, {
  maxAge: "1h",
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".pdf")) {
      res.setHeader("content-type", "application/pdf");
      // Inline — let the browser preview; user can download via browser UI
      res.setHeader("content-disposition", "inline");
    }
  },
}));

// ─── Squad/Agent/Skill cover images (generated by admin-generate-covers) ──
// Persistent dir outside the repo so git reset --hard during deploy doesn't
// wipe them. URL stored in squads.hero_image_url is /static/covers/<slug>.png
const coversDir = process.env.COVERS_DIR ?? "/opt/marketing-os/covers";
const coversPrefix = process.env.COVERS_URL_PREFIX ?? "/static/covers";
app.use(coversPrefix, express.static(coversDir, {
  maxAge: "30d",
  immutable: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".png")) res.setHeader("content-type", "image/png");
    if (filePath.endsWith(".webp")) res.setHeader("content-type", "image/webp");
    if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) res.setHeader("content-type", "image/jpeg");
  },
}));

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
      req.path.startsWith("/static/") ||
      req.path === "/health"
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

// SEC-7: Separate, more lenient rate limiter for /health (no version info leaked)
const healthLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, validate: false });

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
app.use("/api/project-sync", projectSyncCallbackRouter);
app.use("/api/squads/search", squadSearchRouter);
app.use("/api/entity/search", entitySearchRouter);
app.use("/api/intake", intakeRouter);
app.use("/api/missions", missionStepStreamRouter);

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
app.use("/trpc", (req, res, next) => {
  console.log('[express] tRPC request:', {
    method: req.method,
    url: req.url,
    path: req.path,
    query: req.query,
    hasAuth: !!req.headers.authorization,
    ts: new Date().toISOString(),
  });
  next();
});
app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
    onError: ({ error, type, path, input, ctx }) => {
      console.error('[trpc] Error:', {
        type,
        path: path ?? 'unknown',
        errorCode: error.code,
        errorMessage: error.message,
        userId: (ctx as any)?.user?.id,
        ts: new Date().toISOString(),
      });
      // Log stack trace in development for debugging
      if (process.env.NODE_ENV === 'development' && error.cause instanceof Error) {
        console.error('[trpc] Error cause:', error.cause);
      }
    },
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
  console.log(`[server] health: http://localhost:${PORT}/health`);
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
