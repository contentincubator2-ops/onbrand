/**
 * 拖到另一段之後的改寫（campaignRetune）：提示裡有沒有帶到新那一段的策略，
 * 以及模型回的東西什麼時候不算數。
 */
import { describe, it, expect } from "vitest";
import { retunePrompt, cleanRetuned } from "./campaignRetune";
import type { CampaignPlan } from "./campaignPlan";

const plan: Pick<CampaignPlan, "smp" | "items" | "phaseMessages"> = {
  smp: "報告交給數位員工",
  phaseMessages: { lastcall: "今天是最後一天" },
  items: [
    { id: "t1", phase: "teaser", date: "2026-10-07", platform: "facebook", taskId: "fb-a", taskLabel: "FB 貼文", angle: "每次出報告最花時間的是整理數據", enabled: true },
    { id: "l1", phase: "lastcall", date: "2026-11-29", platform: "instagram", taskId: "ig-a", taskLabel: "IG 貼文", angle: "倒數兩天的提醒", enabled: true },
    { id: "l2", phase: "lastcall", date: "2026-11-30", platform: "facebook", taskId: "fb-a", taskLabel: "FB 貼文", angle: "這篇不做的那一篇", enabled: false },
  ],
};
const input = {
  itemId: "t1", platform: "facebook", taskLabel: "FB 貼文", angle: "每次出報告最花時間的是整理數據",
  date: "2026-11-29", phase: "lastcall" as const, fromPhase: "teaser" as const,
};

describe("retunePrompt", () => {
  const text = retunePrompt({ input, plan, mechanic: "首月 85 折", eventName: "AI Reporting 上線" });
  it("帶到新那一段的目的與訊息，以及原本在哪一段", () => {
    expect(text).toContain("【現在挪到】倒數期——這一段要做到：把期限變成理由");
    expect(text).toContain("【這一段要讓人記住的訊息】今天是最後一天");
    expect(text).toContain("【原本在】預熱期");
    expect(text).toContain("【優惠機制／活動內容】首月 85 折");
  });
  it("同一段其他篇只列有在做的，而且不含自己", () => {
    expect(text).toContain("倒數兩天的提醒");
    expect(text).not.toContain("這篇不做的那一篇");
    expect(text.match(/每次出報告最花時間的是整理數據/g)).toHaveLength(1);
  });
  it("那一段沒有訊息、沒有機制：那幾行不出現（不寫空的標題）", () => {
    const bare = retunePrompt({ input: { ...input, phase: "sustain" }, plan, mechanic: " ", eventName: "x" });
    expect(bare).not.toContain("【這一段要讓人記住的訊息】");
    expect(bare).not.toContain("【優惠機制");
    expect(bare).not.toContain("【同一段已經排的其他篇");
  });
});

describe("cleanRetuned", () => {
  it("讀出 angle，去掉引號與換行", () => {
    expect(cleanRetuned('```json\n{"angle":"「最後兩天，\\n把整理數據交出去」"}\n```', "舊的")).toBe("最後兩天， 把整理數據交出去");
  });
  it("跟原本一樣、太短、讀不成 JSON：null（不能假裝改過）", () => {
    expect(cleanRetuned('{"angle":"舊的那一句話"}', "舊的那一句話")).toBeNull();
    expect(cleanRetuned('{"angle":"好"}', "舊的")).toBeNull();
    expect(cleanRetuned("我覺得可以這樣改", "舊的")).toBeNull();
  });
  it("模型把格式說明也抄進去、讀不成 JSON：拿最後一個引號裡的那一句", () => {
    expect(cleanRetuned('```json\n{"angle":"這一篇要講什麼":"11/30 前把整理報告的工作交出去"}\n```', "舊的")).toBe("11/30 前把整理報告的工作交出去");
  });
  it("超過 200 字就截斷", () => {
    expect(cleanRetuned(JSON.stringify({ angle: "字".repeat(300) }), "舊的")).toHaveLength(200);
  });
});
