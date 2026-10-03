export const STRATEGY_STEP_PROVIDER = "anthropic" as const;
/**
 * 2026-08-20 — raised from 40s on the first real measurements.
 *
 * Until the deadline was lifted off 25s no planning step had ever been allowed
 * to finish, so every recorded latency was the deadline itself and told us
 * nothing. strategy_internal_step_artifacts now holds completions, and they
 * land uncomfortably close to the 40s cap:
 *
 *   7,242  21,601  26,814  27,527  28,372  32,125
 *   35,705  36,065  36,291  37,227  37,487  37,683   (ms, status=done)
 *
 * Three of those cleared by under 3s, and on 2026-08-20 04:15 an entire
 * ig-baer-youtility run failed with all four steps at exactly 40,000ms. The cap
 * was sitting inside the distribution, not outside it.
 *
 * 45s keeps the same number of rounds — floor((205s - 12s scout) / 45s) is
 * still 4 — so no squad changes shape, and the four- and five-step squads gain
 * headroom over the observed tail:
 *
 *   4 steps, 4 rounds: 12 + 4*45 = 192s   (route guard 205s, socket 220s)
 *   5 steps, 4 rounds: 12 + 4*45 = 192s   (leading pair merges)
 *
 * It does not rescue ig-chrisdo-visual-story. Its seven steps have a
 * dependency-preserving minimum of five rounds — [0,1] then [2] then [3,4]
 * then [5] then [6] — and five rounds do not fit: 12 + 5*45 = 237s against a
 * 205s guard. Only four rounds fit, and reaching four means merging the
 * caption variant with its image/video siblings (which it feeds) or merging
 * the audit step with the work it audits.
 *
 * Precisely: that squad has no layout whose WORST case fits. A run whose steps
 * happen to finish quickly can still complete, because admission is checked
 * against elapsed time rather than the worst case. It needs fewer steps or
 * planning moved off the request — not another constant.
 */
export const STRATEGY_STEP_DEADLINE_MS = 45_000;
/**
 * Ceiling on how many planning steps may share a round. Nothing cancels a
 * timed-out provider call (llm.ts's Anthropic branch passes no signal), so each
 * concurrent step that overruns leaves a ghost request; llmCircuitBreaker is
 * process-global and opens Anthropic for every feature after three failures in
 * a four-sample window. Two keeps that exposure close to sequential.
 */
export const MAX_CONCURRENT_PLANNING_STEPS = 2;
/**
 * How many rounds may be merged at all. One: the leading pair, whose members
 * are the steps with the fewest upstream dependencies. Merging deeper into the
 * list would need dependency metadata the step list does not carry.
 */
export const MAX_MERGED_PLANNING_ROUNDS = 1;
export const STRATEGY_SCOUT_BUDGET_MS = 12_000;
export const STRATEGY_PERSISTENCE_BUDGET_MS = 4_000;
/**
 * Keep this synchronized with the `server.timeout = ...` socket-inactivity
 * assignment in server/index.ts's HTTP server timeout block. If this is higher
 * than the real socket limit, the admission gate can start work that Node cuts
 * off before persistence; if it is lower, valid DB steps are rejected early.
 * strategyPublicStepRouting.test.ts asserts the two source values stay equal
 * without introducing a runtime import from the server entrypoint.
 */
export const STRATEGY_SERVER_TIMEOUT_MS = 220_000;
export const STRATEGY_FINALIZATION_RESERVE_MS = 15_000;

/**
 * Strategy planning asks zh-TW steps for at most 800 characters. Production
 * nevertheless showed three repurposed-content steps reaching the old 2,048
 * token cap in 19,667-25,749ms, because those steps have several deliverables
 * and a soft aggregate length instruction did not stop the model first.
 *
 * 3,072 is the old measured cap plus 50%. Applying the same 1.5x factor to the
 * slowest measured completion projects 38,624ms, leaving 6,376ms inside the
 * unchanged 45s deadline. This remains a finite runaway backstop while giving
 * the strengthened aggregate prompt room to finish instead of relying on an
 * exact 2,048-token boundary.
 */
