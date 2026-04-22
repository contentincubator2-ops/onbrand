/**
 * llmGateway.ts — Central LLM Gateway (Issue #5)
 *
 * Enforces three layers of protection before delegating to the underlying
 * invokeLLM / invokeLLMStream primitives:
 *
 *   1. Redis semaphore  user:<id>  cap 3   — prevents a single user from
 *      hammering the provider concurrently.
 *   2. Redis semaphore  org:<id>   cap 15  — per-organisation guard.
 *   3. Redis semaphore  global     cap 120 — hard system-wide ceiling.
 *   4. Daily per-user token budget         — Redis counter incremented after
 *      each successful call; 429 on breach with in-app event.
 *
 * Metrics are exposed via prom-client counters under the name
 * `llm_gateway_rejections_total{reason=user|org|global|budget}`.
 *
 * TODO(#3): Once the notification delivery backbone (PR #3) ships, replace
 * the emitBudgetExceededEvent stub below with a real in-app push.
 *
 * DEBT(#6): Per-provider fallback chain will be implemented in a dedicated PR
 * that builds on top of this gateway.
 */

import { Semaphore, TimeoutError } from "redis-semaphore";
import Redis from "ioredis";
import { Registry, Counter } from "prom-client";
import { ENV } from "../_core/env";
import {
  invokeLLM,
  invokeLLMStream,
  type InvokeParams,
  type InvokeResult,
} from "../_core/llm";

// ─── Redis client ─────────────────────────────────────────────────────────────

/**
 * Return a singleton Redis client.  If REDIS_URL is not configured (local dev,
 * test) the client connects to localhost:6379 with no password.
 */
let _redis: Redis | null = null;

export function getRedisClient(): Redis {
  if (_redis) return _redis;
  const url = ENV.REDIS_URL;
  _redis = url ? new Redis(url, { lazyConnect: false }) : new Redis({ lazyConnect: false });
  _redis.on("error", (err: Error) => {
    // Log but don't crash — gateway degrades gracefully when Redis is down.
    console.error("[llmGateway] Redis error:", err.message);
  });
  return _redis;
}

/** Replace the Redis client (used in tests to inject ioredis-mock). */
export function setRedisClient(client: Redis): void {
  _redis = client;
}

// ─── Semaphore caps ───────────────────────────────────────────────────────────

const USER_CAP   = 3;
const ORG_CAP    = 15;
const GLOBAL_CAP = 120;

/**
 * Semaphore lock TTL in ms.  If the holder crashes the lock is auto-released
 * after this duration.
 */
const SEMAPHORE_LOCK_TTL_MS  = 60_000;
/**
 * How long to wait for a free slot before giving up (non-blocking design).
 * Kept low intentionally — callers get a fast 429, not a 60-second hang.
 */
const SEMAPHORE_ACQUIRE_TIMEOUT_MS = 200;

// ─── Metrics registry ─────────────────────────────────────────────────────────

/**
 * We register on a dedicated registry.  If the host server already exposes a
 * /metrics endpoint via the default prom-client registry this counter will
 * appear there automatically if the caller also registers `gatewayMetricsRegistry`.
 * Otherwise consumers can call `metricsHandler()` to mount a minimal endpoint.
 */
export const gatewayMetricsRegistry = new Registry();

export const rejectionCounter = new Counter({
  name:       "llm_gateway_rejections_total",
  help:       "Number of LLM requests rejected by the gateway",
  labelNames: ["reason"] as const,
  registers:  [gatewayMetricsRegistry],
});

/**
 * Return a minimal Express-compatible handler that serves Prometheus metrics.
 * Mount this at /metrics if the host server doesn't already expose one.
 */
export function metricsHandler() {
  return async (_req: unknown, res: any) => {
    try {
      res.set("Content-Type", gatewayMetricsRegistry.contentType);
      res.end(await gatewayMetricsRegistry.metrics());
    } catch (err) {
      res.status(500).end(String(err));
    }
  };
}

// ─── Daily token budget ───────────────────────────────────────────────────────

function todayKey(userId: number): string {
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `budget:user:${userId}:${ymd}`;
}

/**
 * Increment the daily token counter for a user and return the new total.
 * The key expires 25 hours after first write to survive timezone skew.
 */
