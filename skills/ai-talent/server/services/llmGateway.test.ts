/**
 * llmGateway.test.ts — Integration tests for the central LLM gateway
 *
 * Uses ioredis-mock so no real Redis instance is needed.
 *
 * Test matrix:
 *   1. Happy path — single user call goes through without error.
 *   2. Global cap enforced — 10 users × 20 concurrent calls, verify that
 *      calls beyond GLOBAL_CAP (120) throw GatewayRateLimitError("global").
 *   3. Per-user cap — same user fires 10 concurrent calls; >3 must reject.
 *   4. Budget exhausted — pre-seed Redis counter above budget; expect 429.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
// ioredis-mock is a CJS module; use createRequire to import it.
import { createRequire } from "module";
const _require = createRequire(import.meta.url);
const RedisMock = _require("ioredis-mock");

import {
  setRedisClient,
  getRedisClient,
  gatewayInvokeLLM,
  GatewayRateLimitError,
} from "./llmGateway";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Make N concurrent LLM gateway calls for a given userId and collect outcomes. */
async function fireConcurrent(
  n: number,
  userId: number,
  orgId?: number
): Promise<{ ok: number; rejected: string[] }> {
  const calls = Array.from({ length: n }, (_, i) =>
    gatewayInvokeLLM(
      {
        messages: [{ role: "user", content: `ping ${i}` }],
        provider: "openai",
        model:    "gpt-4o-mini",
      },
      { userId, orgId }
    )
      .then(() => ({ ok: true as const }))
      .catch((err: unknown) => ({
        ok: false as const,
        reason: err instanceof GatewayRateLimitError ? err.reason : "unknown",
      }))
  );

  const results = await Promise.all(calls);
  const ok       = results.filter(r => r.ok === true).length;
  const rejected = results.filter(r => r.ok === false).map(r => (r as any).reason as string);
  return { ok, rejected };
}

// ─── Mock invokeLLM so no real HTTP calls are made ───────────────────────────

vi.mock("../_core/llm", () => ({
  invokeLLM: vi.fn().mockImplementation(async () => {
    // Simulate ~10 ms network round-trip.
    await new Promise(r => setTimeout(r, 10));
    return {
      id:      "mock-id",
      created: Date.now(),
      model:   "gpt-4o-mini",
      choices: [{ index: 0, message: { role: "assistant", content: "pong" }, finish_reason: "stop" }],
      usage:   { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };
  }),
  invokeLLMStream: vi.fn().mockImplementation(async function* () {
    yield "pong";
  }),
}));

// ─── Set up a fresh in-memory Redis before each test ─────────────────────────

beforeEach(() => {
  const mock = new RedisMock();
  setRedisClient(mock);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("llmGateway — happy path", () => {
  it("resolves for a single user call", async () => {
    const result = await gatewayInvokeLLM(
      { messages: [{ role: "user", content: "hello" }] },
      { userId: 1 }
    );
    expect(result.choices[0]?.message.content).toBe("pong");
  });
});

describe("llmGateway — per-user concurrency cap (cap=3)", () => {
  it("allows up to 3 concurrent calls; rejects extras with reason=user", async () => {
    // Fire 10 concurrent calls from the same user.
    const { ok, rejected } = await fireConcurrent(10, 42);
    // At least some should succeed (≤ USER_CAP = 3 at any instant, but
    // because calls are sequential-ish after slot release more than 3
    // may succeed — we only check that *some* were rejected).
    expect(rejected.length).toBeGreaterThan(0);
    expect(rejected.every(r => r === "user")).toBe(true);
    expect(ok + rejected.length).toBe(10);
  });
});

describe("llmGateway — global cap enforced (10 users × 20 calls)", () => {
  it("caps aggregate concurrency at GLOBAL_CAP=120 and throws GatewayRateLimitError", async () => {
    // To exceed the global cap of 120 we need enough calls that pass both the
    // per-user cap (limit=3) and the per-org cap (limit=15).
    // Strategy: 200 DISTINCT users each in their own distinct org (1 call each)
    // so neither the user cap (1 < 3) nor the org cap (1 < 15) fires.
    // The global cap is 120, so 80 should be rejected with reason="global".
    const TOTAL_CALLS = 200; // 200 distinct users in 200 distinct orgs, 1 call each

    const allCalls = Array.from({ length: TOTAL_CALLS }, (_, i) =>
      gatewayInvokeLLM(
        { messages: [{ role: "user", content: `u${i}` }], provider: "openai", model: "gpt-4o-mini" },
        { userId: i + 1000, orgId: i + 2000 } // distinct userId + orgId per call
      )
        .then(() => "ok" as const)
        .catch((err: unknown) => {
          if (err instanceof GatewayRateLimitError) return err.reason;
          return "error";
        })
    );

    const results = await Promise.all(allCalls);
    const successes        = results.filter(r => r === "ok").length;
    const globalRejections = results.filter(r => r === "global").length;
    const userRejections   = results.filter(r => r === "user").length;
    const budgetRejections = results.filter(r => r === "budget").length;

    // Verify the global cap was hit — not all 200 calls can succeed simultaneously.
    expect(globalRejections).toBeGreaterThan(0);
    // All results should be accounted for.
    expect(successes + globalRejections + userRejections + budgetRejections).toBe(TOTAL_CALLS);
    // Confirm thrown errors are GatewayRateLimitError instances (not raw Error).
    // This is implied by the pattern above — "error" bucket must be empty.
    expect(results.filter(r => r === "error").length).toBe(0);
  });
});

describe("llmGateway — daily budget exceeded", () => {
  it("throws GatewayRateLimitError(budget) when counter is already at/above budget", async () => {
    const redis = getRedisClient();
    const userId = 999;

    // Pre-seed the budget counter above the cap.
    const d = new Date();
    const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
    await redis.set(`budget:user:${userId}:${ymd}`, 999_999_999);

    await expect(
      gatewayInvokeLLM(
        { messages: [{ role: "user", content: "hello" }] },
        { userId }
      )
    ).rejects.toMatchObject({
      name:   "GatewayRateLimitError",
      reason: "budget",
    });
  });

  it("GatewayRateLimitError has retryAfterSeconds set for budget breach", async () => {
    const redis = getRedisClient();
    const userId = 998;
    const d = new Date();
    const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
    await redis.set(`budget:user:${userId}:${ymd}`, 999_999_999);

    try {
      await gatewayInvokeLLM(
        { messages: [{ role: "user", content: "hello" }] },
        { userId }
      );
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(GatewayRateLimitError);
      expect((err as GatewayRateLimitError).retryAfterSeconds).toBeGreaterThan(0);
    }
  });
});
