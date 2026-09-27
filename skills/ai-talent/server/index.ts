/**
 * AI Talent skill — Express entry point
 * Sprint 1: health check + stub for tRPC router (Sprint 2).
 *
 * DEBT-3: Added rate limiting, request logging, and graceful shutdown.
 */

// SEC-B-03 (2026-05-05): load .env via a side-effect module that runs
// BEFORE any other import. Putting dotenvConfig() as a top-level statement
// here doesn't work — ESM evaluates all imports depth-first, so
// `import { ENV } from "./platform/core/env"` lower in this file would trigger
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
import { ENV } from "./platform/core/env";
import { getBillingRetryQueueLength, flushBillingRetryQueue, loadBillingFallbackLog } from "./platform/core/llmWithBilling";
import { createContext } from "./platform/core/trpc";
import { authRouter } from "./platform/auth/authRouter";
import { reportTemplateRouter } from "./performance/routes/reportTemplateRoute";
import { positioningDocRouter } from "./strategy/routes/positioningDocRoute";
import { assetPhotoRouter as assetPhotoUploadRoute, STORAGE_ROOT as ASSET_PHOTO_STORAGE_ROOT } from "./strategy/routes/assetPhotoRoute";
import { slackOAuthRouter } from "./platform/routes/slackOAuthRoute";
import { cloudOAuthRouter } from "./platform/routes/cloudOAuthRoute";
import { manusRouter } from "./platform/routers/manusRouter";
import { mosAgentsMcpRouter } from "./platform/routers/mosAgentsMcpRouter";
import { publicAgentsRoute } from "./platform/routes/publicAgentsRoute";
import { closeDb, pingDb, pingSoworkDb, getDb } from "./db";
import { sql } from "drizzle-orm";
import { appRouter } from "./routers";
import { resumeInterruptedPositioningJobs } from "./strategy/core/positioningJobRunner";
import { runStartupCleanup } from "./platform/core/startupCleanup";
import { computeMissionResources } from "./content/core/missionResourceComputer";
import { getDisabledRuntimeFeatures, isRuntimeFeatureEnabled } from "./platform/core/runtimeSafety";

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
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://*.pipedream.com"],
      // 2026-05-14 (CJ console screenshot): allow Google Fonts stylesheet
      // load. fonts.googleapis.com serves the CSS, fonts.gstatic.com serves
      // the actual font files (woff2). Without these, the CSP blocks the
      // import and the page falls back to system fonts — visible flicker
      // and console errors during onboarding.
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      // 2026-05-12: onbrand.sowork.ai is the new primary; drop.sowork.ai retired
      // (marketing-os kept alive for backward compat).
      // 2026-05-16 (CJ「pipedream 授權出問題：這項內容已遭到封鎖」):
      // Pipedream Connect (@pipedream/sdk/browser connectAccount) renders
      // an iframe from *.pipedream.com and the SDK calls api.pipedream.com
      // + *.pipedream.net. With no frame-src directive CSP fell back to
      // default-src 'self' → the auth iframe was blocked outright. Allow
      // the Pipedream Connect origins for frames + XHR/WS + script.
      connectSrc: [
        "'self'",
        "https://marketing-os.sowork.ai", "https://onbrand.sowork.ai", "https://drop.sowork.ai",
        "https://api.pipedream.com", "https://*.pipedream.com", "https://*.pipedream.net",
      ],
      frameSrc: ["'self'", "https://pipedream.com", "https://*.pipedream.com"],
    },
  },
  hsts: {
    maxAge: 31536000,        // 1 year
    includeSubDomains: true,
    preload: true,
  },
  // Pipedream Connect opens third-party OAuth in a popup from its embedded
  // iframe. Helmet's default `same-origin` COOP severs the popup's opener,
  // leaving it stuck on connect-oauth-start-handoff.html. This policy keeps
  // same-origin isolation while allowing the trusted OAuth popup handoff.
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  crossOriginEmbedderPolicy: false,  // allow SPA iframe embeds if needed
  // 2026-05-29 (security): explicit referrer policy — don't leak URL path in
  // Referer header when navigating to external sites (GDPR data minimisation).
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
}));

// 2026-05-29 (security): Permissions-Policy — disable unused browser APIs that
// could be abused by injected scripts (microphone, camera, geolocation, etc.)
app.use((_req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=(), payment=(), usb=(), fullscreen=(self)",
  );
  next();
});

