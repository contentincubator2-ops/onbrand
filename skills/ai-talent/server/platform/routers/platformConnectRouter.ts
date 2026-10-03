/**
 * platformConnectRouter — Pipedream Connect OAuth tokens.
 *
 * Issues short-lived Pipedream Connect tokens so the browser-side
 * @pipedream/sdk can open an OAuth popup for Facebook / Instagram /
 * LinkedIn / YouTube without exposing server credentials to the client.
 *
 * Env vars required (add to .env on the VM):
 *   PIPEDREAM_CLIENT_ID
 *   PIPEDREAM_CLIENT_SECRET
 *   PIPEDREAM_PROJECT_ID
 *   PIPEDREAM_PROJECT_ENV   (optional, defaults to "production")
 *   PIPEDREAM_FACEBOOK_OAUTH_APP_ID (required for Facebook publishing)
 *
 * Pipedream "app" names:
 *   facebook_pages, instagram_business, linkedin, youtube
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../core/trpc";
import { assertBrandAccess } from "../core/brandAuth";
import { getPipedreamConnectTokenUrl } from "../core/connectors/pipedreamConnect";
import { getPipedreamOAuthAppId } from "../core/connectors/pipedreamOAuth";
import { isRuntimeFeatureEnabled } from "../core/ops/runtimeSafety";

const socialProcedure = protectedProcedure.use(async ({ next }) => {
  if (!isRuntimeFeatureEnabled("SOCIAL_PUBLISH_ENABLED")) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "此環境已停用社群連接與發布功能。",
    });
  }
  return next();
});

// Pipedream Connect REST endpoint for issuing user tokens
const PLATFORM_APP: Record<string, string> = {
  facebook:  "facebook_pages",
  instagram: "instagram_business",
  linkedin:  "linkedin",
  youtube:   "youtube",
};

async function getPipedreamToken(
  externalUserId: string,
): Promise<{ token: string; expires_at: string; connect_link_url?: string }> {
  const clientId     = process.env.PIPEDREAM_CLIENT_ID;
  const clientSecret = process.env.PIPEDREAM_CLIENT_SECRET;
  const projectId    = process.env.PIPEDREAM_PROJECT_ID;
  const env          = process.env.PIPEDREAM_PROJECT_ENV ?? "production";

  if (!clientId || !clientSecret || !projectId) {
    // 2026-05-11 (CJ「掃 .env 暴露」): env var names removed from user-facing copy.
    console.error("[platformConnect] missing env: PIPEDREAM_CLIENT_ID / CLIENT_SECRET / PROJECT_ID");
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "平台連接服務尚未啟用，請聯絡 sowork@sowork.ai。",
    });
  }

  // Step 1: exchange OAuth App credentials for a short-lived Bearer token.
  // Pipedream Connect requires a two-step flow:
  //   1. POST /v1/oauth/token with Basic Auth (CLIENT_ID:CLIENT_SECRET)
  //   2. POST /v1/connect/{project_id}/tokens with Bearer access_token
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokenRes = await fetch("https://api.pipedream.com/v1/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type":  "application/x-www-form-urlencoded",
      "Authorization": `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Pipedream OAuth token error ${tokenRes.status}: ${text.slice(0, 200)}`,
    });
  }

  const { access_token } = (await tokenRes.json()) as { access_token: string };

  // Step 2: mint a Connect user token with the Bearer access token. Connect
  // resources are project-scoped in the URL path; the browser SDK receives
  // appSlug separately when it opens the account connection flow.
  const connectRes = await fetch(getPipedreamConnectTokenUrl(projectId), {
    method: "POST",
    headers: {
      "Content-Type":    "application/json",
      "Authorization":   `Bearer ${access_token}`,
      "X-PD-Environment": env,
    },
    body: JSON.stringify({
      external_user_id: externalUserId,
    }),
  });

  if (!connectRes.ok) {
    const text = await connectRes.text();
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Pipedream Connect token error ${connectRes.status}: ${text.slice(0, 200)}`,
    });
  }

  const data = (await connectRes.json()) as { token: string; expires_at: string; connect_link_url?: string };
  return data;
}

export const platformConnectRouter = router({
  /**
   * getConnectToken — returns a short-lived Pipedream Connect token.
   * The frontend exchanges this for an OAuth popup via @pipedream/sdk/browser.
   *
   * Input:
   *   platform  — "facebook" | "instagram" | "linkedin" | "youtube"
   *
   * Output:
   *   token      — short-lived connect token (pass to createClient)
   *   expiresAt  — ISO timestamp
   *   appSlug    — Pipedream app slug (e.g. "facebook_pages")
   *   projectId  — Pipedream project ID (needed by browser SDK)
   *   env        — "production" | "development"
   */
  getConnectToken: socialProcedure
    .input(z.object({
      platform: z.enum(["facebook", "instagram", "linkedin", "youtube"]),
      brandId:  z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertBrandAccess(ctx.user.id, input.brandId);

      const externalUserId = `sowork-brand-${input.brandId}`;
      const appSlug = PLATFORM_APP[input.platform]!;
      const oauthAppId = getPipedreamOAuthAppId(input.platform);
      const projectId = process.env.PIPEDREAM_PROJECT_ID ?? "";
      const env = process.env.PIPEDREAM_PROJECT_ENV ?? "production";

      const { token, expires_at, connect_link_url } = await getPipedreamToken(externalUserId);

      return {
        token,
        expiresAt: expires_at,
        appSlug,
        projectId,
        env: env as "production" | "development",
        connectLinkUrl: connect_link_url ?? "",
        oauthAppId: oauthAppId ?? null,
      };
    }),
});
