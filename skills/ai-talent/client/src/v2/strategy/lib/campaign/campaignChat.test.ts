/**
 * 活動頁對話提案的套用與描述。
 */
import { describe, it, expect } from "vitest";
import { applyProposal, describeProposal, isEmptyProposal, routeMention } from "./campaignChat";
import type { CampaignPlan, CampaignPlanItem } from "./campaignSchema";

const it1: CampaignPlanItem = { id: "a", phase: "launch", date: "2026-11-01", platform: "facebook", taskId: "t", taskLabel: "t", angle: "上市公告", enabled: true, outputId: null };
const it2: CampaignPlanItem = { id: "b", phase: "launch", date: "2026-11-02", platform: "instagram", taskId: "t", taskLabel: "t", angle: "輪播", enabled: true, outputId: 9 };
const plan: CampaignPlan = { smp: "舊訴求", items: [it1, it2], phaseMessages: { launch: "舊訊息" } };

describe("applyProposal", () => {
  it("加、改、刪一次套用，照日期排好", () => {
    const next = applyProposal(plan, { ops: [
      { op: "add", item: { ...it1, id: "c", date: "2026-10-30", phase: "teaser", angle: "預熱" } },
      { op: "update", id: "a", patch: { date: "2026-11-03" } },
    ] });
    expect(next.items.map((i) => [i.id, i.date])).toEqual([["c", "2026-10-30"], ["b", "2026-11-02"], ["a", "2026-11-03"]]);
  });
  it("已寫好的那篇不動", () => {
    const next = applyProposal(plan, { ops: [{ op: "remove", id: "b" }, { op: "update", id: "b", patch: { angle: "改掉" } }] });
    expect(next.items.find((i) => i.id === "b")).toEqual(it2);
  });
  it("訊息合併進原本的，訴求直接換", () => {
    const next = applyProposal(plan, { ops: [], smp: "新訴求", phaseMessages: { sustain: "加溫訊息" } });
    expect(next.smp).toBe("新訴求");
    expect(next.phaseMessages).toEqual({ launch: "舊訊息", sustain: "加溫訊息" });
  });
});

describe("describeProposal", () => {
  it("每一條講成一句話", () => {
    const lines = describeProposal(plan, { ops: [
      { op: "add", item: { ...it1, id: "c", date: "2026-11-10", platform: "website", angle: "官網公告頁" } },
      { op: "update", id: "a", patch: { enabled: false } },
      { op: "remove", id: "a" },
    ], phaseMessages: { launch: "新訊息" } }, false);
    expect(lines).toEqual([
      "開賣的訊息改成「新訊息」",
      "＋ 11/10 AI 搜尋：官網公告頁",
      "✎ 11/01 Facebook：這篇不做",
      "－ 刪掉 11/01 Facebook：上市公告",
    ]);
  });
});

describe("isEmptyProposal", () => {
  it("沒有任何改動就是空的", () => {
    expect(isEmptyProposal({ ops: [] })).toBe(true);
    expect(isEmptyProposal({ ops: [], smp: "x" })).toBe(false);
  });
});

describe("routeMention（@ 找團隊裡的人）", () => {
  const roster = [
    { role: "planner", name: "朱怡君", roleZh: "內容企劃", roleEn: "Content planner" },
    { role: "kpi", name: "謝曉雯", roleZh: "投放專家", roleEn: "Paid media" },
    { role: "pr", name: "林雅欣", roleZh: "話題公關", roleEn: "Buzz & PR" },
  ];
  it("全名＋空格", () => expect(routeMention("@謝曉雯 哪幾篇下廣告？", roster)).toEqual({ to: "kpi", message: "哪幾篇下廣告？" }));
  it("名字後面直接接字", () => expect(routeMention("@朱怡君倒數多兩篇", roster)).toEqual({ to: "planner", message: "倒數多兩篇" }));
  it("用角色叫（前兩字也行、全形＠也行）", () => {
    expect(routeMention("＠投放 預算集中在哪", roster)).toEqual({ to: "kpi", message: "預算集中在哪" });
    expect(routeMention("@話題公關要不要發新聞稿", roster)).toEqual({ to: "pr", message: "要不要發新聞稿" });
  });
  it("名字開頭幾個字", () => expect(routeMention("@林 這樣說會不會被罵", roster).to).toBe("pr"));
  it("沒有 @ 或認不得：照原樣", () => {
    expect(routeMention("倒數多兩篇", roster)).toEqual({ to: null, message: "倒數多兩篇" });
    expect(routeMention("@王小明 你好", roster)).toEqual({ to: null, message: "@王小明 你好" });
  });
});

describe("活動日期（2026-10-05 對話可以改活動日期）", () => {
  const dates = { startAt: "2026-10-25", endAt: "2026-11-07", from: { startAt: "2026-11-01", endAt: "2026-11-14" } };
  it("只改活動日期也算有改", () => {
    expect(isEmptyProposal({ ops: [], dates })).toBe(false);
  });
  it("講一句新舊日期；跟著挪的那幾篇合成一句，另外改了內容的照舊列", () => {
    const lines = describeProposal(plan, { dates, ops: [
      { op: "update", id: "a", patch: { date: "2026-10-25" } },
      { op: "update", id: "b", patch: { date: "2026-10-26", angle: "改講提早開跑" } },
    ] }, false);
    expect(lines[0]).toBe("活動日期改成 10/25–11/07（原本 11/01–11/14）");
    expect(lines[1]).toBe("還沒寫的 1 篇跟著挪日期");
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain("改講提早開跑");
  });
  it("沒改活動日期時，挪某一篇照舊逐條列", () => {
    expect(describeProposal(plan, { ops: [{ op: "update", id: "a", patch: { date: "2026-10-25" } }] }, false)).toHaveLength(1);
  });
});