// SEC-S-07 (2026-05-04): production no longer falls back to localhost (a
// misconfig that would have allowed cross-origin writes). If CORS_ORIGIN is
// unset in prod, we default to the real public domain only — never localhost.
const isProd = process.env.NODE_ENV === "production";
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map(s => s.trim())
  : isProd
    ? ["https://marketing-os.sowork.ai", "https://onbrand.sowork.ai", "https://drop.sowork.ai"]
    : ["http://localhost:5173", "http://localhost:3000"];
app.use(cors({
  origin: corsOrigin,
  credentials: true,
}));
console.log(`[server] CORS origin: ${Array.isArray(corsOrigin) ? corsOrigin.join(",") : corsOrigin}`);
app.use(cookieParser());

// ⚠️  STRIPE WEBHOOK — must be registered BEFORE express.json().
// body-parser marks the stream as consumed on first read (req._body = true).
// If express.json() runs first it parses req.body into a JS object and marks
// the stream consumed; express.raw() then skips → req.body is an object, not
// a Buffer → stripe.webhooks.constructEvent() receives wrong bytes →
// signature verification always fails → 400.
// Mounting the raw route here ensures express.raw() wins the first-read race.
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json", limit: "2mb" }),
  async (req, res) => {
    if (!isRuntimeFeatureEnabled("LIVE_BILLING_ENABLED")) {
      res.status(503).json({ error: "billing disabled in this environment" });
      return;
    }
    try {
      const signature = req.header("stripe-signature") ?? "";
      const { handleStripeWebhook } = await import("./platform/routers/stripeRouter");
      const result = await handleStripeWebhook(req.body as Buffer, signature);
      if (result.ok) {
        res.status(200).json({ received: true });
      } else {
        res.status(400).json({ error: result.message ?? "webhook failed" });
      }
    } catch (e: any) {
      console.error("[stripe.webhook] handler error:", e);
      res.status(500).json({ error: "server error" });
    }
  },
);

// SEC-B-08 (2026-05-04): cap JSON body size. Per-field check below is the
// real DoS protection; body limit just caps overall request size.
// 2026-05-12: bumped 1MB → 50MB. OpenAI gpt-image-1 returns base64 PNG.
// 1024x1024 high-quality PNGs come back as 8-15MB base64 strings; 25MB
// wasn't always enough. 50MB covers the worst case; per-field check below
// is the real DoS guard.
app.use(express.json({ limit: '50mb' }));

