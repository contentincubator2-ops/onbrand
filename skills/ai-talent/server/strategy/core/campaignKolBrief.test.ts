/**
 * 網紅任務說明單：收進來要乾淨、名單上每一位在企劃裡各有自己的邀約與 brief、寫手拿得到。
 */
import { describe, it, expect } from "vitest";
import { cleanKolBrief, influencerLabel, kolBriefText } from "./campaignKolBrief";
import { laneItems, candidateCards } from "./campaignPlan";
import { campaignItemBriefText } from "./campaignItemBrief";

describe("cleanKolBrief", () => {
  it("空欄位不留、層級只收認得的、沒有名字也沒有類型的那一列丟掉、最多 8 位", () => {
    const b = cleanKolBrief({
      objective: "  導購  ", kpi: "", budget: "總預算 30 萬，可產品互惠", hacker: "x",
      influencers: [
        { name: "林小美", type: "美妝", tier: "mid", platform: "IG", angle: "上班族底妝" },
        { type: "親子", tier: "bogus" },
        { platform: "YT" },
        ...Array.from({ length: 10 }, (_, i) => ({ type: `類型${i}` })),
      ],
    });
    expect(b.objective).toBe("導購");
    expect(b).not.toHaveProperty("kpi");
    expect(b).not.toHaveProperty("hacker");
    expect(b.influencers![0]).toEqual({ name: "林小美", type: "美妝", tier: "mid", platform: "IG", angle: "上班族底妝" });
    expect(b.influencers![1]).toEqual({ type: "親子" });
    expect(b.influencers).toHaveLength(8);
  });
  it("名字：有名字寫名字＋類型；只有類型寫「類型網紅」", () => {
    expect(influencerLabel({ name: "林小美", type: "美妝", tier: "mid", platform: "IG" })).toBe("林小美（美妝・中腰部・IG）");
    expect(influencerLabel({ type: "親子", tier: "micro" })).toBe("親子網紅（微網紅）");
  });
  it("給寫手的文字只列有填的；全空回空字串", () => {
    expect(kolBriefText({})).toBe("");
    const t = kolBriefText({ influencers: [{ type: "親子", angle: "週末出遊" }], mustSay: "#廣告、折扣碼 ONB10" });
    expect(t).toContain("[網紅任務說明單]");
    expect(t).toContain("親子網紅，角度：週末出遊");
    expect(t).toContain("- 必提：#廣告、折扣碼 ONB10");
    expect(t).not.toContain("預算");
  });
});

describe("laneItems：名單上每一位各一封邀約、一份 brief", () => {
  const cards = candidateCards(["kol"]);
  it("兩位網紅 → 邀約兩件、brief 兩件（錯開一天），追蹤／素材包／接住自然提及各一件", () => {
    const r = laneItems("kol", {
      launch: "2026-11-01", end: "2026-12-25", today: "2026-10-01", mechanic: "免費試用", cards,
      influencers: [{ name: "林小美", type: "美妝", angle: "上班族底妝" }, { type: "親子", tier: "micro" }],
    });
    expect(r.map((i) => [i.date, i.taskId, i.partner ?? ""])).toEqual([
      ["2026-10-11", "kl-30-invite-opener", "林小美（美妝）"],
      ["2026-10-12", "kl-30-invite-opener", "親子網紅（微網紅）"],
      ["2026-10-18", "kl-30-influencer-brief", "林小美（美妝）"],
      ["2026-10-19", "kl-30-influencer-brief", "親子網紅（微網紅）"],
      ["2026-10-25", "kl-30-followup", ""],
      ["2026-11-01", "kl-30-fan-template-kit", ""],
      ["2026-11-06", "kl-30-catch-organic-fan", ""],
    ]);
    expect(r[0]!.angle).toContain("上班族底妝");
    expect(r[1]!.angle).toContain("免費試用");
    expect(new Set(r.map((i) => i.id)).size).toBe(r.length);
  });
  it("沒有名單：跟原本一樣五件", () => {
    expect(laneItems("kol", { launch: "2026-11-01", end: "2026-12-25", today: "2026-10-01", mechanic: "", cards })).toHaveLength(5);
  });
});

describe("寫手拿到的說明", () => {
  it("網紅那一件：寫明給誰＋整張說明單", () => {
    const t = campaignItemBriefText({
      eventId: 1, itemId: "a", paid: false, phase: "teaser", date: "2026-10-11", angle: "邀約", phaseMessage: "",
      partner: "林小美（美妝）", kolBrief: "[網紅任務說明單]\n- 預算：30 萬",
    });
    expect(t).toContain("這一件是給：林小美（美妝）");
    expect(t).toContain("- 預算：30 萬");
  });
});
