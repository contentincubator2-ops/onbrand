/**
 * Unified job queue provider.
 *
 * Two backends behind the same small interface:
 *
 *   • Vercel (IS_VERCEL) → DB-backed: INSERT/SELECT against `queued_jobs`
 *     so status survives across stateless function invocations. No Redis,
 *     no BullMQ — those packages aren't even imported.
 *
 *   • VM / local (default) → BullMQ on Redis (existing behaviour kept for
 *     `pm2 start server/index.ts` on the Azure VM).
 *
 * Callsites that use `marketingQueue.add(...)` / `squadQueue.add(...)` /
 * `marketingQueue.getJob(id)` don't change — the returned job handle has
 * the same shape (id / progress / returnvalue / failedReason / getState()).
 *
 * Processors update progress + final result via the exported
 * `updateJob()` helper. On Vercel that writes to `queued_jobs`; on the
 * VM BullMQ handles it through its own Job API so updateJob() is a no-op
 * (processors keep calling `job.updateProgress()` etc. as before).
 */

import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

const IS_VERCEL = !!process.env.VERCEL;

// ── Public types (unchanged for back-compat) ─────────────────────────────────
export interface MarketingJobData {
  jobId: string;
  userRequest: string;
  brand?: string;
  industry?: string;
  taskType?: string;
  userId?: number;
  sessionId?: string;
}

export interface MarketingJobResult {
  agent: { name: string; title: string; taskType: string };
  model: string;
  thinking: string;
  publishable_content: string;
  metadata?: Record<string, unknown>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens?: number };
}

export type JobState = "waiting" | "active" | "completed" | "failed";

export interface JobHandle<TResult = unknown> {
  id: string;
  progress: number;
  returnvalue: TResult | null;
  failedReason: string | null;
  getState(): Promise<JobState>;
}

export interface JobQueue<TData = unknown, TResult = unknown> {
  add(
    name: string,
    data: TData,
    opts?: { jobId?: string; attempts?: number; backoff?: unknown; delay?: number },
  ): Promise<JobHandle<TResult>>;
  getJob(id: string): Promise<JobHandle<TResult> | null>;
}

// ─────────────────────────────────────────────────────────────────────────────
// DB-backed adapter (used on Vercel)
// ─────────────────────────────────────────────────────────────────────────────

class DbQueue<TData, TResult> implements JobQueue<TData, TResult> {
  constructor(private queueName: string) {}

  async add(name: string, data: TData, opts?: { jobId?: string }): Promise<JobHandle<TResult>> {
    const { getDb } = await import("../db");
    const db = await getDb();
    const id = opts?.jobId ?? randomUUID();
    // ON DUPLICATE KEY so a retried enqueue of the same jobId is idempotent.
    await db.execute(sql`
      INSERT INTO queued_jobs (id, queue, name, data, status, progress)
      VALUES (${id}, ${this.queueName}, ${name}, ${JSON.stringify(data)}, 'waiting', 0)
      ON DUPLICATE KEY UPDATE data = VALUES(data), name = VALUES(name)
    `);

    // Fast-path dispatch: fire POST to /api/worker/execute-task without
    // awaiting. Register with Vercel's waitUntil so the runtime doesn't
    // freeze the function before fetch fires. If this fetch fails, the
    // cron drainer (/api/cron/drain-queue) picks the job up after 30s.
    void this.dispatchAsync(id);

    return this.handle(id, "waiting", 0, null, null);
  }

