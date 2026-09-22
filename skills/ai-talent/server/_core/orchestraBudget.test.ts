import { describe, expect, it, vi } from "vitest";
import { buildBudgetExceededResult, deferredSlot, imageCapsForRemaining } from "./quickTaskOrchestra";

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
  const opts = { primaryCapMs: 35_000 };

  it("keeps the configured cap when there is no task budget", () => {
    expect(imageCapsForRemaining(Number.POSITIVE_INFINITY, opts))
      .toEqual({ skip: false, primaryCapMs: 35_000 });
  });

  // 2026-09-23 (CJ「備援要禁掉」): there is no second attempt to reserve time
  // for any more — the one attempt simply gets whatever is left.
  it("shrinks the attempt to what is left", () => {
    expect(imageCapsForRemaining(20_000, opts)).toEqual({ skip: false, primaryCapMs: 20_000 });
    expect(imageCapsForRemaining(60_000, opts)).toEqual({ skip: false, primaryCapMs: 35_000 });
  });

  // A doomed image is worse than no image: it eats the window the run needs to
  // assemble and persist the captions.
  it("skips generation outright when barely any time is left", () => {
    expect(imageCapsForRemaining(3_000, opts).skip).toBe(true);
    expect(imageCapsForRemaining(-5_000, opts).skip).toBe(true);
  });
});

// 2026-09-22 (CJ「把生圖改成第一篇文案完成就開始」): each image waits on its own
// caption slot, and a liveness sweep settles every slot once the batch
// resolves so nothing can wait forever. The sweep must not clobber what a
// writer already reported.
describe("per-variant slots", () => {
  it("keeps the first value and ignores later fills", async () => {
    const slot = deferredSlot<string | null>();

    slot.resolve("caption from the writer");
    slot.resolve(null); // the liveness sweep, after a partial batch failure

    await expect(slot.promise).resolves.toBe("caption from the writer");
    expect(slot.settled()).toBe(true);
  });

  it("unblocks a waiter that the writer never reported", async () => {
    const slot = deferredSlot<string | null>();
    const waiter = slot.promise;

    expect(slot.settled()).toBe(false);
    slot.resolve(null); // liveness sweep

    await expect(waiter).resolves.toBeNull();
  });
});
