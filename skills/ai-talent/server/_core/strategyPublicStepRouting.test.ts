import { describe, expect, it, vi } from "vitest";
import {
  getPrimaryAuthorizedStrategyProvider,
  hasStrategyStepBudget,
  runAuthorizedStrategyStep,
  summarizeStrategyAttemptError,
} from "./strategyPublicStepRouting";

describe("strategy public step provider routing", () => {
  it("exposes Anthropic as the fixed primary without a weighted-draw argument", () => {
    expect(getPrimaryAuthorizedStrategyProvider()).toBe("anthropic");
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
      attempt1Provider: "anthropic",
      attempt1Error: "Error: unclassified provider failure",
      attempt2Provider: "openai",
      attempt2Error: null,
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
      attempt1Provider: "anthropic",
      attempt1Error: "Error: unclassified provider failure",
      attempt2Provider: null,
      attempt2Error: null,
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
      attempt1Provider: "anthropic",
      attempt1Error: "Error: unclassified provider failure",
      attempt2Provider: "openai",
      attempt2Error: "Error: unclassified provider failure",
    });
  });
});

describe("strategy attempt error summaries", () => {
  it.each([
    "LLM provider returned empty content",
    "LLM provider returned unsafe reasoning content",
  ])("preserves the fixed safe diagnostic: %s", (message) => {
    expect(summarizeStrategyAttemptError(new Error(message))).toBe(message);
  });

  it("keeps HTTP status but strips the provider response body", () => {
    const summary = summarizeStrategyAttemptError(new Error(
      "LLM invoke failed: 400 Bad Request – rejected output: SECRET_BRAND_COPY",
    ));
    expect(summary).toBe("LLM invoke failed: HTTP 400");
    expect(summary).not.toContain("SECRET_BRAND_COPY");
  });

  it("redacts unrecognized error messages instead of logging their content", () => {
    const summary = summarizeStrategyAttemptError(new TypeError(
      "prompt included PRIVATE_BRAND_DATA",
    ));
    expect(summary).toBe("TypeError: unclassified provider failure");
    expect(summary).not.toContain("PRIVATE_BRAND_DATA");
  });
});

describe("strategy step route budget", () => {
  it("starts a step only when its full 25-second deadline fits before the 125-second route guard", () => {
    expect(hasStrategyStepBudget({ routeStartedAt: 1_000, now: 101_000 })).toBe(true);
    expect(hasStrategyStepBudget({ routeStartedAt: 1_000, now: 101_001 })).toBe(false);
  });
});
