/**
 * positioningLock — shared 定位 (positioning) tab lock check.
 *
 * 2026-08-21 (CJ「剛剛所訂好的競爭對手和主打優勢，突然之間就跑掉了。是因
 * 為背景一直在重新推論嗎」): tabLocks.positioning existed purely as a UI
 * display flag (theaterRouter.ts's getTabLocks/lockTab/lockTabs/unlockTab)
 * — nothing that actually WRITES brands.positioning ever checked it, so a
 * locked brand's manually-finalized competitors/advantages/tagline could
 * still be silently overwritten by: the positioning pipeline (positioningJobs
 * .start), workbench derive/applyScenario/researchItem, brand.recalibrate,
 * and the server-restart auto-resume of interrupted jobs. This module is the
 * single place those call sites check before writing, so the lock is finally
 * real instead of cosmetic.
 *
 * Only `brands` has a tabLocks column — products/events are never locked.
 */
import localPool from "../localDb";

export type LockableEntityKind = "brand" | "product" | "event";

/** True iff this brand's 定位 tab is locked. Always false for product/event
 *  (no tabLocks column) and on any read failure (fail-open — a lock check
 *  that itself breaks must never be the reason a legitimate write is lost). */
export async function isPositioningLocked(
  kind: LockableEntityKind,
  id: number,
  userId: number,
): Promise<boolean> {
  if (kind !== "brand") return false;
  try {
    const [rows]: any = await localPool.execute(
      `SELECT tabLocks FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
      [id, userId],
    );
    const row = (rows as any[])[0];
    if (!row) return false;
    let locks: any = row.tabLocks;
    if (typeof locks === "string") {
      try { locks = JSON.parse(locks); } catch { locks = null; }
    }
    return !!(locks && locks.positioning);
  } catch (e) {
    console.warn("[positioningLock] lock check failed (fail-open):", (e as Error)?.message);
    return false;
  }
}
