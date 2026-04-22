/**
 * shutdown.ts — Unified graceful-shutdown coordinator (issue #25)
 *
 * Ordering:
 *   1. Flip /health to 503 immediately (LB stops routing new traffic)
 *   2. server.close() — stop accepting new HTTP/WebSocket connections
 *   3. Drain active SSE streams: send `event: bye` and close within SHUTDOWN_TIMEOUT_MS
 *   4. Wait for #13's worker.close(false) promises (already scheduled by orchestratorWorker /
 *      squadLeaderWorker's own SIGTERM listener — we just wait for those Promises here)
 *   5. Close DB pools (db, localPool) and Redis / IORedis connections
 *   6. process.exit(0)
 *
 * The #13 workers register their own `process.once('SIGTERM', ...)` handlers that call
 * `worker.close(false)`.  We don't re-register those — we coordinate by waiting on the
 * promises they return, which are collected via `registerWorkerClose()`.
 *
 * Config:
 *   SHUTDOWN_TIMEOUT_MS  — hard deadline for the whole sequence (default: 30000)
 */

import type { Server } from "http";
import type { Response } from "express";
import type { Pool } from "mysql2/promise";
import type IORedis from "ioredis";

// ── Config ────────────────────────────────────────────────────────────────────
export const SHUTDOWN_TIMEOUT_MS = parseInt(
  process.env.SHUTDOWN_TIMEOUT_MS ?? "30000",
  10
);

// ── State ─────────────────────────────────────────────────────────────────────

/** Set to true once shutdown starts. Used to serve 503 from /health. */
export let isShuttingDown = false;

/** Active SSE response objects, keyed by a numeric id. */
const activeSseStreams = new Map<number, Response>();
let nextSseId = 1;

/** Worker close() factories registered by queue workers. Called during shutdown. */
const workerClosePromises: Array<() => Promise<void>> = [];

// ── SSE stream registry ───────────────────────────────────────────────────────

/**
 * Register an SSE response so it is gracefully closed on shutdown.
 * Returns an unregister function — call it when the stream ends naturally.
 */
export function registerSseStream(res: Response): () => void {
  const id = nextSseId++;
  activeSseStreams.set(id, res);
  return () => activeSseStreams.delete(id);
}

// ── Worker close registry ─────────────────────────────────────────────────────

/**
 * Queue workers call this to register a factory that produces a worker.close()
 * promise when invoked.  The factory is NOT called at registration time — it is
 * called during shutdown so we don't prematurely close workers.
 *
 * Usage: pass `() => worker.close(false)` from server/index.ts after starting
 * the workers.  Do NOT touch the worker files themselves — #13 owns those.
 */
export function registerWorkerClose(factory: () => Promise<void>): void {
  workerClosePromises.push(factory);
}

// ── Drain SSE streams ─────────────────────────────────────────────────────────

async function drainSseStreams(timeoutMs: number): Promise<void> {
  if (activeSseStreams.size === 0) return;

  console.log(`[shutdown] draining ${activeSseStreams.size} active SSE stream(s)…`);

  // Send bye event to every active SSE client
  for (const [, res] of activeSseStreams) {
    try {
      res.write("event: bye\ndata: shutting down\n\n");
      (res as any).flush?.();
    } catch {
      // client already disconnected — ignore
    }
  }

  // Wait up to timeoutMs for clients to disconnect, checking every 100 ms
  const deadline = Date.now() + timeoutMs;
  while (activeSseStreams.size > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
  }

  // Hard-close any stragglers
  if (activeSseStreams.size > 0) {
    console.warn(
      `[shutdown] ${activeSseStreams.size} SSE stream(s) still open after ${timeoutMs} ms — force-closing`
    );
    for (const [, res] of activeSseStreams) {
      try { res.end(); } catch { /* ignore */ }
    }
    activeSseStreams.clear();
  }
}

// ── Main shutdown coordinator ─────────────────────────────────────────────────

export async function shutdown(opts: {
  signal:    string;
  server:    Server;
  localPool: Pool;
  redisConn: IORedis;
}): Promise<never> {
  const { signal, server, localPool, redisConn } = opts;

  if (isShuttingDown) {
    // Re-entrant call (e.g. SIGINT during shutdown) — ignore
    await new Promise(() => { /* never resolves */ });
  }

  isShuttingDown = true;
  console.log(`[server] ${signal} received — starting graceful shutdown (timeout: ${SHUTDOWN_TIMEOUT_MS} ms)`);

  // ── Hard deadline: force-exit after SHUTDOWN_TIMEOUT_MS ──────────────────
  const forceExitTimer = setTimeout(() => {
    console.error("[server] shutdown timeout exceeded — forcing process.exit(1)");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  try {
    // Step 1: /health already returns 503 via isShuttingDown flag (checked in route)

    // Step 2: Stop accepting new connections
    console.log("[server] closing HTTP server (no new connections)…");
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
    console.log("[server] HTTP server closed");

    // Step 3: Drain SSE streams
    await drainSseStreams(SHUTDOWN_TIMEOUT_MS / 2);

    // Step 4: Close BullMQ workers gracefully.
    // Note: #13's workers also registered their own process.once('SIGTERM') handlers
    // that call worker.close(false) independently.  Calling close() a second time on
    // a BullMQ Worker is idempotent — it returns the same draining promise.
    if (workerClosePromises.length > 0) {
      console.log(`[server] waiting for ${workerClosePromises.length} BullMQ worker(s) to drain…`);
      await Promise.allSettled(workerClosePromises.map((factory) => factory()));
      console.log("[server] BullMQ workers drained");
    }

    // Step 5: Close DB pools and Redis
    console.log("[server] closing DB pools and Redis…");
    await Promise.allSettled([
      // Primary DB pool (Drizzle / mysql2)
      (async () => {
        try {
          const { closeDb } = await import("../db");
          await closeDb();
          console.log("[server] primary DB pool closed");
        } catch (err) {
          console.error("[server] primary DB pool close error:", err);
        }
      })(),
      // localPool (raw mysql2 pool used by missionChatRouter + squad worker)
      (async () => {
        try {
          await localPool.end();
          console.log("[server] localPool closed");
        } catch (err) {
          console.error("[server] localPool close error:", err);
        }
      })(),
      // BullMQ / shared IORedis connection
      (async () => {
        try {
          await redisConn.quit();
          console.log("[server] Redis connection closed");
        } catch (err) {
          console.error("[server] Redis quit error:", err);
        }
      })(),
    ]);

    clearTimeout(forceExitTimer);
    console.log("[server] graceful shutdown complete — exiting 0");
    process.exit(0);
  } catch (err) {
    console.error("[server] shutdown error:", err);
    process.exit(1);
  }
}
