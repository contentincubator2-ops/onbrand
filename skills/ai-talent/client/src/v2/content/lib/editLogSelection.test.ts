import { describe, it, expect } from "vitest";
import { buildRebuildPlan, effectiveIds, rebuildRef, rebuildRequest, sameIds, type LogRowLite } from "./editLogSelection";

// 新 → 舊，跟畫面同一個順序。
const rows: LogRowLite[] = [
  { id: 5, kind: "comment", ask: "標題的限定拿掉", ref: null },
  { id: 4, kind: "restore", ask: "復原上一次修改", ref: null },
  { id: 3, kind: "restyle", ask: "反差開場", ref: "fb-contrast" },
  { id: 2, kind: "voice", ask: "Grace Wu", ref: "30012" },
  { id: 1, kind: "chat", ask: "開頭短一點", ref: null },
];

describe("effectiveIds", () => {
  it("沒有重新整理過：能勾的每一筆都算數，還原不算", () => {
    expect(effectiveIds(rows)).toEqual([5, 3, 2, 1]);
  });
  it("重新整理過：之後的都算，之前的只算當時留下的", () => {
    const after: LogRowLite[] = [
      { id: 7, kind: "chat", ask: "加上活動日期", ref: null },
      { id: 6, kind: "rebuild", ask: "只保留 2 項", ref: rebuildRef([1, 5]) },
      ...rows,
    ];
    expect(effectiveIds(after)).toEqual([7, 5, 1]);
  });
  it("重新整理的 ref 壞掉就當作沒有那一筆", () => {
    expect(effectiveIds([{ id: 9, kind: "rebuild", ask: null, ref: "oops" }, ...rows])).toEqual([5, 3, 2, 1]);
  });
});

describe("buildRebuildPlan", () => {
  it("CJ 的例子：留開頭短一點，不要反差開場", () => {
    const plan = buildRebuildPlan(rows, [1, 5]);
    expect(plan.restyleTaskId).toBeNull();
    expect(plan.voiceKey).toBeNull();
    expect(plan.asks).toEqual(["開頭短一點", "標題的限定拿掉"]);
    expect(plan.keptIds).toEqual([1, 5]);
  });
  it("任務卡與口氣各留最後勾的那一個；被蓋掉的不記成留下", () => {
    const two: LogRowLite[] = [{ id: 8, kind: "restyle", ask: "三點清單文", ref: "fb-list3" }, ...rows];
    const plan = buildRebuildPlan(two, [8, 3, 2, 1]);
    expect(plan.restyleTaskId).toBe("fb-list3");
    expect(plan.restyleName).toBe("三點清單文");
    expect(plan.voiceKey).toBe("30012");
    expect(plan.keptIds).toEqual([1, 2, 8]);
  });
  it("還原的紀錄勾了也不算", () => {
    expect(buildRebuildPlan(rows, [4]).keptIds).toEqual([]);
  });
});

describe("rebuildRequest", () => {
  it("意見編號列出來，有任務卡就先講任務卡", () => {
    const text = rebuildRequest({ asks: ["開頭短一點", "標題的限定拿掉"], restyleName: "三點清單文" }, false);
    expect(text).toContain("「三點清單文」");
    expect(text).toContain("1. 開頭短一點");
    expect(text).toContain("2. 標題的限定拿掉");
  });
  it("只留口氣（沒有意見、沒有任務卡）也有一句可以送", () => {
    expect(rebuildRequest({ asks: [], restyleName: null }, false).length).toBeGreaterThan(0);
  });
  it("不超過上限", () => {
    expect(rebuildRequest({ asks: ["字".repeat(900), "字".repeat(900)], restyleName: null }, false).length).toBeLessThanOrEqual(1000);
  });
});

describe("sameIds", () => {
  it("不看順序", () => {
    expect(sameIds([1, 2], [2, 1])).toBe(true);
    expect(sameIds([1, 2], [1])).toBe(false);
  });
});
