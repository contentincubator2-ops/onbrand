/**
 * oauthRoutes — OnBrand 連接器的 OAuth 2.1 端點（Claude 自訂連接器規格）。
 *
 *   GET  /.well-known/oauth-protected-resource[/api/mcp/onbrand]  RFC 9728
 *   GET  /.well-known/oauth-authorization-server                  RFC 8414
 *   POST /api/mcp-oauth/register                                   RFC 7591 動態註冊（只收 public client）
 *   GET  /api/mcp-oauth/authorize                                  沒登入→登入頁；登入→「允許」頁
 *   POST /api/mcp-oauth/authorize                                  允許／拒絕 → 帶 code 回到 Claude
 *   POST /api/mcp-oauth/token                                      authorization_code（PKCE S256）／refresh_token
 *
 * 資料層與安全考量見 oauthStore.ts。
 */
import express, { Router, Request, Response } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { createContext } from "../core/trpc";
import { getJwtSecret } from "../core/env";
import {
  isAllowedRedirectUri, verifyPkce, registerClient, getClient,
  issueCode, consumeCode, issueTokenPair, rotateRefreshToken,
} from "./oauthStore";

export const MCP_RESOURCE_PATH = "/api/mcp/onbrand";

/** 對外網址。APP_URL 是 Google 登入回呼也在用的同一個值（dev／正式站各自設定）。 */
export function publicBaseUrl(req: Request): string {
  const env = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  if (env) return env;
  return `${req.protocol}://${req.get("host")}`;
}

