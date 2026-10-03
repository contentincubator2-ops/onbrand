/**
 * cloudOAuthRoute.ts — native OAuth install/callback for the persona-agent
 * "帳號連接" cloud-file training source (Google Drive, OneDrive).
 *
 *   GET /api/oauth/google-drive/install?brandId=X  → redirect to Google
 *   GET /api/oauth/google-drive/callback           → exchange code, store
 *   GET /api/oauth/onedrive/install?brandId=X      → redirect to Microsoft
 *   GET /api/oauth/onedrive/callback               → exchange code, store
 *
 * The client opens /install in a popup (not a full-page redirect) — we
 * don't know BrandsPage's brand-selection URL scheme from here, and a popup
 * avoids needing to. /callback responds with a tiny self-closing HTML page
 * that postMessages the result back to window.opener.
 *
 * 2026-08-21 (CJ「怎麼覺得還是不踏實，因為很多人，影音就是放在google drive,
 * one drive or youtube上面」→ 帳號連接型 build).
 */
import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { jwtVerify } from "jose";
import { getJwtSecret, ENV } from "../core/env";
import { saveConnection, type CloudProvider } from "../core/connectors/cloudTokens";

export const cloudOAuthRouter = Router();

// ─── Session (same pattern as brandBrainRoute.ts) ────────────────────────────
async function verifyUser(req: Request): Promise<number | null> {
  const raw = (req as any).cookies?.session;
  if (!raw) return null;
  try {
    const secret = new TextEncoder().encode(getJwtSecret());
    const { payload } = await jwtVerify(raw, secret);
    return payload.sub ? parseInt(String(payload.sub), 10) : null;
  } catch { return null; }
}

// ─── CSRF state store (mirrors slackOAuthRoute.ts's in-memory approach) ─────
const pendingStates = new Map<string, { userId: number; brandId: number; provider: CloudProvider }>();
function putState(userId: number, brandId: number, provider: CloudProvider): string {
  const state = crypto.randomBytes(16).toString("hex");
  pendingStates.set(state, { userId, brandId, provider });
  setTimeout(() => pendingStates.delete(state), 10 * 60 * 1000);
  return state;
}

function appUrl(): string {
  return (ENV.APP_URL ?? "https://onbrand.sowork.ai").replace(/\/$/, "");
}

function popupResultPage(ok: boolean, provider: CloudProvider, message?: string): string {
  const payload = JSON.stringify({ type: "cloud-oauth-result", provider, ok, message: message ?? null });
  return `<!doctype html><html><body style="font-family:sans-serif;padding:24px;color:#333">
<p>${ok ? "連接成功，這個視窗即將自動關閉…" : `連接失敗：${message ?? "未知錯誤"}`}</p>
<script>
  if (window.opener) { window.opener.postMessage(${payload}, "*"); }
  setTimeout(function () { window.close(); }, ${ok ? 800 : 4000});
</script>
</body></html>`;
}

// ─── Google Drive ─────────────────────────────────────────────────────────────

