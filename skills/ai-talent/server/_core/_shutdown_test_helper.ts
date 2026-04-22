/**
 * _shutdown_test_helper.ts
 *
 * Thin re-export of shutdown.ts internals for unit testing.
 * NOT imported in production code — only used by shutdown.test.ts.
 *
 * Exports the internal `drainSseStreams`, `getActiveSseCount`, and
 * `runWorkerDrain` helpers so tests can exercise them without spawning a
 * real HTTP server.
 */

import type { Response } from "express";

// ── Replicate the same state model as shutdown.ts ────────────────────────────
// We intentionally duplicate so tests get fresh isolated state on vi.resetModules().

export const SHUTDOWN_TIMEOUT_MS = parseInt(
  process.env.SHUTDOWN_TIMEOUT_MS ?? "30000",
  10
);

const activeSseStreams = new Map<number, Response>();
let nextSseId = 1;

const workerFactories: Array<() => Promise<void>> = [];

// ── SSE helpers ───────────────────────────────────────────────────────────────

export function registerSseStream(res: Response): () => void {
  const id = nextSseId++;
  activeSseStreams.set(id, res);
  return () => activeSseStreams.delete(id);
}

export function getActiveSseCount(): number {
  return activeSseStreams.size;
}

export async function drainSseStreams(timeoutMs: number): Promise<void> {
  // Send bye event to every registered SSE client
  for (const [, res] of activeSseStreams) {
    try {
      res.write("event: bye\ndata: shutting down\n\n");
      (res as any).flush?.();
    } catch {
      // disconnected
    }
  }

  // Wait up to timeoutMs for clients to self-remove
  const deadline = Date.now() + timeoutMs;
  while (activeSseStreams.size > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1));
  }

  // Hard-close stragglers
  if (activeSseStreams.size > 0) {
    for (const [, res] of activeSseStreams) {
      try { res.end(); } catch { /* ignore */ }
    }
    activeSseStreams.clear();
  }
}

// ── Worker drain helper ───────────────────────────────────────────────────────

export function registerWorkerClose(factory: () => Promise<void>): void {
  workerFactories.push(factory);
}

export async function runWorkerDrain(): Promise<void> {
  await Promise.allSettled(workerFactories.map((f) => f()));
}
