/**
 * scheduledPublishWorker — publishes approved posts when their time comes.
 *
 * Before this existed nothing consumed scheduled_posts: a post only went out
 * when someone pressed "publish now". Approval now schedules in the sense that
 * an approved output with a pending scheduled_posts row goes out at its time;
 * until then it stays editable, reschedulable and cancellable (those mutations
 * only touch rows with status = 'pending').
 *
 * Safety rails:
 *  - Opt-in: does nothing unless AUTOPUBLISH_SCHEDULED=on. This publishes to
 *    customers' real pages, so each environment turns it on deliberately.
 *  - Only approved outputs (publishGate); unapproved rows stay pending.
 *  - Claim-before-publish (pending → publishing) so two ticks or two server
 *    processes can't post twice.
 *  - Grace window: a row more than GRACE_MS overdue is left for a human to
 *    reschedule rather than posting stale content the moment it is approved.
 *  - One failure marks that row failed (with lastError) and is never retried
 *    automatically — a half-published post must not be posted again.
 */
import localPool from "../../localDb";
import { isRuntimeFeatureEnabled } from "../../platform/core/runtimeSafety";
import { outputApprovalState } from "./publishGate";

const GRACE_MS = 6 * 60 * 60 * 1000;
const BATCH = 5;

export function isAutoPublishEnabled(): boolean {
  return (
    process.env.AUTOPUBLISH_SCHEDULED?.trim().toLowerCase() === "on" &&
    isRuntimeFeatureEnabled("SOCIAL_PUBLISH_ENABLED")
  );
}

export async function tickScheduledPublish(): Promise<number> {
  if (!isAutoPublishEnabled()) return 0;
  const [rows]: any = await localPool.execute(
    `SELECT id, userId, outputId FROM scheduled_posts
      WHERE status = 'pending'
        AND scheduledAt <= NOW(3)
        AND scheduledAt >= NOW(3) - INTERVAL ${Math.floor(GRACE_MS / 1000)} SECOND
      ORDER BY scheduledAt ASC
      LIMIT ${BATCH}`,
  );
  let published = 0;
  for (const r of rows as any[]) {
    const id = Number(r.id);
    if ((await outputApprovalState(localPool, Number(r.outputId), Number(r.userId))) !== "approved") continue;

    const [claim]: any = await localPool.execute(
      `UPDATE scheduled_posts SET status = 'publishing', attempts = attempts + 1
        WHERE id = ? AND status = 'pending'`,
      [id],
    );
    if (!(claim as any).affectedRows) continue; // someone else got it

    try {
      const { publishScheduledPost } = await import("../routers/calendarRouter");
      await publishScheduledPost({ id, userId: Number(r.userId), claimed: true });
      published++;
    } catch (e: any) {
      const msg = String(e?.message ?? e).slice(0, 1000);
      await localPool.execute(
        `UPDATE scheduled_posts SET status = 'failed', lastError = ? WHERE id = ? AND status = 'publishing'`,
        [msg, id],
      ).catch(() => { /* nothing more to do */ });
      console.error(`[scheduledPublish] #${id} failed: ${msg}`);
      try {
        const { logError } = await import("../../platform/routers/opsRouter");
        void logError({ source: "scheduled.publish", message: `scheduled post ${id} failed: ${msg}`.slice(0, 500), level: "error" });
      } catch { /* telemetry only */ }
    }
  }
  return published;
}
