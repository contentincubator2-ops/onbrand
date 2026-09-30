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
