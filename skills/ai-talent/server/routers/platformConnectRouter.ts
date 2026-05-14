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
 *
 * Pipedream "app" names:
 *   facebook_pages, instagram_business, linkedin, youtube
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";

// Pipedream Connect REST endpoint for issuing user tokens
const PD_API = "https://api.pipedream.com/v1/connect";

const PLATFORM_APP: Record<string, string> = {
  facebook:  "facebook_pages",
  instagram: "instagram_business",
  linkedin:  "linkedin",
  youtube:   "youtube",
};

async function getPipedreamToken(externalUserId: string): Promise<{ token: string; expires_at: string }> {
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

  // Get OAuth2 bearer token from Pipedream
  const tokenRes = await fetch("https://api.pipedream.com/v1/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type:    "client_credentials",
      client_id:     clientId,
      client_secret: clientSecret,
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Pipedream OAuth token error ${tokenRes.status}: ${text.slice(0, 200)}`,
    });
  }

  const { access_token } = (await tokenRes.json()) as { access_token: string };

  // Issue a Connect user token
  const connectRes = await fetch(`${PD_API}/tokens`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${access_token}`,
      "X-PD-Environment": env,
    },
    body: JSON.stringify({
      external_user_id: externalUserId,
      project_id:       projectId,
    }),
  });

  if (!connectRes.ok) {
    const text = await connectRes.text();
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Pipedream Connect token error ${connectRes.status}: ${text.slice(0, 200)}`,
    });
  }

  const data = (await connectRes.json()) as { token: string; expires_at: string };
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
  getConnectToken: protectedProcedure
    .input(z.object({
      platform: z.enum(["facebook", "instagram", "linkedin", "youtube"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = String((ctx as any).user?.id ?? (ctx as any).session?.user?.id ?? "anonymous");
      const externalUserId = `sowork-${userId}`;
      const appSlug = PLATFORM_APP[input.platform]!;
      const projectId = process.env.PIPEDREAM_PROJECT_ID ?? "";
      const env = process.env.PIPEDREAM_PROJECT_ENV ?? "production";

      const { token, expires_at } = await getPipedreamToken(externalUserId);

      return {
        token,
        expiresAt: expires_at,
        appSlug,
        projectId,
        env: env as "production" | "development",
      };
    }),
});
