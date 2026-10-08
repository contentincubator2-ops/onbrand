import { describe, expect, it, vi } from "vitest";
import { ownTagsFor } from "./ownTags";

describe("ownTagsFor", () => {
  it("keeps every published id regardless of missing, empty or malformed perfTags", async () => {
    const rows = [
      { externalPostId: "bad", metadata: "{" },
      { externalPostId: "missing", metadata: null },
      { externalPostId: "no-tags", metadata: {} },
      { externalPostId: "empty", metadata: { perfTags: {} } },
      { externalPostId: "array", metadata: { perfTags: ["owners"] } },
      { externalPostId: 123, metadata: JSON.stringify({ perfTags: { ta: "owners", bad: 2 } }) },
      { externalPostId: "native", metadata: { perfTags: { usp: "fast" } } },
    ];
    const pool = { execute: vi.fn().mockResolvedValue([rows]) };
    expect(await ownTagsFor(7, pool)).toEqual({
      tags: { empty: {}, "123": { ta: "owners" }, native: { usp: "fast" } },
      ownIds: new Set(rows.map(row => String(row.externalPostId))),
    });
    expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining("LEFT JOIN mission_outputs"), [7]);
    expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining("sp.brandId = ? AND sp.externalPostId IS NOT NULL"), [7]);
  });

  it("still permits syncing when output tables are unavailable", async () => {
    const pool = { execute: vi.fn().mockRejectedValue(new Error("table missing")) };
    expect(await ownTagsFor(7, pool)).toEqual({ tags: {}, ownIds: new Set() });
  });
});
