import { describe, expect, it } from "vitest";
import { resolveSingleVersion } from "./singleVersion";

const base = { variants: 3, images: 3, variantLabels: ["誤會開場", "交換身分", "職場梗"] };

describe("resolveSingleVersion", () => {
  it("collapses alternate versions of one post to a single post", () => {
    expect(resolveSingleVersion({ ...base, taskId: "fb-30-reel-character-series" }))
      .toEqual({ variants: 1, images: 1, variantLabels: ["誤會開場"] });
  });
  it("keeps a text-only task text-only", () => {
    expect(resolveSingleVersion({ ...base, images: 0 })?.images).toBe(0);
  });
  it("leaves packs, cards, pools and multi-choice deliverables alone", () => {
    expect(resolveSingleVersion({ ...base, postLabels: ["Day 1", "Day 2", "Day 3"] })).toBeNull();
    expect(resolveSingleVersion({ ...base, postsCount: 3 })).toBeNull();
    expect(resolveSingleVersion({ ...base, variants: 1, cardsPerVariant: 5 })).toBeNull();
    expect(resolveSingleVersion({ ...base, variants: 5 })).toBeNull();
    expect(resolveSingleVersion({ ...base, taskId: "fb-30-ad-audience-split-test" })).toBeNull();
  });
});
