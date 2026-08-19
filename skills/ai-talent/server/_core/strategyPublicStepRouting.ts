export type AuthorizedStrategyProvider = "anthropic" | "openai";

export type StrategyStepAttemptTrace = {
  attempt1Provider: AuthorizedStrategyProvider;
  attempt1Error: string | null;
  attempt2Provider: AuthorizedStrategyProvider | null;
  attempt2Error: string | null;
};

export type StrategyStepAttemptResult<T> = (
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
    }
) & StrategyStepAttemptTrace;

/**
 * Keep the authorized-provider rotation deterministic: Anthropic first and
 * OpenAI only as its fallback.
 *
 * Production evidence from the four-step strategy run showed that an
 * Anthropic-first step completed in 17,977ms, while every OpenAI-first step
 * reached attempt 2 and then exhausted the shared 25s deadline at 25,000–
 * 25,001ms. Anthropic is therefore viable for this workload (~18s); choosing
 * OpenAI first only consumes the time Anthropic needs to finish.
 *
 * This takes no random input: the signature makes the fixed priority explicit
 * instead of looking like a weighted selection that no longer exists.
 */
export function getPrimaryAuthorizedStrategyProvider(): AuthorizedStrategyProvider {
  return "anthropic";
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

export function hasStrategyStepBudget({
  routeStartedAt,
  now,
  routeLimitMs = 125_000,
  stepDeadlineMs = 25_000,
}: {
  routeStartedAt: number;
  now: number;
  routeLimitMs?: number;
  stepDeadlineMs?: number;
}): boolean {
  return routeStartedAt + routeLimitMs - now >= stepDeadlineMs;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Error.message is not universally safe to log: HTTP provider failures append
 * their response body, which can contain remote diagnostic or content
 * fragments. Preserve only known fixed messages and normalized categories;
 * every returned value is capped even though the canonical strings are short.
 */
export function summarizeStrategyAttemptError(error: unknown): string {
  const normalized = toError(error);
  const message = normalized.message.trim();
  const safeExactMessages = new Set([
    "LLM provider returned empty content",
    "LLM provider returned unsafe reasoning content",
    "LLM provider not configured",
    "[multiModelRouter] Unexpected response structure from LLM",
    "strategy step deadline exceeded",
  ]);
  if (safeExactMessages.has(message)) return message.slice(0, 200);

  const requiredProvider = message.match(/^\[multiModelRouter\] required provider "(anthropic|openai)" is unavailable$/);
  if (requiredProvider) return requiredProvider[0].slice(0, 200);

  const unavailableProvider = message.match(/^LLM provider (anthropic|openai) is temporarily unavailable$/);
  if (unavailableProvider) return unavailableProvider[0].slice(0, 200);

  const httpStatus = message.match(/^LLM invoke failed(?: \([^)]+\))?:\s*(\d{3})\b/i);
  if (httpStatus) return `LLM invoke failed: HTTP ${httpStatus[1]}`.slice(0, 200);
  if (/rate.?limit|too many requests|\b429\b/i.test(message)) return "LLM provider rate limited request";
  if (/unauthori[sz]ed|forbidden|authentication|api.?key|\b401\b|\b403\b/i.test(message)) {
    return "LLM provider authentication or configuration failed";
  }
  if (/timeout|timed out|deadline|abort/i.test(message) || normalized.name === "AbortError") {
    return "LLM provider request timed out or was aborted";
  }

  const safeErrorName = /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(normalized.name)
    ? normalized.name
    : "Error";
  return `${safeErrorName}: unclassified provider failure`.slice(0, 200);
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
    return {
      ok: true,
      value,
      provider: selectedProvider,
      attempt: 1,
      errorCode: null,
      attempt1Provider: selectedProvider,
      attempt1Error: null,
      attempt2Provider: null,
      attempt2Error: null,
    };
  } catch (firstError) {
    const attempt1Error = summarizeStrategyAttemptError(firstError);
    if (!hasStrategyFallbackBudget(deadlineAt, now(), minimumFallbackMs)) {
      const error = toError(firstError);
      return {
        ok: false,
        error,
        provider: selectedProvider,
        attempt: 1,
        errorCode: /deadline|timeout/i.test(error.message) ? "step_timeout" : "step_provider_failed",
        attempt1Provider: selectedProvider,
        attempt1Error,
        attempt2Provider: null,
        attempt2Error: null,
      };
    }

    const fallbackProvider = alternateAuthorizedStrategyProvider(selectedProvider);
    try {
      const value = await executeBeforeDeadline({ execute, provider: fallbackProvider, deadlineAt, now });
      return {
        ok: true,
        value,
        provider: fallbackProvider,
        attempt: 2,
        errorCode: null,
        attempt1Provider: selectedProvider,
        attempt1Error,
        attempt2Provider: fallbackProvider,
        attempt2Error: null,
      };
    } catch (fallbackError) {
      const error = toError(fallbackError);
      return {
        ok: false,
        error,
        provider: fallbackProvider,
        attempt: 2,
        errorCode: /deadline|timeout/i.test(error.message) ? "step_timeout" : "step_all_providers_failed",
        attempt1Provider: selectedProvider,
        attempt1Error,
        attempt2Provider: fallbackProvider,
        attempt2Error: summarizeStrategyAttemptError(fallbackError),
      };
    }
  }
}
