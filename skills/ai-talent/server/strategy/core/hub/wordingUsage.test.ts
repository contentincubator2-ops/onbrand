import { describe, expect, it } from "vitest";
import { findWordingConflicts } from "./wordingUsage";
import type { HubWording } from "../../../platform/core/hub/hubStore";

let nextId = 1;
function w(partial: Partial<HubWording> & Pick<HubWording, "kind" | "term">): HubWording {
  return {
    id: nextId++,
    market: "TW",
    replacement: null,
    note: null,
    addedBy: null,
    createdAt: "2026-09-23T00:00:00.000Z",
    ...partial,
  } as HubWording;
}

describe("findWordingConflicts", () => {
  it("says nothing about a clean list", () => {
    const items = [
      w({ kind: "preferred", term: "整合" }),
      w({ kind: "swap", term: "便宜", replacement: "高性價比" }),
      w({ kind: "banned", term: "最便宜" }),
    ];
    expect(findWordingConflicts(items)).toEqual([]);
  });

  it("catches a term that is both preferred and banned", () => {
    const items = [w({ kind: "preferred", term: "保證" }), w({ kind: "banned", term: "保證" })];
    const [c] = findWordingConflicts(items);
    expect(c.kind).toBe("preferred_also_banned");
    expect(c.zh).toContain("保證");
  });

  it("catches a swap that writes a banned word in after the repair step", () => {
    const items = [
      w({ kind: "swap", term: "划算", replacement: "最便宜" }),
      w({ kind: "banned", term: "最便宜" }),
    ];
    const [c] = findWordingConflicts(items);
    expect(c.kind).toBe("swap_target_banned");
    // 這是這幾條裡唯一會讓貼文真的變成不合格的，訊息要講清楚為什麼修不掉。
    expect(c.zh).toContain("標記成不合格");
  });

  it("catches a swap that removes a preferred term", () => {
    const items = [
      w({ kind: "preferred", term: "方案" }),
      w({ kind: "swap", term: "方案", replacement: "解決方案" }),
    ];
    expect(findWordingConflicts(items).map((c) => c.kind)).toContain("swap_from_preferred");
  });

  it("catches a chain, and names the word that actually comes out", () => {
    const items = [
      w({ kind: "swap", term: "便宜", replacement: "划算" }),
      w({ kind: "swap", term: "划算", replacement: "高性價比" }),
    ];
    const chain = findWordingConflicts(items).filter((c) => c.kind === "swap_chain");
    expect(chain).toHaveLength(1);
    expect(chain[0].zh).toContain("高性價比");
  });

  it("catches a duplicate within one kind", () => {
    const items = [w({ kind: "preferred", term: "整合" }), w({ kind: "preferred", term: " 整合 " })];
    expect(findWordingConflicts(items).map((c) => c.kind)).toEqual(["duplicate_term"]);
  });

  it("does not mix markets", () => {
    const items = [
      w({ kind: "preferred", term: "guarantee", market: "US" }),
      w({ kind: "banned", term: "guarantee", market: "TW" }),
    ];
    expect(findWordingConflicts(items)).toEqual([]);
  });

  it("ignores case when matching a swap target to a banned word", () => {
    const items = [
      w({ kind: "swap", term: "affordable", replacement: "Cheapest", market: "US" }),
      w({ kind: "banned", term: "cheapest", market: "US" }),
    ];
    expect(findWordingConflicts(items).map((c) => c.kind)).toEqual(["swap_target_banned"]);
  });
});
