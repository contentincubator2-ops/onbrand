/**
 * oauthStore — OnBrand 連接器（遠端 MCP）的 OAuth 2.1 授權伺服器資料層。
 *
 * 2026-09-28（CJ「onbrand 的功能變成 claude 外掛服務，賣給其他人」）：客戶在 Claude 裡
 * 加「OnBrand」連接器 → 跳到 OnBrand 登入並按「允許」→ Claude 拿到只給 MCP 用的 token。
 *
 * ── 為什麼不直接發 session JWT ─────────────────────────────────────────
 * session JWT 也能打 /trpc（createContext 先讀 Bearer），發給 Claude 等於把整個帳號交出去，
 * 而且 authRouter 的撤銷清單只在記憶體。這裡的 token 是不透明亂數、只存 SHA-256、
 * 只有 /api/mcp/onbrand 認得，可以逐一撤銷。
 *
 * ── 為什麼 redirect_uri 有白名單 ──────────────────────────────────────
 * 動態註冊（DCR）誰都能打。沒有白名單的話，任何人都能註冊一個 client，把 OnBrand 的
 * 「允許」頁包成釣魚連結，code 被送到他自己的網址。白名單只收 Claude 的固定回呼網址；
 * 要接別的 MCP 客戶端時加在 MCP_OAUTH_EXTRA_REDIRECTS（逗號分隔）。
 */
import { createHash, randomBytes } from "crypto";
import localPool from "../../localDb";

