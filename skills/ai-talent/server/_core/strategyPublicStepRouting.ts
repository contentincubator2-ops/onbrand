export const STRATEGY_STEP_PROVIDER = "anthropic" as const;
export const STRATEGY_STEP_DEADLINE_MS = 40_000;
export const STRATEGY_SCOUT_BUDGET_MS = 12_000;
export const STRATEGY_PERSISTENCE_BUDGET_MS = 4_000;
export const STRATEGY_SERVER_TIMEOUT_MS = 220_000;
export const STRATEGY_FINALIZATION_RESERVE_MS = 15_000;

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
 * With today's four steps that is 12s + (4 * 40s) + 4s = 176s. The admission
 * deadline is 220s - 15s = 205s, reserving about 4s for persistence and 11s
 * for response work / scheduling jitter. `hasStrategyStepBudget` applies that
 * deadline before every DB step, so a longer squad is stopped before starting
 * a step that cannot finish inside the route budget.
 */
export function deriveStrategyRouteBudget({
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

  const planningWorstCaseMs = scoutBudgetMs + (stepCount * stepDeadlineMs);
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
