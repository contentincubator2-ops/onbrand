import { describe, expect, it, vi } from "vitest";
import {
  hasStrategyStepBudget,
  runAuthorizedStrategyStep,
  selectAuthorizedStrategyProvider,
} from "./strategyPublicStepRouting";

describe("strategy public step provider routing", () => {
  it("always selects Anthropic first regardless of the former weighted draw", () => {
    expect(selectAuthorizedStrategyProvider(0)).toBe("anthropic");
    expect(selectAuthorizedStrategyProvider(0.549)).toBe("anthropic");
    expect(selectAuthorizedStrategyProvider(0.55)).toBe("anthropic");
    expect(selectAuthorizedStrategyProvider(0.999)).toBe("anthropic");
  });

  it("tries the other provider when the selected provider fails with enough time left", async () => {
    const execute = vi.fn()
      .mockRejectedValueOnce(new Error("anthropic unavailable"))
      .mockResolvedValueOnce("openai result");

    await expect(runAuthorizedStrategyStep({
      selectedProvider: "anthropic",
      deadlineAt: 25_000,
      now: () => 0,
      execute,
    })).resolves.toMatchObject({
      ok: true,
      value: "openai result",
      provider: "openai",
      attempt: 2,
      errorCode: null,
    });
    expect(execute.mock.calls.map(([provider]) => provider)).toEqual(["anthropic", "openai"]);
  });

  it("does not try the other provider when fewer than five seconds remain", async () => {
    let now = 0;
    const execute = vi.fn(async () => {
      now = 20_001;
      throw new Error("anthropic unavailable");
    });

    await expect(runAuthorizedStrategyStep({
      selectedProvider: "anthropic",
      deadlineAt: 25_000,
      now: () => now,
      execute,
    })).resolves.toMatchObject({
      ok: false,
      provider: "anthropic",
      attempt: 1,
      errorCode: "step_provider_failed",
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("reports the all-providers error code when both authorized providers fail", async () => {
    const execute = vi.fn()
      .mockRejectedValueOnce(new Error("anthropic unavailable"))
      .mockRejectedValueOnce(new Error("openai unavailable"));

    await expect(runAuthorizedStrategyStep({
      selectedProvider: "anthropic",
      deadlineAt: 25_000,
      now: () => 0,
      execute,
    })).resolves.toMatchObject({
      ok: false,
      provider: "openai",
      attempt: 2,
      errorCode: "step_all_providers_failed",
    });
  });
});

describe("strategy step route budget", () => {
  it("starts a step only when its full 25-second deadline fits before the 125-second route guard", () => {
    expect(hasStrategyStepBudget({ routeStartedAt: 1_000, now: 101_000 })).toBe(true);
    expect(hasStrategyStepBudget({ routeStartedAt: 1_000, now: 101_001 })).toBe(false);
  });
});