cloudOAuthRouter.get("/google-drive/install", async (req: Request, res: Response) => {
  const userId = await verifyUser(req);
  if (!userId) { res.status(401).send("請先登入"); return; }
  const brandId = parseInt(String(req.query.brandId ?? ""), 10);
  if (!brandId) { res.status(400).send("缺少 brandId"); return; }
  if (!ENV.GOOGLE_CLIENT_ID) { res.status(500).send("GOOGLE_CLIENT_ID 未設定"); return; }

  const state = putState(userId, brandId, "google_drive");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", ENV.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", `${appUrl()}/api/oauth/google-drive/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email https://www.googleapis.com/auth/drive.readonly");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  res.redirect(url.toString());
});

cloudOAuthRouter.get("/google-drive/callback", async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;
  if (error) { res.send(popupResultPage(false, "google_drive", "使用者取消授權")); return; }
  const ctx = state ? pendingStates.get(state) : null;
  if (!state || !ctx || ctx.provider !== "google_drive") { res.status(400).send(popupResultPage(false, "google_drive", "無效的狀態，請重新連接")); return; }
  pendingStates.delete(state);
  if (!code) { res.send(popupResultPage(false, "google_drive", "缺少授權碼")); return; }

  try {
    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: ENV.GOOGLE_CLIENT_ID ?? "",
        client_secret: ENV.GOOGLE_CLIENT_SECRET ?? "",
        redirect_uri: `${appUrl()}/api/oauth/google-drive/callback`,
        grant_type: "authorization_code",
      }),
      // 2026-08-22 (CJ「跳出的視窗運行很久，都還沒反應」): this fetch had no
      // timeout — a hung/slow call to Google left the popup blank forever,
      // since res.send() only fires after the whole handler resolves.
      signal: AbortSignal.timeout(15_000),
    });
    if (!tokenResp.ok) throw new Error(`token exchange HTTP ${tokenResp.status}`);
    const tokens = await tokenResp.json() as { access_token: string; refresh_token?: string; expires_in: number };
    if (!tokens.refresh_token) {
      // Happens when the user already granted consent before without
      // `prompt=consent` — access_type=offline + prompt=consent above
      // should prevent this, but guard anyway rather than silently storing
      // a connection that can't outlive the first hour.
      throw new Error("Google 沒有回傳 refresh token，請到 Google 帳號權限頁移除既有授權後重試");
    }

    let accountEmail: string | null = null;
    try {
      const meResp = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (meResp.ok) accountEmail = ((await meResp.json()) as any)?.email ?? null;
    } catch { /* non-fatal */ }

    await saveConnection(ctx.userId, ctx.brandId, "google_drive", {
      access: tokens.access_token,
      refresh: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      accountEmail,
    });
    res.send(popupResultPage(true, "google_drive"));
  } catch (e: any) {
    console.error("[cloud-oauth] google-drive callback error:", e?.message ?? e);
    res.send(popupResultPage(false, "google_drive", String(e?.message ?? e)));
  }
});

// ─── OneDrive (Microsoft Graph) ───────────────────────────────────────────────

const MS_SCOPE = "offline_access Files.Read User.Read";

cloudOAuthRouter.get("/onedrive/install", async (req: Request, res: Response) => {
  const userId = await verifyUser(req);
  if (!userId) { res.status(401).send("請先登入"); return; }
  const brandId = parseInt(String(req.query.brandId ?? ""), 10);
  if (!brandId) { res.status(400).send("缺少 brandId"); return; }
  if (!ENV.MICROSOFT_CLIENT_ID) { res.status(500).send("MICROSOFT_CLIENT_ID 未設定"); return; }

  const state = putState(userId, brandId, "onedrive");
  const url = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
  url.searchParams.set("client_id", ENV.MICROSOFT_CLIENT_ID);
  url.searchParams.set("redirect_uri", `${appUrl()}/api/oauth/onedrive/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", MS_SCOPE);
  url.searchParams.set("state", state);
  res.redirect(url.toString());
});

cloudOAuthRouter.get("/onedrive/callback", async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;
  if (error) { res.send(popupResultPage(false, "onedrive", "使用者取消授權")); return; }
  const ctx = state ? pendingStates.get(state) : null;
  if (!state || !ctx || ctx.provider !== "onedrive") { res.status(400).send(popupResultPage(false, "onedrive", "無效的狀態，請重新連接")); return; }
  pendingStates.delete(state);
  if (!code) { res.send(popupResultPage(false, "onedrive", "缺少授權碼")); return; }

  try {
    const tokenResp = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: ENV.MICROSOFT_CLIENT_ID ?? "",
        client_secret: ENV.MICROSOFT_CLIENT_SECRET ?? "",
        redirect_uri: `${appUrl()}/api/oauth/onedrive/callback`,
        grant_type: "authorization_code",
        scope: MS_SCOPE,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!tokenResp.ok) throw new Error(`token exchange HTTP ${tokenResp.status}`);
    const tokens = await tokenResp.json() as { access_token: string; refresh_token: string; expires_in: number };

    let accountEmail: string | null = null;
    try {
      const meResp = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (meResp.ok) {
        const me = await meResp.json() as any;
        accountEmail = me?.mail ?? me?.userPrincipalName ?? null;
      }
    } catch { /* non-fatal */ }

    await saveConnection(ctx.userId, ctx.brandId, "onedrive", {
      access: tokens.access_token,
      refresh: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      accountEmail,
    });
    res.send(popupResultPage(true, "onedrive"));
  } catch (e: any) {
    console.error("[cloud-oauth] onedrive callback error:", e?.message ?? e);
    res.send(popupResultPage(false, "onedrive", String(e?.message ?? e)));
  }
});
