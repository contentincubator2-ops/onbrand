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
export async function listConnections(pool: Queryable, brandId: number, provider: string, platform: string,
  status: "connected" | "disconnected" = "connected"): Promise<PublishConnection[]> {
  const [rows] = await pool.execute(`SELECT id, brandId, provider, platform, accountId, accountLabel,
    accountUsername, status, connectedAt, disconnectedAt, meta FROM brand_publish_connections
    WHERE brandId = ? AND provider = ? AND platform = ? AND status = ? ORDER BY connectedAt DESC, id DESC`,
  [brandId, provider, platform, status]);
  return rows;
}
export async function upsertConnections(pool: Queryable, brandId: number, provider: string, platform: string,
  accounts: PublishAccount[]): Promise<void> {
  const ids = accounts.map(a => a.accountId);
  await pool.execute(`UPDATE brand_publish_connections SET status = 'disconnected', disconnectedAt = NOW(3)
    WHERE brandId = ? AND provider = ? AND platform = ? AND status = 'connected'${ids.length ? ` AND accountId NOT IN (${ids.map(() => "?").join(", ")})` : ""}`,
  [brandId, provider, platform, ...ids]);
  for (const a of accounts) {
    // Preserve first connection time during polling; stamp again only on reconnection.
    await pool.execute(`INSERT INTO brand_publish_connections
      (brandId, provider, platform, accountId, accountLabel, accountUsername, status, connectedAt, meta)
      VALUES (?, ?, ?, ?, ?, ?, 'connected', NOW(3), ?)
      ON DUPLICATE KEY UPDATE accountLabel = VALUES(accountLabel), accountUsername = VALUES(accountUsername),
      connectedAt = IF(status = 'disconnected' OR connectedAt IS NULL, NOW(3), connectedAt),
      status = 'connected', disconnectedAt = NULL, meta = VALUES(meta)`,
    [brandId, provider, platform, a.accountId, a.accountLabel ?? null, a.accountUsername ?? null,
      a.meta == null ? null : JSON.stringify(a.meta)]);
  }
}
export async function markDisconnected(pool: Queryable, brandId: number, provider: string, platform: string, accountId: string): Promise<void> {
  await pool.execute(`UPDATE brand_publish_connections SET status = 'disconnected', disconnectedAt = NOW(3)
    WHERE brandId = ? AND provider = ? AND platform = ? AND accountId = ?`, [brandId, provider, platform, accountId]);
}