export const STRATEGY_STEP_BASELINE_MAX_TOKENS = 2_048;
export const STRATEGY_STEP_TOKEN_HEADROOM_NUMERATOR = 3;
export const STRATEGY_STEP_TOKEN_HEADROOM_DENOMINATOR = 2;
export const STRATEGY_STEP_MAX_TOKENS = Math.floor(
  STRATEGY_STEP_BASELINE_MAX_TOKENS
    * STRATEGY_STEP_TOKEN_HEADROOM_NUMERATOR
    / STRATEGY_STEP_TOKEN_HEADROOM_DENOMINATOR,
);
export const STRATEGY_STEP_OBSERVED_MAX_LATENCY_MS = 25_749;
export const STRATEGY_STEP_ZH_TW_CHAR_LIMIT = 800;
/**
 * A token-limited response is useful synthesis material once it contains at
 * least one quarter of the requested 800-character zh-TW planning envelope.
 * That is 200 characters: enough for several concrete sentences, while still
 * rejecting empty/tiny provider fragments. Real max-token responses are much
 * larger; this threshold is a corruption guard, not a relaxed output target.
 */
export const MIN_USABLE_TRUNCATED_STRATEGY_STEP_CHARS = Math.floor(
  STRATEGY_STEP_ZH_TW_CHAR_LIMIT / 4,
);

/**
 * Anthropic's stop_reason is normalized by llm.ts into finish_reason, where
 * its token cap is `max_tokens`; OpenAI-compatible providers use `length`.
 * Keep this classifier strategy-local so other strict callers retain their
 * existing treatment of otherwise usable partial responses.
 */
export function getStrategyStepFinishErrorCode(
  finishReason: string | null | undefined,
): "step_truncated" | null {
  const normalized = finishReason?.trim().toLowerCase();
  return normalized === "max_tokens" || normalized === "length"
    ? "step_truncated"
    : null;
}

export function isUsableTruncatedStrategyStepContent(content: string): boolean {
  return Array.from(content.trim()).length >= MIN_USABLE_TRUNCATED_STRATEGY_STEP_CHARS;
}

export type StrategyRouteBudget = {
  routeLimitMs: number;
  stepDeadlineMs: number;
  planningWorstCaseMs: number;
  synchronousWorstCaseMs: number;
  routeHeadroomMs: number;
  serverHeadroomMs: number;
  fitsRouteBudget: boolean;
};

/**
 * Derive the strategy route budget from the DB-owned step count and the
 * current server socket limit instead of assuming that every squad has four
 * steps. The synchronous worst case is:
 *
 *   scout + (step count * per-step deadline) + persistence
 *
 * With today's four steps that is 12s + (4 * 45s) + 4s = 196s. The admission
 * deadline is 220s - 15s = 205s, reserving about 4s for persistence and 11s
 * for response work / scheduling jitter. `hasStrategyStepBudget` applies that
 * deadline before every DB step, so a longer squad is stopped before starting
 * a step that cannot finish inside the route budget.
 */