// SEC-B-08 v2 (2026-05-05): per-field string cap. The 1MB body limit alone
// allowed e.g. a 999KB string in a single field to slip through and burn
// memory in zod / db / LLM downstream. We recursively walk req.body and
// reject any string > MAX_FIELD_CHARS chars. 50000 is generous for the
// largest legit input we have (markdown / prompt / brief) — easily 10x
// any realistic content while still preventing pathological payloads.
const MAX_FIELD_CHARS = 50_000;
// 2026-05-12: image data URLs (data:image/png;base64,…) routinely run 2-7M
// chars. Whitelist by field name so legitimate gpt-image-1 / Flux b64
// payloads pass through. Still capped by the overall 25MB body limit above.
const IMAGE_DATA_FIELDS = /(^|\.)(imageUrl|imageB64|b64|publicUrl|url)$/;
function deepCheckStringLengths(obj: any, path: string = ""): string | null {
  if (obj == null) return null;
  if (typeof obj === "string") {
    // Image-data fields are exempted (base64 PNG legitimately exceeds the
    // generic per-field cap). Other fields stay at 50K to prevent DoS.
    if (IMAGE_DATA_FIELDS.test(path)) return null;
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
// 2026-05-28: default updated /opt/marketing-os → /opt/onbrand after infra rename.
const coversDir = process.env.COVERS_DIR ?? "/opt/onbrand/covers";
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

// 2026-09-10 (CJ「允許用戶上傳照片到品牌或個別產品」)：用戶自己上傳的品牌／
// 產品照片，本機硬碟＋靜態伺服，跟上面 coversDir 同一套模式。
const assetPhotoUrlPrefix = process.env.ASSET_PHOTO_URL_PREFIX ?? "/static/asset-photos";
app.use(assetPhotoUrlPrefix, express.static(ASSET_PHOTO_STORAGE_ROOT, { maxAge: "7d", immutable: false }));

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
  // SPA fallback — serve index.html with no-cache so browser always loads latest.
  // 2026-05-13 (CJ「整個網站是空白頁」): if a stale client requests an old
  // hashed bundle (e.g. /assets/index-OLD-HASH.js after a new deploy), the
  // express.static handler above calls next() and we used to fall through
  // to index.html — the browser then executed HTML as JS → SyntaxError →
  // blank page on the WHOLE site. Force 404 for /assets/* misses so the
  // browser surfaces a real network error and a hard-refresh recovers.
  app.get("*", (req, res, next) => {
    if (
      req.path.startsWith("/trpc") ||
      req.path.startsWith("/api") ||
      req.path.startsWith("/static/") ||
      req.path === "/health" ||
      req.path === "/agents"
    ) {
      return next();
    }
    if (req.path.startsWith("/assets/")) {
      res.status(404).send("asset not found — your bundle is stale, please hard-refresh (Ctrl+Shift+R)");
      return;
    }
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.sendFile(join(publicDir, "index.html"));
  });
}

// 2026-05-14 (CJ「系統安全穩定」P0): tiered rate limits.
//   · General /trpc and /api: 300/min — tRPC clients batch many calls
//     into one HTTP req but background pollers (notifications, support
//     drawer poll) plus app interaction can hit 100
//     under normal use. 300 gives 3x headroom.
//   · /api/auth/*: 20/min — login/register/reset endpoints get a much
//     tighter cap to slow down brute-force credential attacks. Each
//     individual endpoint also has per-email logic (forgotByEmail map
//     in authRouter) but raw HTTP limit catches the IP-rotation case.
//   · /health: lenient 60/min (monitoring tools poll frequently)
const generalLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             300,
  standardHeaders: true,
  legacyHeaders:   false,
  validate:        false,
});
const authLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             20,
  standardHeaders: true,
  legacyHeaders:   false,
  validate:        false,
  message:         { error: "Too many auth attempts; please wait a minute" },
});
app.use("/api/auth", authLimiter);  // tighter — mounted FIRST so it wins
app.use("/api", generalLimiter);
app.use("/trpc", generalLimiter);

const healthLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, validate: false });

// ─── Auth routes (SEC-1) ─────────────────────────────────────────────────────
app.use("/api/auth", authRouter);
app.use("/api/report-template", reportTemplateRouter);
app.use("/api/positioning-doc", positioningDocRouter);
app.use("/api/asset-photo", assetPhotoUploadRoute);

// ─── Slack OAuth + Events ─────────────────────────────────────────────────────
app.use("/slack", slackOAuthRouter);
// /api/chat removed 2026-05-14 — only v1 MissionChatCore consumed it.
app.use("/api/oauth", cloudOAuthRouter);
app.use("/api/manus", manusRouter);
// 2026-09-23：內部用的遠端 MCP 端點（見 mosAgentsMcpRouter.ts 檔頭）——
// 刻意不掛在 /api/manus 底下、不用 X-Manus-Key，路徑也沒有寫進任何公開
// 文件／openapi.json。
app.use("/api/mcp/mos-agents", mosAgentsMcpRouter);

// ─── Public agent showcase (no auth required by default) ─────────────────────
app.use(publicAgentsRoute);

