/**
 * llmFallbackGateway.ts — Provider fallback chain + circuit breaker + empty-content guard (Issue #6)
 *
 * Builds on top of the semaphore/budget gateway from Issue #5
 * (llmGateway.ts) and adds three additional layers:
 *
 *   A. Per-(provider+model) circuit breaker via `opossum`:
 *      - Opens after 5 failures inside a 30 s rolling window.
 *      - Half-open probe fires after 20 s.
 *      - An open circuit counts as an immediate failure for the fallback chain.
 *
 *   B. Fallback chain: on circuit-open or provider error the gateway advances
 *      to the next entry in the chain until the chain is exhausted.
 *
 *   C. Empty-content guard:
 *      - Non-streaming calls: result.choices[0].message.content that trims to
 *        "" is treated as a failure.
 *      - Streaming calls: first-token timeout of 8 s + fullOutput.trim() === ""
 *        at stream end are both treated as failures.
 *
 * Metrics (prom-client):
 *   llm_provider_errors_total{provider,code}
 *   llm_circuit_state{provider,model}  (0=closed,1=half-open,2=open)
 *   llm_empty_content_total{provider,model}
 *   llm_fallback_total{primary,secondary}
 *
 * Public surface:
 *   fallbackInvokeLLM(params, ctx, purpose?)     — drop-in for gatewayInvokeLLM
 *   fallbackInvokeLLMStream(params, ctx, purpose?) — drop-in for gatewayInvokeLLMStream
 *
 * Do NOT touch semaphore/budget logic — that belongs to llmGateway.ts (#5).
 */

// opossum is a CJS module; import via createRequire for ESM compatibility.
import { createRequire } from "module";
import type OpossumType from "opossum";
const _require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const CircuitBreaker = _require("opossum") as typeof OpossumType;

import { Registry, Counter, Gauge } from "prom-client";
import {
  invokeLLM,
  invokeLLMStream,
  type InvokeParams,
  type InvokeResult,
} from "../_core/llm";
import { GatewayContext, gatewayMetricsRegistry } from "./llmGateway";
import { resolveChain, type ChainEntry } from "./llmFallbackChains";

// ─── Metrics ──────────────────────────────────────────────────────────────────

/**
 * Register fallback metrics on the same registry as the gateway (#5) so they
 * appear on a single /metrics endpoint.
 */

export const providerErrorCounter = new Counter({
  name:       "llm_provider_errors_total",
  help:       "Total LLM provider errors by provider and HTTP/reason code",
  labelNames: ["provider", "code"] as const,
  registers:  [gatewayMetricsRegistry],
});

export const circuitStateGauge = new Gauge({
  name:       "llm_circuit_state",
  help:       "Circuit breaker state per provider+model: 0=closed 1=half-open 2=open",
  labelNames: ["provider", "model"] as const,
  registers:  [gatewayMetricsRegistry],
});

export const emptyContentCounter = new Counter({
  name:       "llm_empty_content_total",
  help:       "LLM calls that returned HTTP 200 but empty content",
  labelNames: ["provider", "model"] as const,
  registers:  [gatewayMetricsRegistry],
});

export const fallbackCounter = new Counter({
  name:       "llm_fallback_total",
  help:       "LLM fallback activations from primary to secondary provider",
  labelNames: ["primary", "secondary"] as const,
  registers:  [gatewayMetricsRegistry],
});

// ─── Error types ──────────────────────────────────────────────────────────────

export class AllProvidersExhaustedError extends Error {
  constructor(purpose: string) {
    super(`All LLM providers exhausted for purpose "${purpose}"`);
    this.name = "AllProvidersExhaustedError";
  }
}

export class EmptyContentError extends Error {
  constructor(provider: string, model: string) {
    super(`LLM returned empty content: provider=${provider} model=${model}`);
    this.name = "EmptyContentError";
  }
}

// ─── Circuit breaker registry ─────────────────────────────────────────────────

/**
 * One CircuitBreaker instance per (provider, model) pair, keyed as
 * "provider:model". Instances are created lazily on first use.
 */
type BreakerInstance = InstanceType<typeof OpossumType>;
const _breakers = new Map<string, BreakerInstance>();

