/**
 * startupCleanup.ts — mark stuck in-flight rows as failed on every server start.
 *
 * Problem class: in-process async work (LLM calls, webhook fire-and-forget)
 * writes status='running'/'pending' to DB before starting. If pm2 restarts
 * mid-work, the in-memory work dies silently but the DB row is never updated.
 * The UI shows a frozen spinner; user can never retry because the guard
 * sees status='running' and blocks re-submission.
 *
 * Fix: on startup, find rows that are running/pending and were started >5min
 * ago (i.e. not from this fresh start), then mark them failed so users can
 * see the error and click retry.
 *
 * Tables covered:
 *   squad_sessions      — in-memory LLM call dies on pm2 restart
 *   project_sync_jobs   — Pipedream webhook won't callback after restart
 *
 * NOT covered here (has own recovery):
 *   positioning_jobs    — resumeInterruptedPositioningJobs() re-queues these
 *   billing queue       — loadBillingFallbackLog() covers the disk fallback
 */
import localPool from "../../../localDb";
import { getDb } from "../../../db";
import { sql } from "drizzle-orm";

const STALE_MINUTES = 5; // rows running longer than this are presumed dead

/**
 * Mark stuck squad_sessions rows as failed.
 * Uses the drizzle DB connection (squad_sessions is in the Drizzle schema).
 */
async function cleanupSquadSessions(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const result: any = await db.execute(sql`
      UPDATE squad_sessions
         SET status      = 'failed',
             updated_at  = NOW()
       WHERE status = 'running'
         AND updated_at < NOW() - INTERVAL ${STALE_MINUTES} MINUTE
    `);
    const affected = result?.[0]?.affectedRows ?? result?.affectedRows ?? 0;
    if (affected > 0) {
      console.log(`[startupCleanup] squad_sessions: marked ${affected} stuck-running row(s) as failed`);
    } else {
      console.log("[startupCleanup] squad_sessions: no stuck rows");
    }
  } catch (e) {
    console.warn("[startupCleanup] squad_sessions cleanup failed:", (e as Error).message);
  }
}

/**
 * Mark stuck project_sync_jobs rows as failed.
 * Uses localPool (same DB, consistent with projectSyncRouter).
 */
async function cleanupProjectSyncJobs(): Promise<void> {
  try {
    const [result]: any = await localPool.execute(
      `UPDATE project_sync_jobs
          SET status   = 'failed',
              errorMsg = 'server restarted mid-sync — please retry'
        WHERE status IN ('pending', 'running')
          AND createdAt < NOW() - INTERVAL ? MINUTE`,
      [STALE_MINUTES],
    );
    const affected = result?.affectedRows ?? 0;
    if (affected > 0) {
      console.log(`[startupCleanup] project_sync_jobs: marked ${affected} stuck row(s) as failed`);
    } else {
      console.log("[startupCleanup] project_sync_jobs: no stuck rows");
    }
  } catch (e) {
    console.warn("[startupCleanup] project_sync_jobs cleanup failed:", (e as Error).message);
  }
}

/**
 * Mark stuck analysis_jobs rows as failed (legacy table from tenStepPositioning).
 * No router is actively writing to this table, but old rows may linger.
 */
async function cleanupAnalysisJobs(): Promise<void> {
  try {
    const [result]: any = await localPool.execute(
      `UPDATE analysis_jobs
          SET status = 'failed'
        WHERE status IN ('pending', 'processing')
          AND started_at < NOW() - INTERVAL ? MINUTE`,
      [STALE_MINUTES],
    );
    const affected = result?.affectedRows ?? 0;
    if (affected > 0) {
      console.log(`[startupCleanup] analysis_jobs: marked ${affected} stuck row(s) as failed`);
    }
    // else: table may not exist — that's fine, caught below
  } catch (e: any) {
    // Table may not exist in all environments — not a fatal error
    if (!String(e?.message).includes("doesn't exist") && !String(e?.message).includes("Unknown table")) {
      console.warn("[startupCleanup] analysis_jobs cleanup failed:", (e as Error).message);
    }
  }
}

/**
 * Run all cleanup tasks. Called once at server startup.
 * Each sub-task is independent — failure in one does not block others.
 * All failures are non-fatal.
 */
export async function runStartupCleanup(): Promise<void> {
  console.log("[startupCleanup] running stuck-job cleanup…");
  await Promise.allSettled([
    cleanupSquadSessions(),
    cleanupProjectSyncJobs(),
    cleanupAnalysisJobs(),
  ]);
  console.log("[startupCleanup] done");
}
