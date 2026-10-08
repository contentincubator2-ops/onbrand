import { ZernioApiError, type ZernioAccount, type ZernioClient } from "../zernio";
import { getTenant, upsertTenant, getConnection, setConnection, listConnectedByBrand, markDisconnected, type Queryable } from "./connectionStore";
import { PublishUserError, type PublishProviderAdapter } from "./publishAdapter";
import { assertZernioMediaPlan, buildZernioPostPayload, readZernioPublishResult, toZernioPlatform } from "./zernioPublish";

const inFlightProfiles = new Map<number, Promise<string>>();

export function createZernioAdapter({ client, pool, brandNameOf }: {
  client: ZernioClient; pool: Queryable; brandNameOf: (brandId: number) => Promise<string>;
}): PublishProviderAdapter {
  function requirePlatform(value: string) {
    const platform = toZernioPlatform(value);
    if (!platform) throw new PublishUserError(`${value} 尚未支援透過 Zernio 發布。`);
    return { remote: platform, local: platform === "twitter" ? "x" : platform };
  }
  return {
    provider: "zernio",
    async getConnectUrl(input) {
      const platform = requirePlatform(input.platform);
      let tenantId = await getTenant(pool, input.brandId, "zernio");
      function createAndStoreProfile(): Promise<string> {
        const existing = inFlightProfiles.get(input.brandId);
        if (existing) return existing;
        const pending = (async () => {
          const name = Array.from(`onBrand Studio #${input.brandId} ${await brandNameOf(input.brandId)}`.trim()).slice(0, 80).join("");
          const profileId = (await client.createProfile({ name, idempotencyKey: `onbrand-brand-${input.brandId}` }))._id;
          await upsertTenant(pool, input.brandId, "zernio", profileId);
          return profileId;
        })().finally(() => { inFlightProfiles.delete(input.brandId); });
        inFlightProfiles.set(input.brandId, pending);
        return pending;
      }
      if (!tenantId) tenantId = await createAndStoreProfile();
      const current = input.mode === "reconnect" ? await getConnection(pool, input.brandId, "zernio", platform.local) : null;
      const connect = (profileId: string) => client.getConnectUrl({ platform: platform.remote, profileId,
        redirectUrl: input.redirectUrl, ...(current ? { reconnectAccountId: current.accountId } : {}) });
      try {
        return { url: (await connect(tenantId)).authUrl };
      } catch (e) {
        if (!(e instanceof ZernioApiError) || e.status !== 404) throw e;
        // The profile may have been deleted in Zernio. Recreate and retry once.
        const replacementId = await createAndStoreProfile();
        return { url: (await connect(replacementId)).authUrl };
      }
    },
    async syncConnection(input) {
      const platform = requirePlatform(input.platform);
      const tenantId = await getTenant(pool, input.brandId, "zernio");
      const accounts = tenantId ? await client.listAccounts({ profileId: tenantId, platform: platform.remote,
        status: "connected", sort: "connected", order: "desc" }).catch((e): ZernioAccount[] => {
        if (e instanceof ZernioApiError && e.status === 404) return [];
        throw e;
      }) : [];
      const [current, ...obsolete] = accounts.filter(a => a.isActive !== false && a.platform === platform.remote);
      if (!current) {
        await markDisconnected(pool, input.brandId, "zernio", platform.local);
        return null;
      }
      await setConnection(pool, input.brandId, "zernio", platform.local, {
        accountId: current._id, accountLabel: current.displayName ?? current.username ?? null,
        accountUsername: current.username, meta: { profileUrl: current.profileUrl ?? null },
      });
      for (const account of obsolete) {
        await client.deleteAccount(account._id);
        console.warn(`[zernio.sync] brand ${input.brandId}: removed obsolete ${platform.local} account ${account._id}`);
      }
      return getConnection(pool, input.brandId, "zernio", platform.local);
    },
    async disconnect(input) {
      const platform = requirePlatform(input.platform);
      const account = await getConnection(pool, input.brandId, "zernio", platform.local);
      if (!account) throw new PublishUserError("此品牌尚未連接此平台。");
      await client.deleteAccount(account.accountId);
      await markDisconnected(pool, input.brandId, "zernio", platform.local);
    },
    async disconnectAll({ brandId }) {
      const accounts = await listConnectedByBrand(pool, brandId, "zernio");
      let disconnected = 0, failed = 0;
      for (const account of accounts) {
        try {
          await client.deleteAccount(account.accountId);
          await markDisconnected(pool, brandId, "zernio", account.platform);
          disconnected++;
        } catch {
          failed++;
          console.warn(`[zernio.lifecycle] brand ${brandId}: failed to disconnect ${account.platform} account ${account.accountId}`);
        }
      }
      return { disconnected, failed };
    },
    async publish(input) {
      const platform = requirePlatform(input.platform);
      assertZernioMediaPlan(platform.remote, input.caption, input.imageUrls.length, input.videoUrl ? 1 : 0);
      const account = await getConnection(pool, input.brandId, "zernio", platform.local);
      if (!account) throw new PublishUserError("此品牌尚未連接此平台，請先到品牌設定完成連接。");
      const result = await client.createPost(buildZernioPostPayload({ ...input, accountId: account.accountId }),
        { idempotencyKey: `onbrand-sp-${input.scheduledPostId}-a${input.attempt ?? 0}` });
      return readZernioPublishResult({ ...result, platform: platform.remote });
    },
  };
}