// ─── Health check (SEC-7: no version number) ────────────────────────────────
// 2026-05-14 (CJ「系統安全穩定」P0): real health check that monitors can act on.
//   · 503 status code when degraded so nginx / uptime monitors can alert
//   · verify critical env vars are present (catches deploy-misconfig)
//   · verify at least one LLM provider key is set (router has fallback chain)
//   · include memory + uptime for capacity planning
app.get("/health", healthLimiter, async (req, res) => {
  const [dbOk, soworkDbOk] = await Promise.all([pingDb(), pingSoworkDb()]);
  const billingQueueLength = getBillingRetryQueueLength();

  const criticalEnvPresent =
    !!process.env.JWT_SECRET &&
    !!process.env.LOCAL_DB_PASSWORD &&
    !!process.env.RESEND_API_KEY;

  const anyLLMKey =
    !!process.env.AZURE_FOUNDRY_API_KEY ||
    !!process.env.OPENAI_API_KEY ||
    !!process.env.ANTHROPIC_API_KEY ||
    !!process.env.GOOGLE_AI_KEY ||
    !!process.env.QWEN_API_KEY ||
    !!process.env.ZHIPU_API_KEY ||
    !!process.env.DEEPSEEK_API_KEY ||
    !!process.env.GROQ_API_KEY;

  const checks = {
    db: dbOk,
    soworkDb: soworkDbOk,
    billingQueueOk: billingQueueLength < 100,
    criticalEnvPresent,
    anyLLMKey,
  };
  const allOk = Object.values(checks).every(Boolean);
  const status = allOk ? "ok" : "degraded";

  // 2026-05-29 (security): full details only for authenticated internal monitors.
  // HEALTH_SECRET env var — set a random token in prod; monitoring tools send
  // Authorization: Bearer <token>. Without it, only return a status flag.
  const healthSecret = process.env.HEALTH_SECRET;
  const authHeader = req.headers.authorization ?? "";
  const isInternal =
    !healthSecret || // no secret set = open (dev mode)
    authHeader === `Bearer ${healthSecret}` ||
    req.ip === "127.0.0.1" || req.ip === "::1" || req.ip === "::ffff:127.0.0.1";

  if (!isInternal) {
    // External probes: only the status code + minimal body
    res.status(allOk ? 200 : 503).json({ status });
    return;
  }

  const mem = process.memoryUsage();
  res.status(allOk ? 200 : 503).json({
    status,
    service: "ai-talent",
    checks: {
      db:                checks.db ? "ok" : "fail",
      soworkDb:          checks.soworkDb ? "ok" : "fail",
      billingQueue:      checks.billingQueueOk ? "ok" : `${billingQueueLength} stuck`,
      criticalEnv:       checks.criticalEnvPresent ? "ok" : "missing",
      llmKey:            checks.anyLLMKey ? "ok" : "no_keys",
    },
    billingQueueLength,
    uptimeSec: Math.floor(process.uptime()),
    memMb:     Math.round(mem.rss / 1024 / 1024),
    ts:        new Date().toISOString(),
  });
});

// (Stripe webhook route moved above express.json() — see comment above)

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
      // 2026-05-15 (CJ digest cleanup): skip expected codes that fire as
      // part of normal UI flow — stale scope (NOT_FOUND), unauth race
      // (UNAUTHORIZED), zod validation (BAD_REQUEST), rate limit
      // (TOO_MANY_REQUESTS) etc. They're not bugs and they were drowning
      // out real issues in pm2 log.
      const expected = new Set([
        "UNAUTHORIZED", "BAD_REQUEST", "NOT_FOUND", "FORBIDDEN",
        "PRECONDITION_FAILED", "CONFLICT", "TOO_MANY_REQUESTS",
      ]);
      if (expected.has(error.code)) return;
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
if (isRuntimeFeatureEnabled("LIVE_BILLING_ENABLED")) {
  setInterval(async () => {
    try {
      const flushed = await flushBillingRetryQueue();
      if (flushed > 0) console.log(`[billing] flushed ${flushed} queued records`);
    } catch (err) {
      console.error("[billing] flush error:", err);
    }
  }, 60_000);
}

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

    // 2026-08-23 (CJ「安排定期任務掃描當地熱門的 facebook 貼文，補充為 task」):
    // 每月排程掃出來的貼文形式候選佇列。DDL 的來源在 _core/postFormatStore.ts，
    // 那裡也寫了為什麼去重不看 status（否則被否決的形式每月復活）。
    const { ASSET_PHOTO_DDL } = await import("./strategy/core/assetPhotos");
    await db.execute(sql.raw(ASSET_PHOTO_DDL));
    console.log("[migrate] asset_photos: OK");

    const { POST_FORMAT_CANDIDATES_DDL } = await import("./content/core/postFormatStore");
    await db.execute(sql.raw(POST_FORMAT_CANDIDATES_DDL));
    console.log("[migrate] post_format_candidates: OK");

    // 2026-09-08 (CJ「策略監測，定義在 9000 的方案」)：監測清單與策略提醒。
    const { STRATEGY_WATCH_DDL, STRATEGY_ALERTS_DDL } = await import("./strategy/core/strategyMonitor");
    await db.execute(sql.raw(STRATEGY_WATCH_DDL));
    await db.execute(sql.raw(STRATEGY_ALERTS_DDL));
    console.log("[migrate] strategy_watch / strategy_alerts: OK");

    // 2026-09-26（CJ「會議的主題、與會人員、多久開一次由用戶設定，定期留會議紀錄」）：策略會議。
    const { STRATEGY_MEETINGS_DDL, STRATEGY_MEETING_RUNS_DDL } = await import("./strategy/core/strategyMeetings");
    await db.execute(sql.raw(STRATEGY_MEETINGS_DDL));
    await db.execute(sql.raw(STRATEGY_MEETING_RUNS_DDL));
    const { POSITIONING_VERSIONS_DDL } = await import("./strategy/core/meetingWriteback");
    await db.execute(sql.raw(POSITIONING_VERSIONS_DDL));
    console.log("[migrate] strategy_meetings / strategy_meeting_runs: OK");

    // 2026-09-14（CJ「選定一個競爭者，對比接觸點跟策略訴求差異」）：
    // 具名競爭者的逐接觸點比對快照（14 天內快取，不重跑研究）。
    const { COMPETITOR_SNAPSHOT_DDL } = await import("./strategy/core/competitorSnapshot");
    await db.execute(sql.raw(COMPETITOR_SNAPSHOT_DDL));
    console.log("[migrate] competitor_snapshots: OK");

    // 2026-09-21（CJ「把『可加購成效層』接上真正的購買路徑」）：加購申請。
    const { ADDON_REQUESTS_DDL } = await import("./platform/core/addonRequests");
    await db.execute(sql.raw(ADDON_REQUESTS_DDL));
    console.log("[migrate] addon_requests: OK");
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

