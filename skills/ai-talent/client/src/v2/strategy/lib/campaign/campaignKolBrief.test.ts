import { describe, it, expect } from "vitest";
import { prefillKolBrief, KOL_BRIEF_GROUPS } from "./campaignKolBrief";

describe("網紅任務說明單", () => {
  it("空的時候用活動已經有的先填：核心訊息、目標、受眾、上線期間，並帶業配揭露", () => {
    const b = prefillKolBrief({ brief: null, smp: "品牌每週七篇", goal: "試用 150 人", audience: "中小品牌主", startAt: "2026-11-01", endAt: "2026-12-25" });
    expect(b).toMatchObject({ keyMessage: "品牌每週七篇", objective: "試用 150 人", audience: "中小品牌主", timeline: "上線期間：11/01 – 12/25" });
    expect(b.mustSay).toContain("#廣告");
  });
  it("已經填過就照使用者的，不覆蓋", () => {
    expect(prefillKolBrief({ brief: { review: "改 2 次" }, smp: "x" })).toEqual({ review: "改 2 次" });
  });
  it("13 個欄位分四組，而且沒有預算（CJ 2026-10-01：不放任何估算的價格）", () => {
    const keys = KOL_BRIEF_GROUPS.flatMap((g) => g.fields.map((f) => f.key as string));
    expect(keys).toHaveLength(13);
    expect(keys).not.toContain("budget");
  });
});
