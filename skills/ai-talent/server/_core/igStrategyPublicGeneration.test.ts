import { describe, expect, it } from "vitest";
import {
  assertIgStrategyPublicCampaignSafe,
  getIgStrategyPublicSynthesisDeadlineMs,
  IG_STRATEGY_SYNTHESIS_MAX_TOKENS,
  isIgStrategyPublicSynthesisTruncated,
} from "./igStrategyPublicGeneration";
import type { IgStrategyPublicVariant } from "./igStrategyPublicSynthesis";

function variant(id: string, caption: string): IgStrategyPublicVariant {
  return {
    id,
    label: id,
    format: "feed",
    caption,
    hashtags: [],
    image: { style: null, url: null, status: "skipped" },
  };
}

function assertCampaign(variants: readonly IgStrategyPublicVariant[]): void {
  assertIgStrategyPublicCampaignSafe({
    idOrSlug: "ig-fanzo-live-first",
    variants,
    steps: [],
    outputLanguage: "zh-TW",
    privateTerms: [],
  });
}

describe("IG strategy public campaign boundary", () => {
  it("allows independently valid variants to choose different reader addresses", () => {
    expect(() => assertCampaign([
      variant("live-promo-reel-1", "你可以先預告這場直播的核心問題。"),
      variant("live-reminder-story-1", "你們可以在開播前留下最想問的問題。"),
      variant("live-recap-feed-1", "如果您錯過直播，可以先收藏這份重點。"),
    ])).not.toThrow();
  });

  it("still rejects mixed reader addresses inside one variant", () => {
    expect(() => assertCampaign([
      variant("live-promo-reel-1", "你可以先預告主題，你們也可以整理問題。"),
    ])).toThrow("strategy public audience address validation failed");
  });

  it("does not let audience context from another variant validate an ambiguous 她", () => {
    expect(() => assertCampaign([
      variant("live-promo-reel-1", "不解決她正在經歷的卡點，就無法幫助她採取行動。"),
      variant("live-reminder-story-1", "受眾可以在開播前留下問題。"),
    ])).toThrow("strategy public perspective validation failed");
  });
});

describe("IG strategy public synthesis limits", () => {
  it("recognizes provider token-limit finish reasons as truncation", () => {
    expect(IG_STRATEGY_SYNTHESIS_MAX_TOKENS).toBe(8_192);
    expect(isIgStrategyPublicSynthesisTruncated("max_tokens")).toBe(true);
    expect(isIgStrategyPublicSynthesisTruncated(" length ")).toBe(true);
    expect(isIgStrategyPublicSynthesisTruncated("stop")).toBe(false);
    expect(isIgStrategyPublicSynthesisTruncated(null)).toBe(false);
  });

  it("budgets retries and an optional serial recovery probe", () => {
    expect(getIgStrategyPublicSynthesisDeadlineMs({
      batchCount: 6,
      serialProbe: false,
      concurrency: 3,
      perAttemptTimeoutMs: 26_000,
      maxAttempts: 2,
    })).toBe(107_000);
    expect(getIgStrategyPublicSynthesisDeadlineMs({
      batchCount: 6,
      serialProbe: true,
      concurrency: 3,
      perAttemptTimeoutMs: 26_000,
      maxAttempts: 2,
    })).toBe(159_000);
  });
});
