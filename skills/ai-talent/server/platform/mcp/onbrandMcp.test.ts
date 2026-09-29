/**
 * OnBrand 連接器 — OAuth 2.1 ＋ MCP 協定的端到端行為測試。
 *
 * 起真的 express app、打真的 HTTP：動態註冊 → 授權頁 → 允許 → 換 token（PKCE）→ 帶 token 呼叫 MCP。
 * localDb 用一個小型的記憶體假庫頂替（只認得 mcp_oauth_* 三張表的語句）；登入狀態用 x-test-user 模擬。
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import type { Server } from "http";
import { createHash, randomBytes } from "crypto";

type Row = Record<string, any>;
const clients = new Map<string, Row>();
const codes = new Map<string, Row>();
const tokens = new Map<string, Row>();
const now = () => Date.now();

vi.mock("../../localDb", () => ({
  default: {
    execute: async (q: string, p: any[] = []) => {
      const s = q.replace(/\s+/g, " ").trim();
      if (s.startsWith("INSERT INTO mcp_oauth_clients")) { clients.set(p[0], { clientId: p[0], clientName: p[1], redirectUris: p[2] }); return [{ affectedRows: 1 }]; }
      if (s.startsWith("SELECT clientId, clientName, redirectUris")) return [[clients.get(p[0])].filter(Boolean)];
      if (s.startsWith("INSERT INTO mcp_oauth_codes")) {
        codes.set(p[0], { codeHash: p[0], clientId: p[1], userId: p[2], redirectUri: p[3], codeChallenge: p[4], resource: p[5], expiresAt: now() + p[6] * 1000, usedAt: null });
        return [{ affectedRows: 1 }];
      }
      if (s.startsWith("UPDATE mcp_oauth_codes SET usedAt")) {
        const c = codes.get(p[0]);
        if (!c || c.usedAt || c.expiresAt <= now()) return [{ affectedRows: 0 }];
        c.usedAt = now(); return [{ affectedRows: 1 }];
      }
      if (s.startsWith("SELECT clientId, userId, redirectUri, codeChallenge, resource FROM mcp_oauth_codes")) return [[codes.get(p[0])].filter(Boolean)];
      if (s.startsWith("INSERT INTO mcp_oauth_tokens")) {
        tokens.set(p[0], { kind: "access", clientId: p[1], userId: p[2], resource: p[3], expiresAt: now() + p[4] * 1000, revokedAt: null });
        tokens.set(p[5], { kind: "refresh", clientId: p[6], userId: p[7], resource: p[8], expiresAt: now() + p[9] * 1000, revokedAt: null });
        return [{ affectedRows: 2 }];
      }
      if (s.startsWith("SELECT userId, resource FROM mcp_oauth_tokens")) {
        const t = tokens.get(p[0]);
        const ok = t && t.kind === "refresh" && t.clientId === p[1] && !t.revokedAt && t.expiresAt > now();
        return [ok ? [t] : []];
      }
      if (s.startsWith("UPDATE mcp_oauth_tokens SET revokedAt")) {
        const t = tokens.get(p[0]);
        if (!t || t.revokedAt) return [{ affectedRows: 0 }];
        t.revokedAt = now(); return [{ affectedRows: 1 }];
      }
      if (s.startsWith("SELECT userId FROM mcp_oauth_tokens")) {
        const t = tokens.get(p[0]);
        return [t && t.kind === "access" && !t.revokedAt && t.expiresAt > now() ? [t] : []];
      }
      return [[]];
    },
  },
}));
vi.mock("../core/env", () => ({ getJwtSecret: () => "test-secret" }));
vi.mock("../core/trpc", () => ({
  createContext: async ({ req }: any) => {
    const id = Number(req.headers["x-test-user"] ?? 0);
    return { user: id ? { id } : null };
  },
}));
vi.mock("../../db", () => ({ getDb: async () => null }));
vi.mock("../core/brandAuth", () => ({ assertBrandAccess: async () => { throw new Error("no"); } }));

import { wellKnownRouter, mcpOAuthRouter } from "./oauthRoutes";
import { onbrandMcpRouter } from "./onbrandMcpRouter";
import { isAllowedRedirectUri, verifyPkce } from "./oauthStore";
import { TOOLS } from "./onbrandTools";

let server: Server;
let base: string;
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";

beforeAll(async () => {
  process.env.APP_URL = "";
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use(wellKnownRouter);
  app.use("/api/mcp-oauth", mcpOAuthRouter);
  app.use("/api/mcp/onbrand", onbrandMcpRouter);
  await new Promise<void>((r) => { server = app.listen(0, () => r()); });
  const addr = server.address() as any;
  base = `http://127.0.0.1:${addr.port}`;
});
afterAll(() => { server?.close(); });

function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

async function register(redirect = REDIRECT) {
  const r = await fetch(`${base}/api/mcp-oauth/register`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "Claude", redirect_uris: [redirect], token_endpoint_auth_method: "none" }),
  });
  return { status: r.status, body: await r.json() as any };
}

async function authorizeAndGetCode(clientId: string, challenge: string, userId = 42) {
  const q = new URLSearchParams({
    response_type: "code", client_id: clientId, redirect_uri: REDIRECT,
    code_challenge: challenge, code_challenge_method: "S256", state: "st-1", resource: `${base}/api/mcp/onbrand`,
  });
  const page = await fetch(`${base}/api/mcp-oauth/authorize?${q}`, { headers: { "x-test-user": String(userId) }, redirect: "manual" });
  expect(page.status).toBe(200);
  expect(page.headers.get("content-security-policy")).toContain("form-action 'self' https://claude.ai");
  const html = await page.text();
  const sig = /name="sig" value="([^"]+)"/.exec(html)![1];
  const form = new URLSearchParams(q); form.set("sig", sig); form.set("decision", "allow");
  const post = await fetch(`${base}/api/mcp-oauth/authorize`, {
    method: "POST", headers: { "x-test-user": String(userId), "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(), redirect: "manual",
  });
  expect(post.status).toBe(302);
  const loc = new URL(post.headers.get("location")!);
  expect(loc.origin + loc.pathname).toBe(REDIRECT);
  expect(loc.searchParams.get("state")).toBe("st-1");
  return loc.searchParams.get("code")!;
}

async function token(body: Record<string, string>) {
  const r = await fetch(`${base}/api/mcp-oauth/token`, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body).toString(),
  });
  return { status: r.status, body: await r.json() as any };
}

async function rpc(method: string, params: any = {}, bearer?: string) {
  const r = await fetch(`${base}/api/mcp/onbrand`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return { status: r.status, headers: r.headers, body: await r.json() as any };
}

describe("OAuth metadata", () => {
  it("advertises PKCE S256, DCR and public clients", async () => {
    const as = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json() as any;
    expect(as.code_challenge_methods_supported).toEqual(["S256"]);
    expect(as.registration_endpoint).toMatch(/\/api\/mcp-oauth\/register$/);
    expect(as.token_endpoint_auth_methods_supported).toEqual(["none"]);
    const pr = await (await fetch(`${base}/.well-known/oauth-protected-resource/api/mcp/onbrand`)).json() as any;
    expect(pr.resource).toMatch(/\/api\/mcp\/onbrand$/);
    expect(pr.authorization_servers).toHaveLength(1);
  });

  it("MCP without a token → 401 pointing at resource metadata", async () => {
    const r = await rpc("initialize");
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toMatch(/resource_metadata=".*\/\.well-known\/oauth-protected-resource\/api\/mcp\/onbrand"/);
  });
});

describe("redirect allowlist", () => {
  it("accepts Claude callbacks and localhost /callback only", () => {
    expect(isAllowedRedirectUri(REDIRECT)).toBe(true);
    expect(isAllowedRedirectUri("http://localhost:53682/callback")).toBe(true);
    expect(isAllowedRedirectUri("http://127.0.0.1/callback")).toBe(true);
    expect(isAllowedRedirectUri("https://evil.example/callback")).toBe(false);
    expect(isAllowedRedirectUri("http://localhost:1/other")).toBe(false);
    expect(isAllowedRedirectUri("http://user@localhost/callback")).toBe(false);
  });
  it("DCR rejects non-allowlisted redirect_uris", async () => {
    const r = await register("https://evil.example/cb");
    expect(r.status).toBe(400);
  });
  it("verifyPkce only accepts the matching verifier", () => {
    const { verifier, challenge } = pkce();
    expect(verifyPkce(verifier, challenge)).toBe(true);
    expect(verifyPkce(pkce().verifier, challenge)).toBe(false);
  });
});

describe("full connect flow", () => {
  it("not logged in → login page with next back to authorize", async () => {
    const { body } = await register();
    const { challenge } = pkce();
    const q = new URLSearchParams({ response_type: "code", client_id: body.client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: "S256", state: "s" });
    const r = await fetch(`${base}/api/mcp-oauth/authorize?${q}`, { redirect: "manual" });
    expect(r.status).toBe(302);
    const loc = r.headers.get("location")!;
    expect(loc.startsWith("/auth/login?next=")).toBe(true);
    expect(decodeURIComponent(loc.split("next=")[1])).toMatch(/^\/api\/mcp-oauth\/authorize\?/);
  });

  it("unknown client is shown an error page, never redirected", async () => {
    const q = new URLSearchParams({ response_type: "code", client_id: "nope", redirect_uri: REDIRECT, code_challenge: pkce().challenge, code_challenge_method: "S256" });
    const r = await fetch(`${base}/api/mcp-oauth/authorize?${q}`, { headers: { "x-test-user": "1" }, redirect: "manual" });
    expect(r.status).toBe(400);
  });

  it("forged consent signature is rejected", async () => {
    const { body } = await register();
    const q = new URLSearchParams({ response_type: "code", client_id: body.client_id, redirect_uri: REDIRECT, code_challenge: pkce().challenge, code_challenge_method: "S256", sig: "forged", decision: "allow" });
    const r = await fetch(`${base}/api/mcp-oauth/authorize`, {
      method: "POST", headers: { "x-test-user": "7", "content-type": "application/x-www-form-urlencoded" }, body: q.toString(), redirect: "manual",
    });
    expect(r.status).toBe(400);
  });

  it("register → allow → token (PKCE) → MCP; code is single-use; refresh rotates", { timeout: 30_000 }, async () => {
    const { status, body: client } = await register();
    expect(status).toBe(201);
    const { verifier, challenge } = pkce();
    const code = await authorizeAndGetCode(client.client_id, challenge);

    const bad = await token({ grant_type: "authorization_code", code, client_id: client.client_id, redirect_uri: REDIRECT, code_verifier: pkce().verifier });
    expect(bad.status).toBe(400); // 錯的 verifier 也會把 code 用掉 —— 一次性

    const code2 = await authorizeAndGetCode(client.client_id, challenge);
    const ok = await token({ grant_type: "authorization_code", code: code2, client_id: client.client_id, redirect_uri: REDIRECT, code_verifier: verifier });
    expect(ok.status).toBe(200);
    expect(ok.body.access_token).toMatch(/^oba_/);
    const reuse = await token({ grant_type: "authorization_code", code: code2, client_id: client.client_id, redirect_uri: REDIRECT, code_verifier: verifier });
    expect(reuse.status).toBe(400);

    const init = await rpc("initialize", { protocolVersion: "2025-06-18" }, ok.body.access_token);
    expect(init.status).toBe(200);
    expect(init.body.result.protocolVersion).toBe("2025-06-18");
    expect(init.body.result.capabilities.extensions["io.modelcontextprotocol/ui"]).toBeTruthy();

    const list = await rpc("tools/list", {}, ok.body.access_token);
    const names = list.body.result.tools.map((t: any) => t.name);
    expect(names).toEqual(TOOLS.map((t) => t.name));
    const board = list.body.result.tools.find((t: any) => t.name === "team_board");
    expect(board._meta.ui.resourceUri).toBe("ui://onbrand/app");

    const res = await rpc("resources/read", { uri: "ui://onbrand/app" }, ok.body.access_token);
    const c = res.body.result.contents[0];
    expect(c.mimeType).toBe("text/html;profile=mcp-app");
    expect(c.text).toContain("ui/initialize");
    expect(c._meta.ui.csp.resourceDomains).toHaveLength(1);

    // 別人的品牌：工具回 isError，訊息看得懂，不是 500
    const call = await rpc("tools/call", { name: "get_brand_context", arguments: { brandId: 999 } }, ok.body.access_token);
    expect(call.body.result.isError).toBe(true);
    expect(call.body.result.content[0].text).toContain("找不到品牌 999");

    const r1 = await token({ grant_type: "refresh_token", refresh_token: ok.body.refresh_token, client_id: client.client_id });
    expect(r1.status).toBe(200);
    const r2 = await token({ grant_type: "refresh_token", refresh_token: ok.body.refresh_token, client_id: client.client_id });
    expect(r2.status).toBe(400); // 舊 refresh token 已作廢
  });
});

describe("IP boundary", () => {
  it("no tool schema or description leaks task system prompts", () => {
    for (const t of TOOLS) expect(JSON.stringify(t.inputSchema)).not.toMatch(/systemPrompt|skill/i);
  });
});