export const MCP_OAUTH_CLIENTS_DDL = `
  CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
    clientId      VARCHAR(64)  NOT NULL PRIMARY KEY,
    clientName    VARCHAR(200) NULL,
    redirectUris  TEXT         NOT NULL,
    createdAt     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export const MCP_OAUTH_CODES_DDL = `
  CREATE TABLE IF NOT EXISTS mcp_oauth_codes (
    codeHash       CHAR(64)     NOT NULL PRIMARY KEY,
    clientId       VARCHAR(64)  NOT NULL,
    userId         INT          NOT NULL,
    redirectUri    VARCHAR(500) NOT NULL,
    codeChallenge  VARCHAR(128) NOT NULL,
    resource       VARCHAR(300) NULL,
    expiresAt      DATETIME(3)  NOT NULL,
    usedAt         DATETIME(3)  NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export const MCP_OAUTH_TOKENS_DDL = `
  CREATE TABLE IF NOT EXISTS mcp_oauth_tokens (
    tokenHash   CHAR(64)     NOT NULL PRIMARY KEY,
    kind        VARCHAR(8)   NOT NULL,
    clientId    VARCHAR(64)  NOT NULL,
    userId      INT          NOT NULL,
    resource    VARCHAR(300) NULL,
    expiresAt   DATETIME(3)  NOT NULL,
    revokedAt   DATETIME(3)  NULL,
    createdAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_mcp_tokens_user (userId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export const ACCESS_TOKEN_TTL_S = 60 * 60;            // 1 小時
export const REFRESH_TOKEN_TTL_S = 30 * 24 * 60 * 60;  // 30 天，每次換發都輪替
const CODE_TTL_S = 5 * 60;

const CLAUDE_REDIRECTS = [
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback",
];

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function newSecret(prefix: string): string {
  return prefix + randomBytes(32).toString("base64url");
}

/** Claude 的固定回呼網址；Claude Code 走 localhost（port 不固定，只比 host 與路徑）。 */
export function isAllowedRedirectUri(uri: string): boolean {
  const extra = (process.env.MCP_OAUTH_EXTRA_REDIRECTS ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (CLAUDE_REDIRECTS.includes(uri) || extra.includes(uri)) return true;
  let u: URL;
  try { u = new URL(uri); } catch { return false; }
  return u.protocol === "http:"
    && (u.hostname === "localhost" || u.hostname === "127.0.0.1")
    && u.pathname === "/callback"
    && !u.username && !u.password;
}

/** PKCE S256：BASE64URL(SHA256(verifier)) === challenge。只收 S256，不收 plain。 */
export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  return computed === challenge;
}

export async function registerClient(args: { clientName: string | null; redirectUris: string[] }) {
  const clientId = "obc_" + randomBytes(16).toString("hex");
  await localPool.execute(
    `INSERT INTO mcp_oauth_clients (clientId, clientName, redirectUris) VALUES (?, ?, ?)`,
    [clientId, args.clientName?.slice(0, 200) ?? null, JSON.stringify(args.redirectUris)],
  );
  return clientId;
}

export async function getClient(clientId: string): Promise<{ clientId: string; clientName: string | null; redirectUris: string[] } | null> {
  const [rows]: any = await localPool.execute(
    `SELECT clientId, clientName, redirectUris FROM mcp_oauth_clients WHERE clientId = ? LIMIT 1`,
    [clientId],
  );
  const r = rows?.[0];
  if (!r) return null;
  let uris: string[] = [];
  try { uris = JSON.parse(r.redirectUris); } catch { /* 壞資料＝沒有可用的回呼 */ }
  return { clientId: r.clientId, clientName: r.clientName, redirectUris: Array.isArray(uris) ? uris : [] };
}

export async function issueCode(args: {
  clientId: string; userId: number; redirectUri: string; codeChallenge: string; resource: string | null;
}): Promise<string> {
  const code = newSecret("obk_");
  await localPool.execute(
    `INSERT INTO mcp_oauth_codes (codeHash, clientId, userId, redirectUri, codeChallenge, resource, expiresAt)
     VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(3), INTERVAL ? SECOND))`,
    [sha256(code), args.clientId, args.userId, args.redirectUri, args.codeChallenge, args.resource, CODE_TTL_S],
  );
  return code;
}

/** 一次性：兌換時就標記 usedAt，用 affectedRows 防止同一個 code 被並發兌換兩次。 */
export async function consumeCode(code: string) {
  const hash = sha256(code);
  const [upd]: any = await localPool.execute(
    `UPDATE mcp_oauth_codes SET usedAt = NOW(3) WHERE codeHash = ? AND usedAt IS NULL AND expiresAt > NOW(3)`,
    [hash],
  );
  if (!upd?.affectedRows) return null;
  const [rows]: any = await localPool.execute(
    `SELECT clientId, userId, redirectUri, codeChallenge, resource FROM mcp_oauth_codes WHERE codeHash = ? LIMIT 1`,
    [hash],
  );
  return rows?.[0] ?? null;
}

export async function issueTokenPair(args: { clientId: string; userId: number; resource: string | null }) {
  const access = newSecret("oba_");
  const refresh = newSecret("obr_");
  await localPool.execute(
    `INSERT INTO mcp_oauth_tokens (tokenHash, kind, clientId, userId, resource, expiresAt) VALUES
       (?, 'access',  ?, ?, ?, DATE_ADD(NOW(3), INTERVAL ? SECOND)),
       (?, 'refresh', ?, ?, ?, DATE_ADD(NOW(3), INTERVAL ? SECOND))`,
    [
      sha256(access), args.clientId, args.userId, args.resource, ACCESS_TOKEN_TTL_S,
      sha256(refresh), args.clientId, args.userId, args.resource, REFRESH_TOKEN_TTL_S,
    ],
  );
  return { access_token: access, refresh_token: refresh, token_type: "Bearer", expires_in: ACCESS_TOKEN_TTL_S };
}

/** refresh token 輪替：舊的立刻作廢（同樣靠 affectedRows 擋並發重放）。 */
export async function rotateRefreshToken(refreshToken: string, clientId: string) {
  const hash = sha256(refreshToken);
  const [rows]: any = await localPool.execute(
    `SELECT userId, resource FROM mcp_oauth_tokens
      WHERE tokenHash = ? AND kind = 'refresh' AND clientId = ? AND revokedAt IS NULL AND expiresAt > NOW(3) LIMIT 1`,
    [hash, clientId],
  );
  const r = rows?.[0];
  if (!r) return null;
  const [upd]: any = await localPool.execute(
    `UPDATE mcp_oauth_tokens SET revokedAt = NOW(3) WHERE tokenHash = ? AND revokedAt IS NULL`,
    [hash],
  );
  if (!upd?.affectedRows) return null;
  return issueTokenPair({ clientId, userId: Number(r.userId), resource: r.resource });
}

export async function userIdForAccessToken(token: string): Promise<number | null> {
  if (!token.startsWith("oba_")) return null;
  const [rows]: any = await localPool.execute(
    `SELECT userId FROM mcp_oauth_tokens
      WHERE tokenHash = ? AND kind = 'access' AND revokedAt IS NULL AND expiresAt > NOW(3) LIMIT 1`,
    [sha256(token)],
  );
  return rows?.[0] ? Number(rows[0].userId) : null;
}
