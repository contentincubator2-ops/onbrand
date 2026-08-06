/**
 * projectSyncCallbackRoute — webhook receiver for Pipedream sync workflows.
 *
 * Pipedream POSTs:
 *   {
 *     jobId, secret,
 *     status?:    'running' | 'done' | 'failed',
 *     progressPct?: 0-100,
 *     errorMsg?:  string,
 *     assets?: [{
 *       kind:        'post' | 'image' | 'video' | 'doc' | 'page' | 'audio',
 *       title?:      string,
 *       externalId?: string,
 *       externalUrl?: string,
 *       mediaUrl?:   string,
 *       thumbnailUrl?: string,
 *       mimeType?:   string,
 *       sizeBytes?:  number,
 *       textContent?: string,
 *       meta?:       object,
 *     }, ...]
 *   }
 *
 * Secret is verified against project_sync_jobs.webhookSecret. Multiple
 * batches per job are supported — assets accumulate, progressPct can go
 * up monotonically. Final batch should set status='done' or 'failed'.
 */
import express from "express";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { isRuntimeFeatureEnabled } from "../_core/runtimeSafety";

export const projectSyncCallbackRouter = express.Router();

projectSyncCallbackRouter.post("/callback", express.json({ limit: "10mb" }), async (req, res) => {
  if (!isRuntimeFeatureEnabled("PROJECT_SYNC_ENABLED")) {
    console.warn("[projectSyncCallback] ignored because PROJECT_SYNC_ENABLED=false");
    return res.status(503).json({ error: "project sync disabled in this environment" });
  }
  try {
    const jobId = Number(req.query.jobId ?? req.body?.jobId);
    if (!jobId) return res.status(400).json({ error: "missing jobId" });

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "db unavailable" });

    const rows: any = await db.execute(sql`
      SELECT id, userId, brandId, missionId, source, webhookSecret
        FROM project_sync_jobs
       WHERE id=${jobId}
       LIMIT 1
    `);
    const job = (Array.isArray(rows[0]) ? rows[0] : rows)?.[0];
    if (!job) return res.status(404).json({ error: "job not found" });

    const supplied = String(req.body?.secret ?? req.headers["x-webhook-secret"] ?? "");
    if (supplied !== job.webhookSecret) {
      return res.status(403).json({ error: "bad secret" });
    }

    // Insert assets
    const assets = Array.isArray(req.body?.assets) ? req.body.assets : [];
    let inserted = 0;
    for (const a of assets) {
      try {
        await db.execute(sql`
          INSERT INTO project_assets
            (userId, brandId, missionId, syncJobId, source, kind,
             title, externalId, externalUrl, mediaUrl, thumbnailUrl,
             mimeType, sizeBytes, textContent, meta)
          VALUES
            (${job.userId}, ${job.brandId}, ${job.missionId}, ${job.id},
             ${job.source}, ${String(a.kind ?? "doc")},
             ${a.title ?? null}, ${a.externalId ?? null}, ${a.externalUrl ?? null},
             ${a.mediaUrl ?? null}, ${a.thumbnailUrl ?? null},
             ${a.mimeType ?? null}, ${a.sizeBytes ?? null},
             ${a.textContent ?? null},
             ${a.meta ? JSON.stringify(a.meta) : null})
        `);
        inserted++;
      } catch (e) {
        console.warn("[projectSyncCallback] insert asset failed:", (e as any)?.message);
      }
    }

    // Update job state
    const status = req.body?.status as string | undefined;
    const progressPct = Number.isFinite(req.body?.progressPct) ? Number(req.body.progressPct) : null;
    const errorMsg = req.body?.errorMsg ?? null;

    await db.execute(sql`
      UPDATE project_sync_jobs
         SET assetCount = assetCount + ${inserted},
             progressPct = COALESCE(${progressPct}, progressPct),
             status = COALESCE(${status ?? null}, status),
             errorMsg = COALESCE(${errorMsg}, errorMsg)
       WHERE id=${job.id}
    `);

    return res.json({ ok: true, inserted });
  } catch (e: any) {
    console.error("[projectSyncCallback] error:", e?.message ?? e);
    return res.status(500).json({ error: String(e?.message ?? e) });
  }
});
