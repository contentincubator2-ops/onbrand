import { describe, it, expect } from "vitest";
import { prefillKolBrief, KOL_BRIEF_GROUPS } from "./campaignKolBrief";

describe("網紅任務說明單", () => {
  it("空的時候用活動已經有的先填：核心訊息、目標、受眾、上線期間，並帶業配揭露", () => {
    const b = prefillKolBrief({ brief: null, smp: "品牌每週七篇", goal: "試用 150 人", audience: "中小品牌主", startAt: "2026-11-01", endAt: "2026-12-25" });
    expect(b).toMatchObject({ keyMessage: "品牌每週七篇", objective: "試用 150 人", audience: "中小品牌主", timeline: "上線期間：11/01 – 12/25" });
    expect(b.mustSay).toContain("#廣告");
  });
  it("已經填過就照使用者的，不覆蓋", () => {
    expect(prefillKolBrief({ brief: { budget: "30 萬" }, smp: "x" })).toEqual({ budget: "30 萬" });
  });
  it("經紀公司要的 14 個欄位都在（分四組）", () => {
    expect(KOL_BRIEF_GROUPS.flatMap((g) => g.fields.map((f) => f.key))).toHaveLength(14);
  });
});
