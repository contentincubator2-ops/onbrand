/**
 * 從活動企劃寫某一篇時，給寫手的那段說明：廣告要講清楚是廣告，一般貼文不能被誤標。
 */
import { describe, it, expect } from "vitest";
import { campaignItemBriefText } from "./campaignItemBrief";

const base = { eventId: 31, itemId: "launch-1", phase: "launch", date: "2026-11-01", angle: "上市公告", phaseMessage: "免費每週七篇" };

describe("campaignItemBriefText", () => {
  it("廣告：要求寫成廣告文案（冷受眾、第一句、CTA、避開審核會擋的說法）", () => {
    const t = campaignItemBriefText({ ...base, paid: true });
    expect(t).toContain("[本篇在活動企劃中的位置]");
    expect(t).toContain("開賣期；這一段要讓人記住：「免費每週七篇」");
    expect(t).toContain("這一篇要講的：上市公告");
    expect(t).toContain("這一篇會下廣告");
    expect(t).toContain("行動呼籲");
  });
  it("一般貼文：只有位置，沒有廣告要求", () => {
    const t = campaignItemBriefText({ ...base, paid: false, phaseMessage: "" });
    expect(t).not.toContain("廣告");
    expect(t).toContain("屬於開賣期\n");
  });
});
