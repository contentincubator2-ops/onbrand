import { describe, it, expect } from "vitest";
import { resolveTierVariantShape, isPackShape } from "./tierVariantShape";

const SIX_SEGMENTS = [
  "00:00-03:00 黃金開場", "03:00-10:00 主軸切入", "10:00-18:00 深度互動",
  "18:00-23:00 高潮／優惠公布", "23:00-28:00 限時催單", "28:00-30:00 收尾預告",
];

describe("resolveTierVariantShape", () => {
  it("ships every segment a pack declares — the 6-段 run of show keeps 收尾預告", () => {
    // ig-60-live-suite: the bug was variants:5, which cut the last segment.
    const s = resolveTierVariantShape({
      variants: 6, images: 6, variantLabels: SIX_SEGMENTS,
      postLabels: SIX_SEGMENTS, postsCount: 6,
    });
    expect(s.variants).toBe(6);
    expect(s.images).toBe(6);
    expect(s.variantLabels).toEqual(SIX_SEGMENTS);
    expect(s.variantLabels.at(-1)).toContain("收尾預告");
  });

  it("does not pad a 3-piece pack with 進階版／替代版 tabs it never promised", () => {
    // ig-60-serial-3 / ig-60-story-3frame / yt-60-series-3ep
    const labels = ["第 1 集", "第 2 集", "第 3 集"];
    const s = resolveTierVariantShape({
      variants: 3, images: 3, variantLabels: labels, postLabels: labels, postsCount: 3,
    });
    expect(s.variants).toBe(3);
    expect(s.images).toBe(3);
    expect(s.variantLabels).toEqual(labels);
  });

  it("keeps the 5-version floor for an alternatives task", () => {
    // fb-60-single-full: 2 alternative versions at 30s, 5 at 60s.
    const labels = ["情感版", "理性版", "故事版", "數據版", "懸念版"];
    const s = resolveTierVariantShape({ variants: 2, images: 2, variantLabels: labels });
    expect(s.variants).toBe(5);
    expect(s.images).toBe(5);
    expect(s.variantLabels).toEqual(labels);
  });

  it("pads a short non-pack up to the floor with generic labels", () => {
    const s = resolveTierVariantShape({ variants: 3, images: 0, variantLabels: ["A", "B", "C"] });
    expect(s.variants).toBe(5);
    expect(s.variantLabels).toEqual(["A", "B", "C", "進階版", "替代版"]);
    expect(s.images).toBe(0); // a text-only task stays text-only
  });

  it("never cuts a non-pack pool below what it declares", () => {
    // pr-99-newsjack declares 6 category lenses; the 5-clamp dropped 技術突破.
    const lenses = ["競品動態", "產業數據／報告", "法規政策", "社群熱話", "媒體議題", "技術突破"];
    const s = resolveTierVariantShape({ variants: 6, images: 0, variantLabels: lenses });
    expect(s.variants).toBe(6);
    expect(s.variantLabels).toEqual(lenses);
  });

  it("falls back to numbered labels when the generic filler runs out", () => {
    const s = resolveTierVariantShape({ variants: 9, images: 0, variantLabels: ["A"] });
    expect(s.variantLabels).toHaveLength(9);
    expect(s.variantLabels.slice(-2)).toEqual(["版本 8", "版本 9"]);
  });

  it("treats postLabels or postsCount alone as a pack", () => {
    expect(isPackShape({ postsCount: 4 })).toBe(true);
    expect(isPackShape({ postLabels: ["a", "b"] })).toBe(true);
    expect(isPackShape({})).toBe(false);
    expect(isPackShape({ postLabels: [] })).toBe(false);
  });
});
