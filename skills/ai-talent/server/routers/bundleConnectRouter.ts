/**
 * bundleConnectRouter — connect social accounts through bundle.social.
 *
 * bundle.social hosts the whole OAuth + channel-picking UI, so the browser only
 * needs a portal URL. Each OnBrand brand maps to one bundle.social team, stored
 * in brands.bundleTeamId. The Pipedream connect flow in publishRouter /
 * platformConnectRouter is left untouched — which path a platform uses is
 * decided by PUBLISH_PROVIDER_<PLATFORM>.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { assertBrandAccess } from "../_core/brandAuth";
import { createBundleSocialClient } from "../_core/bundleSocial";
import { toBundlePlatform } from "../_core/bundlePublish";
import { getPublishProvider } from "../_core/publishProvider";

const PLATFORM_INPUT = z.enum(["facebook", "instagram", "linkedin"]);

/** Portal links are one-shot; 30 minutes covers a user who gets interrupted. */
const PORTAL_EXPIRY_MINUTES = 30;

function requireClient() {
  const apiKey = process.env.BUNDLE_SOCIAL_API_KEY;
  if (!apiKey) {
    console.error("[bundleConnect] missing env: BUNDLE_SOCIAL_API_KEY");
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "連接服務尚未啟用，請聯絡 sowork@sowork.ai。",
    });
  }
  return createBundleSocialClient({ apiKey });
}

function requirePlatform(platform: string) {
  const mapped = toBundlePlatform(platform);
  if (!mapped) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${platform} 尚未支援透過 bundle.social 連接`,
    });
  }
  return mapped;
}

export const bundleConnectRouter = router({
  /**
   * Tell the client which backend owns a platform so it can pick the right
   * connect flow without duplicating the env logic in the browser.
   */
  getProviders: protectedProcedure.query(async () => ({
    facebook:  getPublishProvider("facebook"),
    instagram: getPublishProvider("instagram"),
    linkedin:  getPublishProvider("linkedin"),
  })),

  /**
   * Create (once) the brand's bundle.social team, then mint a portal URL the
   * browser opens in a new tab.
   */
  getConnectUrl: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      platform: PLATFORM_INPUT,
      redirectUrl: z.string().url().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user.id, input.brandId);
      const client = requireClient();
      const platform = requirePlatform(input.platform);
      const { default: localPool } = await import("../localDb");

      const [rows]: any = await localPool.execute(
        `SELECT bundleTeamId, name FROM brands WHERE id = ? LIMIT 1`,
        [input.brandId],
      );
      const brand = (rows as any[])[0];
      if (!brand) throw new TRPCError({ code: "NOT_FOUND", message: "品牌不存在" });

      let teamId: string | null = brand.bundleTeamId ?? null;
      if (!teamId) {
        // bundle.social caps team names at 80 chars.
        const name = `OnBrand #${input.brandId} ${brand.name ?? ""}`.trim().slice(0, 80);
        try {
          const team = await client.createTeam(name);
          teamId = team.id;
        } catch (e: any) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `建立 bundle.social 工作區失敗：${String(e?.message ?? e).slice(0, 200)}`,
          });
        }
        await localPool.execute(
          `UPDATE brands SET bundleTeamId = ? WHERE id = ?`,
          [teamId, input.brandId],
        );
      }

      try {
        const link = await client.createPortalLink({
          teamId,
          socialAccountTypes: [platform],
          redirectUrl: input.redirectUrl,
          expiresIn: PORTAL_EXPIRY_MINUTES,
        });
        return { url: link.url, teamId };
      } catch (e: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `取得連接連結失敗：${String(e?.message ?? e).slice(0, 200)}`,
        });
      }
    }),

  /**
   * Poll after the user returns from the portal. Stamps bundleConnectedAt on
   * the first successful check so the UI can show when the link was made.
   */
  getConnectionStatus: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      platform: PLATFORM_INPUT,
    }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user.id, input.brandId);
      const client = requireClient();
      const platform = requirePlatform(input.platform);
      const { default: localPool } = await import("../localDb");

      const [rows]: any = await localPool.execute(
        `SELECT bundleTeamId FROM brands WHERE id = ? LIMIT 1`,
        [input.brandId],
      );
      const teamId = (rows as any[])[0]?.bundleTeamId ?? null;
      if (!teamId) return { connected: false, accountName: null, channels: [] };

      const account = await client.getSocialAccount({ teamId, type: platform });
      if (!account) return { connected: false, accountName: null, channels: [] };

      await localPool.execute(
        `UPDATE brands SET bundleConnectedAt = NOW() WHERE id = ? AND bundleConnectedAt IS NULL`,
        [input.brandId],
      );

      return {
        connected: true,
        accountName: account.displayName ?? account.username ?? null,
        channels: (account.channels ?? []).map((c) => ({ id: c.id, name: c.name ?? null })),
      };
    }),
});
