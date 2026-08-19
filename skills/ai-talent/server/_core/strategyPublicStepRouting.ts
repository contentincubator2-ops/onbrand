export type AuthorizedStrategyProvider = "anthropic" | "openai";

export type StrategyStepAttemptResult<T> =
  | {
      ok: true;
      value: T;
      provider: AuthorizedStrategyProvider;
      attempt: 1 | 2;
      errorCode: null;
    }
  | {
      ok: false;
      error: Error;
      provider: AuthorizedStrategyProvider;
      attempt: 1 | 2;
      errorCode: "step_timeout" | "step_provider_failed" | "step_all_providers_failed";
    };

/** Mirrors quickTaskOrchestra's authorized-provider split: Anthropic 55%, OpenAI 45%. */
export function selectAuthorizedStrategyProvider(
  randomValue: number,
): AuthorizedStrategyProvider {
  return randomValue < 0.55 ? "anthropic" : "openai";
}

export function alternateAuthorizedStrategyProvider(
  provider: AuthorizedStrategyProvider,
): AuthorizedStrategyProvider {
  return provider === "anthropic" ? "openai" : "anthropic";
}

export function hasStrategyFallbackBudget(
  deadlineAt: number,
  now: number,
  minimumFallbackMs = 5_000,
): boolean {
  return deadlineAt - now >= minimumFallbackMs;
}

export function hasStrategySynthesisBudget({
  routeStartedAt,
  now,
  routeLimitMs = 125_000,
  synthesisDeadlineMs = 55_000,
}: {
  routeStartedAt: number;
  now: number;
  routeLimitMs?: number;
  synthesisDeadlineMs?: number;
}): boolean {
  return routeStartedAt + routeLimitMs - now >= synthesisDeadlineMs;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

async function executeBeforeDeadline<T>({
  execute,
  provider,
  deadlineAt,
  now,
}: {
  execute: (provider: AuthorizedStrategyProvider) => Promise<T>;
  provider: AuthorizedStrategyProvider;
  deadlineAt: number;
  now: () => number;
}): Promise<T> {
  const remainingMs = deadlineAt - now();
  if (remainingMs <= 0) throw new Error("strategy step deadline exceeded");

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      execute(provider),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("strategy step deadline exceeded")), remainingMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function runAuthorizedStrategyStep<T>({
  selectedProvider,
  deadlineAt,
  execute,
  now = Date.now,
  minimumFallbackMs = 5_000,
}: {
  selectedProvider: AuthorizedStrategyProvider;
  deadlineAt: number;
  execute: (provider: AuthorizedStrategyProvider) => Promise<T>;
  now?: () => number;
  minimumFallbackMs?: number;
}): Promise<StrategyStepAttemptResult<T>> {
  try {
    const value = await executeBeforeDeadline({ execute, provider: selectedProvider, deadlineAt, now });
    return { ok: true, value, provider: selectedProvider, attempt: 1, errorCode: null };
  } catch (firstError) {
    if (!hasStrategyFallbackBudget(deadlineAt, now(), minimumFallbackMs)) {
      const error = toError(firstError);
      return {
        ok: false,
        error,
        provider: selectedProvider,
        attempt: 1,
        errorCode: /deadline|timeout/i.test(error.message) ? "step_timeout" : "step_provider_failed",
      };
    }

    const fallbackProvider = alternateAuthorizedStrategyProvider(selectedProvider);
    try {
      const value = await executeBeforeDeadline({ execute, provider: fallbackProvider, deadlineAt, now });
      return { ok: true, value, provider: fallbackProvider, attempt: 2, errorCode: null };
    } catch (fallbackError) {
      const error = toError(fallbackError);
      return {
        ok: false,
        error,
        provider: fallbackProvider,
        attempt: 2,
        errorCode: /deadline|timeout/i.test(error.message) ? "step_timeout" : "step_all_providers_failed",
      };
    }
  }
}
