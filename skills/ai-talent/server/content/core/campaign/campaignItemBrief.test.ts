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

describe("追蹤連結", () => {
  it("有連結時要求文中用這一個；沒有就不提", () => {
    const base = { eventId: 1, itemId: "a", paid: false, phase: "launch", date: "2026-11-01", angle: "上市", phaseMessage: "" };
    expect(campaignItemBriefText({ ...base, link: "https://a.com/?utm_campaign=ob-ev1" })).toContain("https://a.com/?utm_campaign=ob-ev1");
    expect(campaignItemBriefText(base)).not.toContain("連結");
  });
});

describe("同一天別的通路已定稿的底稿", () => {
  const base = { eventId: 1, itemId: "ig-1", paid: false, phase: "teaser", date: "2026-10-27", angle: "IG 語調改寫", phaseMessage: "" };
  it("有底稿：給寫手原文，要求訊息一致、語調照這個通路", () => {
    const t = campaignItemBriefText({ ...base, siblingBase: { platform: "facebook", text: "你的品牌每次開口，說的都是同一件事嗎？" } });
    expect(t).toContain("同一天 Facebook 那一篇已經定稿");
    expect(t).toContain("你的品牌每次開口，說的都是同一件事嗎？");
    expect(t).toContain("不要逐字照抄");
  });
  it("沒有底稿就不提", () => {
    expect(campaignItemBriefText(base)).not.toContain("定稿");
    expect(campaignItemBriefText({ ...base, siblingBase: null })).not.toContain("定稿");
  });
});