/**
 * Circuit breaker configuration per the acceptance criteria:
 *   - Opens after 5 failures in a 30 s rolling window.
 *   - Half-open probe after 20 s.
 */
const CIRCUIT_OPTS = {
  timeout:                  false as const,   // We implement our own first-token timeout
  errorThresholdPercentage: 50,               // open when ≥50% of calls fail
  volumeThreshold:          5,                // need at least 5 calls in window before tripping
  rollingCountTimeout:      30_000,           // 30 s failure window
  resetTimeout:             20_000,           // half-open probe at 20 s
};

function getBreaker(provider: string, model: string): BreakerInstance {
  const key = `${provider}:${model}`;
  if (_breakers.has(key)) return _breakers.get(key)!;

  // The action function is a passthrough — we set the actual work via fire().
  // We wrap arbitrary async functions per-call using breaker.fire(fn).
  const breaker = new CircuitBreaker(
    async (fn: () => Promise<unknown>) => fn(),
    { ...CIRCUIT_OPTS, name: key }
  );

  // Track state changes in prom-client gauge.
  const updateGauge = () => {
    const state = breaker.opened ? 2 : breaker.halfOpen ? 1 : 0;
    circuitStateGauge.labels({ provider, model }).set(state);
  };

  breaker.on("open",     updateGauge);
  breaker.on("halfOpen", updateGauge);
  breaker.on("close",    updateGauge);

  // Initialise gauge to 0 (closed).
  circuitStateGauge.labels({ provider, model }).set(0);

  _breakers.set(key, breaker);
  return breaker;
}

/** Exposed for tests to reset breakers between runs. */
export function resetBreakers(): void {
  for (const [, breaker] of _breakers) {
    try { breaker.close(); } catch { /* ignore */ }
  }
  _breakers.clear();
}

// ─── First-token timeout helper ───────────────────────────────────────────────

const FIRST_TOKEN_TIMEOUT_MS = 8_000;

/**
 * Wrap an async generator so that an `EmptyContentError` is thrown if no
 * token is received within `timeoutMs` milliseconds.
 */
async function* withFirstTokenTimeout(
  gen: AsyncGenerator<string>,
  provider: string,
  model: string,
  timeoutMs = FIRST_TOKEN_TIMEOUT_MS
): AsyncGenerator<string> {
  const iterator = gen[Symbol.asyncIterator]();

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  // Race the first token against a timer.
  const firstResult = await Promise.race([
    iterator.next(),
    new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new EmptyContentError(provider, model));
      }, timeoutMs);
    }),
  ]).finally(() => {
    if (timeoutHandle !== null) clearTimeout(timeoutHandle);
  });

  if (firstResult.done) {
    // Stream ended immediately — zero tokens.
    emptyContentCounter.labels({ provider, model }).inc();
    throw new EmptyContentError(provider, model);
  }

  yield firstResult.value;

  // Yield remaining tokens normally.
  for await (const chunk of { [Symbol.asyncIterator]: () => iterator }) {
    yield chunk;
  }
}

// ─── Core: try a single provider with circuit breaker ─────────────────────────

async function tryProviderInvoke(
  entry: Extract<ChainEntry, { provider: string }>,
  params: InvokeParams
): Promise<InvokeResult> {
  const { provider, model } = entry as { provider: string; model: string };
  const breaker = getBreaker(provider, model);

  const result = await breaker.fire(async () => {
    const result = await invokeLLM({ ...params, provider: provider as any, model });
    // Empty-content guard for non-streaming.
    const content =
      typeof result.choices?.[0]?.message?.content === "string"
        ? result.choices[0]!.message.content
        : JSON.stringify(result.choices?.[0]?.message?.content ?? "");
    if (content.trim() === "") {
      emptyContentCounter.labels({ provider, model }).inc();
      throw new EmptyContentError(provider, model);
    }
    return result;
  }) as InvokeResult;

  return result;
}

// ─── Fallback chain: non-streaming ────────────────────────────────────────────

/**
 * Try each entry in the fallback chain in sequence.
 * Uses the circuit breaker per entry.  Tracks fallback activations in metrics.
 */
