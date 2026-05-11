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
          message: "FB 發布服務尚未啟用，請聯絡 drop@sowork.ai。",
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
      const apiKey = (ENV as any).PIPEDREAM_API_KEY as string | undefined;
      const projectId = (ENV as any).PIPEDREAM_PROJECT_ID as string | undefined;
      if (!apiKey || !projectId) {
        console.error("[publish.getFacebookConnectUrl] missing env: PIPEDREAM_API_KEY / PIPEDREAM_PROJECT_ID");
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Facebook 授權服務尚未啟用，請聯絡 drop@sowork.ai。",
        });
      }
      const resp = await fetch(`https://api.pipedream.com/v1/connect/${projectId}/tokens`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          external_user_id: String(ctx.user.id),
          allowed_origins: ["https://marketing-os.sowork.ai"],
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!resp.ok) {
        const t = await resp.text();
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Pipedream ${resp.status}: ${t.slice(0, 300)}`,
        });
      }
      const data: any = await resp.json();
      // Frontend opens this URL → user OAuths Facebook → returns to our app.
      return {
        token: data.token,
        connectUrl: data.connect_link_url ?? `https://pipedream.com/_static/connect.html?token=${data.token}&app=facebook_pages`,
        expiresAt: data.expires_at ?? null,
      };
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
