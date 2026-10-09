/**
 * cloudTokens.ts — per-brand OAuth token storage/refresh for cloud-file
 * connections (Google Drive, OneDrive), backing the persona-agent "帳號
 * 連接" training-source flow.
 *
 * 2026-08-21 (CJ「怎麼覺得還是不踏實，因為很多人，影音就是放在google drive,
 * one drive or youtube上面」→ 選了「帳號連接型（大工程量，最踏實）」):
 * native OAuth (not Pipedream — that scaffolding exists in
 * projectSyncRouter.ts but depends on Pipedream-side workflows we can't see
 * or verify from this repo).
 *
 * Storage: `brand_integrations` (drizzle/schema.ts) — declared in schema but
 * had zero readers/writers anywhere before this. One row per
 * (userId, brandId, integrationType). No unique index exists on that
 * triple, so every write here does a fresh SELECT then INSERT-or-UPDATE
 * rather than relying on ON DUPLICATE KEY.
 *
 * The table has no separate refresh-token/expiry columns, so the full
 * {access, refresh, expiresAt, accountEmail} payload is JSON-serialized,
 * then AES-256-GCM encrypted as a single blob into the existing
 * `accessToken` text column via tokenEncryption.ts's serialize helpers —
 * avoids a migration entirely.
 */
import localPool from "../../../localDb";
import { ENV } from "../env";
import {
  encryptAccessToken, decryptAccessToken,
  serializeEncryptedToken, deserializeEncryptedToken,
} from "../tokenEncryption";

export type CloudProvider = "google_drive" | "onedrive";
/**
 * 2026-10-09：Canva 也存在同一張表、同一種加密 blob，但它不是「雲端檔案」——
 * cloudDriveClient 的列檔／下載只認 CloudProvider，所以另外開一個較寬的型別給儲存層用。
 * Canva 的連接跟著「人」不跟著品牌（同一個人的設計不分品牌），brandId 一律存
 * CANVA_ACCOUNT_SCOPE。
 */
export type IntegrationProvider = CloudProvider | "canva";
export const CANVA_ACCOUNT_SCOPE = 0;

interface TokenPayload {
  access: string;
  refresh: string | null;
  expiresAt: number; // epoch ms
  accountEmail: string | null;
}

interface IntegrationRow {
  id: number;
  status: "connected" | "disconnected" | "error";
  accessToken: string | null;
  authorizedResources: any;
}

async function loadRow(userId: number, brandId: number, provider: IntegrationProvider): Promise<IntegrationRow | null> {
  const [rows]: any = await localPool.execute(
    `SELECT id, status, accessToken, authorizedResources
       FROM brand_integrations
      WHERE userId = ? AND brandId = ? AND integrationType = ?
      LIMIT 1`,
    [userId, brandId, provider],
  );
  return (rows as IntegrationRow[])[0] ?? null;
}

function encodePayload(payload: TokenPayload): string {
  return serializeEncryptedToken(encryptAccessToken(JSON.stringify(payload)));
}

function decodePayload(serialized: string): TokenPayload {
  const { encrypted, iv, authTag } = deserializeEncryptedToken(serialized);
  return JSON.parse(decryptAccessToken(encrypted, iv, authTag));
}

/** Called from the OAuth callback once tokens are exchanged. */
export async function saveConnection(
  userId: number, brandId: number, provider: IntegrationProvider, payload: TokenPayload,
): Promise<void> {
  const existing = await loadRow(userId, brandId, provider);
  const encoded = encodePayload(payload);
  const authorizedResources = JSON.stringify({ accountEmail: payload.accountEmail });
  if (existing) {
    await localPool.execute(
      `UPDATE brand_integrations
          SET status = 'connected', accessToken = ?, authorizedResources = ?, connectedAt = NOW()
        WHERE id = ?`,
      [encoded, authorizedResources, existing.id],
    );
  } else {
    await localPool.execute(
      `INSERT INTO brand_integrations
         (userId, brandId, integrationType, status, accessToken, authorizedResources, connectedAt)
       VALUES (?, ?, ?, 'connected', ?, ?, NOW())`,
      [userId, brandId, provider, encoded, authorizedResources],
    );
  }
}

export async function disconnectCloud(userId: number, brandId: number, provider: IntegrationProvider): Promise<void> {
  await localPool.execute(
    `UPDATE brand_integrations SET status = 'disconnected', accessToken = NULL
      WHERE userId = ? AND brandId = ? AND integrationType = ?`,
    [userId, brandId, provider],
  );
}

