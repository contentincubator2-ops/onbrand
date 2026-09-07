/**
 * activationTelemetry.ts — log activation-funnel milestones to ops.logError
 * (level: "info"). Server-side dedupe via MIN(createdAt) per (userId, stage),
 * so client just fires; the admin dashboard computes "first occurrence" + TTFV.
 *
 * 2026-06-21 (CJ「量 TTFV」): created. Reuses the analytics piggyback pattern
 * established for mia.nudge.* events — no new table needed.
 *
 * Funnel order:
 *   1. register_completed       — first successful registration (RegisterPage)
 *   2. first_brand_created      — Wizard creates the first brand
 *   3. express_brain_ready      — runInterim completed (~30s after #2)
 *   4. first_theater_arrived    — first time hitting /theater?firstTime=1
 *   5. first_week_generated     — first 7-day batch of cards completed
 *
 * TTFV = time between #1 and #5 for the same userId.
 */

export type ActivationStage =
  | "register_completed"
  | "first_brand_created"
  | "express_brain_ready"
  | "first_theater_arrived"
  | "first_week_generated";

/**
 * Fire an activation milestone. Per-user dedupe happens server-side via
 * MIN(createdAt) — client may fire multiple times across sessions, the
 * dashboard takes the first occurrence per (userId, stage).
 *
 * Local sessionStorage flag avoids re-firing the same stage within one
 * tab session (saves on duplicate network calls; doesn't affect dedupe
 * correctness).
 */
export function logActivation(
  stage: ActivationStage,
  meta?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  const sessionKey = `activation.${stage}.fired`;
  try {
    if (sessionStorage.getItem(sessionKey) === "1") return;
    sessionStorage.setItem(sessionKey, "1");
  } catch { /* private-mode / quota — fall through, just network noise */ }

  try {
    const body = {
      "0": {
        level: "info",
        source: `activation.${stage}`,
        route: window.location.pathname,
        message: stage,
        fingerprint: `activation:${stage}`,
        meta: {
          ...meta,
          firedAt: new Date().toISOString(),
          ua: navigator.userAgent.slice(0, 200),
        },
      },
    };
    fetch("/trpc/ops.logError?batch=1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
    }).catch(() => { /* never throws */ });
  } catch { /* swallow */ }
}