export function authServerMetadata(base: string) {
  return {
    issuer: base,
    authorization_endpoint: `${base}/api/mcp-oauth/authorize`,
    token_endpoint: `${base}/api/mcp-oauth/token`,
    registration_endpoint: `${base}/api/mcp-oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["onbrand"],
  };
}

export function protectedResourceMetadata(base: string) {
  return {
    resource: `${base}${MCP_RESOURCE_PATH}`,
    authorization_servers: [base],
    bearer_methods_supported: ["header"],
    scopes_supported: ["onbrand"],
    resource_name: "OnBrand AI",
  };
}

// ── /.well-known（掛在網站根目錄；SPA fallback 已跳過 /.well-known）──────────
export const wellKnownRouter = Router();
wellKnownRouter.get(
  ["/.well-known/oauth-protected-resource", `/.well-known/oauth-protected-resource${MCP_RESOURCE_PATH}`],
  (req, res) => { res.json(protectedResourceMetadata(publicBaseUrl(req))); },
);
wellKnownRouter.get(
  ["/.well-known/oauth-authorization-server", `/.well-known/oauth-authorization-server${MCP_RESOURCE_PATH}`],
  (req, res) => { res.json(authServerMetadata(publicBaseUrl(req))); },
);

// ── /api/mcp-oauth ────────────────────────────────────────────────────────
export const mcpOAuthRouter = Router();
mcpOAuthRouter.use(express.urlencoded({ extended: false, limit: "20kb" }));

function oauthError(res: Response, status: number, error: string, description?: string) {
  res.status(status).set("Cache-Control", "no-store").json({ error, ...(description ? { error_description: description } : {}) });
}

mcpOAuthRouter.post("/register", async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const uris: unknown = body.redirect_uris;
  if (!Array.isArray(uris) || !uris.length || uris.length > 10 || !uris.every((u) => typeof u === "string")) {
    return oauthError(res, 400, "invalid_redirect_uri", "redirect_uris 必填");
  }
  const bad = (uris as string[]).find((u) => !isAllowedRedirectUri(u));
  if (bad) return oauthError(res, 400, "invalid_redirect_uri", `不允許的回呼網址：${bad}`);
  const method = body.token_endpoint_auth_method ?? "none";
  if (method !== "none") return oauthError(res, 400, "invalid_client_metadata", "只支援 public client（token_endpoint_auth_method=none）");
  const clientName = typeof body.client_name === "string" ? body.client_name : null;
  const clientId = await registerClient({ clientName, redirectUris: uris as string[] });
  res.status(201).set("Cache-Control", "no-store").json({
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: clientName ?? undefined,
    redirect_uris: uris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  });
});

type AuthzParams = {
  client_id: string; redirect_uri: string; code_challenge: string;
  code_challenge_method: string; state: string; resource: string; response_type: string;
};

function readAuthzParams(src: any): AuthzParams {
  const s = (k: string) => (typeof src?.[k] === "string" ? src[k] : "");
  return {
    client_id: s("client_id"), redirect_uri: s("redirect_uri"), code_challenge: s("code_challenge"),
    code_challenge_method: s("code_challenge_method"), state: s("state"), resource: s("resource"),
    response_type: s("response_type"),
  };
}

/**
 * 驗 client 與 redirect_uri。這兩個不對時「不能」redirect 回去（RFC 6749 §4.1.2.1），
 * 否則等於替攻擊者轉址；其餘錯誤才帶 error 回到 redirect_uri。
 */
async function validateAuthz(p: AuthzParams): Promise<
  { ok: true; clientName: string | null } | { ok: false; fatal: boolean; error: string; description: string }
> {
  const client = p.client_id ? await getClient(p.client_id) : null;
  if (!client) return { ok: false, fatal: true, error: "invalid_client", description: "找不到這個連接器，請回到 Claude 重新連線。" };
  if (!client.redirectUris.includes(p.redirect_uri) || !isAllowedRedirectUri(p.redirect_uri)) {
    return { ok: false, fatal: true, error: "invalid_request", description: "回呼網址不符，請回到 Claude 重新連線。" };
  }
  if (p.response_type !== "code") return { ok: false, fatal: false, error: "unsupported_response_type", description: "只支援 code" };
  if (p.code_challenge_method !== "S256" || !/^[A-Za-z0-9\-_]{43,128}$/.test(p.code_challenge)) {
    return { ok: false, fatal: false, error: "invalid_request", description: "需要 PKCE S256" };
  }
  return { ok: true, clientName: client.clientName };
}

function redirectWith(res: Response, redirectUri: string, params: Record<string, string>) {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  res.redirect(302, u.toString());
}

/** 「允許」表單的 CSRF 簽章：綁使用者＋這次授權的參數。 */
function consentSig(userId: number, p: AuthzParams): string {
  return createHmac("sha256", getJwtSecret())
    .update(["mcp-consent", userId, p.client_id, p.redirect_uri, p.code_challenge, p.state, p.resource].join("|"))
    .digest("base64url");
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function page(res: Response, status: number, body: string, formActionOrigins: string[] = []) {
  // helmet 預設 form-action 'self'；Chrome 會連「送出後的 302」一起擋，所以允許頁要放行 Claude 的回呼來源。
  res.setHeader(
    "Content-Security-Policy",
    `default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'self' ${formActionOrigins.join(" ")}; frame-ancestors 'none'; base-uri 'none'`,
  );
  res.status(status).type("html").send(`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>OnBrand AI · 連接 Claude</title>
<style>
  :root{color-scheme:light dark;--bg:#faf8f5;--card:#fff;--ink:#1a1a1a;--mute:#6b6b6b;--line:#e7e2da;--accent:#e8590c}
  @media (prefers-color-scheme:dark){:root{--bg:#161514;--card:#1f1e1c;--ink:#f2f0ec;--mute:#a19d97;--line:#34312d}}
  body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 -apple-system,"Noto Sans TC","PingFang TC",sans-serif;display:grid;place-items:center;min-height:100vh;padding:16px;box-sizing:border-box}
  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:28px;max-width:420px;width:100%}
  h1{font-size:19px;margin:0 0 6px} p{margin:8px 0;color:var(--mute)} ul{padding-left:20px;margin:12px 0} li{margin:4px 0}
  .who{font-size:13px;color:var(--mute);border-top:1px solid var(--line);padding-top:12px;margin-top:16px}
  .row{display:flex;gap:10px;margin-top:20px} button{flex:1;font:inherit;padding:10px;border-radius:10px;cursor:pointer;border:1px solid var(--line);background:transparent;color:var(--ink)}
  button.primary{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600}
</style></head><body><main class="card">${body}</main></body></html>`);
}

function originOf(uri: string): string {
  try { return new URL(uri).origin; } catch { return ""; }
}

mcpOAuthRouter.get("/authorize", async (req: Request, res: Response) => {
  const p = readAuthzParams(req.query);
  const v = await validateAuthz(p);
  if (!v.ok && v.fatal) return page(res, 400, `<h1>無法連接</h1><p>${esc(v.description)}</p>`);
  if (!v.ok) return redirectWith(res, p.redirect_uri, { error: v.error, error_description: v.description, state: p.state });

  const ctx = await createContext({ req });
  if (!ctx.user) {
    const next = req.originalUrl; // 只會是本站路徑，登入頁另外再驗一次
    return res.redirect(302, `/auth/login?next=${encodeURIComponent(next)}`);
  }

  const { getDb } = await import("../../db");
  const { getUserById } = await import("../auth/usersDb");
  const db = await getDb();
  const user = db ? await getUserById(db as any, ctx.user.id) : null;
  const email = user?.email ?? `使用者 #${ctx.user.id}`;
  const clientLabel = v.clientName || "Claude";
  const hidden = (Object.entries(p) as Array<[string, string]>)
    .map(([k, val]) => `<input type="hidden" name="${k}" value="${esc(val)}">`).join("");

  page(res, 200, `
    <h1>${esc(clientLabel)} 想連接你的 OnBrand</h1>
    <p>允許後，你在 Claude 裡就能直接調度 OnBrand 行銷團隊：</p>
    <ul>
      <li>讀取你的品牌大腦與品牌清單</li>
      <li>用最新的任務卡產出貼文（會扣你 OnBrand 方案的點數）</li>
      <li>查看與排定本週企劃</li>
    </ul>
    <form method="post" action="/api/mcp-oauth/authorize">
      ${hidden}<input type="hidden" name="sig" value="${consentSig(ctx.user.id, p)}">
      <div class="row">
        <button type="submit" name="decision" value="deny">取消</button>
        <button type="submit" name="decision" value="allow" class="primary">允許</button>
      </div>
    </form>
    <div class="who">目前登入：${esc(email)}</div>`,
    [originOf(p.redirect_uri)].filter(Boolean));
});

mcpOAuthRouter.post("/authorize", async (req: Request, res: Response) => {
  const p = readAuthzParams(req.body);
  const v = await validateAuthz(p);
  if (!v.ok && v.fatal) return page(res, 400, `<h1>無法連接</h1><p>${esc(v.description)}</p>`);
  if (!v.ok) return redirectWith(res, p.redirect_uri, { error: v.error, error_description: v.description, state: p.state });

  const ctx = await createContext({ req });
  if (!ctx.user) return page(res, 401, `<h1>登入已過期</h1><p>請回到 Claude 重新連線。</p>`);

  const sig = typeof req.body?.sig === "string" ? req.body.sig : "";
  const expected = consentSig(ctx.user.id, p);
  const a = Buffer.from(sig); const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return page(res, 400, `<h1>請求無效</h1><p>請回到 Claude 重新連線。</p>`);

  if (req.body?.decision !== "allow") {
    return redirectWith(res, p.redirect_uri, { error: "access_denied", state: p.state });
  }
  const code = await issueCode({
    clientId: p.client_id, userId: ctx.user.id, redirectUri: p.redirect_uri,
    codeChallenge: p.code_challenge, resource: p.resource || null,
  });
  redirectWith(res, p.redirect_uri, { code, state: p.state });
});

mcpOAuthRouter.post("/token", async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const s = (k: string) => (typeof b[k] === "string" ? b[k] : "");
  try {
    if (s("grant_type") === "authorization_code") {
      const row = await consumeCode(s("code"));
      if (!row) return oauthError(res, 400, "invalid_grant", "code 無效或已使用");
      if (row.clientId !== s("client_id")) return oauthError(res, 400, "invalid_grant", "client 不符");
      if (row.redirectUri !== s("redirect_uri")) return oauthError(res, 400, "invalid_grant", "redirect_uri 不符");
      if (!verifyPkce(s("code_verifier"), row.codeChallenge)) return oauthError(res, 400, "invalid_grant", "PKCE 驗證失敗");
      const tokens = await issueTokenPair({ clientId: row.clientId, userId: Number(row.userId), resource: row.resource });
      return res.set("Cache-Control", "no-store").json({ ...tokens, scope: "onbrand" });
    }
    if (s("grant_type") === "refresh_token") {
      const tokens = await rotateRefreshToken(s("refresh_token"), s("client_id"));
      if (!tokens) return oauthError(res, 400, "invalid_grant", "refresh_token 無效或已過期");
      return res.set("Cache-Control", "no-store").json({ ...tokens, scope: "onbrand" });
    }
    return oauthError(res, 400, "unsupported_grant_type");
  } catch (err: any) {
    console.error("[mcpOAuth] token error:", err?.message);
    return oauthError(res, 500, "server_error");
  }
});
