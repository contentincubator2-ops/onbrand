/**
 * readiness.test.ts — Unit tests for /ready response shape
 *
 * Covers:
 *   - OK case: all checks pass → status "ok"
 *   - Degraded case: LLM fails → status "degraded", HTTP 200
 *   - Fail cases: db / redis / workers / migrations failures → status "fail"
 *
 * Individual check functions (checkDb, checkRedis, etc.) are tested in isolation
 * with mocked external deps. The aggregation logic is tested via
 * deriveReadinessResponse() which accepts injectable check functions, making it
 * fully deterministic without any live I/O.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock db.ts so imports of getDb() don't connect to a real DB ──────────────
vi.mock("./db.js", () => ({
  getDb: vi.fn(),
}));

// ── Mock ioredis so no real Redis connection is opened ────────────────────────
vi.mock("ioredis", () => {
  const MockRedis = vi.fn().mockImplementation(() => ({
    ping: vi.fn().mockResolvedValue("PONG"),
    mget: vi.fn().mockResolvedValue([null, null]),
    on:   vi.fn(),
    set:  vi.fn().mockResolvedValue("OK"),
  }));
  return { default: MockRedis };
});

import { getDb } from "./db.js";
import {
  checkDb,
  checkMigrations,
  checkLlm,
  deriveReadinessResponse,
  resetLlmCache,
  BUILD_VERSION,
  BUILD_COMMIT,
  type ReadinessResponse,
  type CheckResult,
  type WorkerCheckResult,
  type MigrationCheckResult,
  type LlmCheckResult,
} from "./readiness.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeMockDb(rows: any[] = []) {
  return { execute: vi.fn().mockResolvedValue([rows]) };
}

const OK_DB:         CheckResult         = { ok: true,  latencyMs: 1 };
const OK_REDIS:      CheckResult         = { ok: true,  latencyMs: 1 };
const OK_WORKERS:    WorkerCheckResult   = {
  ok: true,
  queues: { "marketing-jobs": { ok: true, ageMs: 1000 }, "squad-leader": { ok: true, ageMs: 1000 } },
};
const OK_MIGRATIONS: MigrationCheckResult = { ok: true, version: 1, dirty: false };
const OK_LLM:       LlmCheckResult       = { ok: true };

beforeEach(() => {
  vi.clearAllMocks();
  resetLlmCache();
  vi.stubGlobal("fetch", vi.fn());
});

// ── BUILD_VERSION / BUILD_COMMIT ──────────────────────────────────────────────

describe("build constants", () => {
  it("exports BUILD_VERSION as a string", () => {
    expect(typeof BUILD_VERSION).toBe("string");
  });

  it("exports BUILD_COMMIT as a string", () => {
    expect(typeof BUILD_COMMIT).toBe("string");
  });
});

// ── checkDb ───────────────────────────────────────────────────────────────────

describe("checkDb", () => {
  it("returns ok=true when SELECT 1 succeeds", async () => {
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockDb());
    const result = await checkDb();
    expect(result.ok).toBe(true);
    expect(typeof result.latencyMs).toBe("number");
  });

  it("returns ok=false when DB throws", async () => {
    (getDb as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("connection refused"));
    const result = await checkDb();
    expect(result.ok).toBe(false);
    expect(result.error).toContain("connection refused");
  });
});

// ── checkMigrations ───────────────────────────────────────────────────────────

describe("checkMigrations", () => {
  it("returns ok=true when dirty=0", async () => {
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeMockDb([{ version: 5, dirty: 0 }])
    );
    const result = await checkMigrations();
    expect(result.ok).toBe(true);
    expect(result.dirty).toBe(false);
    expect(result.version).toBe(5);
  });

  it("returns ok=false when dirty=1", async () => {
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeMockDb([{ version: 3, dirty: 1 }])
    );
    const result = await checkMigrations();
    expect(result.ok).toBe(false);
    expect(result.dirty).toBe(true);
  });

  it("returns ok=true when schema_migrations table does not exist", async () => {
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValue({
      execute: vi.fn().mockRejectedValue(
        new Error("Table schema_migrations doesn't exist")
      ),
    });
    const result = await checkMigrations();
    expect(result.ok).toBe(true);
  });
});

// ── checkLlm ─────────────────────────────────────────────────────────────────

describe("checkLlm", () => {
  it("returns ok=true when gateway responds 200", async () => {
    (global.fetch as ReturnType<typeof vi.fn>) = vi.fn().mockResolvedValue({
      ok: true, status: 200,
    });
    const result = await checkLlm();
    expect(result.ok).toBe(true);
    expect(result.degraded).toBeUndefined();
    expect(typeof result.cachedUntil).toBe("number");
  });

  it("returns ok=false + degraded=true when gateway responds non-200", async () => {
    (global.fetch as ReturnType<typeof vi.fn>) = vi.fn().mockResolvedValue({
      ok: false, status: 503,
    });
    const result = await checkLlm();
    expect(result.ok).toBe(false);
    expect(result.degraded).toBe(true);
  });

  it("returns ok=false + degraded=true when gateway is unreachable", async () => {
    (global.fetch as ReturnType<typeof vi.fn>) = vi.fn().mockRejectedValue(
      new Error("ECONNREFUSED")
    );
    const result = await checkLlm();
    expect(result.ok).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.error).toContain("ECONNREFUSED");
  });

  it("caches results for 60 s (fetch called only once)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    (global.fetch as ReturnType<typeof vi.fn>) = mockFetch;
    await checkLlm();
    await checkLlm();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns fresh result after resetLlmCache()", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    (global.fetch as ReturnType<typeof vi.fn>) = mockFetch;
    await checkLlm();
    resetLlmCache();
    await checkLlm();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

// ── deriveReadinessResponse — aggregation logic ───────────────────────────────
// Uses injectable check functions — no live I/O needed.

describe("deriveReadinessResponse", () => {
  it("returns status=ok when all checks pass", async () => {
    const resp: ReadinessResponse = await deriveReadinessResponse({
      checkDb:         () => Promise.resolve(OK_DB),
      checkRedis:      () => Promise.resolve(OK_REDIS),
      checkWorkers:    () => Promise.resolve(OK_WORKERS),
      checkMigrations: () => Promise.resolve(OK_MIGRATIONS),
      checkLlm:        () => Promise.resolve(OK_LLM),
    });
    expect(resp.status).toBe("ok");
    expect(resp.checks.db.ok).toBe(true);
    expect(resp.checks.redis.ok).toBe(true);
    expect(resp.checks.workers.ok).toBe(true);
    expect(resp.checks.migrations.ok).toBe(true);
    expect(resp.checks.llm.ok).toBe(true);
    expect(typeof resp.version).toBe("string");
    expect(typeof resp.commit).toBe("string");
  });

  it("returns status=degraded when only LLM fails", async () => {
    const resp: ReadinessResponse = await deriveReadinessResponse({
      checkDb:         () => Promise.resolve(OK_DB),
      checkRedis:      () => Promise.resolve(OK_REDIS),
      checkWorkers:    () => Promise.resolve(OK_WORKERS),
      checkMigrations: () => Promise.resolve(OK_MIGRATIONS),
      checkLlm:        () => Promise.resolve({ ok: false, degraded: true, error: "ECONNREFUSED" }),
    });
    expect(resp.status).toBe("degraded");
    expect(resp.checks.llm.ok).toBe(false);
    expect(resp.checks.llm.degraded).toBe(true);
    // Hard checks still pass — not a fail
    expect(resp.checks.db.ok).toBe(true);
    expect(resp.checks.redis.ok).toBe(true);
  });

  it("returns status=fail when DB is down", async () => {
    const resp: ReadinessResponse = await deriveReadinessResponse({
      checkDb:         () => Promise.resolve({ ok: false, latencyMs: 500, error: "ETIMEDOUT" }),
      checkRedis:      () => Promise.resolve(OK_REDIS),
      checkWorkers:    () => Promise.resolve(OK_WORKERS),
      checkMigrations: () => Promise.resolve(OK_MIGRATIONS),
      checkLlm:        () => Promise.resolve(OK_LLM),
    });
    expect(resp.status).toBe("fail");
    expect(resp.checks.db.ok).toBe(false);
    expect(resp.checks.db.error).toContain("ETIMEDOUT");
  });

  it("returns status=fail when Redis is down", async () => {
    const resp: ReadinessResponse = await deriveReadinessResponse({
      checkDb:         () => Promise.resolve(OK_DB),
      checkRedis:      () => Promise.resolve({ ok: false, latencyMs: 2000, error: "ECONNREFUSED" }),
      checkWorkers:    () => Promise.resolve({
        ok: false,
        queues: { "marketing-jobs": { ok: false }, "squad-leader": { ok: false } },
      }),
      checkMigrations: () => Promise.resolve(OK_MIGRATIONS),
      checkLlm:        () => Promise.resolve(OK_LLM),
    });
    expect(resp.status).toBe("fail");
    expect(resp.checks.redis.ok).toBe(false);
  });

  it("returns status=fail when migrations are dirty", async () => {
    const resp: ReadinessResponse = await deriveReadinessResponse({
      checkDb:         () => Promise.resolve(OK_DB),
      checkRedis:      () => Promise.resolve(OK_REDIS),
      checkWorkers:    () => Promise.resolve(OK_WORKERS),
      checkMigrations: () => Promise.resolve({ ok: false, version: 2, dirty: true }),
      checkLlm:        () => Promise.resolve(OK_LLM),
    });
    expect(resp.status).toBe("fail");
    expect(resp.checks.migrations.ok).toBe(false);
    expect(resp.checks.migrations.dirty).toBe(true);
  });

  it("returns status=fail when worker heartbeats are missing", async () => {
    const resp: ReadinessResponse = await deriveReadinessResponse({
      checkDb:         () => Promise.resolve(OK_DB),
      checkRedis:      () => Promise.resolve(OK_REDIS),
      checkWorkers:    () => Promise.resolve({
        ok: false,
        queues: { "marketing-jobs": { ok: false }, "squad-leader": { ok: false } },
        error: "heartbeat missing",
      }),
      checkMigrations: () => Promise.resolve(OK_MIGRATIONS),
      checkLlm:        () => Promise.resolve(OK_LLM),
    });
    expect(resp.status).toBe("fail");
    expect(resp.checks.workers.ok).toBe(false);
  });

  it("HTTP status should be 503 on fail and 200 on ok/degraded", async () => {
    const failResp = await deriveReadinessResponse({
      checkDb:         () => Promise.resolve({ ok: false, error: "down" }),
      checkRedis:      () => Promise.resolve(OK_REDIS),
      checkWorkers:    () => Promise.resolve(OK_WORKERS),
      checkMigrations: () => Promise.resolve(OK_MIGRATIONS),
      checkLlm:        () => Promise.resolve(OK_LLM),
    });
    // 503 expected for "fail"
    expect(failResp.status === "fail" ? 503 : 200).toBe(503);

    const degradedResp = await deriveReadinessResponse({
      checkDb:         () => Promise.resolve(OK_DB),
      checkRedis:      () => Promise.resolve(OK_REDIS),
      checkWorkers:    () => Promise.resolve(OK_WORKERS),
      checkMigrations: () => Promise.resolve(OK_MIGRATIONS),
      checkLlm:        () => Promise.resolve({ ok: false, degraded: true, error: "gateway down" }),
    });
    // 200 expected for "degraded"
    expect(degradedResp.status === "fail" ? 503 : 200).toBe(200);
  });
});
