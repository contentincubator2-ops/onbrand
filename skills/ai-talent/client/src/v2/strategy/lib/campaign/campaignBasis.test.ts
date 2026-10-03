import { describe, it, expect } from "vitest";
import { basisLabel, fromText, toText, shortTitle } from "./campaignBasis";
import { describeProposal, isEmptyProposal } from "./campaignChat";

describe("策略依據的標籤與值", () => {
  it("標籤從 EVENT_SEGMENTS 讀，括號裡的內部說明拿掉", () => {
    expect(basisLabel("audience.keyInsight", false)).toBe("目標受眾・關鍵洞察");
    expect(basisLabel("smp.singleMindedProposition", false)).toBe("單一核心命題・SMP");
    expect(shortTitle("戰略 Brief（intake 自動填寫）")).toBe("戰略 Brief");
  });
  it("清單一行一項；空的＝清掉", () => {
    expect(fromText("誇大\n\n 免費 ", true)).toEqual(["誇大", "免費"]);
    expect(fromText("  ", false)).toBeNull();
    expect(toText(["a", "b"])).toBe("a\nb");
  });
  it("只改策略依據的提案也算有改，畫面列得出來", () => {
    const p = { ops: [], basis: { "audience.keyInsight": "品牌走調比想的更常發生", "guidelines.forbiddenElements": ["免費"] } };
    expect(isEmptyProposal(p)).toBe(false);
    const lines = describeProposal({ smp: "", items: [] } as any, p, false);
    expect(lines).toEqual(["策略依據・目標受眾・關鍵洞察：「品牌走調比想的更常發生」", "策略依據・創意與內容規範・禁用元素：「免費」"]);
  });
});