export function deriveStrategyRouteBudget({
  stepCount,
  serverTimeoutMs,
  waveCount = stepCount,
  scoutBudgetMs = STRATEGY_SCOUT_BUDGET_MS,
  stepDeadlineMs = STRATEGY_STEP_DEADLINE_MS,
  persistenceBudgetMs = STRATEGY_PERSISTENCE_BUDGET_MS,
  finalizationReserveMs = STRATEGY_FINALIZATION_RESERVE_MS,
}: {
  stepCount: number;
  serverTimeoutMs: number;
  /**
   * How many sequential rounds the planning steps actually take. Defaults to
   * stepCount — one round per step, which is what a plain loop does. See
   * planStrategyPlanning for when it is lower.
   */
  waveCount?: number;
  scoutBudgetMs?: number;
  stepDeadlineMs?: number;
  persistenceBudgetMs?: number;
  finalizationReserveMs?: number;
}): StrategyRouteBudget {
  if (!Number.isInteger(stepCount) || stepCount < 0) {
    throw new RangeError("strategy step count must be a non-negative integer");
  }
  for (const [name, value] of Object.entries({
    serverTimeoutMs,
    scoutBudgetMs,
    stepDeadlineMs,
    persistenceBudgetMs,
    finalizationReserveMs,
  })) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative finite number`);
    }
  }
  if (finalizationReserveMs > serverTimeoutMs) {
    throw new RangeError("strategy finalization reserve exceeds server timeout");
  }

  if (!Number.isInteger(waveCount) || waveCount < 0) {
    throw new RangeError("strategy wave count must be a non-negative integer");
  }
  if (waveCount > stepCount) {
    throw new RangeError("strategy wave count cannot exceed the step count");
  }

  const planningWorstCaseMs = scoutBudgetMs + (waveCount * stepDeadlineMs);
  const synchronousWorstCaseMs = planningWorstCaseMs + persistenceBudgetMs;
  const routeLimitMs = serverTimeoutMs - finalizationReserveMs;
  return {
    routeLimitMs,
    stepDeadlineMs,
    planningWorstCaseMs,
    synchronousWorstCaseMs,
    routeHeadroomMs: routeLimitMs - planningWorstCaseMs,
    serverHeadroomMs: serverTimeoutMs - synchronousWorstCaseMs,
    fitsRouteBudget: planningWorstCaseMs <= routeLimitMs,
  };
}

export function hasStrategyStepBudget({
  routeStartedAt,
  now,
  routeLimitMs,
  stepDeadlineMs,
}: {
  routeStartedAt: number;
  now: number;
  routeLimitMs: number;
  stepDeadlineMs: number;
}): boolean {
  return routeStartedAt + routeLimitMs - now >= stepDeadlineMs;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

async function executeBeforeDeadline<T>({
  execute,
  deadlineAt,
  now,
}: {
  execute: () => Promise<T>;
  deadlineAt: number;
  now: () => number;
}): Promise<T> {
  const remainingMs = deadlineAt - now();
  if (remainingMs <= 0) throw new Error("strategy step deadline exceeded");

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      execute(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("strategy step deadline exceeded")), remainingMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type StrategyStepResult<T> =
  | {
      ok: true;
      value: T;
      provider: typeof STRATEGY_STEP_PROVIDER;
      attempt: 1;
      errorCode: null;
    }
  | {
      ok: false;
      error: Error;
      provider: typeof STRATEGY_STEP_PROVIDER;
      attempt: 1;
      errorCode: "step_timeout" | "step_provider_failed";
    };

/**
 * Give the production-proven Anthropic path the entire step deadline. OpenAI
 * is intentionally not a fallback: production showed it cannot complete this
 * workload, while a shared deadline left no usable time for attempt two.
 */
export async function runAnthropicStrategyStep<T>({
  deadlineAt,
  execute,
  now = Date.now,
}: {
  deadlineAt: number;
  execute: () => Promise<T>;
  now?: () => number;
}): Promise<StrategyStepResult<T>> {
  try {
    const value = await executeBeforeDeadline({ execute, deadlineAt, now });
    return {
      ok: true,
      value,
      provider: STRATEGY_STEP_PROVIDER,
      attempt: 1,
      errorCode: null,
    };
  } catch (cause) {
    const error = toError(cause);
    return {
      ok: false,
      error,
      provider: STRATEGY_STEP_PROVIDER,
      attempt: 1,
      errorCode: /deadline|timeout/i.test(error.message) ? "step_timeout" : "step_provider_failed",
    };
  }
}

/**
 * 2026-08-20 — how many rounds the planning steps are allowed to take, and
 * which steps share a round.
 *
 * Running one step per round makes the route's wall clock grow with whatever
 * step count the DB happens to hold, and the admission guard then refuses the
 * tail: a five-step squad needs 12s + 5*45s = 237s against a 205s guard, so
 * its last step never starts, the private-artifact gate fails and the whole
 * public campaign is lost.
 *
 * Running everything after step 1 together fixes the arithmetic but breaks the
 * work. ig-chrisdo-visual-story genuinely chains — the caption step writes
 * against the visual-content step, the audit step reviews what came before —
 * and prevOutputs feeds each step its two predecessors precisely because of
 * that. So parallelise as little as possible: keep one step per round, and
 * only when the budget cannot fit them all, merge the *leading* steps, which
 * are the ones with the fewest upstream dependencies.
 *
 *   4 steps, 4 rounds available  -> [[0],[1],[2],[3]]    fully sequential
 *   5 steps, 4 rounds available  -> [[0,1],[2],[3],[4]]  the leading pair merges
 *   6 steps, 4 rounds available  -> five rounds, reported as not fitting
 *
 * Peak concurrency is therefore two, and only ever for the first two steps.
 * That matters: nothing cancels a timed-out provider call
 * (llm.ts's Anthropic branch passes no signal), so every concurrent step that
 * overruns leaves a ghost request behind, and llmCircuitBreaker is
 * process-global — three failures inside a four-sample window open Anthropic
 * for every other feature too.
 */
export function planStrategyPlanning({
  stepCount,
  serverTimeoutMs,
  scoutBudgetMs = STRATEGY_SCOUT_BUDGET_MS,
  stepDeadlineMs = STRATEGY_STEP_DEADLINE_MS,
  persistenceBudgetMs = STRATEGY_PERSISTENCE_BUDGET_MS,
  finalizationReserveMs = STRATEGY_FINALIZATION_RESERVE_MS,
}: {
  stepCount: number;
  serverTimeoutMs: number;
  scoutBudgetMs?: number;
  stepDeadlineMs?: number;
  persistenceBudgetMs?: number;
  finalizationReserveMs?: number;
}): { waves: number[][]; budget: StrategyRouteBudget } {
  if (!Number.isFinite(stepDeadlineMs) || stepDeadlineMs <= 0) {
    throw new RangeError("strategy step deadline must be a positive number to plan rounds");
  }
  const shared = { scoutBudgetMs, stepDeadlineMs, persistenceBudgetMs, finalizationReserveMs };
  // Sequential is the reference point; deriving it also validates every input.
  const sequential = deriveStrategyRouteBudget({ stepCount, serverTimeoutMs, ...shared });
  const sequentialWaves = Array.from({ length: stepCount }, (_, i) => [i]);

  const roundsAvailable = Math.floor((sequential.routeLimitMs - scoutBudgetMs) / stepDeadlineMs);
  // No room for even one step: keep the sequential plan so the per-step
  // admission guard is what refuses it and says why. Merging here would be
  // backwards — it would run everything at once on the tightest budget.
  if (roundsAvailable < 1 || stepCount <= roundsAvailable) {
    return {
      waves: sequentialWaves,
      budget: deriveStrategyRouteBudget({
        stepCount,
        serverTimeoutMs,
        waveCount: sequentialWaves.length,
        ...shared,
      }),
    };
  }

  // Each merged pair removes exactly one round. Merge from the front and never
  // beyond MAX_CONCURRENT_PLANNING_STEPS, so a step is at most sharing with one
  // sibling however many steps the DB grows to.
  // Only the leading pair is merged. Pairing further in would need to know the
  // dependency graph, and we do not have one: steps are an ordered list with no
  // edges. ig-chrisdo-visual-story shows why guessing is unsafe — its visual
  // content step and its caption step are a real chain (seed-local-squads.ts),
  // so a positional [2,3] pair would hide the former from the latter. A squad
  // that needs more merging than this reports fitsRouteBudget=false instead.
  const roundsToRemove = stepCount - roundsAvailable;
  const pairCount = Math.min(roundsToRemove, MAX_MERGED_PLANNING_ROUNDS);

  const waves: number[][] = [];
  for (let pair = 0; pair < pairCount; pair += 1) {
    waves.push([pair * 2, (pair * 2) + 1]);
  }
  for (let i = pairCount * 2; i < stepCount; i += 1) waves.push([i]);

  // If the cap could not remove enough rounds, the plan is returned as it is
  // and its budget reports fitsRouteBudget=false rather than quietly running
  // an unbounded number of steps at once.
  return {
    waves,
    budget: deriveStrategyRouteBudget({
      stepCount,
      serverTimeoutMs,
      waveCount: waves.length,
      ...shared,
    }),
  };
}
