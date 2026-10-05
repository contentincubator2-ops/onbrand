/**
 * 策略層活動頁要算的東西：階段、通路、倒數、提醒。
 */
import { describe, it, expect } from "vitest";
import { stagePhases, stageLanes, countdown, stageNotes, addDateRange } from "./campaignStage";
import type { CampaignPlanItem } from "./campaignSchema";

const item = (date: string, phase: any, platform: string, enabled = true): CampaignPlanItem => ({
  id: `${phase}-${date}-${platform}`, phase, date, platform, taskId: "t", taskLabel: "t", angle: "a", enabled,
});

const plan: CampaignPlanItem[] = [
  item("2026-10-27", "teaser", "instagram"),
  item("2026-10-30", "teaser", "facebook"),
  item("2026-11-01", "launch", "facebook"),
  item("2026-11-03", "sustain", "instagram"),
  item("2026-11-28", "sustain", "website"),
  item("2026-12-24", "lastcall", "facebook"),
  item("2026-12-26", "encore", "facebook", false),   // 這篇不做
];

describe("stagePhases", () => {
  it("只列有排文的階段，照檔期順序，起迄日取那一段的第一篇與最後一篇", () => {
    const ps = stagePhases(plan);
    expect(ps.map((p) => p.id)).toEqual(["teaser", "launch", "sustain", "lastcall", "encore"]);
    expect(ps[2]).toEqual({ id: "sustain", from: "2026-11-03", to: "2026-11-28", count: 2 });
  });
  it("整段都按了「這篇不做」：那一段還在（篇數 0），才有地方放回來", () => {
    expect(stagePhases(plan).find((p) => p.id === "encore")).toEqual({ id: "encore", from: "2026-12-26", to: "2026-12-26", count: 0 });
  });
});

describe("stageLanes", () => {
  it("有排文的通路加上設定選了但還沒排的，照固定順序", () => {
    expect(stageLanes(plan, ["facebook", "email"])).toEqual(["facebook", "instagram", "email", "website"]);
  });
});

describe("countdown", () => {
  it("開始前倒數", () => {
    expect(countdown("2026-11-01", "2026-12-25", "2026-09-30")).toMatchObject({ big: "32", unitZh: "天後開始" });
  });
  it("開始當天是第 1 天", () => {
    expect(countdown("2026-11-01", "2026-12-25", "2026-11-01")).toMatchObject({ big: "1", unitZh: "活動第幾天" });
  });
  it("結束後說結束了", () => {
    expect(countdown("2026-11-01", "2026-12-25", "2026-12-26")).toMatchObject({ unitZh: "活動已結束" });
  });
  it("沒設期間不假裝有數字", () => {
    expect(countdown(null, null, "2026-09-30").big).toBe("—");
  });
});

describe("stageNotes", () => {
  it("整檔：找出最長的空窗", () => {
    const n = stageNotes(plan, ["facebook", "instagram", "website"], null);
    expect(n[0]!.zh).toBe("11/28 到 12/24 之間有 25 天沒有排文。");
  });
  it("整檔：選了但一篇都沒排的通路", () => {
    const n = stageNotes(plan, ["facebook", "email"], null).map((x) => x.zh);
    expect(n).toContain("電子報 選了，但整檔一篇都沒排。");
  });
  it("某一段：只看那一段", () => {
    const n = stageNotes(plan, ["facebook", "instagram", "website"], "teaser").map((x) => x.zh);
    expect(n).toEqual(["這一段沒有排 官網。"]);
  });
  it("沒有問題時講一句狀態，不硬擠提醒", () => {
    const n = stageNotes(plan, ["facebook"], "launch").map((x) => x.zh);
    expect(n).toEqual(["這一段 1 篇，沒有明顯的空窗。"]);
  });
});

describe("addDateRange（手動加一篇可以選的日期）", () => {
  const ps = stagePhases(plan);
  const window = { from: "2026-10-18", to: "2027-01-02" };
  it("夾在前一段最後一篇與下一段第一篇之間", () => {
    expect(addDateRange(ps, "sustain", window)).toEqual({ min: "2026-11-01", max: "2026-12-24" });
  });
  it("第一段從允許範圍的第一天起，最後一段到允許範圍的最後一天", () => {
    expect(addDateRange(ps, "teaser", window)).toEqual({ min: "2026-10-18", max: "2026-11-01" });
    expect(addDateRange(ps, "encore", window)).toEqual({ min: "2026-12-24", max: "2027-01-02" });
  });
  it("整段已經過去（今天比下一段的第一篇還晚）：null", () => {
    expect(addDateRange(ps, "teaser", { from: "2026-11-15", to: "2027-01-02" })).toBeNull();
  });
  it("找不到這一段：null", () => {
    expect(addDateRange(ps.filter((p) => p.id !== "launch"), "launch", window)).toBeNull();
  });
});