  private async dispatchAsync(jobId: string): Promise<void> {
    // Only marketing-jobs currently has a worker endpoint. Squad jobs
    // stay queued until their own worker is ported.
    if (this.queueName !== "marketing-jobs") return;

    const baseUrl =
      process.env.APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
    if (!baseUrl) return;

    const fire = fetch(`${baseUrl}/api/worker/execute-task`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.CRON_SECRET ?? ""}`,
      },
      body: JSON.stringify({ jobId }),
    }).catch(() => {
      /* swallow — cron drain will retry */
    });

    try {
      const { waitUntil } = await import("@vercel/functions");
      waitUntil(fire);
    } catch {
      // @vercel/functions not available (e.g. running locally). The plain
      // Promise above will still settle in dev environments that keep the
      // event loop alive until idle.
    }
  }

  async getJob(id: string): Promise<JobHandle<TResult> | null> {
    const { getDb } = await import("../db");
    const db = await getDb();
    const [rows] = (await db.execute(sql`
      SELECT id, status, progress, result, failed_reason
      FROM queued_jobs
      WHERE id = ${id} AND queue = ${this.queueName}
      LIMIT 1
    `)) as unknown as [Array<{
      id: string;
      status: JobState;
      progress: number;
      result: string | null;
      failed_reason: string | null;
    }>, unknown];
    const row = rows[0];
    if (!row) return null;
    return this.handle(
      row.id,
      row.status,
      row.progress ?? 0,
      row.result ? (JSON.parse(row.result) as TResult) : null,
      row.failed_reason,
    );
  }

  private handle(
    id: string,
    state: JobState,
    progress: number,
    returnvalue: TResult | null,
    failedReason: string | null,
  ): JobHandle<TResult> {
    return {
      id,
      progress,
      returnvalue,
      failedReason,
      getState: async () => state,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BullMQ adapter (used on VM). Redis + BullMQ are dynamic-imported so they
// never load on Vercel — this keeps the function cold start Redis-free.
// ─────────────────────────────────────────────────────────────────────────────

type LazyBullQueue = {
  add(name: string, data: unknown, opts?: unknown): Promise<{
    id: string;
    progress: number;
    returnvalue: unknown;
    failedReason: string | null;
    getState(): Promise<string>;
  }>;
  getJob(id: string): Promise<{
    id: string;
    progress: number;
    returnvalue: unknown;
    failedReason: string | null;
    getState(): Promise<string>;
  } | null>;
};

let _bullmqConnection: unknown = null;
const _bullmqQueues: Map<string, LazyBullQueue> = new Map();

async function getBullmqConnection(): Promise<unknown> {
  if (_bullmqConnection) return _bullmqConnection;
  const { default: IORedis } = await import("ioredis");
  _bullmqConnection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });
  return _bullmqConnection;
}

async function getBullmqQueue(name: string): Promise<LazyBullQueue> {
  const existing = _bullmqQueues.get(name);
  if (existing) return existing;
  const { Queue } = await import("bullmq");
  const q = new Queue(name, { connection: (await getBullmqConnection()) as never }) as unknown as LazyBullQueue;
  _bullmqQueues.set(name, q);
  return q;
}

class BullmqQueue<TData, TResult> implements JobQueue<TData, TResult> {
  constructor(private queueName: string) {}

  async add(name: string, data: TData, opts?: unknown): Promise<JobHandle<TResult>> {
    const q = await getBullmqQueue(this.queueName);
    const job = await q.add(name, data as never, opts);
    return this.wrap(job);
  }

  async getJob(id: string): Promise<JobHandle<TResult> | null> {
    const q = await getBullmqQueue(this.queueName);
    const job = await q.getJob(id);
    return job ? this.wrap(job) : null;
  }

  private wrap(job: Awaited<ReturnType<LazyBullQueue["add"]>>): JobHandle<TResult> {
    return {
      id: job.id,
      progress: job.progress,
      returnvalue: (job.returnvalue ?? null) as TResult | null,
      failedReason: job.failedReason,
      getState: async () => (await job.getState()) as JobState,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public queue instances
// ─────────────────────────────────────────────────────────────────────────────

function makeQueue<TData, TResult>(name: string): JobQueue<TData, TResult> {
  return IS_VERCEL
    ? new DbQueue<TData, TResult>(name)
    : new BullmqQueue<TData, TResult>(name);
}

export const marketingQueue: JobQueue<MarketingJobData, MarketingJobResult> =
  makeQueue<MarketingJobData, MarketingJobResult>("marketing-jobs");

export const squadQueue: JobQueue<unknown, unknown> = makeQueue("squad-jobs");

// ─────────────────────────────────────────────────────────────────────────────
// BullMQ `connection` re-export — used by worker files inside startXxxWorker()
// calls, all of which only run when !IS_VERCEL. We still export a Proxy so
// workers that read properties at call time get a lazily-constructed Redis
// client. Accessing this on Vercel throws, which is what we want — it would
// only be hit by a programming error (e.g. running a worker on serverless).
// ─────────────────────────────────────────────────────────────────────────────
export const connection: unknown = new Proxy(
  {},
  {
    get(_t, prop) {
      if (IS_VERCEL) {
        throw new Error(
          "[queue] Redis connection is not available on Vercel — use the DB-backed queue (see marketingQueue.ts).",
        );
      }
      // Return a Promise-bound value so callers can `await connection.xxx`
      // or pass it as a config that eventually dereferences.
      const thunk = async () => {
        const c = (await getBullmqConnection()) as Record<PropertyKey, unknown>;
        const v = c[prop];
        return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(c) : v;
      };
      // Property-access on Proxy needs a sync return: hand back the thunk
      // directly for callers that await it, otherwise BullMQ's Worker
      // constructor reads specific fields that we can't spoof. Since
      // Workers are gated behind !IS_VERCEL in server/index.ts they never
      // construct on Vercel, so this branch is only reached on the VM
      // where the thunk resolves correctly.
      return thunk;
    },
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Status-update API — for processors running as Vercel Functions to write
// progress / result back to `queued_jobs`. On the VM BullMQ's Job API handles
// this natively, so this is a no-op there.
// ─────────────────────────────────────────────────────────────────────────────
export async function updateJob(
  id: string,
  patch: {
    status?: JobState;
    progress?: number;
    result?: unknown;
    failedReason?: string | null;
  },
): Promise<void> {
  if (!IS_VERCEL) return;
  const { getDb } = await import("../db");
  const db = await getDb();

  // Build individual sql fragments then compose. Drizzle's sql template
  // handles parameter binding for each piece.
  const set: ReturnType<typeof sql>[] = [];
  if (patch.status !== undefined) set.push(sql`status = ${patch.status}`);
  if (patch.progress !== undefined) set.push(sql`progress = ${patch.progress}`);
  if (patch.result !== undefined) set.push(sql`result = ${JSON.stringify(patch.result)}`);
  if (patch.failedReason !== undefined) set.push(sql`failed_reason = ${patch.failedReason}`);
  if (patch.status === "active") set.push(sql`started_at = IFNULL(started_at, NOW(3))`);
  if (patch.status === "completed" || patch.status === "failed") {
    set.push(sql`completed_at = NOW(3)`);
  }
  if (set.length === 0) return;

  // Join the fragments with commas.
  const setClause = set.reduce(
    (acc, frag, i) => (i === 0 ? frag : sql`${acc}, ${frag}`),
    sql``,
  );

  await db.execute(sql`UPDATE queued_jobs SET ${setClause} WHERE id = ${id}`);
}
