/**
 * Slack OAuth 2.0 Flow — Multi-workspace installation
 *
 * Endpoints:
 *   GET /slack/install         → redirects to Slack authorize page
 *   GET /slack/oauth/callback  → exchanges code for bot token, stores in DB
 *   POST /slack/events         → receives Slack events (challenge + message routing)
 */

import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import { createPool } from "mysql2/promise";

const router = Router();

// ─── Env ──────────────────────────────────────────────────────────────────────
function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`[slack-oauth] Missing env: ${key}`);
  return v;
}

// In-memory CSRF state store (use Redis for multi-instance deployments)
const pendingStates = new Set<string>();

// ─── Lazy DB helper ───────────────────────────────────────────────────────────
function makePool() {
  // SEC-B-02 (2026-05-05): no hardcoded password fallback. See db.ts.
  const password = process.env.LOCAL_DB_PASSWORD;
  if (!password) throw new Error("[slackOAuthRoute] LOCAL_DB_PASSWORD env var is required.");
  return createPool({
    host:            process.env.LOCAL_DB_HOST     || "localhost",
    user:            process.env.LOCAL_DB_USER     || "mos_user",
    password,
    database:        process.env.LOCAL_DB_NAME     || "mos_db",
    connectionLimit: 2,
    connectTimeout:  10_000,
  });
}

async function dbExec(sqlStr: string, values: (string | null)[]): Promise<void> {
  const pool = makePool();
  try {
    await pool.query(sqlStr, values);
  } finally {
    await pool.end();
  }
}

async function dbQuery<T>(sqlStr: string, values: (string | null)[]): Promise<T[]> {
  const pool = makePool();
  try {
    const [rows] = await pool.query(sqlStr, values);
    return rows as T[];
  } finally {
    await pool.end();
  }
}

// ─── ① Install entry — redirect to Slack OAuth ───────────────────────────────
router.get("/install", (_req: Request, res: Response) => {
  let clientId: string;
  try { clientId = env("SLACK_CLIENT_ID"); } catch {
    res.status(500).send("SLACK_CLIENT_ID not configured");
    return;
  }

  const state = crypto.randomBytes(16).toString("hex");
  pendingStates.add(state);
  setTimeout(() => pendingStates.delete(state), 10 * 60 * 1000);

  const scopes = [
    "app_mentions:read",
    "channels:history",
    "channels:read",
    "chat:write",
    "commands",
    "im:history",
    "im:write",
    "users:read",
    "users:read.email",
  ].join(",");

  const redirectUri = process.env.SLACK_REDIRECT_URI
    ?? "https://marketing-claw.sowork.ai/slack/oauth/callback";

  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id",    clientId);
  url.searchParams.set("scope",        scopes);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state",        state);

  res.redirect(url.toString());
});

// ─── ② OAuth Callback — exchange code → bot token → store in DB ──────────────
router.get("/oauth/callback", async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;

  if (error) {
    console.error("[slack-oauth] user denied:", error);
    res.redirect("https://marketing-claw.sowork.ai/install?error=access_denied");
    return;
  }

  // CSRF check
  if (!state || !pendingStates.has(state)) {
    console.warn("[slack-oauth] invalid state:", state);
    res.status(400).send("Invalid state — possible CSRF. Please try again.");
    return;
  }
  pendingStates.delete(state);

  if (!code) {
    res.status(400).send("Missing code parameter.");
    return;
  }

  let clientId: string;
  let clientSecret: string;
  const redirectUri = process.env.SLACK_REDIRECT_URI
    ?? "https://marketing-claw.sowork.ai/slack/oauth/callback";

  try {
    clientId     = env("SLACK_CLIENT_ID");
    clientSecret = env("SLACK_CLIENT_SECRET");
  } catch (e) {
    console.error("[slack-oauth] env error:", e);
    res.status(500).send("Server configuration error.");
    return;
  }

  try {
    // Exchange code for access token (native fetch — no axios needed)
    const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        code,
        redirect_uri:  redirectUri,
      }),
    });

    const data = await tokenRes.json() as {
      ok: boolean;
      error?: string;
      access_token: string;
      bot_user_id: string;
      scope: string;
      team: { id: string; name: string };
      authed_user?: { id: string };
    };

    if (!data.ok) {
      console.error("[slack-oauth] token exchange failed:", data.error);
      res.status(500).send(`Slack error: ${data.error}`);
      return;
    }

    const { access_token, bot_user_id, team, authed_user, scope } = data;

    // Upsert into slack_installs
    await dbExec(
      `INSERT INTO slack_installs
         (slack_team_id, slack_team_name, bot_user_id, bot_token,
          installer_user_id, scopes, source)
       VALUES (?, ?, ?, ?, ?, ?, 'public_distribution')
       ON DUPLICATE KEY UPDATE
         slack_team_name   = VALUES(slack_team_name),
         bot_user_id       = VALUES(bot_user_id),
         bot_token         = VALUES(bot_token),
         installer_user_id = VALUES(installer_user_id),
         scopes            = VALUES(scopes),
         updated_at        = NOW()`,
      [
        team.id,
        team.name,
        bot_user_id,
        access_token,
        authed_user?.id ?? null,
        scope,
      ]
    );

    console.log(`[slack-oauth] ✅ installed: ${team.name} (${team.id})`);
    res.redirect(`slack://app?team=${team.id}`);
  } catch (err: unknown) {
    console.error("[slack-oauth] unexpected error:", err);
    res.status(500).send("Installation failed. Please try again.");
  }
});

// ─── ③ Events endpoint — URL verification + event routing ────────────────────
router.post("/events", (req: Request, res: Response) => {
  const payload = req.body as {
    type?: string;
    challenge?: string;
    team_id?: string;
    event?: { type: string; channel_type?: string };
  };

  // Slack URL verification challenge
  if (payload?.type === "url_verification") {
    res.json({ challenge: payload.challenge });
    return;
  }

  // Acknowledge immediately (Slack requires < 3s)
  res.status(200).send();

  // Route asynchronously
  void (async () => {
    try {
      const { team_id, event } = payload;
      if (!team_id || !event) return;

      const { type, channel_type } = event;
      if (type !== "app_mention" && channel_type !== "im") return;

      // Lookup bot_token for this workspace
      const rows = await dbQuery<{ bot_token: string }>(
        `SELECT bot_token FROM slack_installs
         WHERE slack_team_id = ? LIMIT 1`,
        [team_id]
      );

      if (!rows.length || !rows[0]) {
        console.warn(`[slack-events] unknown workspace: ${team_id}`);
        return;
      }

      const botToken = rows[0].bot_token;
      const ocGatewayUrl = process.env.OPENCLAW_GATEWAY_URL ?? "http://localhost:3100";

      // Forward to OpenClaw Gateway
      await fetch(`${ocGatewayUrl}/slack/inbound`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ...payload, _marketing_claw_token: botToken }),
        signal:  AbortSignal.timeout(5000),
      }).catch((err: unknown) => {
        console.error("[slack-events] forward to OpenClaw failed:", (err as Error).message);
      });
    } catch (err: unknown) {
      console.error("[slack-events] routing error:", err);
    }
  })();
});

export { router as slackOAuthRouter };
