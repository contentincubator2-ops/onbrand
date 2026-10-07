import { createZernioClient, type ZernioClient, type ZernioAccount } from "../zernio";
import { listAllConnected, markDisconnected, type Queryable } from "./connectionStore";
import type { logError } from "../../../routers/opsRouter";

const profileOf = (account: ZernioAccount) => typeof account.profileId === "string" ? account.profileId : account.profileId?._id;
const localPlatform = (platform: string) => platform === "twitter" ? "x" : platform;

export async function tickZernioReconcile(deps: {
  pool?: Queryable; client?: Pick<ZernioClient, "listAllAccounts">; log?: typeof logError;
} = {}): Promise<{ scanned: number; orphans: number; staleLocal: number; crossBrand: number }> {
  const result = { scanned: 0, orphans: 0, staleLocal: 0, crossBrand: 0 };
  if (!deps.client && !process.env.ZERNIO_API_KEY) return result;
  const pool = deps.pool ?? (await import("../../../../localDb")).default;
  const client = deps.client ?? createZernioClient({ apiKey: process.env.ZERNIO_API_KEY! });
  const log = deps.log ?? (await import("../../../routers/opsRouter")).logError;
  // Finish the entire remote snapshot before making any local changes.
  const [remote, local] = await Promise.all([client.listAllAccounts(), listAllConnected(pool, "zernio")]);
  const [tenants]: [Array<{ brandId: number; tenantId: string }>, unknown] = await pool.execute(
    "SELECT brandId, tenantId FROM brand_publish_tenants WHERE provider = ?", ["zernio"]);
  const profileByBrand = new Map(tenants.map(t => [t.brandId, t.tenantId]));
  const matches = (account: ZernioAccount, connection: typeof local[number]) =>
    account._id === connection.accountId && localPlatform(account.platform) === connection.platform
    && profileOf(account) === profileByBrand.get(connection.brandId) && profileOf(account) !== undefined;
  result.scanned = remote.length;
  for (const account of remote) {
    if (!local.some(connection => matches(account, connection))) {
      result.orphans++;
      await log({ source: "zernio.reconcile", level: "warn", message: "孤兒帳號，正在計費",
        meta: { accountId: account._id, profileId: profileOf(account), platform: account.platform } });
    }
  }
  for (const connection of local) {
    if (!remote.some(account => matches(account, connection))) {
      await markDisconnected(pool, connection.brandId, "zernio", connection.platform);
      result.staleLocal++;
      await log({ source: "zernio.reconcile", level: "warn", message: "本地連線已失效，已標記 disconnected",
        meta: { brandId: connection.brandId, platform: connection.platform, accountId: connection.accountId } });
    }
  }
  // Match either platform user id or username, scoped to the platform. Merge
  // overlapping groups so an identity present on three profiles warns once.
  const groups: Array<{ keys: Set<string>; accounts: ZernioAccount[] }> = [];
  for (const account of remote) {
    const keys = [account.platformUserId ? `${account.platform}:id:${account.platformUserId}` : null,
      account.username ? `${account.platform}:username:${account.username}` : null].filter((key): key is string => key !== null);
    if (!keys.length || !profileOf(account)) continue;
    const group = { keys: new Set(keys), accounts: [account] };
    for (let i = groups.length - 1; i >= 0; i--) {
      const existing = groups[i]!;
      if ([...group.keys].some(key => existing.keys.has(key))) {
        existing.keys.forEach(key => group.keys.add(key));
        group.accounts.push(...existing.accounts);
        groups.splice(i, 1);
      }
    }
    groups.push(group);
  }
  for (const group of groups) {
    const profiles = [...new Set(group.accounts.map(profileOf))];
    if (profiles.length < 2) continue;
    result.crossBrand++;
    await log({ source: "zernio.reconcile", level: "warn", message: "同帳號跨品牌，計費兩次",
      meta: { platform: group.accounts[0]!.platform, profileIds: profiles, accountIds: group.accounts.map(a => a._id) } });
  }
  return result;
}
