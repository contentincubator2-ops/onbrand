import { describe, it, expect } from "vitest";
import { alertKeyOf, classifyEvidence, deriveDefaultWatch, isDue, matchesNewsLanguage, newsMarketOf, parseAlertsJson } from "./strategyMonitor";

describe("strategyMonitor · deriveDefaultWatch", () => {
  it("品牌：名稱＋產業當關鍵字，直接／間接競品當競爭者，去重且最多 10 個", () => {
    const d = deriveDefaultWatch({
      scope: "brand",
      name: "十築",
      industry: "有機保養",
      positioning: {
        competition: {
          direct: [{ name: "綠藤" }, { name: "綠藤" }, { name: "  " }],
          indirect: [{ name: "The Body Shop", threat: "中" }],
        },
      },
    });
    expect(d.keywords).toEqual(["十築", "有機保養"]);
    expect(d.competitors).toEqual(["綠藤", "The Body Shop"]);
  });

  it("產品：只看產品定位裡的 competition.competitors", () => {
    const d = deriveDefaultWatch({
      scope: "product",
      name: "十築好氧",
      positioning: { competition: { competitors: [{ name: "A 牌", position: "平價" }, "B 牌"] } },
    });
    expect(d.keywords).toEqual(["十築好氧"]);
    expect(d.competitors).toEqual(["A 牌", "B 牌"]);
  });

  it("定位是空的也不會炸，只是清單短", () => {
    const d = deriveDefaultWatch({ scope: "brand", name: "X", positioning: null });
    expect(d).toEqual({ keywords: ["X"], competitors: [] });
  });
});

describe("strategyMonitor · parseAlertsJson", () => {
  const raw = JSON.stringify({
    alerts: [
      { kind: "competitor_move", anchor: "differentiation", title: "綠藤推出無包裝補充站", summary: "s", suggestion: "g", evidence: [0, 2, 2] },
      { kind: "made_up", anchor: "audience", title: "不認得的 kind", evidence: [0] },
      { kind: "market_trend", anchor: "none", title: "沒有證據的趨勢", evidence: [] },
      { kind: "audience_shift", anchor: "audience", title: "證據超出範圍", evidence: [9] },
      { kind: "audience_shift", anchor: "audience", title: "第二則合法", evidence: [1] },
      { kind: "market_trend", anchor: "tagline", title: "第三則合法", evidence: [1] },
      { kind: "market_trend", anchor: "tagline", title: "第四則被截掉", evidence: [1] },
    ],
  });

  it("只留 kind／anchor 合法、有 evidence、evidence 在範圍內的，最多 3 則，evidence 去重", () => {
    const out = parseAlertsJson(raw, 3);
    expect(out.map((a) => a.title)).toEqual(["綠藤推出無包裝補充站", "第二則合法", "第三則合法"]);
    expect(out[0]!.evidence).toEqual([0, 2]);
  });

  it("吃得下 ```json 圍欄與前言", () => {
    const fenced = "好的，這是結果：\n```json\n" + raw + "\n```";
    expect(parseAlertsJson(fenced, 3).length).toBe(3);
  });

  it("壞 JSON 回空陣列，不丟錯", () => {
    expect(parseAlertsJson("not json at all", 3)).toEqual([]);
    expect(parseAlertsJson("", 3)).toEqual([]);
  });
});

describe("strategyMonitor · alertKeyOf / isDue", () => {
  it("同一件事換標點與空白仍是同一個 key", () => {
    expect(alertKeyOf("competitor_move", "綠藤，推出 無包裝補充站！")).toBe(alertKeyOf("competitor_move", "綠藤推出無包裝補充站"));
    expect(alertKeyOf("competitor_move", "a")).not.toBe(alertKeyOf("market_trend", "a"));
  });

  it("沒掃過、或超過 7 天就到期；剛掃過不到期", () => {
    const now = new Date("2026-09-08T00:00:00Z");
    expect(isDue(null, now)).toBe(true);
    expect(isDue("2026-08-31T00:00:00Z", now)).toBe(true);
    expect(isDue("2026-09-05T00:00:00Z", now)).toBe(false);
    expect(isDue("garbage", now)).toBe(true);
  });
});

// 2026-09-30（CJ「確定只有在 7 天內的新聞」「專心抓新聞，就很好了」）
describe("classifyEvidence — 只收確定 7 天內的新聞", () => {
  const asOf = new Date("2026-09-30T12:00:00Z");
  it("7 天內有發布日＝採用", () => {
    expect(classifyEvidence({ url: "https://news.example.com/a", publishedAt: "2026-09-29" }, asOf)).toBe("news");
    expect(classifyEvidence({ url: "https://news.example.com/a", publishedAt: "2026-09-23" }, asOf)).toBe("news");
  });
  it("超過 7 天的舊文不採用", () => {
    expect(classifyEvidence({ url: "https://zapier.com/blog/x", publishedAt: "2023-03-17" }, asOf)).toBeNull();
    expect(classifyEvidence({ url: "https://toolking.app/a", publishedAt: "2026-09-20" }, asOf)).toBeNull();
  });
  it("讀不到日期（官網頁、社群貼文）不採用", () => {
    expect(classifyEvidence({ url: "https://thinklytics.com/services/x", publishedAt: null }, asOf)).toBeNull();
    expect(classifyEvidence({ url: "https://www.threads.com/@a/post/1" }, asOf)).toBeNull();
  });
});

// 2026-09-30（CJ「看在台灣或美國，搜尋不同語言的」）
describe("newsMarketOf／matchesNewsLanguage — 依市場搜不同語言的新聞", () => {
  it("台灣（含未設定）＝繁中；美國＝英文", () => {
    expect(newsMarketOf("TW", "zh-TW")).toMatchObject({ language: "Traditional Chinese", searchHint: "台灣" });
    expect(newsMarketOf(null, null).country).toBe("TW");
    expect(newsMarketOf("US", "en-US")).toMatchObject({ language: "English", searchHint: "" });
    expect(newsMarketOf("US", null).display).toBe("美國・英文新聞");
  });
  it("語言不符的報導擋掉", () => {
    const tw = newsMarketOf("TW", "zh-TW");
    const us = newsMarketOf("US", "en");
    const zh = "HubSpot 推出 Breeze AI 套件，台灣中小企業行銷團隊開始評估導入成本與效益";
    const en = "HubSpot launches Breeze AI suite as marketers weigh the cost of adopting new tools";
    expect(matchesNewsLanguage(zh, tw)).toBe(true);
    expect(matchesNewsLanguage(en, tw)).toBe(false);
    expect(matchesNewsLanguage(en, us)).toBe(true);
    expect(matchesNewsLanguage(zh, us)).toBe(false);
  });
});
