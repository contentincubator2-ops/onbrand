import { describe, expect, it, vi } from "vitest";

vi.mock("../../../localDb.js", () => ({ default: { execute: vi.fn() } }));

import { MAX_ACTIVE_NOTES, priorNotesBlock, variantKeyOf } from "./refineNotes";

describe("refineNotes", () => {
  it("keys a note by the same locator the editor saves with", () => {
    expect(variantKeyOf({ variantIndex: 2 })).toBe("legacy:2");
    expect(variantKeyOf({})).toBe("legacy:0");
    expect(variantKeyOf({ contentKind: "public", contentIndex: 1, variantIndex: 0 })).toBe("public:1");
  });

  it("adds nothing to the prompt when there is no earlier feedback", () => {
    expect(priorNotesBlock([])).toBe("");
    expect(priorNotesBlock([{ feedback: "   " }])).toBe("");
  });

  it("lists earlier feedback oldest-first and tells the model it still applies", () => {
    const b = priorNotesBlock([{ feedback: "減少故事感" }, { feedback: "增加\nCTA" }]);
    expect(b).toContain("1. 減少故事感");
    expect(b).toContain("2. 增加 CTA");
    expect(b).toContain("全部仍然有效");
    expect(b).toContain("以這次為準");
  });

  it("caps how much earlier feedback goes into the prompt", () => {
    const many = Array.from({ length: MAX_ACTIVE_NOTES + 5 }, (_, i) => ({ feedback: `意見${i}` }));
    const b = priorNotesBlock(many);
    expect(b).not.toContain("意見4");
    expect(b).toContain(`1. 意見5`);
    expect(priorNotesBlock([{ feedback: "字".repeat(900) }])).toContain("…");
  });
});
