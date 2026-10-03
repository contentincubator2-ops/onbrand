/**
 * 活動成效：企劃的每一篇 vs 真的發出去的貼文。
 *
 * 守的是 CJ 擔心的兩種情況：不是從 OnBrand 發的（要列進待確認、而且猜得到是哪一格）、
 * 發文時間跟企劃不一樣（照樣對得上，標「時間變動」，數字照實際發文日歸段）。
 */
import { describe, it, expect } from "vitest";
import { buildCampaignPerf, applyMatch, textSimilarity, type PerfFact, type PerfItem } from "./campaignPerf";

const items: PerfItem[] = [
  { id: "t1", phase: "teaser", date: "2026-10-27", platform: "facebook", angle: "品牌主的困境：發了很多，品牌卻越來越模糊", outputId: 101 },
  { id: "l1", phase: "launch", date: "2026-11-01", platform: "facebook", angle: "上市公告：免費試用每週七篇，到 12/25", outputId: 102 },
  { id: "s1", phase: "sustain", date: "2026-11-20", platform: "facebook", angle: "一人行銷團隊的一週：試用前後差在哪" },
  { id: "c1", phase: "lastcall", date: "2026-12-24", platform: "facebook", angle: "明天截止" },
];
const fact = (id: string, date: string, text: string, metrics: Record<string, number> = { reach: 100, engagement: 10 }): PerfFact => ({
  key: `fb_page:${id}`, source: "fb_page", entityId: id, date, text, permalink: null, metrics,
});
const facts = [
  fact("pg_901", "2026-10-27", "你發了很多貼文，品牌卻越來越模糊？", { reach: 500, engagement: 40 }),   // OnBrand 發的 t1
  fact("pg_902", "2026-11-03", "免費試用開跑：每週七篇文案，到 12/25", { reach: 800, engagement: 60 }), // OnBrand 發的 l1，晚兩天
  fact("pg_903", "2026-11-21", "一人行銷團隊的一週，試用前後差很多", { reach: 300, engagement: 20 }),   // 不是從 OnBrand 發的，像 s1
  fact("pg_904", "2026-11-10", "今天員工旅遊合照", { reach: 50, engagement: 5 }),                      // 不相干
  fact("pg_999", "2026-08-01", "期間外", { reach: 9999 }),
];

const run = (store = {}, today = "2026-11-25") =>
  buildCampaignPerf({ items, published: { 101: ["901"], 102: ["pg_902"] }, facts, store, today, kpiPhases: {
    launch: { budget: 40000, metrics: [{ metric: "leads", target: 150 }, { metric: "reach", target: null }] },
  } });

describe("buildCampaignPerf", () => {
  it("從 OnBrand 發的：對得上（貼文 id 兩種寫法都認），晚發的標時間變動", () => {
    const r = run();
    const t1 = r.items.find((i) => i.id === "t1")!;
    const l1 = r.items.find((i) => i.id === "l1")!;
    expect([t1.status, t1.via]).toEqual(["matched", "published"]);
    expect([l1.status, l1.diffDays]).toEqual(["moved", 2]);
  });

  it("不是從 OnBrand 發的：進待確認，猜得到是哪一格；不相干的也列但不猜；期間外的不列", () => {
    const r = run();
    const keys = r.candidates.map((c) => c.key);
    expect(keys).toEqual(["fb_page:pg_903", "fb_page:pg_904"]);
    expect(r.candidates[0]!.suggestItemId).toBe("s1");
    expect(r.candidates[1]!.suggestItemId).toBeNull();
  });

  it("還沒對上的：日期過了是還沒發，還沒到是還沒到", () => {
    const r = run();
    expect(r.items.find((i) => i.id === "s1")!.status).toBe("missing");
    expect(r.items.find((i) => i.id === "c1")!.status).toBe("upcoming");
    expect(r.counts).toMatchObject({ planned: 4, matched: 1, moved: 1, missing: 1, upcoming: 1, pending: 2 });
  });

  it("用戶確認之後：配對的算進那一格，企劃外的另外列，排除的不再出現", () => {
    let store = applyMatch({}, "fb_page:pg_903", "match", "s1");
    store = applyMatch(store, "fb_page:pg_904", "dismiss");
    const r = run(store);
    expect(r.items.find((i) => i.id === "s1")!).toMatchObject({ status: "moved", via: "confirmed", diffDays: 1 });
    expect(r.candidates).toEqual([]);
    const r2 = run(applyMatch({}, "fb_page:pg_904", "extra"));
    expect(r2.extras.map((f) => f.key)).toEqual(["fb_page:pg_904"]);
  });

  it("數字照實際發文日歸段：晚兩天發的開賣文，算進開賣；目標與預算帶過來", () => {
    const r = run(applyMatch({}, "fb_page:pg_903", "match", "s1"));
    const launch = r.phases.find((p) => p.id === "launch")!;
    expect(launch.from).toBe("2026-11-01");
    expect(launch.to).toBe("2026-11-19");
    expect(launch.actual).toEqual({ reach: 800, engagement: 60 });
    expect(launch.budget).toBe(40000);
    expect(launch.targets[0]).toEqual({ metric: "leads", target: 150 });
    expect(r.phases.find((p) => p.id === "sustain")!.actual.reach).toBe(300);
  });
});

describe("applyMatch", () => {
  it("一格只配一則：同一格配第二則時，第一則放回待確認", () => {
    let s = applyMatch({}, "a", "match", "s1");
    s = applyMatch(s, "b", "match", "s1");
    expect(s.matches).toEqual({ b: "s1" });
  });
  it("clear 回到待確認", () => {
    const s = applyMatch(applyMatch({}, "a", "dismiss"), "a", "clear");
    expect(s.dismissed).toEqual([]);
    expect(s.matches).toEqual({});
  });
});

