/**
 * tierCompat — backward-compatibility shim for the "100s" → "99s" tier rename
 * (2026-05-17, CJ「現在應該沒有100S」/ 久久 雙關 品牌化).
 *
 * The tier id and every campaign-level task-id was renamed from the `100`
 * token to `99` (tier string `"100s"`→`"99s"`, task-id segment `-100-`→
 * `-99-`). Code/definitions are now fully `99`. BUT existing production data
 * still carries the OLD ids:
 *   - missions.description stores `[task:fb-100-...]` tags
 *   - mission_outputs / runs reference old taskIds like `fb-100-30day-calendar`
 *   - some persisted tier labels may still read `"100s"`
 *
 * To avoid a destructive DB migration, every boundary where a taskId / tier
 * arrives FROM stored data (or a legacy client/bookmark) and is then used for
 * routing / inference / lookup must funnel through these normalizers, so a
 * legacy `fb-100-foo` row still resolves to the renamed `fb-99-foo` logic and
 * renders correctly.
 *
 * Behaviour is otherwise identical — this is purely an identifier shim.
 */

/**
 * Replace ONLY the campaign tier segment `-100-` with `-99-` in a taskId.
 * Anchored to the `<platform>-100-` prefix so unrelated digits (slugs,
 * agent ids, percentages) are never touched.
 *
 *   fb-100-30day-calendar  → fb-99-30day-calendar
 *   rs-100-competitor-ads  → rs-99-competitor-ads
 *   fb-30-single-post      → fb-30-single-post   (unchanged)
 *   fb-99-30day-calendar   → fb-99-30day-calendar (idempotent)
 */
export function normalizeTaskId(id: string): string {
  if (!id) return id;
  // 2026-05-18 (CJ): fb-60-carousel-5 moved to the 99s tier (real 5-card
  // multi-image deliverable). Map the legacy id forward so old links /
  // stored runs / re-runs resolve to the new 99s task.
  if (id === "fb-60-carousel-5") return "fb-99-carousel-5";
  if (id === "fb-60-serial-3") return "fb-99-serial-3";
  if (id === "fb-60-trend-rewrite") return "fb-99-trend-rewrite";
  if (id === "fb-60-viral-rewrite") return "fb-99-viral-rewrite";
  if (id === "fb-60-testimonial-rewrite") return "fb-99-testimonial-rewrite";
  return id.replace(/^([a-z]+)-100-/, "$1-99-");
}

/**
 * Inverse of normalizeTaskId: produce the LEGACY `-100-` form of a (possibly
 * already-new) taskId, for matching historic stored rows that were written
 * before the rename. Returns null when there is no tier segment to rewrite
 * (so callers can skip the extra lookup). Idempotent on legacy input.
 *
 *   fb-99-30day-calendar  → fb-100-30day-calendar
 *   fb-100-30day-calendar → fb-100-30day-calendar
 *   fb-30-single-post     → null
 */
export function legacyTaskId(id: string): string | null {
  if (!id) return null;
  if (/^[a-z]+-100-/.test(id)) return id;
  const legacy = id.replace(/^([a-z]+)-99-/, "$1-100-");
  return legacy === id ? null : legacy;
}

/** Tier ids the app understands after the rename. */
export type NormalizedTier = "30s" | "60s" | "99s" | "theater" | string;

/**
 * Map a possibly-legacy tier value to its current id. Only `"100s"` → `"99s"`;
 * everything else passes through untouched (incl. legacy `"90s"` which other
 * code already aliases visually). Idempotent.
 */
export function normalizeTier<T extends string | null | undefined>(
  t: T,
): T extends string ? NormalizedTier : T {
  return (t === "100s" ? "99s" : t) as any;
}
