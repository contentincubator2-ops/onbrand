/**
 * Lock in schema tolerance — LLMs drift, the schema must absorb it.
 */
import { describe, it, expect } from "vitest";
import { parseQuickTaskOutput } from "./quickTaskOutput";

describe("parseQuickTaskOutput — LLM drift tolerance", () => {
  it("accepts color_palette as array (auto-joins)", () => {
    const r = parseQuickTaskOutput({
      tier: "60s",
      platform: "facebook",
      post_type: "feed",
      caption: "test",
      image_style_direction: {
        summary: "warm hand-held",
        color_palette: ["粉櫻", "暖陽", "寶藍"],
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.image_style_direction?.color_palette).toBe("粉櫻 · 暖陽 · 寶藍");
    }
  });

  it("accepts tone as comma-separated string OR as array", () => {
    const fromString = parseQuickTaskOutput({
      tier: "60s", platform: "facebook", post_type: "feed", caption: "x",
      image_style_direction: { summary: "x", tone: "warm, golden, hand-held" },
    });
    expect(fromString.ok).toBe(true);
    if (fromString.ok) {
      expect(fromString.data.image_style_direction?.tone).toEqual(["warm", "golden", "hand-held"]);
    }
    const fromArray = parseQuickTaskOutput({
      tier: "60s", platform: "facebook", post_type: "feed", caption: "x",
      image_style_direction: { summary: "x", tone: ["warm", "golden"] },
    });
    expect(fromArray.ok).toBe(true);
    if (fromArray.ok) {
      expect(fromArray.data.image_style_direction?.tone).toEqual(["warm", "golden"]);
    }
  });

  it("auto-fills missing variant.label as 版本 N", () => {
    const r = parseQuickTaskOutput({
      tier: "60s", platform: "facebook", post_type: "feed", caption: "x",
      variants: [
        { caption: "ver A" },
        { caption: "ver B" },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.variants?.[0].label).toBe("版本 1");
      expect(r.data.variants?.[1].label).toBe("版本 2");
    }
  });

  it("accepts non-standard aspect_ratio (open string)", () => {
    const r = parseQuickTaskOutput({
      tier: "30s", platform: "facebook", post_type: "feed", caption: "x",
      image_style_direction: { summary: "x", aspect_ratio: "9x16" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.image_style_direction?.aspect_ratio).toBe("9x16");
    }
  });

  it("still rejects truly malformed output (missing caption)", () => {
    const r = parseQuickTaskOutput({
      tier: "30s", platform: "facebook", post_type: "feed",
      // no caption
    });
    expect(r.ok).toBe(false);
  });

  it("preserves partial output even when invalid (no exception)", () => {
    const r = parseQuickTaskOutput({
      tier: "30s", platform: "facebook", post_type: "feed",
      caption: "", // too short
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.partial.caption).toBe("");
    }
  });
});
