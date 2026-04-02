import { describe, it, expect } from "vitest";
import {
  calcCostFromTokens,
  usdToCredits,
  MARKUP_FACTOR,
} from "./tokenLedger";

describe("tokenLedger", () => {
  it("calculates openai cost correctly", () => {
    // 1 000 prompt @ $0.0025/1K + 500 completion @ $0.010/1K = 0.0025 + 0.005 = 0.0075
    const cost = calcCostFromTokens("openai", 1000, 500);
    expect(cost).toBeCloseTo(0.0025 + 0.005);
  });

  it("calculates google (cheapest) cost", () => {
    // 1 000 prompt @ $0.000075/1K + 1 000 completion @ $0.0003/1K
    const cost = calcCostFromTokens("google", 1000, 1000);
    expect(cost).toBeCloseTo(0.000075 + 0.0003);
  });

  it("converts USD to credits with markup", () => {
    const credits = usdToCredits(0.01);
    // MARKUP_FACTOR=5, CREDITS_PER_USD=100 → ceil(0.01 * 5 * 100) = ceil(5) = 5
    expect(credits).toBe(Math.ceil(0.01 * MARKUP_FACTOR * 100));
  });

  it("falls back to openai pricing for unknown provider", () => {
    const costUnknown = calcCostFromTokens("unknown-provider", 1000, 0);
    const costOpenAI  = calcCostFromTokens("openai",           1000, 0);
    expect(costUnknown).toBe(costOpenAI);
  });

  it("returns zero cost for zero tokens", () => {
    expect(calcCostFromTokens("openai", 0, 0)).toBe(0);
  });

  it("usdToCredits always rounds up", () => {
    // e.g. 0.001 USD * 5 * 100 = 0.5 → ceil = 1
    expect(usdToCredits(0.001)).toBe(1);
  });
});