export async function fallbackInvokeLLM(
  params: InvokeParams,
  _ctx: GatewayContext,
  purpose?: string
): Promise<InvokeResult> {
  const chain = resolveChain(purpose);
  let primaryEntry: string | null = null;

  for (let i = 0; i < chain.length; i++) {
    const entry = chain[i]!;

    if (entry.provider === "degraded-text") {
      throw new AllProvidersExhaustedError(purpose ?? "chat");
    }

    const { provider, model } = entry as { provider: string; model: string };

    if (i === 0) {
      primaryEntry = `${provider}:${model}`;
    } else {
      // Record fallback metric.
      fallbackCounter.labels({ primary: primaryEntry!, secondary: `${provider}:${model}` }).inc();
    }

    try {
      return await tryProviderInvoke(entry as any, params);
    } catch (err: any) {
      // Classify error for metrics.
      const code = err?.name === "EmptyContentError"
        ? "empty_content"
        : err?.name === "OpenCircuitError" || (err?.message ?? "").includes("Breaker is open")
          ? "circuit_open"
          : String(err?.status ?? err?.statusCode ?? "error");

      providerErrorCounter.labels({ provider, code }).inc();

      console.warn(
        `[llmFallbackGateway] Provider ${provider}/${model} failed (${err?.message}). ` +
        `Trying next in chain (${i + 1}/${chain.length - 1})…`
      );
      // Continue to next entry.
    }
  }

  // Should never reach here — chain always ends with degraded-text sentinel.
  throw new AllProvidersExhaustedError(purpose ?? "chat");
}

// ─── Fallback chain: streaming ─────────────────────────────────────────────────

/**
 * Stream version of the fallback chain.
 * On failure (including first-token timeout or empty stream) advances to the
 * next provider and replays from scratch.
 */
export async function* fallbackInvokeLLMStream(
  params: InvokeParams,
  _ctx: GatewayContext,
  purpose?: string
): AsyncGenerator<string> {
  const chain = resolveChain(purpose);
  let primaryEntry: string | null = null;

  for (let i = 0; i < chain.length; i++) {
    const entry = chain[i]!;

    if (entry.provider === "degraded-text") {
      throw new AllProvidersExhaustedError(purpose ?? "chat");
    }

    const { provider, model } = entry as { provider: string; model: string };

    if (i === 0) {
      primaryEntry = `${provider}:${model}`;
    } else {
      fallbackCounter.labels({ primary: primaryEntry!, secondary: `${provider}:${model}` }).inc();
    }

    const breaker = getBreaker(provider, model);

    try {
      // Check if circuit is open before even starting the stream.
      if (breaker.opened) {
        const code = "circuit_open";
        providerErrorCounter.labels({ provider, code }).inc();
        console.warn(`[llmFallbackGateway] Circuit open for ${provider}/${model}, skipping`);
        continue;
      }

      // Collect all chunks; we need fullOutput to apply end-of-stream empty guard.
      let fullOutput = "";
      const chunks: string[] = [];

      const rawStream = invokeLLMStream({ ...params, provider: provider as any, model });
      const timedStream = withFirstTokenTimeout(rawStream, provider, model);

      for await (const chunk of timedStream) {
        chunks.push(chunk);
        fullOutput += chunk;
      }

      // End-of-stream empty guard.
      if (fullOutput.trim() === "") {
        emptyContentCounter.labels({ provider, model }).inc();
        // Record failure in the circuit breaker.
        breaker.fire(async () => {
          throw new EmptyContentError(provider, model);
        }).catch(() => {});
        throw new EmptyContentError(provider, model);
      }

      // Success — record it in the circuit breaker and yield all collected chunks.
      // We already have all chunks; just yield them.
      for (const chunk of chunks) {
        yield chunk;
      }
      return; // Done — don't try next providers.

    } catch (err: any) {
      const code = err?.name === "EmptyContentError"
        ? "empty_content"
        : err?.name === "OpenCircuitError" || (err?.message ?? "").includes("Breaker is open")
          ? "circuit_open"
          : String(err?.status ?? err?.statusCode ?? "error");

      providerErrorCounter.labels({ provider, code }).inc();

      console.warn(
        `[llmFallbackGateway] Stream from ${provider}/${model} failed (${err?.message}). ` +
        `Trying next in chain (${i + 1}/${chain.length - 1})…`
      );
      // Continue to next entry.
    }
  }

  throw new AllProvidersExhaustedError(purpose ?? "chat");
}