// 2026-05-09 (CJ direction「根除 HTML/JSON 錯誤」):
//   Express's default 404/500 page is HTML. tRPC middleware itself ALWAYS
//   returns JSON, but if a request doesn't match any route OR an unhandled
//   exception bubbles up past tRPC, the client gets HTML and parses it as
//   JSON → "Unexpected token '<'..." error. Adding a JSON-only catch-all
//   for /trpc + /api paths ensures the client never sees HTML for those.
//   Static / boardroom / covers paths still return HTML (intentional).
app.use("/trpc", (_req, res) => {
  res.status(404).json({ error: "tRPC procedure not found" });
});
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API endpoint not found" });
});
// Global error handler — last middleware. Catches anything not handled by
// tRPC's onError or route-level try/catch. Always returns JSON so the
// client's `JSON.parse` never sees HTML.
app.use((err: any, req: any, res: any, _next: any) => {
  console.error("[express] Unhandled error:", {
    method: req.method,
    url: req.url,
    name: err?.name,
    message: err?.message,
    stack: err?.stack?.split("\n").slice(0, 5).join("\n"),
  });
  if (res.headersSent) return;
  // For /trpc and /api routes, ALWAYS JSON. For others, plaintext.
  const isJsonPath = req.path?.startsWith("/trpc") || req.path?.startsWith("/api");
  if (isJsonPath) {
    res.status(500).json({
      error: err?.message ?? "unknown server error",
    });
  } else {
    res.status(500).type("text/plain").send(`server error: ${err?.message ?? "unknown"}`);
  }
});

