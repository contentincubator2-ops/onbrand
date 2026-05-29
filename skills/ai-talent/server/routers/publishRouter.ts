/**
 * publishRouter — direct-publish to social platforms via Pipedream.
 *
 * Why Pipedream: Meta OAuth + Page Access Token + token rotation is a
 * multi-week build if we do it ourselves. Pipedream Connect handles all
 * of that — user OAuths once on Pipedream's hosted UI, token lives in
 * Pipedream's vault, we just trigger a webhook with the caption and let
 * Pipedream's workflow call Graph API.
 *
 * 2026-05-09 (P5 — CJ direction「use pipedream for OAuth」)
 *
 * Setup on Pipedream side (one-time, CJ does this):
 *   1. Create a workflow at https://pipedream.com triggered by HTTP webhook
 *   2. Add a "Connect Account → Facebook" step (user OAuths via Pipedream)
 *   3. Add a "Facebook Pages → Create Post" step using the Connect token
 *   4. Copy the webhook URL → set as env PIPEDREAM_FB_PUBLISH_WEBHOOK
 *   5. Generate a long-lived secret → set as env PIPEDREAM_WEBHOOK_SECRET
 *
 * Then this router POSTs {caption, pageId, brandId, secret} to the webhook
 * and returns the post_id Pipedream sends back.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";

const ENV = process.env;

export const publishRouter = router({
  /**
   * Publish a caption to a connected Facebook page via Pipedream.
   * Returns Pipedream's response (typically {post_id, permalink_url}).
   */
  toFacebook: protectedProcedure
    .input(z.object({
      outputId: z.number().int().positive(),
      variantIndex: z.number().int().min(0).default(0),
      pageId: z.string().min(1).max(64).optional(), // FB Page ID; optional if Pipedream workflow defaults
    }))
    .mutation(async ({ ctx, input }) => {
      const webhookUrl = (ENV as any).PIPEDREAM_FB_PUBLISH_WEBHOOK as string | undefined;
      const secret = (ENV as any).PIPEDREAM_WEBHOOK_SECRET as string | undefined;
      if (!webhookUrl) {
        // 2026-05-11 (CJ「掃 .env 暴露」): env var names removed from user-facing
        // copy. Real reason logged for admins via console + error_log.
        console.error("[publish.toFacebook] missing env: PIPEDREAM_FB_PUBLISH_WEBHOOK / PIPEDREAM_WEBHOOK_SECRET");
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "FB 發布服務尚未啟用，請聯絡 sowork@sowork.ai。",
        });
      }

      // Load output + verify ownership + get caption + brand's FB binding
      // 2026-05-11 (CJ「多用戶 SaaS, 每用戶連自己 FB」): JOIN brands to read
      // per-brand fbPageId — no more global DEFAULT_FB_PAGE_ID env.
      const { default: localPool } = await import("../localDb");
      const [rows]: any = await localPool.execute(
        `SELECT o.content, m.brandId, m.userId AS owner_id,
                b.fbPageId AS brand_fb_page_id, b.fbPageName AS brand_fb_page_name
         FROM mission_outputs o
         JOIN missions m ON m.id = o.missionId
         LEFT JOIN brands b ON b.id = m.brandId
         WHERE o.id = ? AND m.userId = ? LIMIT 1`,
        [input.outputId, ctx.user.id],
      );
      const row = (rows as any[])[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "output 不存在或無權限" });

      let caption = "";
      try {
        const parsed = JSON.parse(row.content);
        const variants = Array.isArray(parsed) ? parsed : (parsed.variants ?? [parsed]);
        caption = variants[input.variantIndex]?.caption ?? "";
      } catch {
        caption = String(row.content ?? "");
      }
      if (!caption.trim()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "此 variant 沒有 caption 可發布" });
      }

      // 2026-05-11 (multi-tenant): page_id MUST come from this brand's
      // saved binding. No global env fallback — each user connects their
      // own FB and stores their target page on the brand row.
      const pageId = input.pageId ?? row.brand_fb_page_id ?? null;
      if (!pageId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "此品牌尚未連接 Facebook 粉專。請到 品牌設定 → 連接 Facebook 完成綁定。",
        });
      }
      // Pipedream Connect: pass external_user_id so the workflow uses
      // THIS user's OAuth token (not a shared account).
      const payload = {
        page_id: pageId,
        message: caption,
        connect_external_user_id: String(ctx.user.id),
        // Diagnostics — Pipedream workflow can ignore these but they help
        // for support / dedupe / audit if Pipedream's logs are needed.
        _meta: {
          secret: secret ?? null,
          outputId: input.outputId,
          variantIndex: input.variantIndex,
          brandId: row.brandId,
          userId: ctx.user.id,
          fbPageName: row.brand_fb_page_name ?? null,
        },
      };

      const t0 = Date.now();
      const resp = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30_000),
      });
      const text = await resp.text();
      const latencyMs = Date.now() - t0;

      if (!resp.ok) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Pipedream ${resp.status}: ${text.slice(0, 300)}`,
        });
      }

      // Pipedream returns whatever the workflow's last step returns; try to parse JSON
      let pipedreamResult: any = text;
      try { pipedreamResult = JSON.parse(text); } catch { /* keep as text */ }

      // Mark output as published in DB
      try {
        await localPool.execute(
          `UPDATE mission_outputs SET status = 'published', publishedAt = NOW(), updatedAt = NOW() WHERE id = ?`,
          [input.outputId],
        );
      } catch { /* non-fatal */ }

      return {
        ok: true,
        latencyMs,
        pipedreamResult,
        postId: pipedreamResult?.post_id ?? pipedreamResult?.id ?? null,
        permalink: pipedreamResult?.permalink_url ?? pipedreamResult?.permalink ?? null,
      };
    }),

  /**
   * Generate a Pipedream Connect onboarding URL so the user can OAuth
   * their Facebook page once. Returns a URL the frontend opens in a new
   * tab/popup. After the user finishes OAuth, the connected account is
   * stored in Pipedream's vault keyed by external_user_id (=our userId).
   *
   * Pipedream Connect API ref: https://pipedream.com/docs/connect/api
   */
  getFacebookConnectUrl: protectedProcedure
    .input(z.object({}).optional())
    .mutation(async ({ ctx }) => {
      // 2026-05-26: migrated from PIPEDREAM_API_KEY (static, unsupported by
      // Pipedream Connect) to OAuth client_credentials flow using
      // PIPEDREAM_CLIENT_ID (pub_...) + PIPEDREAM_CLIENT_SECRET (sec_...).
      // Same pattern as platformConnectRouter.getPipedreamToken().
      const clientId     = process.env.PIPEDREAM_CLIENT_ID;
      const clientSecret = process.env.PIPEDREAM_CLIENT_SECRET;
      const projectId    = process.env.PIPEDREAM_PROJECT_ID;
      const pdEnv        = process.env.PIPEDREAM_PROJECT_ENV ?? "production";

      if (!clientId || !clientSecret || !projectId) {
        console.error("[publish.getFacebookConnectUrl] missing env: PIPEDREAM_CLIENT_ID / CLIENT_SECRET / PROJECT_ID");
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Facebook 授權服務尚未啟用，請聯絡 sowork@sowork.ai。",
        });
      }

      // Two-step Pipedream Connect flow (confirmed working 2026-05-27):
      // Step 1: exchange OAuth App credentials for Bearer access_token.
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      const tokenRes = await fetch("https://api.pipedream.com/v1/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type":  "application/x-www-form-urlencoded",
          "Authorization": `Basic ${basicAuth}`,
        },
        body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
        signal: AbortSignal.timeout(15_000),
      });
      if (!tokenRes.ok) {
        const t = await tokenRes.text();
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Pipedream OAuth error ${tokenRes.status}: ${t.slice(0, 200)}`,
        });
      }
      const { access_token } = (await tokenRes.json()) as { access_token: string };

      // Step 2: mint a Connect user token for the popup flow.
      // 2026-05-28 fix: include app so connect_link_url embeds ?app=facebook_pages.
      // Without this, Pipedream returns a connect_link_url without the app
      // parameter and its iframe shows "Please include the app in the Connect URL".
      const resp = await fetch(`https://api.pipedream.com/v1/connect/tokens`, {
        method: "POST",
        headers: {
          "Authorization":    `Bearer ${access_token}`,
          "Content-Type":     "application/json",
          "X-PD-Environment": pdEnv,
        },
        body: JSON.stringify({
          external_user_id: `sowork-${ctx.user.id}`,
          project_id:       projectId,
          app:              "facebook_pages",
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!resp.ok) {
        const t = await resp.text();
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Pipedream Connect ${resp.status}: ${t.slice(0, 300)}`,
        });
      }
      const data: any = await resp.json();
      // Build the Connect URL — always guarantee ?app=facebook_pages is present.
      // Pipedream only embeds the app in connect_link_url when the token was
      // created with `app` in the body (fixed above). But as a belt-and-suspenders
      // guard, we parse whatever URL Pipedream returns and force-inject the app
      // param if it's missing rather than trusting Pipedream's format blindly.
      let connectUrl: string;
      try {
        const rawUrl = data.connect_link_url
          ?? `https://pipedream.com/_static/connect.html?token=${data.token}`;
        const u = new URL(rawUrl);
        if (!u.searchParams.has("app")) {
          u.searchParams.set("app", "facebook_pages");
        }
        if (!u.searchParams.has("token") && data.token) {
          u.searchParams.set("token", data.token);
        }
        connectUrl = u.toString();
      } catch {
        connectUrl = `https://pipedream.com/_static/connect.html?token=${data.token}&app=facebook_pages`;
      }
      return {
        token: data.token,
        connectUrl,
        expiresAt: data.expires_at ?? null,
      };
    }),

  /**
   * 2026-05-28 — After the user completes Facebook OAuth via Pipedream,
   * fetch the list of FB Pages they manage so the frontend can show a
   * picker instead of making the user manually hunt for a numeric Page ID.
   *
   * Flow:
   *   1. Get Pipedream Bearer token (same client_credentials flow)
   *   2. GET /v1/connect/{projectId}/users/{externalUserId}/accounts?app=facebook_pages
   *      → find the connected Facebook account ID
   *   3. GET /v1/connect/{projectId}/accounts/{accountId}?include_credentials=1
   *      → extract the OAuth user access token
   *   4. GET graph.facebook.com/v18.0/me/accounts → pages the user manages
   */
  getFacebookPages: protectedProcedure
    .input(z.object({}).optional())
    .mutation(async ({ ctx }) => {
      const clientId     = process.env.PIPEDREAM_CLIENT_ID;
      const clientSecret = process.env.PIPEDREAM_CLIENT_SECRET;
      const projectId    = process.env.PIPEDREAM_PROJECT_ID;
      const pdEnv        = process.env.PIPEDREAM_PROJECT_ENV ?? "production";

      if (!clientId || !clientSecret || !projectId) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Facebook 授權服務尚未啟用。" });
      }

      const externalUserId = `sowork-${ctx.user.id}`;
      const PD = "https://api.pipedream.com/v1";

      // Step 1: get Bearer token
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      const tokenRes = await fetch(`${PD}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": `Basic ${basicAuth}` },
        body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
        signal: AbortSignal.timeout(15_000),
      });
      if (!tokenRes.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "無法取得 Pipedream token" });
      const { access_token } = (await tokenRes.json()) as { access_token: string };
      const headers = { "Authorization": `Bearer ${access_token}`, "X-PD-Environment": pdEnv };

      // Step 2: list connected accounts for this user + facebook_pages app.
      // Retry up to 4× with increasing delay — Pipedream can take 2–4 seconds
      // to propagate the OAuth callback after the user completes the popup.
      const accountsUrl = `${PD}/connect/${projectId}/users/${externalUserId}/accounts?app=facebook_pages&limit=10`;
      let accounts: Array<{ id: string; name?: string }> = [];
      const RETRIES = [0, 2000, 3000, 4000]; // ms to wait before each attempt
      for (let attempt = 0; attempt < RETRIES.length; attempt++) {
        if (RETRIES[attempt]! > 0) {
          await new Promise((r) => setTimeout(r, RETRIES[attempt]));
        }
        const accountsRes = await fetch(accountsUrl, { headers, signal: AbortSignal.timeout(15_000) });
        if (!accountsRes.ok) {
          const t = await accountsRes.text();
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `無法取得已連接的 FB 帳號：${t.slice(0, 200)}` });
        }
        const accountsData = (await accountsRes.json()) as { data?: Array<{ id: string; name?: string }> };
        accounts = accountsData.data ?? [];
        if (accounts.length > 0) break; // found — stop retrying
      }
      if (accounts.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "尚未連接 Facebook，請先完成授權。" });
      }
      const accountId = accounts[0]!.id;

      // Step 3: get OAuth credentials for the account
      const credRes = await fetch(
        `${PD}/connect/${projectId}/accounts/${accountId}?include_credentials=1`,
        { headers, signal: AbortSignal.timeout(15_000) },
      );
      if (!credRes.ok) {
        const t = await credRes.text();
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `無法取得 FB token：${t.slice(0, 200)}` });
      }
      const credData = (await credRes.json()) as { credentials?: { oauth_access_token?: string; access_token?: string } };
      const fbToken = credData.credentials?.oauth_access_token ?? credData.credentials?.access_token;
      if (!fbToken) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "無法取得 FB 存取 token，請重新授權。" });
      }

      // Step 4: call FB Graph API to list managed pages
      const pagesRes = await fetch(
        `https://graph.facebook.com/v18.0/me/accounts?fields=id,name,category&limit=30&access_token=${encodeURIComponent(fbToken)}`,
        { signal: AbortSignal.timeout(15_000) },
      );
      if (!pagesRes.ok) {
        const t = await pagesRes.text();
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `FB Graph API 失敗：${t.slice(0, 200)}` });
      }
      const pagesData = (await pagesRes.json()) as { data?: Array<{ id: string; name: string; category?: string }> };
      const pages = (pagesData.data ?? []).map((p) => ({ id: p.id, name: p.name, category: p.category ?? "" }));
      return { ok: true as const, pages };
    }),

  /**
   * 2026-05-11 — Bind a Facebook Page to a brand. After the user finishes
   * Pipedream Connect OAuth, the frontend asks them which Page ID to use
   * (or pick from a list later) and calls this to persist.
   */
  setBrandFacebookPage: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      fbPageId: z.string().min(1).max(64),
      fbPageName: z.string().max(128).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { default: localPool } = await import("../localDb");
      // Verify ownership
      const [rows]: any = await localPool.execute(
        `SELECT id FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
        [input.brandId, ctx.user.id],
      );
      if (!(rows as any[])[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "品牌不存在或無權限" });
      }
      await localPool.execute(
        `UPDATE brands SET fbPageId = ?, fbPageName = ?, fbConnectedAt = NOW() WHERE id = ?`,
        [input.fbPageId, input.fbPageName ?? null, input.brandId],
      );
      return { ok: true };
    }),

  /**
   * 2026-05-29 — Return which platforms are connected via Pipedream for the
   * current user. Used by Settings PublishTab to show connection status on all
   * platform cards (Buffer-style).
   *
   * Calls: GET /v1/connect/{projectId}/users/{externalUserId}/accounts?limit=50
   * Returns: { connected: { facebook?: {accountId,name}, instagram?: ..., ... } }
   */
  getConnectedPlatforms: protectedProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      const clientId     = process.env.PIPEDREAM_CLIENT_ID;
      const clientSecret = process.env.PIPEDREAM_CLIENT_SECRET;
      const projectId    = process.env.PIPEDREAM_PROJECT_ID;
      const pdEnv        = process.env.PIPEDREAM_PROJECT_ENV ?? "production";
      if (!clientId || !clientSecret || !projectId) return { connected: {} as Record<string, { accountId: string; name?: string }> };

      const userId = String(ctx.user.id);
      const externalUserId = `sowork-${userId}`;
      const PD = "https://api.pipedream.com/v1";

      // Step 1: bearer token
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      const tokenRes = await fetch(`${PD}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": `Basic ${basicAuth}` },
        body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
        signal: AbortSignal.timeout(10_000),
      });
      if (!tokenRes.ok) return { connected: {} as Record<string, { accountId: string; name?: string }> };
      const { access_token } = (await tokenRes.json()) as { access_token: string };
      const pdHeaders = { "Authorization": `Bearer ${access_token}`, "X-PD-Environment": pdEnv };

      // Step 2: list all connected accounts for this external user
      const accsRes = await fetch(
        `${PD}/connect/${projectId}/users/${externalUserId}/accounts?limit=50`,
        { headers: pdHeaders, signal: AbortSignal.timeout(10_000) },
      );
      if (!accsRes.ok) return { connected: {} as Record<string, { accountId: string; name?: string }> };
      const body = (await accsRes.json()) as { data?: Array<{ app?: string; id: string; name?: string }> };
      const accounts = body.data ?? [];

      const APP_KEY: Record<string, string> = {
        facebook_pages:      "facebook",
        instagram_business:  "instagram",
        linkedin:            "linkedin",
        youtube:             "youtube",
      };
      const connected: Record<string, { accountId: string; name?: string }> = {};
      for (const acc of accounts) {
        if (acc.app && APP_KEY[acc.app]) {
          connected[APP_KEY[acc.app]!] = { accountId: acc.id, name: acc.name };
        }
      }
      return { connected };
    }),

  /** Disconnect FB binding from a brand (does NOT revoke Pipedream token). */
  unbindBrandFacebook: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { default: localPool } = await import("../localDb");
      const [rows]: any = await localPool.execute(
        `SELECT id FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
        [input.brandId, ctx.user.id],
      );
      if (!(rows as any[])[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "品牌不存在或無權限" });
      }
      await localPool.execute(
        `UPDATE brands SET fbPageId = NULL, fbPageName = NULL, fbConnectedAt = NULL WHERE id = ?`,
        [input.brandId],
      );
      return { ok: true };
    }),

  /** Read FB binding status for a brand (drives the settings UI). */
  getBrandFacebookStatus: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const { default: localPool } = await import("../localDb");
      const [rows]: any = await localPool.execute(
        `SELECT fbPageId, fbPageName, fbConnectedAt
         FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
        [input.brandId, ctx.user.id],
      );
      const row = (rows as any[])[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "品牌不存在或無權限" });
      return {
        connected: !!row.fbPageId,
        fbPageId: row.fbPageId ?? null,
        fbPageName: row.fbPageName ?? null,
        connectedAt: row.fbConnectedAt ?? null,
      };
    }),
});
