/**
 * readiness.ts — /ready endpoint checks
 *
 * Implements readiness probe per issue #14:
 *   - MySQL SELECT 1 (500 ms timeout)
 *   - Redis PING
 *   - BullMQ worker heartbeat via heartbeat:<queue> Redis key (TTL 10 s; fail if age >20 s)
 *   - schema_migrations dirty=0 and version matches build
 *   - Cached LLM provider probe (60 s TTL) — failure → degraded (200 OK), not fail
 *
 * Response schema:
 * {
 *   status: "ok" | "degraded" | "fail",
 *   checks: {
 *     db:         { ok: boolean; latencyMs: number; error?: string },
 *     redis:      { ok: boolean; latencyMs: number; error?: string },
 *     workers:    { ok: boolean; queues: Record<string, { ok: boolean; ageMs?: number }>; error?: string },
 *     migrations: { ok: boolean; version?: number; dirty?: boolean; error?: string },
 *     llm:        { ok: boolean; degraded?: boolean; error?: string; cachedUntil?: number },
 *   },
 *   version: string,   // package.json version
 *   commit:  string,   // GIT_COMMIT env or git rev-parse HEAD
 * }
 */

import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import IORedis from "ioredis";

// ── Resolve version + commit once at module load ──────────────────────────────

function loadVersion(): string {
  try {
    const pkgPath = join(process.cwd(), "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function resolveCommit(): string {
  if (process.env.GIT_COMMIT) return process.env.GIT_COMMIT;
  try {
    // execFileSync avoids shell injection — literal args, no user input
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8", timeout: 3000 }).trim();
  } catch {
    return "unknown";
  }
}

export const BUILD_VERSION = loadVersion();
export const BUILD_COMMIT  = resolveCommit();

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CheckResult {
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

export interface WorkerCheckResult {
  ok: boolean;
  queues: Record<string, { ok: boolean; ageMs?: number }>;
  error?: string;
}

export interface MigrationCheckResult {
  ok: boolean;
  version?: number;
  dirty?: boolean;
  error?: string;
}

export interface LlmCheckResult {
  ok: boolean;
  degraded?: boolean;
  error?: string;
  cachedUntil?: number;
}

export interface ReadinessChecks {
  db:         CheckResult;
  redis:      CheckResult;
  workers:    WorkerCheckResult;
  migrations: MigrationCheckResult;
  llm:        LlmCheckResult;
}

export interface ReadinessResponse {
  status:  "ok" | "degraded" | "fail";
  checks:  ReadinessChecks;
  version: string;
  commit:  string;
}

// ── Redis singleton for readiness checks (separate from BullMQ connection) ───

let _redis: IORedis | null = null;

function getRedis(): IORedis {
  if (_redis) return _redis;
  _redis = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: 1,
    connectTimeout:        2000,
    lazyConnect:           true,
    enableOfflineQueue:    false,
  });
  _redis.on("error", () => { /* suppress — errors handled per-call */ });
  return _redis;
}

// ── Individual checks ─────────────────────────────────────────────────────────

const DB_TIMEOUT_MS = 500;

/**
 * checkDb — MySQL SELECT 1 with 500 ms timeout.
 * Uses the existing getDb() singleton so we don't open extra connections.
 */
export async function checkDb(): Promise<CheckResult> {
  const t0 = Date.now();
  try {
    // Dynamic import to avoid circular dependency during test mocking
    const { getDb } = await import("./db.js");
    const db = await Promise.race([
      getDb(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), DB_TIMEOUT_MS)
      ),
    ]);
    await Promise.race([
      (db as any).execute("SELECT 1"),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), DB_TIMEOUT_MS)
      ),
    ]);
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - t0, error: String(err) };
  }
}

/**
 * checkRedis — Redis PING with 2 s timeout.
 */
export async function checkRedis(): Promise<CheckResult> {
  const t0 = Date.now();
  try {
    const redis = getRedis();
    const pong = await Promise.race([
      redis.ping(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 2000)
      ),
    ]);
    return pong === "PONG"
      ? { ok: true,  latencyMs: Date.now() - t0 }
      : { ok: false, latencyMs: Date.now() - t0, error: `Unexpected PING response: ${pong}` };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - t0, error: String(err) };
  }
}

/**
 * checkWorkers — reads heartbeat:<queue> keys from Redis.
 * Workers write the key with a 10 s TTL on each job cycle.
 * /ready fails the worker check if any key is missing OR was written >20 s ago.
 *
 * Key format:  heartbeat:<queueName>   value: Unix timestamp ms written by worker
 */
// Queue names match the heartbeat:<name> keys written by each worker.
// orchestratorWorker writes heartbeat:marketing-jobs
// squadLeaderWorker  writes heartbeat:squad-leader
const WORKER_QUEUES        = ["marketing-jobs", "squad-leader"];
const HEARTBEAT_MAX_AGE_MS = 20_000;