export async function getConnectionStatus(
  userId: number, brandId: number, provider: IntegrationProvider,
): Promise<{ connected: boolean; accountEmail: string | null }> {
  const row = await loadRow(userId, brandId, provider);
  if (!row || row.status !== "connected" || !row.accessToken) return { connected: false, accountEmail: null };
  let accountEmail: string | null = null;
  try {
    const res = typeof row.authorizedResources === "string" ? JSON.parse(row.authorizedResources) : row.authorizedResources;
    accountEmail = res?.accountEmail ?? null;
  } catch { /* ignore */ }
  return { connected: true, accountEmail };
}

async function refreshGoogleToken(refreshToken: string): Promise<{ access: string; expiresAt: number }> {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: ENV.GOOGLE_CLIENT_ID ?? "",
      client_secret: ENV.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!resp.ok) throw new Error(`Google token refresh failed: HTTP ${resp.status}`);
  const data = await resp.json() as { access_token: string; expires_in: number };
  return { access: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
}

async function refreshMicrosoftToken(refreshToken: string): Promise<{ access: string; refresh: string; expiresAt: number }> {
  const resp = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: ENV.MICROSOFT_CLIENT_ID ?? "",
      client_secret: ENV.MICROSOFT_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: "offline_access Files.Read User.Read",
    }),
  });
  if (!resp.ok) throw new Error(`Microsoft token refresh failed: HTTP ${resp.status}`);
  const data = await resp.json() as { access_token: string; refresh_token: string; expires_in: number };
  return { access: data.access_token, refresh: data.refresh_token, expiresAt: Date.now() + data.expires_in * 1000 };
}

export class CloudNotConnectedError extends Error {
  constructor(provider: IntegrationProvider) { super(`${provider} not connected for this brand`); this.name = "CloudNotConnectedError"; }
}

/** Returns a valid (non-expired) access token, refreshing and persisting a
 *  new one first if the stored token is within 2 minutes of expiry. */
export async function getValidAccessToken(userId: number, brandId: number, provider: IntegrationProvider): Promise<string> {
  if (provider === "canva") return dedupeRefresh(`${userId}:${brandId}`, () => validAccessToken(userId, brandId, provider));
  return validAccessToken(userId, brandId, provider);
}

/**
 * Canva 的 refresh token 只能用一次。挑選視窗一打開會同時問「連接狀態」和「設計清單」，
 * 兩個請求各自去換就會有一個拿著已作廢的 refresh token——連接被標成 error，用戶得重新授權。
 * 同一個人同一時間只讓一個換 token 的動作在跑，其餘等它的結果。
 */
const refreshInFlight = new Map<string, Promise<string>>();
function dedupeRefresh(key: string, run: () => Promise<string>): Promise<string> {
  const running = refreshInFlight.get(key);
  if (running) return running;
  const p = run().finally(() => refreshInFlight.delete(key));
  refreshInFlight.set(key, p);
  return p;
}

async function validAccessToken(userId: number, brandId: number, provider: IntegrationProvider): Promise<string> {
  const row = await loadRow(userId, brandId, provider);
  if (!row || row.status !== "connected" || !row.accessToken) throw new CloudNotConnectedError(provider);
  const payload = decodePayload(row.accessToken);

  if (payload.expiresAt - Date.now() > 2 * 60_000) return payload.access;
  if (!payload.refresh) throw new CloudNotConnectedError(provider);

  try {
    if (provider === "canva") {
      const { refreshCanvaToken } = await import("./canvaClient");
      const fresh = await refreshCanvaToken(
        { clientId: ENV.CANVA_CLIENT_ID ?? "", clientSecret: ENV.CANVA_CLIENT_SECRET ?? "" }, payload.refresh,
      );
      await saveConnection(userId, brandId, provider, { ...payload, ...fresh });
      return fresh.access;
    } else if (provider === "google_drive") {
      const { access, expiresAt } = await refreshGoogleToken(payload.refresh);
      const next: TokenPayload = { ...payload, access, expiresAt };
      await saveConnection(userId, brandId, provider, next);
      return access;
    } else {
      const { access, refresh, expiresAt } = await refreshMicrosoftToken(payload.refresh);
      const next: TokenPayload = { ...payload, access, refresh, expiresAt };
      await saveConnection(userId, brandId, provider, next);
      return access;
    }
  } catch (e) {
    await localPool.execute(
      `UPDATE brand_integrations SET status = 'error' WHERE userId = ? AND brandId = ? AND integrationType = ?`,
      [userId, brandId, provider],
    ).catch(() => {});
    throw e;
  }
}

export type { TokenPayload };
