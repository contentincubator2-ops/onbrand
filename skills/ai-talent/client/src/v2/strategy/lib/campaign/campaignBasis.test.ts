import { describe, it, expect } from "vitest";
import { basisLabel, fromText, toText, shortTitle, briefFromBasis } from "./campaignBasis";
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

describe("活動定位 → 排企劃用的那段話", () => {
  it("只抄定位裡寫好的字，重複的不抄兩次", () => {
    const raw = { brief: { briefSummary: "onBrand Studio 上市" }, smp: { singleMindedProposition: "行銷團隊，上線就位" }, messaging: { coreMessage: "行銷團隊，上線就位" } };
    expect(briefFromBasis(raw)).toBe("onBrand Studio 上市\n行銷團隊，上線就位");
  });
  it("定位是空的就回空字串；長度不超過設定欄位上限", () => {
    expect(briefFromBasis(null)).toBe("");
    expect(briefFromBasis({ brief: { briefSummary: 123 }, smp: null })).toBe("");
    expect(briefFromBasis({ brief: { briefSummary: "字".repeat(900) } }).length).toBe(600);
  });
});