async function incrementDailyTokens(
  redis: Redis,
  userId: number,
  tokens: number
): Promise<number> {
  const key = todayKey(userId);
  const newVal = await redis.incrby(key, tokens);
  // Set expiry only on first write (TTL = 25 h).
  if (newVal === tokens) {
    await redis.expire(key, 25 * 60 * 60);
  }
  return newVal;
}

async function getDailyTokensUsed(redis: Redis, userId: number): Promise<number> {
  const key = todayKey(userId);
  const val = await redis.get(key);
  return val ? parseInt(val, 10) : 0;
}

// ─── In-app event stub ────────────────────────────────────────────────────────

/**
 * Fire an event when a user exceeds their daily budget.
 * TODO(#3): Route this through the notification delivery backbone once PR #3 ships.
 */
function emitBudgetExceededEvent(userId: number, used: number, budget: number): void {
  console.warn(
    `[llmGateway] Budget exceeded for user ${userId}: ${used}/${budget} tokens today`
  );
  // TODO(#3): Replace with real notification dispatch, e.g.:
  //   notificationBus.emit("budget_exceeded", { userId, used, budget });
}

// ─── TOO_MANY_REQUESTS error ──────────────────────────────────────────────────

export class GatewayRateLimitError extends Error {
  public readonly retryAfterSeconds: number;
  public readonly reason: "user" | "org" | "global" | "budget";

