import { describe, expect, it } from "vitest";
import { countChars, isOverLimit, rewriteContractBlock, stripMarkdown } from "./rewriteContract";

describe("rewriteContract", () => {
  it("strips markdown but keeps hashtags", () => {
    expect(stripMarkdown("意味著**什麼**。\n## 小標\n#行銷策略 `x`")).toBe("意味著什麼。\n小標\n#行銷策略 x");
  });
  it("counts characters without whitespace", () => {
    expect(countChars("一 二\n三")).toBe(3);
  });
  it("flags only clearly-over-limit rewrites (25% slack)", () => {
    expect(isOverLimit("字".repeat(188), { maxChars: 150 })).toBe(false);
    expect(isOverLimit("字".repeat(189), { maxChars: 150 })).toBe(true);
    expect(isOverLimit("字".repeat(999), { maxChars: 0 })).toBe(false);
  });
  it("puts the card's limit into the contract", () => {
    const b = rewriteContractBlock({ label: "FB Reels：固定角色短劇", minChars: 60, maxChars: 150 });
    expect(b).toContain("60–150 字");
    expect(b).toContain("FB Reels：固定角色短劇");
    expect(b).toContain("markdown");
  });
});
