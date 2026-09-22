import { describe, expect, it, vi } from "vitest";
import { buildBudgetExceededResult, imageCapsForRemaining } from "./quickTaskOrchestra";

describe("hard-budget result assembly", () => {
  const stages: any[] = [];

  // 2026-09-22 (CJ「請繼續做」): the timeout branch used to fabricate N empty
  // variants, so a run that had already written captions and generated images
  // reported nothing and saved nothing. The work was done and paid for.
  it("ships the captions and images that landed before the budget ran out", () => {
    const result = buildBudgetExceededResult({
      taskId: "fb-99-carousel-5",
      labels: ["輪播版本", "進階版", "替代版"],
      variantCount: 3,
      tierBudgetMs: 150_000,
      stages,
      progress: {
        captions: [
          { label: "輪播版本", caption: "第一篇文案", hashtags: ["#a"] },
          { caption: "第二篇文案" },
          null,
        ],
        images: [{ style: null, url: "/static/covers/a.png", status: "ready" } as any],
      },
    });

    expect(result.ok).toBe(true);
    expect(result.variants.map((v) => v.caption)).toEqual(["第一篇文案", "第二篇文案", ""]);
    expect(result.variants[0]?.image?.url).toBe("/static/covers/a.png");
    expect(result.variants[0]?.hashtags).toEqual(["#a"]);
    // The unfinished ones still read as timed out, not as silent successes.
    expect(result.variants[2]?.image?.status).toBe("timeout");
    expect(result.errors[0]).toContain("已完成 2/3 篇");
  });

  it("still reports a clean failure when nothing finished", () => {
    const result = buildBudgetExceededResult({
      taskId: "fb-99-carousel-5",
      labels: ["A", "B"],
      variantCount: 2,
      tierBudgetMs: 150_000,
      stages,
      progress: { captions: [], images: [] },
    });

    expect(result.ok).toBe(false);
    expect(result.variants).toHaveLength(2);
    expect(result.variants.every((v) => v.caption === "")).toBe(true);
    expect(result.errors[0]).toBe("orchestra: hard 150s budget exceeded");
  });

  it("applies the cheap dedupe to a caption it ships", () => {
    const dedupe = vi.fn((c: string) => c.replace("重複 重複", "重複"));
    const result = buildBudgetExceededResult({
      taskId: "t", labels: ["A"], variantCount: 1, tierBudgetMs: 100_000, stages,
      progress: { captions: [{ caption: "重複 重複" }], images: [] },
      dedupe,
    });

    expect(dedupe).toHaveBeenCalledOnce();
    expect(result.variants[0]?.caption).toBe("重複");
  });
});

describe("image caps derived from the remaining budget", () => {
  const opts = { primaryCapMs: 35_000, fallbackCapMs: 45_000 };

  it("keeps the configured caps when there is no task budget", () => {
    expect(imageCapsForRemaining(Number.POSITIVE_INFINITY, opts))
      .toEqual({ skip: false, primaryCapMs: 35_000, fallbackCapMs: 45_000 });
  });

  it("shrinks the primary attempt to what is left", () => {
    // 20s left: attempt for 20s, and don't promise a fallback that cannot run.
    expect(imageCapsForRemaining(20_000, opts))
      .toEqual({ skip: false, primaryCapMs: 20_000, fallbackCapMs: 0 });
  });

  it("keeps a fallback when the leftover is still useful", () => {
    expect(imageCapsForRemaining(60_000, opts))
      .toEqual({ skip: false, primaryCapMs: 35_000, fallbackCapMs: 25_000 });
  });

  // A doomed image is worse than no image: it eats the window the run needs to
  // assemble and persist the captions.
  it("skips generation outright when barely any time is left", () => {
    expect(imageCapsForRemaining(3_000, opts).skip).toBe(true);
    expect(imageCapsForRemaining(-5_000, opts).skip).toBe(true);
  });
});
