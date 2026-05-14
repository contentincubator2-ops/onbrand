/**
 * projectSyncRouter — sync project assets from external sources via Pipedream.
 *
 * Architecture
 * ────────────
 *   1. Frontend POST  → start({ source, params, brandId?, missionId? })
 *   2. Backend creates project_sync_jobs row with a webhookSecret,
 *      then HTTP POSTs the matching Pipedream workflow trigger URL with:
 *        { jobId, webhookSecret, source, params, callbackUrl }
 *   3. Pipedream workflow:
 *        - reads `params` (eg. fb page url, gdrive folder id)
 *        - uses Pipedream Connect's stored OAuth creds to call the
 *          provider API (FB Graph, YT Data, Drive Files, …)
 *        - POSTs assets back to {callbackUrl} in batches:
 *            { jobId, secret, status, progressPct?, assets: [...] }
 *        - final POST with status='done' or 'failed'
 *   4. Backend's REST handler (registered separately, not tRPC) verifies
 *      the secret, inserts rows into project_assets, updates job status.
 *
 * Pipedream workflow URLs come from env, one per source:
 *   PIPEDREAM_WEBHOOK_FACEBOOK
 *   PIPEDREAM_WEBHOOK_INSTAGRAM
 *   PIPEDREAM_WEBHOOK_YOUTUBE
 *   PIPEDREAM_WEBHOOK_WEBSITE
 *   PIPEDREAM_WEBHOOK_GOOGLE_DRIVE
 *   PIPEDREAM_WEBHOOK_ONEDRIVE
 *   PIPEDREAM_WEBHOOK_DROPBOX
 *
 * If env is not set, start() still creates the job but marks it as
 * 'failed' with an explanatory errorMsg so the UI can surface it.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import crypto from "node:crypto";

const SOURCES = [
  "facebook", "instagram", "youtube", "website",
  "google-drive", "onedrive", "dropbox",
] as const;
type Source = (typeof SOURCES)[number];

const ENV_KEY: Record<Source, string> = {
  "facebook":      "PIPEDREAM_WEBHOOK_FACEBOOK",
  "instagram":     "PIPEDREAM_WEBHOOK_INSTAGRAM",
  "youtube":       "PIPEDREAM_WEBHOOK_YOUTUBE",
  "website":       "PIPEDREAM_WEBHOOK_WEBSITE",
  "google-drive":  "PIPEDREAM_WEBHOOK_GOOGLE_DRIVE",
  "onedrive":      "PIPEDREAM_WEBHOOK_ONEDRIVE",
  "dropbox":       "PIPEDREAM_WEBHOOK_DROPBOX",
};

function callbackUrl(jobId: number): string {
  const base = process.env.PUBLIC_APP_URL ?? "https://onbrand.sowork.ai";
  return `${base.replace(/\/$/, "")}/api/project-sync/callback?jobId=${jobId}`;
}

export const projectSyncRouter = router({
  /** Kick off a sync. Returns the new jobId. UI then polls status(). */
  start: protectedProcedure
    .input(z.object({
      source:     z.enum(SOURCES),
      params:     z.record(z.any()).default({}),
      brandId:    z.number().int().nullable().optional(),
      missionId:  z.number().int().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      const secret = crypto.randomBytes(24).toString("hex");

      const [insertRes]: any = await db.execute(sql`
        INSERT INTO project_sync_jobs
          (userId, brandId, missionId, source, sourceParams, status, webhookSecret)
        VALUES
          (${ctx.user.id},
           ${input.brandId ?? null},
           ${input.missionId ?? null},
           ${input.source},
           ${JSON.stringify(input.params)},
           'pending',
           ${secret})
      `);
      const jobId: number = (insertRes as any).insertId ?? (insertRes as any)[0]?.insertId;

      const webhook = process.env[ENV_KEY[input.source as Source]];
      if (!webhook) {
        await db.execute(sql`
          UPDATE project_sync_jobs
             SET status='failed',
                 errorMsg=${`Pipedream workflow not configured (missing ${ENV_KEY[input.source as Source]})`}
           WHERE id=${jobId}
        `);
        return { jobId, ok: false, reason: "no-pipedream-workflow" };
      }

      // Fire trigger; don't block on it.
      (async () => {
        try {
          const r = await fetch(webhook, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jobId,
              webhookSecret: secret,
              source: input.source,
              params: input.params,
              userId: ctx.user.id,
              brandId: input.brandId ?? null,
              missionId: input.missionId ?? null,
              callbackUrl: callbackUrl(jobId),
            }),
          });
          if (!r.ok) throw new Error(`Pipedream trigger HTTP ${r.status}`);
          await db.execute(sql`
            UPDATE project_sync_jobs SET status='running' WHERE id=${jobId}
          `);
        } catch (e: any) {
          await db.execute(sql`
            UPDATE project_sync_jobs
               SET status='failed', errorMsg=${String(e?.message ?? e)}
             WHERE id=${jobId}
          `);
        }
      })();

      return { jobId, ok: true };
    }),

  /** Poll job progress. UI polls every ~1.5s while modal open. */
  status: protectedProcedure
    .input(z.object({ jobId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const rows: any = await db.execute(sql`
        SELECT id, source, status, progressPct, assetCount, errorMsg, createdAt
          FROM project_sync_jobs
         WHERE id=${input.jobId} AND userId=${ctx.user.id}
         LIMIT 1
      `);
      const r = (Array.isArray(rows) ? rows[0] : rows?.[0])?.[0] ?? rows?.[0];
      if (!r) throw new Error(`job ${input.jobId} not found`);
      return {
        id: r.id as number,
        source: r.source as string,
        status: r.status as "pending" | "running" | "done" | "failed",
        progressPct: r.progressPct as number,
        assetCount: r.assetCount as number,
        errorMsg: r.errorMsg as string | null,
        createdAt: r.createdAt,
      };
    }),

  /** List user's recent sync jobs (for a "同步紀錄" panel). */
  listRecent: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const rows: any = await db.execute(sql`
        SELECT id, source, status, assetCount, progressPct, errorMsg, createdAt
          FROM project_sync_jobs
         WHERE userId=${ctx.user.id}
         ORDER BY id DESC
         LIMIT ${input.limit}
      `);
      return Array.isArray(rows[0]) ? rows[0] : rows;
    }),
});
