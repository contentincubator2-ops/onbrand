/**
 * backpressure.ts — Load-shedding middleware + shared check function.
 *
 * Protects hot routes from request overload by rejecting new work when:
 *   1. BullMQ queue waiting count exceeds BACKPRESSURE_QUEUE_MAX (default 500), OR
 *   2. Event-loop P99 lag exceeds BACKPRESSURE_LAG_MS (default 200 ms).
 *
 * The core logic lives in `shouldShedLoad()` which is shared between:
 *   - Express middleware (backpressureMiddleware) → HTTP 503 + Retry-After: 10
 *   - tRPC procedures → TRPCError({ code: "TOO_MANY_REQUESTS" })
 *
 * Prometheus metric:
 *   backpressure_rejections_total{reason="queue_depth"|"event_loop_lag"}
 */

import { monitorEventLoopDelay, type IntervalHistogram } from "perf_hooks";
import type { Request, Response, NextFunction } from "express";
import { Counter, type Registry } from "prom-client";
import { marketingQueue } from "../queue/marketingQueue";

// ─── Configuration ────────────────────────────────────────────────────────────

/** Maximum BullMQ waiting jobs before shedding. Env-configurable. */
const QUEUE_MAX = Number(process.env.BACKPRESSURE_QUEUE_MAX ?? 500);

/** Maximum P99 event-loop lag (ms) before shedding. Env-configurable. */
const LAG_MS = Number(process.env.BACKPRESSURE_LAG_MS ?? 200);

/** Retry-After seconds returned in 503 responses. */
const RETRY_AFTER_SECONDS = 10;

// ─── Prometheus metric ────────────────────────────────────────────────────────

let _counter: Counter<"reason"> | null = null;

/**
 * Lazily initialise the Prometheus counter.
 * Accepts an optional custom registry for testing isolation.
 */
export function getBackpressureCounter(registry?: Registry): Counter<"reason"> {
  if (!_counter) {
    const opts = {
      name: "backpressure_rejections_total",
      help: "Total number of requests shed by the backpressure guard",
      labelNames: ["reason"] as const,
      ...(registry ? { registers: [registry] } : {}),
    };
    _counter = new Counter(opts);
  }
  return _counter;
}

/** Reset internal counter singleton (for test isolation). */
export function _resetCounterForTest(): void {
  _counter = null;
}

// ─── Event-loop lag monitor ───────────────────────────────────────────────────

let _histogram: IntervalHistogram | null = null;

function getHistogram(): IntervalHistogram {
  if (!_histogram) {
    _histogram = monitorEventLoopDelay({ resolution: 20 }); // 20 ms resolution
    _histogram.enable();
  }
  return _histogram;
}

/** P99 event-loop lag in milliseconds. */
function getP99LagMs(): number {
  const h = getHistogram();
  // IntervalHistogram reports percentiles in nanoseconds
  return h.percentile(99) / 1_000_000;
}

// ─── Core check ──────────────────────────────────────────────────────────────

export interface ShedDecision {
  shed: boolean;
  reason: "queue_depth" | "event_loop_lag" | null;
}

/**
 * Determine whether the server should shed the current request.
 *
 * Shared between Express middleware and tRPC procedures to keep the
 * threshold logic in one place.
 *
 * @param overrides - Optional overrides for queue count and lag (for testing).
 */
export async function shouldShedLoad(overrides?: {
  queueWaiting?: number;
  lagMs?: number;
}): Promise<ShedDecision> {
  // Allow test injection via overrides
  const queueWaiting =
    overrides?.queueWaiting !== undefined
      ? overrides.queueWaiting
      : await marketingQueue.getWaitingCount().catch(() => 0);

  const lagMs =
    overrides?.lagMs !== undefined ? overrides.lagMs : getP99LagMs();

  if (queueWaiting > QUEUE_MAX) {
    return { shed: true, reason: "queue_depth" };
  }
  if (lagMs > LAG_MS) {
    return { shed: true, reason: "event_loop_lag" };
  }
  return { shed: false, reason: null };
}

// ─── Express middleware ───────────────────────────────────────────────────────

/**
 * Express middleware that returns HTTP 503 + Retry-After: 10 when the server
 * is under excessive load.
 *
 * Mount on hot routes (e.g. /api/chat) before any heavy handlers.
 */
export async function backpressureMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const decision = await shouldShedLoad();

    if (decision.shed && decision.reason) {
      getBackpressureCounter().inc({ reason: decision.reason });

      res.set("Retry-After", String(RETRY_AFTER_SECONDS));
      res.status(503).json({
        error: "Service temporarily unavailable — server under load",
        retryAfter: RETRY_AFTER_SECONDS,
        reason: decision.reason,
      });
      return;
    }
  } catch (err) {
    // Never block the request due to a monitoring failure
    console.error("[backpressure] check error:", err);
  }

  next();
}
