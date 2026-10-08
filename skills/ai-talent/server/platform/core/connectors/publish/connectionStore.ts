/** Structurally identical to publishGate's Queryable, without a platform → content dependency. */
export interface Queryable {
  execute: (sql: string, params?: any) => Promise<any>;
}
export type PublishAccount = {
  accountId: string;
  accountLabel?: string | null;
  accountUsername?: string | null;
  meta?: Record<string, unknown> | null;
};
export type PublishConnection = PublishAccount & {
  id: number; brandId: number; provider: string; platform: string;
  status: "connected" | "disconnected";
  connectedAt: Date | string | null;
  disconnectedAt: Date | string | null;
};
export async function getTenant(pool: Queryable, brandId: number, provider: string): Promise<string | null> {
  const [rows] = await pool.execute(
    "SELECT tenantId FROM brand_publish_tenants WHERE brandId = ? AND provider = ? LIMIT 1", [brandId, provider]);
  return rows[0]?.tenantId ?? null;
}
export async function upsertTenant(pool: Queryable, brandId: number, provider: string, tenantId: string): Promise<void> {
  await pool.execute(`INSERT INTO brand_publish_tenants (brandId, provider, tenantId) VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE tenantId = VALUES(tenantId)`, [brandId, provider, tenantId]);
}
const CONNECTION_COLUMNS = `id, brandId, provider, platform, accountId, accountLabel,
  accountUsername, status, connectedAt, disconnectedAt, meta`;
export async function getConnection(pool: Queryable, brandId: number, provider: string, platform: string): Promise<PublishConnection | null> {
  const [rows] = await pool.execute(`SELECT ${CONNECTION_COLUMNS} FROM brand_publish_connections
    WHERE brandId = ? AND provider = ? AND platform = ? AND status = 'connected' LIMIT 1`,
  [brandId, provider, platform]);
  return rows[0] ?? null;
}
export async function setConnection(pool: Queryable, brandId: number, provider: string, platform: string,
  account: PublishAccount): Promise<void> {
  // MySQL evaluates assignments left-to-right: compare the OLD account/status first.
  await pool.execute(`INSERT INTO brand_publish_connections
    (brandId, provider, platform, accountId, accountLabel, accountUsername, status, connectedAt, meta)
    VALUES (?, ?, ?, ?, ?, ?, 'connected', NOW(3), ?)
    ON DUPLICATE KEY UPDATE
    connectedAt = IF(accountId <> VALUES(accountId) OR status = 'disconnected', NOW(3), connectedAt),
    accountId = VALUES(accountId), accountLabel = VALUES(accountLabel), accountUsername = VALUES(accountUsername),
    status = 'connected', disconnectedAt = NULL, meta = VALUES(meta)`,
  [brandId, provider, platform, account.accountId, account.accountLabel ?? null, account.accountUsername ?? null,
    account.meta == null ? null : JSON.stringify(account.meta)]);
}
export async function markDisconnected(pool: Queryable, brandId: number, provider: string, platform: string): Promise<void> {
  await pool.execute(`UPDATE brand_publish_connections SET status = 'disconnected', disconnectedAt = NOW(3)
    WHERE brandId = ? AND provider = ? AND platform = ? AND status = 'connected'`, [brandId, provider, platform]);
}
export async function listConnectedByBrand(pool: Queryable, brandId: number, provider: string): Promise<PublishConnection[]> {
  const [rows] = await pool.execute(`SELECT ${CONNECTION_COLUMNS} FROM brand_publish_connections
    WHERE brandId = ? AND provider = ? AND status = 'connected'`, [brandId, provider]);
  return rows;
}
export async function listAllConnected(pool: Queryable, provider: string): Promise<PublishConnection[]> {
  const [rows] = await pool.execute(`SELECT ${CONNECTION_COLUMNS} FROM brand_publish_connections
    WHERE provider = ? AND status = 'connected'`, [provider]);
  return rows;
}
