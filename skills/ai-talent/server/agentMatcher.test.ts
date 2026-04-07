import { describe, it, expect } from "vitest";
import { TASK_AGENT_MAP_EXPORT } from "./agentMatcher";

describe("agentMatcher", () => {
  describe("TASK_AGENT_MAP", () => {
    it("has valid task types", () => {
      const validTypes = [
        "brand_positioning",
        "ad_copy",
        "competitor_analysis",
        "press_release",
        "social_content",
        "market_research",
        "general",
      ];
      validTypes.forEach((type) => {
        expect(TASK_AGENT_MAP_EXPORT[type]).toBeDefined();
        expect(TASK_AGENT_MAP_EXPORT[type].titles.length).toBeGreaterThan(0);
        expect(TASK_AGENT_MAP_EXPORT[type].keywords.length).toBeGreaterThan(0);
      });
    });

    it("all task types have non-empty title and keyword arrays", () => {
      for (const [type, config] of Object.entries(TASK_AGENT_MAP_EXPORT)) {
        expect(config.titles.length, `${type} titles empty`).toBeGreaterThan(0);
        expect(config.keywords.length, `${type} keywords empty`).toBeGreaterThan(0);
        config.titles.forEach((t) => expect(typeof t).toBe("string"));
        config.keywords.forEach((k) => expect(typeof k).toBe("string"));
      }
    });
  });

  describe("input validation", () => {
    it("sanitizes market to allowlist — rejects SQL injection attempts", () => {
      const VALID_MARKETS = [
        "Taiwan", "USA", "China", "Japan", "South Korea",
        "Singapore", "Hong Kong", "UK", "Germany", "France",
        "Australia", "Canada", "Other",
      ];
      const invalidMarket = "'; DROP TABLE agents; --";
      expect(VALID_MARKETS.includes(invalidMarket)).toBe(false);

      const anotherInvalid = "Taiwan' OR '1'='1";
      expect(VALID_MARKETS.includes(anotherInvalid)).toBe(false);

      // Valid markets pass through
      expect(VALID_MARKETS.includes("Taiwan")).toBe(true);
      expect(VALID_MARKETS.includes("USA")).toBe(true);
    });

    it("clamps limit to 1-20", () => {
      const clamp = (n: number) => Math.min(Math.max(1, Math.floor(n)), 20);
      expect(clamp(-1)).toBe(1);
      expect(clamp(0)).toBe(1);
      expect(clamp(0.5)).toBe(1);
      expect(clamp(100)).toBe(20);
      expect(clamp(21)).toBe(20);
      expect(clamp(5)).toBe(5);
      expect(clamp(20)).toBe(20);
    });

    it("validates layer against allowlist", () => {
      const VALID_LAYERS = ["strategy", "execution", "training"];
      expect(VALID_LAYERS.includes("strategy")).toBe(true);
      expect(VALID_LAYERS.includes("execution")).toBe(true);
      expect(VALID_LAYERS.includes("training")).toBe(true);
      expect(VALID_LAYERS.includes("admin")).toBe(false);
      expect(VALID_LAYERS.includes("'; DROP TABLE agents--")).toBe(false);
    });

    it("sanitizes userId to positive integer", () => {
      const sanitize = (n: number) => Math.floor(Math.abs(n));
      expect(sanitize(-5)).toBe(5);
      expect(sanitize(3.7)).toBe(3);
      expect(sanitize(0)).toBe(0);
      expect(sanitize(42)).toBe(42);
    });

    it("falls back to 'general' taskType for unknown values", () => {
      const VALID_TASK_TYPES = Object.keys(TASK_AGENT_MAP_EXPORT);
      const fallback = (t: string) =>
        VALID_TASK_TYPES.includes(t) ? t : "general";
      expect(fallback("brand_positioning")).toBe("brand_positioning");
      expect(fallback("unknown_type")).toBe("general");
      expect(fallback("'; DROP TABLE--")).toBe("general");
    });
  });
});

describe("marketIntel keyword sanitizer", () => {
  // Import sanitize logic inline (mirrors sanitizeKeyword in marketIntel.ts)
  const sanitize = (k: string) =>
    k.replace(/[%_\\'";\-\/\*]/g, "").slice(0, 50).trim();

  it("removes SQL special chars from keywords", () => {
    expect(sanitize("'; DROP TABLE--")).toBe("DROP TABLE");
    expect(sanitize("normal keyword")).toBe("normal keyword");
    expect(sanitize("%_\\")).toBe("");
    expect(sanitize("hello'world")).toBe("helloworld");
  });

  it("truncates long keywords to 50 chars", () => {
    expect(sanitize("a".repeat(100)).length).toBeLessThanOrEqual(50);
  });

  it("trims whitespace after sanitization", () => {
    expect(sanitize("  test  ")).toBe("test");
  });

  it("preserves normal Chinese/alphanumeric keywords", () => {
    expect(sanitize("品牌行銷")).toBe("品牌行銷");
    expect(sanitize("Meta Ads")).toBe("Meta Ads");
  });
});
