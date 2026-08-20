import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  deriveStrategyRouteBudget,
  hasStrategyStepBudget,
  runAnthropicStrategyStep,
  STRATEGY_SERVER_TIMEOUT_MS,
  STRATEGY_STEP_PROVIDER,
} from "./strategyPublicStepRouting";

describe("strategy public step provider routing", () => {
  it("gives one Anthropic attempt the full step deadline", async () => {
    const execute = vi.fn().mockResolvedValue("anthropic result");

    await expect(runAnthropicStrategyStep({
      deadlineAt: 40_000,
      now: () => 0,
      execute,
    })).resolves.toEqual({
      ok: true,
      value: "anthropic result",
      provider: STRATEGY_STEP_PROVIDER,
      attempt: 1,
      errorCode: null,
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("does not route a provider failure to a second provider", async () => {
    const error = new Error("anthropic unavailable");
    const execute = vi.fn().mockRejectedValue(error);

    await expect(runAnthropicStrategyStep({
      deadlineAt: 40_000,
      now: () => 0,
      execute,
    })).resolves.toEqual({
      ok: false,
      error,
      provider: "anthropic",
      attempt: 1,
      errorCode: "step_provider_failed",
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("does not invoke Anthropic after the step deadline has elapsed", async () => {
    const execute = vi.fn().mockResolvedValue("late result");

    await expect(runAnthropicStrategyStep({
      deadlineAt: 40_000,
      now: () => 40_000,
      execute,
    })).resolves.toMatchObject({
      ok: false,
      provider: "anthropic",
      attempt: 1,
      errorCode: "step_timeout",
    });
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("strategy route budget derivation", () => {
  it("stays synchronized with the Node socket timeout in server/index.ts", () => {
    const serverEntrySource = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
    const assignment = serverEntrySource.match(/^\s*server\.timeout\s*=\s*([\d_]+)\s*;/m);

    expect(assignment, "server/index.ts must keep an explicit server.timeout assignment").not.toBeNull();
    const serverSocketTimeoutMs = Number(assignment![1].replaceAll("_", ""));
    expect(STRATEGY_SERVER_TIMEOUT_MS).toBe(serverSocketTimeoutMs);
  });

  it("derives the four-step production budget without fixing the function to four steps", () => {
    expect(deriveStrategyRouteBudget({
      stepCount: 4,
      serverTimeoutMs: 220_000,
    })).toEqual({
      routeLimitMs: 205_000,
      stepDeadlineMs: 40_000,
      planningWorstCaseMs: 172_000,
      synchronousWorstCaseMs: 176_000,
      routeHeadroomMs: 33_000,
      serverHeadroomMs: 44_000,
      fitsRouteBudget: true,
    });
  });

  it("recalculates from a variable DB step count and server upper limit", () => {
    expect(deriveStrategyRouteBudget({
      stepCount: 5,
      serverTimeoutMs: 260_000,
    })).toEqual({
      routeLimitMs: 245_000,
      stepDeadlineMs: 40_000,
      planningWorstCaseMs: 212_000,
      synchronousWorstCaseMs: 216_000,
      routeHeadroomMs: 33_000,
      serverHeadroomMs: 44_000,
      fitsRouteBudget: true,
    });
    expect(deriveStrategyRouteBudget({
      stepCount: 5,
      serverTimeoutMs: 220_000,
    }).fitsRouteBudget).toBe(false);
  });

  it("admits a step only when its complete 40-second deadline fits before the 205-second guard", () => {
    expect(hasStrategyStepBudget({
      routeStartedAt: 1_000,
      now: 166_000,
      routeLimitMs: 205_000,
      stepDeadlineMs: 40_000,
    })).toBe(true);
    expect(hasStrategyStepBudget({
      routeStartedAt: 1_000,
      now: 166_001,
      routeLimitMs: 205_000,
      stepDeadlineMs: 40_000,
    })).toBe(false);
  });
});
