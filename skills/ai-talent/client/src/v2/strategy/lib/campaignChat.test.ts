/**
 * 活動頁對話提案的套用與描述。
 */
import { describe, it, expect } from "vitest";
import { applyProposal, describeProposal, isEmptyProposal } from "./campaignChat";
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
      "＋ 11/10 官網：官網公告頁",
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
