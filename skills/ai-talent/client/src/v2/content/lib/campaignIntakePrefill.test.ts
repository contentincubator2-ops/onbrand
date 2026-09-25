import { describe, expect, it } from "vitest";
import { campaignPrefill, campaignWhen, answerFor } from "./campaignIntakePrefill";

// 2026-09-25（CJ「他忘記帶入日期時間了，本來在活動企畫中，有該則貼文要發布的時間」）：
// 這支的錯法很安靜——填錯欄位跟沒填在畫面上長得一樣，所以規則要被釘住。
const ctx = {
  eventName: "中秋烤肉黃金組合",
  startAt: "2026-09-20", endAt: "2026-09-28",
  itemDate: "2026-09-22",
  mechanic: "全站 85 折，橫膈牛排 NT$560 起，9/28 止",
  venue: "", sessions: "", signupUrl: "",
  angle: "活動正式開跑：把折數與期限一次講清楚",
};

// fb-60-launch-kit 真實的欄位定義（quickTaskFB60.ts）
const LAUNCH_KIT = [
  { key: "event_name", label: "活動名稱", type: "text", required: true },
  { key: "event_when", label: "日期 / 時間", type: "text", required: true },
  { key: "event_why", label: "為什麼參加 / 重點", type: "textarea", required: true },
];

describe("campaignWhen", () => {
  it("有起迄就給期間", () => expect(campaignWhen(ctx)).toBe("2026-09-20 至 2026-09-28"));
  it("只有單日就給單日", () => expect(campaignWhen({ ...ctx, endAt: null })).toBe("2026-09-20"));
  it("起迄同一天不要寫成「X 至 X」", () =>
    expect(campaignWhen({ ...ctx, endAt: "2026-09-20" })).toBe("2026-09-20"));
  it("活動沒設日期時，退回這一篇的發布日", () =>
    expect(campaignWhen({ ...ctx, startAt: null, endAt: null })).toBe("2026-09-22"));
  it("什麼都沒有就回空字串——不要編一個日期", () =>
    expect(campaignWhen({ eventName: "x" })).toBe(""));
});

describe("campaignPrefill — 活動上線包這張卡", () => {
  const r = campaignPrefill({
    primaryKey: "event_name", primaryLabel: "活動名稱 + 日期？", fields: LAUNCH_KIT, ctx,
  });

  it("三個必填欄位不再有空的（CJ 遇到的就是這兩格空著）", () => {
    expect(r.extras.event_when).toBe("2026-09-20 至 2026-09-28");
    expect(r.extras.event_why).toContain("85 折");
    // 主要欄位是活動名稱，名稱＋期間一起給（卡片問的是「活動名稱 + 日期」）
    expect(r.primary).toBe("中秋烤肉黃金組合（2026-09-20 至 2026-09-28）");
  });

  it("主要欄位不會被 extras 重複填一次", () => {
    expect(r.extras.event_name).toBeUndefined();
  });

  it("切角進的是「重點」那一格，不是活動名稱那一格", () => {
    expect(r.extras.event_why).toContain("活動正式開跑");
    expect(r.primary).not.toContain("活動正式開跑");
  });
});

describe("三條原則", () => {
  it("使用者打過的字不覆蓋", () => {
    const r = campaignPrefill({
      primaryKey: "event_name", fields: LAUNCH_KIT, ctx,
      existing: { event_when: "我自己寫的時間" },
    });
    expect(r.extras.event_when).toBeUndefined();
  });

  it("不知道的事不要編——活動沒設地點，地點欄就留空", () => {
    const r = campaignPrefill({
      fields: [{ key: "venue", label: "地點", required: true }], ctx,
    });
    expect(r.extras.venue).toBeUndefined();
    expect(answerFor({ key: "venue" }, { ...ctx, venue: "松菸 2 號倉庫" })).toBe("松菸 2 號倉庫");
  });

  it("卡片問的不是活動名稱／日期時，主要欄位留給切角（回空字串＝沿用既有行為）", () => {
    const r = campaignPrefill({
      primaryKey: "topic", primaryLabel: "這篇要談什麼？", fields: [], ctx,
    });
    expect(r.primary).toBe("");
  });

  it("英文 key 也對得到（when / why / signup_url）", () => {
    const r = campaignPrefill({
      fields: [
        { key: "when", label: "When" },
        { key: "why", label: "Why join" },
        { key: "signup_url", label: "Sign-up link" },
      ],
      ctx: { ...ctx, signupUrl: "https://x.tw/go" },
    });
    expect(r.extras.when).toBe("2026-09-20 至 2026-09-28");
    expect(r.extras.why).toContain("85 折");
    expect(r.extras.signup_url).toBe("https://x.tw/go");
  });
});