  constructor(reason: "user" | "org" | "global" | "budget", retryAfterSeconds = 30) {
    const messages: Record<string, string> = {
      user:   "Too many concurrent LLM requests for this user",
      org:    "Too many concurrent LLM requests for this organisation",
      global: "System is at capacity; please retry shortly",
      budget: "Daily LLM token budget exhausted; resets at midnight UTC",
    };
    super(messages[reason]);
    this.name = "GatewayRateLimitError";
    this.reason = reason;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// ─── Semaphore acquisition helper ─────────────────────────────────────────────

/**
 * Try to acquire one slot of a Redis semaphore.
 * Returns the Semaphore instance (already acquired) or null if all slots are busy.
 */
async function tryAcquireSemaphore(
  redis: Redis,
  key: string,
  limit: number
): Promise<Semaphore | null> {
  const sem = new Semaphore(redis as any, key, limit, {
    lockTimeout:      SEMAPHORE_LOCK_TTL_MS,
    acquireTimeout:   SEMAPHORE_ACQUIRE_TIMEOUT_MS,
    acquireAttemptsLimit: 1,
    retryInterval:    0,
  });
  try {
    await sem.acquire();
    return sem;
  } catch (err) {
    if (err instanceof TimeoutError) return null;
    // Unexpected Redis error — treat as capacity-full to fail safe.
    console.error("[llmGateway] Semaphore acquire error:", err);
    return null;
  }
}

// ─── Context passed to every gateway call ─────────────────────────────────────

export interface GatewayContext {
  userId: number;
  orgId?: number;
}

// ─── Core gateway: acquire semaphores → check budget → invoke → release ───────

async function runWithGateway<T>(
  ctx: GatewayContext,
  invoke: () => Promise<{ result: T; tokens: number }>
): Promise<T> {
  const redis = getRedisClient();
  const budget = ENV.LLM_DAILY_USER_TOKEN_BUDGET;

  // 0. Pre-flight budget check (optimistic — avoids acquiring semaphores for doomed requests).
  const used = await getDailyTokensUsed(redis, ctx.userId);
  if (used >= budget) {
    rejectionCounter.labels({ reason: "budget" }).inc();
    emitBudgetExceededEvent(ctx.userId, used, budget);
    throw new GatewayRateLimitError("budget", 3600);
  }

  // 1. Acquire user semaphore.
  const userSem = await tryAcquireSemaphore(redis, `sem:user:${ctx.userId}`, USER_CAP);
  if (!userSem) {
    rejectionCounter.labels({ reason: "user" }).inc();
    throw new GatewayRateLimitError("user", 5);
  }

  // 2. Acquire org semaphore.
  const orgKey = ctx.orgId != null ? `sem:org:${ctx.orgId}` : "sem:org:default";
  const orgSem = await tryAcquireSemaphore(redis, orgKey, ORG_CAP);
  if (!orgSem) {
    await userSem.release().catch(() => {});
    rejectionCounter.labels({ reason: "org" }).inc();
    throw new GatewayRateLimitError("org", 10);
  }

  // 3. Acquire global semaphore.
  const globalSem = await tryAcquireSemaphore(redis, "sem:global", GLOBAL_CAP);
  if (!globalSem) {
    await orgSem.release().catch(() => {});
    await userSem.release().catch(() => {});
    rejectionCounter.labels({ reason: "global" }).inc();
    throw new GatewayRateLimitError("global", 15);
  }

  // 4. Execute the LLM call.
  try {
    const { result, tokens } = await invoke();

    // 5. Post-call: increment daily budget counter.
    if (tokens > 0) {
      const newTotal = await incrementDailyTokens(redis, ctx.userId, tokens);
      if (newTotal >= budget) {
        // Warn asynchronously — don't fail the call that just succeeded.
        emitBudgetExceededEvent(ctx.userId, newTotal, budget);
      }
    }

    return result;
  } finally {
    // 6. Always release semaphores in reverse order.
    await globalSem.release().catch(() => {});
    await orgSem.release().catch(() => {});
    await userSem.release().catch(() => {});
  }
}

// ─── Public API: gateway-wrapped invokeLLM ────────────────────────────────────

/**
 * Drop-in replacement for `invokeLLM` with per-user/org/global semaphore
 * and daily token budget enforcement.
 */
export async function gatewayInvokeLLM(
  params: InvokeParams,
  ctx: GatewayContext
): Promise<InvokeResult> {
  return runWithGateway(ctx, async () => {
    const result = await invokeLLM(params);
    const tokens = result.usage?.total_tokens ?? 0;
    return { result, tokens };
  });
}

/**
 * Drop-in replacement for `invokeLLMStream` with per-user/org/global semaphore
 * and daily token budget enforcement.
 *
 * Semaphores are held for the duration of the stream.  The pre-flight budget
 * check prevents starting new streams after the budget is already exhausted.
 * Token counting during streaming uses a ~4-chars/token heuristic because
 * streaming responses don't return a `usage` field.
 */
export async function* gatewayInvokeLLMStream(
  params: InvokeParams,
  ctx: GatewayContext
): AsyncGenerator<string> {
  const redis = getRedisClient();
  const budget = ENV.LLM_DAILY_USER_TOKEN_BUDGET;

  // Pre-flight budget check.
  const used = await getDailyTokensUsed(redis, ctx.userId);
  if (used >= budget) {
    rejectionCounter.labels({ reason: "budget" }).inc();
    emitBudgetExceededEvent(ctx.userId, used, budget);
    throw new GatewayRateLimitError("budget", 3600);
  }

  // Acquire semaphores.
  const userSem = await tryAcquireSemaphore(redis, `sem:user:${ctx.userId}`, USER_CAP);
  if (!userSem) {
    rejectionCounter.labels({ reason: "user" }).inc();
    throw new GatewayRateLimitError("user", 5);
  }

  const orgKey = ctx.orgId != null ? `sem:org:${ctx.orgId}` : "sem:org:default";
  const orgSem = await tryAcquireSemaphore(redis, orgKey, ORG_CAP);
  if (!orgSem) {
    await userSem.release().catch(() => {});
    rejectionCounter.labels({ reason: "org" }).inc();
    throw new GatewayRateLimitError("org", 10);
  }

  const globalSem = await tryAcquireSemaphore(redis, "sem:global", GLOBAL_CAP);
  if (!globalSem) {
    await orgSem.release().catch(() => {});
    await userSem.release().catch(() => {});
    rejectionCounter.labels({ reason: "global" }).inc();
    throw new GatewayRateLimitError("global", 15);
  }

  let charCount = 0;
  try {
    for await (const chunk of invokeLLMStream(params)) {
      charCount += chunk.length;
      yield chunk;
    }
  } finally {
    // Release semaphores.
    await globalSem.release().catch(() => {});
    await orgSem.release().catch(() => {});
    await userSem.release().catch(() => {});

    // Post-stream budget update (~4 chars per token heuristic).
    const estimatedTokens = Math.ceil(charCount / 4);
    if (estimatedTokens > 0) {
      incrementDailyTokens(redis, ctx.userId, estimatedTokens).then((newTotal) => {
        if (newTotal >= budget) {
          emitBudgetExceededEvent(ctx.userId, newTotal, budget);
        }
      }).catch(() => {});
    }
  }
}