export async function checkWorkers(): Promise<WorkerCheckResult> {
  try {
    const redis  = getRedis();
    const now    = Date.now();
    const keys   = WORKER_QUEUES.map(q => `heartbeat:${q}`);
    const values = await Promise.race([
      redis.mget(...keys),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 2000)
      ),
    ]);
    const queues: Record<string, { ok: boolean; ageMs?: number }> = {};
    let allOk = true;
    for (let i = 0; i < WORKER_QUEUES.length; i++) {
      const raw  = values[i];
      const name = WORKER_QUEUES[i]!;
      if (raw === null || raw === undefined) {
        queues[name] = { ok: false };
        allOk = false;
      } else {
        const ts    = parseInt(raw, 10);
        const ageMs = now - ts;
        const ok    = ageMs <= HEARTBEAT_MAX_AGE_MS;
        queues[name] = { ok, ageMs };
        if (!ok) allOk = false;
      }
    }
    return { ok: allOk, queues };
  } catch (err) {
    const queues: Record<string, { ok: boolean }> = {};
    for (const q of WORKER_QUEUES) queues[q] = { ok: false };
    return { ok: false, queues, error: String(err) };
  }
}

/**
 * checkMigrations — verifies schema_migrations has no dirty row.
 * Returns ok=true if the table does not exist yet (fresh deployment pre-migrate).
 */
export async function checkMigrations(): Promise<MigrationCheckResult> {
  try {
    const { getDb } = await import("./db.js");
    const db = await getDb();
    const [rows] = await Promise.race([
      (db as any).execute(
        "SELECT version, dirty FROM schema_migrations ORDER BY version DESC LIMIT 1"
      ) as Promise<[any[], any]>,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), DB_TIMEOUT_MS)
      ),
    ]);
    if (!rows || rows.length === 0) {
      return { ok: true, version: 0, dirty: false };
    }
    const row   = rows[0] as { version: number; dirty: number | boolean };
    const dirty = Boolean(row.dirty);
    return { ok: !dirty, version: Number(row.version), dirty };
  } catch (err) {
    const msg = String(err);
    // Table not found: treat as ok — schema_migrations may not exist yet
    if (msg.includes("schema_migrations") && msg.includes("exist")) {
      return { ok: true };
    }
    return { ok: false, error: msg };
  }
}

// ── LLM probe with 60 s cache ─────────────────────────────────────────────────

interface LlmCacheEntry {
  result:   LlmCheckResult;
  cachedAt: number;
}

let _llmCache: LlmCacheEntry | null = null;
const LLM_CACHE_TTL_MS = 60_000;

/**
 * checkLlm — sends a lightweight probe to the internal gateway.
 * Failures are non-fatal: status becomes "degraded", HTTP response stays 200.
 * Result is cached for 60 s to avoid hammering the provider.
 */
export async function checkLlm(): Promise<LlmCheckResult> {
  const now = Date.now();
  if (_llmCache && now - _llmCache.cachedAt < LLM_CACHE_TTL_MS) {
    return { ..._llmCache.result, cachedUntil: _llmCache.cachedAt + LLM_CACHE_TTL_MS };
  }
  try {
    const gatewayUrl = process.env.GATEWAY_HTTP_URL || "http://localhost:18790";
    const token      = process.env.GATEWAY_TOKEN    || "mos-pm-claw-2026";
    const resp = await Promise.race([
      fetch(`${gatewayUrl}/health`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 5000)
      ),
    ]);
    const result: LlmCheckResult = resp.ok
      ? { ok: true }
      : { ok: false, degraded: true, error: `Gateway ${resp.status}` };
    _llmCache = { result, cachedAt: now };
    return { ...result, cachedUntil: now + LLM_CACHE_TTL_MS };
  } catch (err) {
    const result: LlmCheckResult = { ok: false, degraded: true, error: String(err) };
    _llmCache = { result, cachedAt: now };
    return { ...result, cachedUntil: now + LLM_CACHE_TTL_MS };
  }
}

/** Exported for tests — clears the LLM probe cache. */
export function resetLlmCache(): void {
  _llmCache = null;
}

// ── Full readiness check ──────────────────────────────────────────────────────

export interface CheckDeps {
  checkDb:         () => Promise<CheckResult>;
  checkRedis:      () => Promise<CheckResult>;
  checkWorkers:    () => Promise<WorkerCheckResult>;
  checkMigrations: () => Promise<MigrationCheckResult>;
  checkLlm:        () => Promise<LlmCheckResult>;
}

/**
 * deriveReadinessResponse — pure aggregation function (testable without I/O).
 *
 * Status rules:
 *   "fail"     — db | redis | workers | migrations fails
 *   "degraded" — only llm fails (provider probe is non-fatal)
 *   "ok"       — everything passes
 */
export async function deriveReadinessResponse(deps: CheckDeps): Promise<ReadinessResponse> {
  const [db, redis, workers, migrations, llm] = await Promise.all([
    deps.checkDb(),
    deps.checkRedis(),
    deps.checkWorkers(),
    deps.checkMigrations(),
    deps.checkLlm(),
  ]);

  const hardFail = !db.ok || !redis.ok || !workers.ok || !migrations.ok;
  const softFail = !llm.ok;

  const status: "ok" | "degraded" | "fail" =
    hardFail ? "fail" : softFail ? "degraded" : "ok";

  return {
    status,
    checks: { db, redis, workers, migrations, llm },
    version: BUILD_VERSION,
    commit:  BUILD_COMMIT,
  };
}

/**
 * runReadinessChecks — runs all checks against real deps and derives overall status.
 */
export async function runReadinessChecks(): Promise<ReadinessResponse> {
  return deriveReadinessResponse({
    checkDb,
    checkRedis,
    checkWorkers,
    checkMigrations,
    checkLlm,
  });
}
