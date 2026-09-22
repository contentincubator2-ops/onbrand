/**
 * Per-provider circuit breaker for the LLM router.
 *
 * Problem (2026-05-15): with 100-user trial scale, when a provider has a
 * brief outage (Azure region maintenance, OpenAI 429 storm, Google quota
 * reset window), the LLM router still tries that provider for every call
 * — adds 1-2 RTT of dead weight per task before falling through. Multiply
 * by 100 users × 3 LLM calls per task = real latency tax.
 *
 * Solution: lightweight in-process circuit breaker. Track per-provider
 * failures in a rolling window; if failure rate > threshold within N
 * calls, mark provider "OPEN" for COOLOFF seconds. invokeLLM skips OPEN
 * providers. After cooloff, "HALF_OPEN" → next call attempts; success
 * closes the circuit, failure re-opens for another COOLOFF.
 *
 * Process-local (no Redis). In cluster mode, each worker has its own
 * breaker — that's acceptable since one worker observing failures while
 * another succeeds is a non-issue.
 */

type State = "CLOSED" | "OPEN" | "HALF_OPEN";

interface ProviderStats {
  state: State;
  recentResults: boolean[];   // true=ok, false=fail; rolling window of N
  openedAt: number;           // when state went OPEN (for cooloff)
  halfOpenAt: number;         // when the in-flight probe was let through
  consecutiveFailures: number;
}

const WINDOW_SIZE = 8;            // last N calls considered
const FAILURE_THRESHOLD = 0.625;  // ≥5 of last 8 failures → OPEN
const MIN_CALLS_TO_TRIP = 4;      // need 4 calls in window before tripping
const COOLOFF_MS = 30_000;        // 30s before HALF_OPEN probe
/**
 * 2026-09-21 (CJ「修 LLM cascade」): a HALF_OPEN probe whose outcome never gets
 * recorded used to wedge the provider off FOREVER — shouldAttempt returned
 * false for every later call and nothing could move the state on. That happens
 * whenever the probe's promise is abandoned rather than settled: the orchestra
 * cutting a variant at its budget, a request the client gave up on, a worker
 * killed mid-call. Give the probe a deadline so a provider can always come
 * back on its own.
 */
const HALF_OPEN_TIMEOUT_MS = 60_000;

const stats = new Map<string, ProviderStats>();

function getStats(provider: string): ProviderStats {
  let s = stats.get(provider);
  if (!s) {
    s = { state: "CLOSED", recentResults: [], openedAt: 0, halfOpenAt: 0, consecutiveFailures: 0 };
    stats.set(provider, s);
  }
  return s;
}

/** Returns true if the breaker permits a call (CLOSED or HALF_OPEN probe). */
export function shouldAttempt(provider: string): boolean {
  const s = getStats(provider);
  if (s.state === "CLOSED") return true;
  if (s.state === "OPEN") {
    // Cooloff elapsed? Move to HALF_OPEN so we let ONE call through.
    if (Date.now() - s.openedAt >= COOLOFF_MS) {
      s.state = "HALF_OPEN";
      s.halfOpenAt = Date.now();
      return true;
    }
    return false;
  }
  // HALF_OPEN: we've already let one probe through; until it returns,
  // suppress further calls. Probe result determines next state — unless the
  // probe never reported back, in which case let a fresh one through rather
  // than skipping this provider for the rest of the process's life.
  if (Date.now() - s.halfOpenAt >= HALF_OPEN_TIMEOUT_MS) {
    s.halfOpenAt = Date.now();
    return true;
  }
  return false;
}

/** Record an outcome. Updates breaker state. */
export function recordOutcome(provider: string, success: boolean): void {
  const s = getStats(provider);
  s.recentResults.push(success);
  while (s.recentResults.length > WINDOW_SIZE) s.recentResults.shift();
  s.consecutiveFailures = success ? 0 : s.consecutiveFailures + 1;

  if (s.state === "HALF_OPEN") {
    s.state = success ? "CLOSED" : "OPEN";
    s.halfOpenAt = 0;
    if (!success) s.openedAt = Date.now();
    return;
  }

  if (s.state === "CLOSED" && s.recentResults.length >= MIN_CALLS_TO_TRIP) {
    const failures = s.recentResults.filter((r) => !r).length;
    const failureRate = failures / s.recentResults.length;
    if (failureRate >= FAILURE_THRESHOLD) {
      s.state = "OPEN";
      s.openedAt = Date.now();
      console.warn(
        `[llmCircuitBreaker] provider=${provider} → OPEN (` +
          `${failures}/${s.recentResults.length} failed, cooloff ${COOLOFF_MS}ms)`,
      );
    }
  }
}

/** Debug / admin dashboard. */
export function snapshot(): Array<{
  provider: string;
  state: State;
  recentFailures: number;
  recentTotal: number;
  consecutiveFailures: number;
  openedMsAgo: number;
}> {
  const now = Date.now();
  return Array.from(stats.entries()).map(([provider, s]) => ({
    provider,
    state: s.state,
    recentFailures: s.recentResults.filter((r) => !r).length,
    recentTotal: s.recentResults.length,
    consecutiveFailures: s.consecutiveFailures,
    openedMsAgo: s.openedAt ? now - s.openedAt : 0,
  }));
}

/** Force-close (manual recovery). */
export function reset(provider?: string): void {
  if (provider) stats.delete(provider);
  else stats.clear();
}

/**
 * Permanent failure — open circuit for 1 hour (vs. the normal 30s cooloff).
 * Use for errors that are NOT transient: DeploymentNotFound, invalid endpoint,
 * wrong model name, etc. The cascade will skip this provider for 60 minutes
 * instead of retrying every 30s and burning RTTs on a known-bad config.
 */
const PERMANENT_COOLOFF_MS = 60 * 60 * 1_000; // 1 hour
export function permanentFail(provider: string): void {
  const s = getStats(provider);
  s.state = "OPEN";
  // shouldAttempt reopens at openedAt + COOLOFF_MS, so dating openedAt into the
  // future is what buys the full hour. (This used to be assigned twice, the
  // first one dead — same value, but it read like a bug.)
  s.openedAt = Date.now() + PERMANENT_COOLOFF_MS - COOLOFF_MS;
  s.halfOpenAt = 0;
  s.consecutiveFailures = 99;
  s.recentResults = Array(WINDOW_SIZE).fill(false);
  console.warn(`[llmCircuitBreaker] provider=${provider} → OPEN (permanent, 1h cooloff)`);
}
