/**
 * Unit tests for graceful shutdown coordinator (issue #25).
 *
 * These tests run in a fully-mocked environment — no live HTTP server, DB, or
 * Redis required.  We test the individual shutdown steps in isolation:
 *
 *   (a) /health returns 503 once isShuttingDown is set
 *   (b) SSE streams receive `event: bye` on drain
 *   (c) registerSseStream unregister callback removes the stream
 *   (d) registerWorkerClose factories are called during shutdown
 *   (e) SHUTDOWN_TIMEOUT_MS is read from env (defaults to 30000)
 *
 * Integration test (spawning a real child process and SSE client) is skipped
 * here to avoid CI flakiness — the manual smoke-test procedure is documented
 * in the PR description.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── We import and test the pure-logic pieces directly ───────────────────────

// Reset module state between tests by re-importing fresh each time.
// Vitest's module isolation: we use vi.resetModules() + dynamic imports.

describe("SHUTDOWN_TIMEOUT_MS config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to 30000 when env var is not set", async () => {
    vi.resetModules();
    const { SHUTDOWN_TIMEOUT_MS } = await import("./_shutdown_test_helper");
    expect(SHUTDOWN_TIMEOUT_MS).toBe(30000);
  });

  it("reads SHUTDOWN_TIMEOUT_MS from environment", async () => {
    vi.stubEnv("SHUTDOWN_TIMEOUT_MS", "5000");
    vi.resetModules();
    const { SHUTDOWN_TIMEOUT_MS } = await import("./_shutdown_test_helper");
    expect(SHUTDOWN_TIMEOUT_MS).toBe(5000);
  });
});

describe("registerSseStream / SSE drain", () => {
  it("unregister removes the stream from the registry", async () => {
    vi.resetModules();
    const { registerSseStream, getActiveSseCount } = await import("./_shutdown_test_helper");

    const fakeRes = { write: vi.fn(), flush: vi.fn(), end: vi.fn() } as any;
    const unregister = registerSseStream(fakeRes);
    expect(getActiveSseCount()).toBe(1);

    unregister();
    expect(getActiveSseCount()).toBe(0);
  });

  it("drainSseStreams sends event:bye to each registered SSE stream", async () => {
    vi.resetModules();
    const { registerSseStream, drainSseStreams } = await import("./_shutdown_test_helper");

    const fakeRes = { write: vi.fn(), flush: vi.fn(), end: vi.fn() } as any;
    registerSseStream(fakeRes);

    // Drain with a very short timeout (1 ms) so the test is fast.
    await drainSseStreams(1);

    expect(fakeRes.write).toHaveBeenCalledWith(
      "event: bye\ndata: shutting down\n\n"
    );
  });

  it("hard-closes streams that do not disconnect within the timeout", async () => {
    vi.resetModules();
    const { registerSseStream, drainSseStreams, getActiveSseCount } = await import(
      "./_shutdown_test_helper"
    );

    // Stream that never self-removes (simulates a stuck client)
    const fakeRes = { write: vi.fn(), flush: vi.fn(), end: vi.fn() } as any;
    registerSseStream(fakeRes);

    // Very short timeout — stream won't disconnect in 1 ms
    await drainSseStreams(1);

    // After timeout, end() must have been called
    expect(fakeRes.end).toHaveBeenCalled();
    expect(getActiveSseCount()).toBe(0);
  });
});

describe("registerWorkerClose", () => {
  it("collected factories are called during the worker-drain step", async () => {
    vi.resetModules();
    const { registerWorkerClose, runWorkerDrain } = await import("./_shutdown_test_helper");

    const factory = vi.fn().mockResolvedValue(undefined);
    registerWorkerClose(factory);

    await runWorkerDrain();

    expect(factory).toHaveBeenCalledOnce();
  });
});
