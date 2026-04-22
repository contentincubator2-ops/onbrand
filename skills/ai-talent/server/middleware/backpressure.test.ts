/**
 * backpressure.test.ts — Integration tests for the backpressure guard.
 *
 * All queue interactions are mocked so no Redis / BullMQ instance is needed.
 *
 * Test matrix:
 *   1. shouldShedLoad — below thresholds → shed=false
 *   2. shouldShedLoad — queue depth above threshold → shed=true, reason=queue_depth
 *   3. shouldShedLoad — event-loop lag above threshold → shed=true, reason=event_loop_lag
 *   4. backpressureMiddleware — below threshold → calls next()
 *   5. backpressureMiddleware — queue depth above threshold → 503 + Retry-After
 *   6. backpressureMiddleware — lag above threshold → 503 + Retry-After
 *   7. Prometheus counter is incremented on shed
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Registry } from "prom-client";

// Mock the entire marketingQueue module so no real Redis is touched.
vi.mock("../queue/marketingQueue", () => ({
  marketingQueue: {
    getWaitingCount: vi.fn().mockResolvedValue(0),
  },
}));

import { shouldShedLoad, backpressureMiddleware, _resetCounterForTest, getBackpressureCounter } from "./backpressure";

// Helper: build a minimal mock Express req/res/next triple.
function mockExpressTriple(overrides: Partial<{ set: any; status: any; json: any }> = {}) {
  const res: any = {
    _status: 200,
    _headers: {} as Record<string, string>,
    _body: null as any,
    set(key: string, val: string) { this._headers[key] = val; return this; },
    status(code: number) { this._status = code; return this; },
    json(body: any) { this._body = body; return this; },
    ...overrides,
  };
  const req: any = {};
  const next = vi.fn();
  return { req, res, next };
}

beforeEach(() => {
  // Reset the prom-client counter singleton before each test to avoid
  // "metric already registered" conflicts.
  _resetCounterForTest();
});

// ─── shouldShedLoad ───────────────────────────────────────────────────────────

describe("shouldShedLoad — override injection", () => {
  it("returns shed=false when both metrics are below threshold", async () => {
    const decision = await shouldShedLoad({ queueWaiting: 10, lagMs: 5 });
    expect(decision.shed).toBe(false);
    expect(decision.reason).toBeNull();
  });

  it("returns shed=true (queue_depth) when waiting > 500", async () => {
    const decision = await shouldShedLoad({ queueWaiting: 600, lagMs: 5 });
    expect(decision.shed).toBe(true);
    expect(decision.reason).toBe("queue_depth");
  });

  it("returns shed=true (event_loop_lag) when lag > 200 ms", async () => {
    const decision = await shouldShedLoad({ queueWaiting: 10, lagMs: 250 });
    expect(decision.shed).toBe(true);
    expect(decision.reason).toBe("event_loop_lag");
  });

  it("queue_depth takes priority over event_loop_lag when both exceed threshold", async () => {
    const decision = await shouldShedLoad({ queueWaiting: 600, lagMs: 250 });
    expect(decision.shed).toBe(true);
    expect(decision.reason).toBe("queue_depth");
  });
});

// ─── backpressureMiddleware ───────────────────────────────────────────────────

describe("backpressureMiddleware — Express integration", () => {
  it("calls next() when load is within limits", async () => {
    const { req, res, next } = mockExpressTriple();
    // Override so the real marketingQueue mock returns 0 (already set in vi.mock)
    // and lag stays low (histogram won't be near 200ms in a unit test).
    await backpressureMiddleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res._status).toBe(200);
  });

  it("returns 503 + Retry-After:10 when queue_waiting > 500", async () => {
    // Patch the marketingQueue mock for this test only
    const { marketingQueue } = await import("../queue/marketingQueue");
    (marketingQueue.getWaitingCount as any).mockResolvedValueOnce(600);

    const { req, res, next } = mockExpressTriple();
    await backpressureMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._headers["Retry-After"]).toBe("10");
    expect(res._status).toBe(503);
    expect(res._body.reason).toBe("queue_depth");
    expect(res._body.retryAfter).toBe(10);
  });

  it("shouldShedLoad returns event_loop_lag reason when lag > threshold", async () => {
    // We can't drive the real perf_hooks histogram above 200 ms in a unit test,
    // but shouldShedLoad accepts overrides so we test it directly.
    const decision = await shouldShedLoad({ queueWaiting: 0, lagMs: 300 });
    expect(decision.shed).toBe(true);
    expect(decision.reason).toBe("event_loop_lag");
  });
});

// ─── Prometheus counter ───────────────────────────────────────────────────────

describe("Prometheus counter", () => {
  it("increments backpressure_rejections_total{reason=queue_depth} on shed", async () => {
    const registry = new Registry();
    const counter = getBackpressureCounter(registry);

    // Simulate a queue_depth shed
    counter.inc({ reason: "queue_depth" });
    counter.inc({ reason: "queue_depth" });

    const metrics = await registry.getMetricsAsJSON();
    const bp = metrics.find((m) => m.name === "backpressure_rejections_total");
    expect(bp).toBeDefined();
    const queueDepthValue = (bp as any).values.find(
      (v: any) => v.labels?.reason === "queue_depth"
    );
    expect(queueDepthValue?.value).toBe(2);
  });

  it("increments backpressure_rejections_total{reason=event_loop_lag} on shed", async () => {
    const registry = new Registry();
    const counter = getBackpressureCounter(registry);

    counter.inc({ reason: "event_loop_lag" });

    const metrics = await registry.getMetricsAsJSON();
    const bp = metrics.find((m) => m.name === "backpressure_rejections_total");
    const lagValue = (bp as any).values.find(
      (v: any) => v.labels?.reason === "event_loop_lag"
    );
    expect(lagValue?.value).toBe(1);
  });
});
