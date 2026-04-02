import { describe, it, expect } from "vitest";
import { formatMarketIntelForPrompt, sanitizeKeyword } from "./marketIntel";
import type { MarketIntelResult } from "./marketIntel";

describe("formatMarketIntelForPrompt", () => {
  it("returns empty string for empty results", () => {
    expect(formatMarketIntelForPrompt([])).toBe("");
  });

  it("groups results by type", () => {
    const results: MarketIntelResult[] = [
      {
        type: "competitor_news",
        title: "Test News",
        content: "Content",
        source: "TechCrunch",
        publishedAt: "",
        relevanceScore: 100,
      },
      {
        type: "trending_topic",
        title: "Hot Topic",
        content: "Trending",
        source: "Twitter",
        publishedAt: "",
        relevanceScore: 80,
      },
    ];
    const output = formatMarketIntelForPrompt(results);
    expect(output).toContain("競品最新動態");
    expect(output).toContain("市場熱門話題");
    expect(output).toContain("Test News");
    expect(output).toContain("Hot Topic");
  });

  it("limits to 3 items per type", () => {
    const results: MarketIntelResult[] = Array(5)
      .fill(null)
      .map((_, i) => ({
        type: "competitor_news" as const,
        title: `News ${i}`,
        content: "Content",
        source: "Source",
        publishedAt: "",
        relevanceScore: 100 - i,
      }));
    const output = formatMarketIntelForPrompt(results);
    expect(output).toContain("News 0");
    expect(output).toContain("News 2");
    expect(output).not.toContain("News 4"); // 4th item (index 4) should be cut off
  });

  it("handles all three result types", () => {
    const results: MarketIntelResult[] = [
      {
        type: "competitor_news",
        title: "Competitor",
        content: "...",
        source: "S1",
        publishedAt: "",
        relevanceScore: 90,
      },
      {
        type: "trending_topic",
        title: "Trend",
        content: "...",
        source: "S2",
        publishedAt: "",
        relevanceScore: 80,
      },
      {
        type: "social_trend",
        title: "Social",
        content: "...",
        source: "S3",
        publishedAt: "",
        relevanceScore: 70,
      },
    ];
    const output = formatMarketIntelForPrompt(results);
    expect(output).toContain("競品最新動態");
    expect(output).toContain("市場熱門話題");
    expect(output).toContain("社群趨勢");
  });

  it("includes the market intel header", () => {
    const results: MarketIntelResult[] = [
      {
        type: "competitor_news",
        title: "News",
        content: "Content",
        source: "Src",
        publishedAt: "",
        relevanceScore: 100,
      },
    ];
    expect(formatMarketIntelForPrompt(results)).toContain("即時市場情報");
  });
});

describe("sanitizeKeyword", () => {
  it("removes SQL special chars", () => {
    expect(sanitizeKeyword("'; DROP TABLE--")).not.toContain("'");
    expect(sanitizeKeyword("'; DROP TABLE--")).not.toContain(";");
    expect(sanitizeKeyword("%_\\")).toBe("");
  });

  it("truncates to 50 chars", () => {
    expect(sanitizeKeyword("a".repeat(100)).length).toBeLessThanOrEqual(50);
  });

  it("preserves normal keywords", () => {
    expect(sanitizeKeyword("品牌行銷")).toBe("品牌行銷");
    expect(sanitizeKeyword("Meta Ads 2024")).toBe("Meta Ads 2024");
  });

  it("trims whitespace", () => {
    expect(sanitizeKeyword("  keyword  ")).toBe("keyword");
  });
});
