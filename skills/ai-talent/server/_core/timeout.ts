/**
 * timeoutPromise — race a promise against a timeout. Returns the
 * promise's value or throws `${label} exceeded ${ms}ms` after the
 * deadline.
 *
 * Extracted 2026-05-08 (P0-D) from quickTaskOrchestra.ts so any
 * outbound LLM / fetch / DB call can wrap itself without re-implementing.
 */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/** Hard ceiling for any single LLM round-trip. Provider hangs are the
 *  #1 cause of stuck tasks — always wrap LLM calls in this. */
export const LLM_HARD_TIMEOUT_MS = 90_000;

/** Daily cost cap per user (USD). Plan-aware fair-use caps.
 *  Trial =  $3 (tight; pushes upgrade)
 *  Solo  =  $5 (typical light/medium user fits well under)
 *  Studio = $15 (3 brands × $5 budget per brand)
 *  Enterprise / agency = unlimited (preflightCostCheck bypasses) */
export const DAILY_USD_CAP_TRIAL  = 3;
export const DAILY_USD_CAP_SOLO   = 5;
export const DAILY_USD_CAP_STUDIO = 15;
/** @deprecated kept for back-compat with older imports — alias for Solo cap. */
export const DAILY_USD_CAP_PAID   = DAILY_USD_CAP_SOLO;

/** Pre-flight credits floor — refuse new LLM calls if wallet under this. */
export const MIN_CREDITS_TO_RUN = 10;