const server = app.listen(PORT, async () => {
  console.log(`[server] sowork-enterprise listening on port ${PORT}`);
  console.log(`[server] health: http://localhost:${PORT}/health`);
  const disabledFeatures = getDisabledRuntimeFeatures();
  if (disabledFeatures.length > 0) {
    console.warn(`[safety] disabled runtime features: ${disabledFeatures.join(", ")}`);
  }
  await runStartupMigrations();
  if (isRuntimeFeatureEnabled("BACKGROUND_WORKERS_ENABLED")) {
    console.log("[A2A] Orchestrator Worker started");
    console.log("[A2A] Squad Leader Worker started");
    // STAB-4: Re-queue any positioning jobs that were in-flight when pm2
    // was last restarted (status='pending'|'running' but no process running them).
    resumeInterruptedPositioningJobs();
    // STAB-5: Mark stuck squad_sessions and project_sync_jobs rows as failed
    // so users see an error + retry button instead of a frozen spinner.
    runStartupCleanup();

    // 2026-09-24（CJ「刪除AI掃描官網的功能」）：這裡原本每 30 秒輪詢一次
    // product_discovery_jobs，把官網爬回來的產品寫進 products 表。整個功能
    // 已移除，worker 一起拿掉——留著會是一個永遠撈不到工作的空轉迴圈。

    // 策略監測 worker：每 15 分鐘挑一份到期的監測清單掃一次（每份至少隔 7 天）。
    // 一拍只掃一份 —— scout 與 LLM 都要錢，寧可慢。
    const { tickStrategyMonitor } = await import("./strategy/core/strategyMonitor");
    setInterval(() => {
      tickStrategyMonitor().catch((e) => {
        console.error("[strategyMonitor] tick error:", e?.message ?? e);
      });
    }, 15 * 60_000);
    console.log("[strategyMonitor] Worker started (15m interval)");

    // 策略會議 worker：每 15 分鐘挑一場到期的會開（一拍一場，一場是 N+1 次 LLM）。
    const { tickStrategyMeetings } = await import("./strategy/core/strategyMeetings");
    setInterval(() => {
      tickStrategyMeetings().catch((e) => {
        console.error("[strategyMeetings] tick error:", e?.message ?? e);
      });
    }, 15 * 60_000);
    console.log("[strategyMeetings] Worker started (15m interval)");
  }

  if (isRuntimeFeatureEnabled("LIVE_BILLING_ENABLED")) {
    // STAB-3: Recover any billing records persisted to disk during previous crash
    const recovered = await loadBillingFallbackLog();
    if (recovered > 0) {
      console.log(`[server] recovered ${recovered} billing records from fallback log`);
    }
  }

  // Backfill mission resources for existing missions (fire-and-forget)
  if (isRuntimeFeatureEnabled("STARTUP_BACKFILL_ENABLED")) {
    backfillMissionResources();
  }
});

// 2026-05-09: bump server timeouts so heavy orchestra calls (60s tier
// with 5 variants + image gen) don't get killed mid-flight.
//
// 2026-08-19 (IG 99s 502 root cause, confirmed from production nginx logs):
// the old 140s here was the binding constraint and it fired on every slow
// quickTask.runSquadAuto. nginx logged, five times on 2026-08-19 alone:
//   upstream prematurely closed connection while reading response header
//   from upstream, request: "POST /trpc/quickTask.runSquadAuto?batch=1"
// and ZERO "upstream timed out (110)" — i.e. nginx's own 180s never got a
// chance, Node destroyed the socket first and nginx surfaced that as a 502.
//
// runSquadAuto's synchronous worst case is ~196s:
//   scout <=12s (socialListeningScout SCOUT_TIMEOUT_MS)
// + 5 planning steps run in sequence, <=25s each  = 125s
// + public synthesis shared deadline               = 55s
// + brand context / redaction / persistence        ~4s
// 220s covers that with margin while staying under both nginx's read
// timeout (raise to 230s) and Azure's default 4-minute L4 idle timeout.
// The real fix is to stop running a 3-minute job inside an HTTP request;
// this only stops the bleeding.
//
// The three knobs mean different things — do NOT scale them together:
//   timeout        — socket INACTIVITY, not total request time. This is the
//                    one that was killing us.
//   keepAliveTimeout — idle wait for the NEXT request on a kept-alive socket.
//                    Raising it only piles up idle sockets. Leave it.
//   headersTimeout — time allowed to RECEIVE request headers. It is a
//                    slow-header DoS guard and must not grow with handler
//                    time. The old "must be > server.timeout" comment was
//                    wrong; Node imposes no such rule.
//   requestTimeout — time allowed to receive the ENTIRE request (409/408 on
//                    expiry). It does not cover handler execution, so Node
//                    22's 300s default was never our ceiling. Pinned here so
//                    the behaviour can't drift with the Node version.
server.timeout = 220_000;          // socket inactivity
server.keepAliveTimeout = 65_000;  // > nginx's default keep-alive
server.headersTimeout = 60_000;    // receiving headers only — slow-header guard
server.requestTimeout = 300_000;   // receiving the request body only

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
  // 2026-05-29 (solo-ops): unhandled promise rejection = unexpected state.
  // Log then initiate graceful shutdown so pm2 can restart the process
  // instead of leaving it in a potentially corrupt state.
  shutdown("unhandledRejection").catch(() => process.exit(1));
});

export default app;