describe("textSimilarity", () => {
  it("字重疊越多越像；空字串是 0", () => {
    expect(textSimilarity("一人行銷團隊的一週", "一人行銷團隊的一週")).toBe(1);
    expect(textSimilarity("一人行銷團隊", "員工旅遊")).toBe(0);
    expect(textSimilarity("", "abc")).toBe(0);
  });
});

// ─── 第 2 步：廣告／GA4／電商匯入歸檔 ───────────────────────────────────
import { campaignOf, applyAlias, type ExtFact } from "./campaignPerf";
import { campaignLink, campaignCode, cleanLandingUrl } from "../../platform/core/perfUtm";
import { parseUtmTags } from "./perfImport";

describe("活動追蹤連結", () => {
  it("每一篇的連結帶活動代碼、那一篇、那一段；廣告篇是 paid_social", () => {
    const u = new URL(campaignLink("https://onbrand.sowork.ai/?ref=x", { eventId: 31, itemId: "launch-2026-11-01-3", phase: "launch", platform: "facebook", paid: true }));
    expect(u.searchParams.get("utm_campaign")).toBe(campaignCode(31));
    expect(u.searchParams.get("utm_source")).toBe("facebook");
    expect(u.searchParams.get("utm_medium")).toBe("paid_social");
    expect(u.searchParams.get("ref")).toBe("x");
    // 匯入時解得回來
    expect(parseUtmTags(u.searchParams.get("utm_content")!)).toEqual({ cp: "ev31", it: "launch-2026-11-01-3", ph: "launch" });
  });
  it("導流網址只收 http(s)", () => {
    expect(cleanLandingUrl("javascript:alert(1)")).toBeNull();
    expect(cleanLandingUrl("  ")).toBeNull();
    expect(cleanLandingUrl("https://a.com/p")).toBe("https://a.com/p");
  });
});

describe("campaignOf：匯入的一列是不是這檔", () => {
  it("UTM 標籤或名稱帶代碼 → utm；別檔的代碼 → other；名稱對應 → alias；都沒有 → null", () => {
    expect(campaignOf({ label: "x", tags: { cp: "ev31" } }, 31, [])).toBe("utm");
    expect(campaignOf({ label: "google / ob-ev31", tags: {} }, 31, [])).toBe("utm");
    expect(campaignOf({ label: "ob-ev310", tags: {} }, 31, [])).toBe("other");
    expect(campaignOf({ label: "x", tags: { cp: "ev7" } }, 31, ["x"])).toBe("other");
    expect(campaignOf({ label: "2026 年末試用｜轉換", tags: {} }, 31, ["年末試用"])).toBe("alias");
    expect(campaignOf({ label: "品牌常態", tags: {} }, 31, ["年末試用"])).toBeNull();
  });
  it("applyAlias：不分大小寫去重、拿得掉", () => {
    let s = applyAlias({}, "Year-End", "add");
    s = applyAlias(s, "year-end", "add");
    expect(s.aliases).toEqual(["year-end"]);
    expect(applyAlias(s, "YEAR-END", "remove").aliases).toEqual([]);
  });
});

describe("buildCampaignPerf：匯入資料歸段", () => {
  const ext: ExtFact[] = [
    // GA4：帶 ph 標籤 → 照標籤歸開賣（日期其實落在加溫）
    { source: "ga4", date: "2026-11-22", label: "ob-ev9 / cp.ev9~ph.launch", tags: { cp: "ev9", ph: "launch" }, metrics: { sessions: 120, orders: 3, revenue: 4500 } },
    // Meta 廣告：名稱對應 → 照日期歸開賣
    { source: "meta_ads", date: "2026-11-05", label: "年末試用 - 轉換", tags: {}, metrics: { spend: 8000, clicks: 300, reach: 5000 } },
    // 別檔
    { source: "ga4", date: "2026-11-06", label: "ob-ev12", tags: {}, metrics: { sessions: 999 } },
    // 還沒歸檔
    { source: "meta_ads", date: "2026-11-07", label: "品牌常態", tags: {}, metrics: { spend: 500 } },
    { source: "meta_ads", date: "2026-11-08", label: "品牌常態", tags: {}, metrics: { spend: 700 } },
    // 期間外
    { source: "meta_ads", date: "2026-06-01", label: "年末試用", tags: {}, metrics: { spend: 1 } },
  ];
  const r = buildCampaignPerf({
    items, published: { 101: ["901"], 102: ["pg_902"] }, facts, store: { aliases: ["年末試用"] }, today: "2026-11-25",
    eventId: 9, external: ext, kpiPhases: null,
  });
  it("開賣段：粉專＋Meta 廣告＋GA4（照 ph 標籤）分來源也有總和", () => {
    const launch = r.phases.find((p) => p.id === "launch")!;
    expect(launch.bySource.meta_ads).toEqual({ spend: 8000, clicks: 300, reach: 5000 });
    expect(launch.bySource.ga4).toEqual({ sessions: 120, orders: 3, revenue: 4500 });
    expect(launch.actual.reach).toBe(5800);                 // 粉專 800 + 廣告 5000
    expect(launch.actual.revenue).toBe(4500);
    expect(r.phases.find((p) => p.id === "sustain")!.bySource.ga4).toBeUndefined();
  });
  it("來源摘要與還沒歸檔：別檔、期間外的不列；同名合併", () => {
    expect(r.sources.map((s) => [s.source, s.rows, s.utm, s.alias])).toEqual([["ga4", 1, 1, 0], ["meta_ads", 1, 0, 1]]);
    expect(r.unlinked).toEqual([{ source: "meta_ads", label: "品牌常態", rows: 2, metrics: { spend: 1200 } }]);
  });
});
