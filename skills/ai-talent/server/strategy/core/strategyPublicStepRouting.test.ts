import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  deriveStrategyRouteBudget,
  getStrategyStepFinishErrorCode,
  hasStrategyStepBudget,
  isUsableTruncatedStrategyStepContent,
  MIN_USABLE_TRUNCATED_STRATEGY_STEP_CHARS,
  planStrategyPlanning,
  MAX_CONCURRENT_PLANNING_STEPS,
  runAnthropicStrategyStep,
  STRATEGY_STEP_BASELINE_MAX_TOKENS,
  STRATEGY_SERVER_TIMEOUT_MS,
  STRATEGY_STEP_DEADLINE_MS,
  STRATEGY_STEP_MAX_TOKENS,
  STRATEGY_STEP_OBSERVED_MAX_LATENCY_MS,
  STRATEGY_STEP_PROVIDER,
  STRATEGY_STEP_TOKEN_HEADROOM_DENOMINATOR,
  STRATEGY_STEP_TOKEN_HEADROOM_NUMERATOR,
  STRATEGY_STEP_ZH_TW_CHAR_LIMIT,
} from "./strategyPublicStepRouting";

describe("strategy step completion", () => {
  it.each(["max_tokens", "MAX_TOKENS", "length"])(
    "classifies %s as a truncated step",
    (finishReason) => {
      expect(getStrategyStepFinishErrorCode(finishReason)).toBe("step_truncated");
    },
  );

  it.each(["stop", "end_turn", null, undefined])(
    "accepts non-truncating finish reason %s",
    (finishReason) => {
      expect(getStrategyStepFinishErrorCode(finishReason)).toBeNull();
    },
  );

  it("keeps truncated output once it contains substantial synthesis material", () => {
    expect(isUsableTruncatedStrategyStepContent(
      "策".repeat(MIN_USABLE_TRUNCATED_STRATEGY_STEP_CHARS),
    )).toBe(true);
  });

  it("rejects a truncated fragment below the substantial-material threshold", () => {
    expect(isUsableTruncatedStrategyStepContent(
      "策".repeat(MIN_USABLE_TRUNCATED_STRATEGY_STEP_CHARS - 1),
    )).toBe(false);
  });

  it("derives the truncation threshold and token backstop from documented constants", () => {
    expect(MIN_USABLE_TRUNCATED_STRATEGY_STEP_CHARS)
      .toBe(Math.floor(STRATEGY_STEP_ZH_TW_CHAR_LIMIT / 4));
    expect(STRATEGY_STEP_MAX_TOKENS).toBe(Math.floor(
      STRATEGY_STEP_BASELINE_MAX_TOKENS
        * STRATEGY_STEP_TOKEN_HEADROOM_NUMERATOR
        / STRATEGY_STEP_TOKEN_HEADROOM_DENOMINATOR,
    ));
    expect(
      STRATEGY_STEP_OBSERVED_MAX_LATENCY_MS
        * STRATEGY_STEP_TOKEN_HEADROOM_NUMERATOR
        / STRATEGY_STEP_TOKEN_HEADROOM_DENOMINATOR,
    ).toBeLessThan(STRATEGY_STEP_DEADLINE_MS);
  });
});

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
    const serverEntrySource = readFileSync(new URL("../../index.ts", import.meta.url), "utf8");
    const assignment = serverEntrySource.match(/^\s*server\.timeout\s*=\s*([\d_]+)\s*;/m);

    expect(assignment, "server/index.ts must keep an explicit server.timeout assignment").not.toBeNull();
    const serverSocketTimeoutMs = Number(assignment![1].replaceAll("_", ""));
    expect(STRATEGY_SERVER_TIMEOUT_MS).toBe(serverSocketTimeoutMs);
  });

  it("derives the four-step production budget without fixing the function to four steps", () => {
    // Expressed against the constants, not copies of them: the shape of the
    // arithmetic is what this pins down, so re-sizing a budget does not have to
    // come with a hunt for restated numbers.
    const scout = 12_000;
    const persistence = 4_000;
    const reserve = 15_000;
    const planning = scout + (4 * STRATEGY_STEP_DEADLINE_MS);
    expect(deriveStrategyRouteBudget({
      stepCount: 4,
      serverTimeoutMs: 220_000,
    })).toEqual({
      routeLimitMs: 220_000 - reserve,
      stepDeadlineMs: STRATEGY_STEP_DEADLINE_MS,
      planningWorstCaseMs: planning,
      synchronousWorstCaseMs: planning + persistence,
      routeHeadroomMs: (220_000 - reserve) - planning,
      serverHeadroomMs: 220_000 - (planning + persistence),
      fitsRouteBudget: true,
    });
  });

  it("recalculates from a variable DB step count and server upper limit", () => {
    const planning5 = 12_000 + (5 * STRATEGY_STEP_DEADLINE_MS);
    expect(deriveStrategyRouteBudget({
      stepCount: 5,
      serverTimeoutMs: 260_000,
    })).toEqual({
      routeLimitMs: 245_000,
      stepDeadlineMs: STRATEGY_STEP_DEADLINE_MS,
      planningWorstCaseMs: planning5,
      synchronousWorstCaseMs: planning5 + 4_000,
      routeHeadroomMs: 245_000 - planning5,
      serverHeadroomMs: 260_000 - (planning5 + 4_000),
      fitsRouteBudget: true,
    });
    expect(deriveStrategyRouteBudget({
      stepCount: 5,
      serverTimeoutMs: 220_000,
    }).fitsRouteBudget).toBe(false);
  });

  it("keeps every step in its own round while the budget allows it", () => {
    const { waves, budget } = planStrategyPlanning({ stepCount: 4, serverTimeoutMs: 220_000 });
    expect(waves).toEqual([[0], [1], [2], [3]]);
    expect(budget.fitsRouteBudget).toBe(true);
  });

  it("merges only the leading steps when the budget cannot fit one round each", () => {
    // Sequentially five steps do not fit, which is why the last one used to be
    // refused outright and the whole public campaign lost with it.
    expect(deriveStrategyRouteBudget({
      stepCount: 5,
      serverTimeoutMs: 220_000,
    }).fitsRouteBudget).toBe(false);

    const { waves, budget } = planStrategyPlanning({ stepCount: 5, serverTimeoutMs: 220_000 });
    // The chained tail keeps its own rounds; only the two leading steps share.
    expect(waves).toEqual([[0, 1], [2], [3], [4]]);
    expect(budget.fitsRouteBudget).toBe(true);
  });

  it("never lets more than MAX_CONCURRENT_PLANNING_STEPS steps share a round", () => {
    for (const stepCount of [1, 2, 3, 4, 5, 6, 8, 9, 20]) {
      const { waves } = planStrategyPlanning({ stepCount, serverTimeoutMs: 220_000 });
      expect(Math.max(0, ...waves.map((wave) => wave.length)))
        .toBeLessThanOrEqual(MAX_CONCURRENT_PLANNING_STEPS);
    }
  });

  it("merges only the leading pair, never a pair further down the chain", () => {
    // Pairing by position deeper into the list would need a dependency graph
    // the step list does not carry: ig-chrisdo-visual-story's visual-content
    // and caption steps really do chain, so a [2,3] pair would hide one from
    // the other. Anything needing more merging is reported, not guessed at.
    for (const stepCount of [5, 6, 8, 9, 20]) {
      const { waves } = planStrategyPlanning({ stepCount, serverTimeoutMs: 220_000 });
      expect(waves.filter((wave) => wave.length > 1)).toEqual([[0, 1]]);
    }
  });

  it("never drops, duplicates or reorders a step when it merges a round", () => {
    for (const stepCount of [1, 2, 3, 4, 5, 6, 8, 9, 20]) {
      const { waves } = planStrategyPlanning({ stepCount, serverTimeoutMs: 220_000 });
      expect(waves.flat()).toEqual(Array.from({ length: stepCount }, (_, i) => i));
    }
  });

  it("reports the overflow instead of merging past the cap to hide it", () => {
    // Five steps fit once the leading pair merges. Six do not, and the plan
    // says so — the router refuses up front rather than paying for four rounds
    // and being turned away at the tail.
    expect(planStrategyPlanning({ stepCount: 5, serverTimeoutMs: 220_000 }).budget.fitsRouteBudget).toBe(true);
    for (const stepCount of [6, 9]) {
      expect(planStrategyPlanning({ stepCount, serverTimeoutMs: 220_000 }).budget.fitsRouteBudget).toBe(false);
    }
  });

  it("stays sequential when the route cannot even hold one step", () => {
    // Merging here would be backwards: it would run every step at once on the
    // tightest possible budget. The per-step admission guard refuses instead.
    const { waves } = planStrategyPlanning({
      stepCount: 4,
      serverTimeoutMs: 20_000,
      finalizationReserveMs: 15_000,
    });
    expect(waves).toEqual([[0], [1], [2], [3]]);
  });

  it("refuses to plan rounds against a zero-length step deadline", () => {
    expect(() => planStrategyPlanning({
      stepCount: 4,
      serverTimeoutMs: 220_000,
      stepDeadlineMs: 0,
    })).toThrow(RangeError);
  });

  it("admits a step only when its complete deadline fits before the route guard", () => {
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
