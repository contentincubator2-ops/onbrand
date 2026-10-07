import { ZernioApiError, type ZernioAccount, type ZernioClient } from "../zernio";
import { getTenant, upsertTenant, listConnections, upsertConnections, markDisconnected, type Queryable } from "./connectionStore";
import { PublishUserError, type PublishProviderAdapter } from "./publishAdapter";
import { assertZernioMediaPlan, buildZernioPostPayload, readZernioPublishResult, toZernioPlatform } from "./zernioPublish";

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
      async function createAndStoreProfile() {
        const name = Array.from(`onBrand Studio #${input.brandId} ${await brandNameOf(input.brandId)}`.trim()).slice(0, 80).join("");
        const profileId = (await client.createProfile({ name, idempotencyKey: `onbrand-brand-${input.brandId}` }))._id;
        await upsertTenant(pool, input.brandId, "zernio", profileId);
        return profileId;
      }
      if (!tenantId) tenantId = await createAndStoreProfile();
      const connect = (profileId: string) => client.getConnectUrl({ platform: platform.remote, profileId, redirectUrl: input.redirectUrl });
      try {
        return { url: (await connect(tenantId)).authUrl };
      } catch (e) {
        if (!(e instanceof ZernioApiError) || e.status !== 404) throw e;
        // The profile may have been deleted in Zernio. Recreate and retry once.
        const replacementId = await createAndStoreProfile();
        return { url: (await connect(replacementId)).authUrl };
      }
    },
    async syncConnections(input) {
      const platform = requirePlatform(input.platform);
      const tenantId = await getTenant(pool, input.brandId, "zernio");
      if (!tenantId) return [];
      const accounts = await client.listAccounts({ profileId: tenantId, platform: platform.remote }).catch((e): ZernioAccount[] => {
        if (e instanceof ZernioApiError && e.status === 404) return [];
        throw e;
      });
      await upsertConnections(pool, input.brandId, "zernio", platform.local,
        accounts.filter(a => a.isActive !== false && a.platform === platform.remote).map(a => ({
          accountId: a._id, accountLabel: a.displayName ?? a.username ?? null,
          accountUsername: a.username, meta: { profileUrl: a.profileUrl ?? null },
        })));
      return accounts.length ? listConnections(pool, input.brandId, "zernio", platform.local) : [];
    },
    async disconnect(input) {
      const platform = requirePlatform(input.platform);
      // A team-level credential may only delete an account bound to this brand/platform.
      const accounts = await listConnections(pool, input.brandId, "zernio", platform.local);
      if (!accounts.some(a => a.accountId === input.accountId)) throw new PublishUserError("此品牌尚未連接此帳號。");
      await client.deleteAccount(input.accountId);
      await markDisconnected(pool, input.brandId, "zernio", platform.local, input.accountId);
    },
    async publish(input) {
      const platform = requirePlatform(input.platform);
      assertZernioMediaPlan(platform.remote, input.caption, input.imageUrls.length, input.videoUrl ? 1 : 0);
      const accounts = await listConnections(pool, input.brandId, "zernio", platform.local);
      if (!accounts.length) throw new PublishUserError("此品牌尚未連接此平台，請先到品牌設定完成連接。");
      if (accounts.length > 1) console.warn(`[zernio.publish] brand ${input.brandId}: multiple ${platform.local} accounts; using latest connection`);
      const account = [...accounts].sort((a, b) =>
        new Date(b.connectedAt ?? 0).getTime() - new Date(a.connectedAt ?? 0).getTime() || b.id - a.id)[0]!;
      const result = await client.createPost(buildZernioPostPayload({ ...input, accountId: account.accountId }),
        { idempotencyKey: `onbrand-sp-${input.scheduledPostId}-a${input.attempt ?? 0}` });
      return readZernioPublishResult({ ...result, platform: platform.remote });
    },
  };
}
