/**
 * KPI 與預算的拆法（validateKpiPlan）。
 *
 * 守的是「數字從哪來」：絕對數字只能來自用戶填的總預算與總目標；模型只給比例與相對
 * 大小，各段加起來一定剛好等於用戶填的總數。用戶沒給的指標可以看，但不能有數字。
 */
import { describe, it, expect } from "vitest";
import { toPercent, splitTotal, validateKpiPlan } from "./campaignKpi";
import type { CampaignPlan } from "./campaignPlan";

const item = (id: string, phase: any, platform: string, enabled = true) => ({
  id, phase, date: "2026-11-01", platform, taskId: "t", taskLabel: "t", angle: "a", enabled, outputId: null,
});
const plan: CampaignPlan = {
  smp: "s", generatedAt: "",
  items: [
    item("t1", "teaser", "instagram"),
    item("l1", "launch", "facebook"),
    item("l2", "launch", "website"),
    item("s1", "sustain", "facebook"),
    item("e1", "encore", "facebook", false),   // 整段都不做：這段不該分到錢
  ],
};

describe("toPercent / splitTotal", () => {
  it("整數、加起來剛好 100／剛好等於總數", () => {
    expect(toPercent([1, 1, 1])).toEqual([34, 33, 33]);
    expect(toPercent([0, 0])).toEqual([50, 50]);
    expect(splitTotal(100000, [20, 50, 30])).toEqual([20000, 50000, 30000]);
    const s = splitTotal(301, [1, 1, 1]);
    expect(s.reduce((a, b) => a + b, 0)).toBe(301);
  });
});

describe("validateKpiPlan", () => {
  const raw = {
    brief: "預熱拉觸及，開賣集中轉換。",
    assumptions: ["假設官網轉換率由用戶提供"],
    phases: {
      teaser: { share: 20, metrics: [{ metric: "reach", target: 50000 }], note: "拉受眾" },
      launch: { share: 60, metrics: [{ metric: "leads", target: 200 }, { metric: "clicks", target: 3000 }, { metric: "bogus" }] },
      sustain: { share: 40, metrics: [{ metric: "leads", target: 100 }] },
      encore: { share: 30, metrics: [{ metric: "leads", target: 50 }] },
    },
    paid: ["l1", "l2", "t1", "ghost", "e1"],
  };
  const out = validateKpiPlan({ raw, plan, budget: 100000, goals: [{ metric: "leads", target: 300 }] });

  it("只分給還有文的段；比例正規化成 100、預算照比例拆", () => {
    expect(Object.keys(out.phases)).toEqual(["teaser", "launch", "sustain"]);
    expect(out.phases.teaser!.share + out.phases.launch!.share + out.phases.sustain!.share).toBe(100);
    expect(out.phases.launch!.budget).toBe(50000);
    expect([out.phases.teaser!.budget, out.phases.launch!.budget, out.phases.sustain!.budget].reduce((a, b) => a! + b!, 0)).toBe(100000);
  });

  it("用戶給了總數的指標：各段加起來剛好等於總數（依模型給的相對大小）", () => {
    expect(out.phases.launch!.metrics.find((m) => m.metric === "leads")!.target).toBe(200);
    expect(out.phases.sustain!.metrics.find((m) => m.metric === "leads")!.target).toBe(100);
  });

  it("用戶沒給總數的指標：留著要看，但沒有數字；不認得的指標丟掉", () => {
    expect(out.phases.teaser!.metrics).toEqual([{ metric: "reach", target: null }]);
    expect(out.phases.launch!.metrics.map((m) => m.metric)).toEqual(["leads", "clicks"]);
    expect(out.phases.launch!.metrics.find((m) => m.metric === "clicks")!.target).toBeNull();
  });

  it("廣告只能是企劃裡、要做、而且是可以下廣告的通路那幾篇", () => {
    expect(out.paidIds).toEqual(["l1", "t1"]);
  });

  it("沒填預算：只有比例，預算是 null", () => {
    const o = validateKpiPlan({ raw, plan, budget: null, goals: [] });
    expect(o.phases.launch!.budget).toBeNull();
    expect(o.phases.launch!.metrics.every((m) => m.target === null)).toBe(true);
  });
});
