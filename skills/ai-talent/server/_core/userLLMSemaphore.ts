/**
 * Per-user concurrency limiter for LLM calls.
 *
 * Problem (2026-05-14): with ~100 concurrent users each running theater
 * (21 cells × 3 LLM calls = 63 calls/user), a single tab can fire 5
 * caption/image calls in parallel and starve other users on the same
 * Node process. nginx then returns 502/504 for everyone else.
 *
 * This semaphore caps each userId at MAX_CONCURRENT_PER_USER concurrent
 * invokeLLM calls. Excess calls queue (FIFO) until a slot frees.
 *
 * Process-local: in PM2 cluster mode each worker has its own semaphore,
 * so effective per-user concurrency = workers × MAX. That's fine — the
 * goal is to prevent any single user from monopolizing one worker, not
 * to enforce a global cap (which would need Redis).
 */

const MAX_CONCURRENT_PER_USER = 3;
const QUEUE_TIMEOUT_MS = 120_000; // give up waiting after 2min

type Slot = { resolve: () => void; reject: (e: Error) => void; timer: NodeJS.Timeout };

type Pool = {
  active: number;
  queue: Slot[];
};

const pools = new Map<string, Pool>();

function getPool(key: string): Pool {
  let p = pools.get(key);
  if (!p) {
    p = { active: 0, queue: [] };
    pools.set(key, p);
  }
  return p;
}

function acquire(key: string): Promise<void> {
  const pool = getPool(key);
  if (pool.active < MAX_CONCURRENT_PER_USER) {
    pool.active++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = pool.queue.findIndex((s) => s.resolve === resolve);
      if (idx >= 0) pool.queue.splice(idx, 1);
      reject(new Error(`[userLLMSemaphore] queue timeout for key=${key} after ${QUEUE_TIMEOUT_MS}ms`));
    }, QUEUE_TIMEOUT_MS);
    pool.queue.push({ resolve, reject, timer });
  });
}

function release(key: string): void {
  const pool = pools.get(key);
  if (!pool) return;
  const next = pool.queue.shift();
  if (next) {
    clearTimeout(next.timer);
    // active stays the same — slot transfers to next waiter
    next.resolve();
  } else {
    pool.active = Math.max(0, pool.active - 1);
    // Clean up empty pools to avoid Map growing unbounded
    if (pool.active === 0 && pool.queue.length === 0) {
      pools.delete(key);
    }
  }
}

/**
 * Run `fn` under a per-user concurrency cap. `key` is typically a userId
 * (stringified). Anonymous traffic can pass "anon" or an IP-derived key.
 */
export async function withUserLLMSlot<T>(key: string | number | null | undefined, fn: () => Promise<T>): Promise<T> {
  const k = key == null ? "anon" : String(key);
  await acquire(k);
  try {
    return await fn();
  } finally {
    release(k);
  }
}

/** For debugging / admin endpoints */
export function snapshotSemaphore(): Array<{ key: string; active: number; queued: number }> {
  return Array.from(pools.entries()).map(([key, p]) => ({
    key,
    active: p.active,
    queued: p.queue.length,
  }));
}
