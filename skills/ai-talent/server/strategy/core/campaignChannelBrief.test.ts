import { describe, it, expect } from "vitest";
import {
  BRIEF_CHANNELS, CHANNEL_BRIEF_SPECS, COBRAND_SCHEMES, cleanChannelBrief, cleanChannelBriefs,
  channelBriefText, briefRowLabel, briefPartners, activeGroups,
} from "./campaignChannelBrief";
import { laneItems, candidateCards } from "./campaignPlan";

describe("規格", () => {
  it("每個通路都有清單、至少一組欄位；欄位鍵不重複", () => {
    for (const c of BRIEF_CHANNELS) {
      const s = CHANNEL_BRIEF_SPECS[c];
      expect(s.rows.fields.length).toBeGreaterThan(0);
      expect(s.groups.length).toBeGreaterThan(0);
      const keys = s.groups.flatMap((g) => g.fields.map((f) => f.key));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
  it("LINE 收每月可發則數（CJ 2026-10-02）；其他通路不收預算", () => {
    const keysOf = (c: (typeof BRIEF_CHANNELS)[number]) => CHANNEL_BRIEF_SPECS[c].groups.flatMap((g) => g.fields.map((f) => f.key));
    expect(keysOf("line")).toContain("quota");
    for (const c of BRIEF_CHANNELS) expect(keysOf(c).some((k) => /budget|price|fee/i.test(k))).toBe(false);
  });
  it("異業合作：每個對象類型都有方案，也都有自己那一組要談的事", () => {
    for (const type of Object.keys(COBRAND_SCHEMES)) {
      expect(COBRAND_SCHEMES[type]!.length).toBeGreaterThan(0);
      expect(CHANNEL_BRIEF_SPECS.cobrand.groups.some((g) => g.whenType === type)).toBe(true);
    }
  });
});

describe("cleanChannelBrief", () => {
  it("空的不留；選項不在清單裡的丟掉；方案要對得上類型", () => {
    const b = cleanChannelBrief("cobrand", {
      rows: [
        { name: " 全家 ", partnerType: "retail", scheme: "display", angle: "通勤客" },
        { partnerType: "media", scheme: "display" }, // 媒體沒有「店內陳列」
        { partnerType: "alien" },
        {},
      ],
      values: { shelf: "結帳櫃台旁", objective: "", nope: "x" },
    });
    expect(b.rows).toEqual([
      { name: "全家", partnerType: "retail", scheme: "display", angle: "通勤客" },
      { partnerType: "media" },
    ]);
    expect(b.values).toEqual({ shelf: "結帳櫃台旁" });
  });
  it("cleanChannelBriefs 只留有內容的通路", () => {
    const all = cleanChannelBriefs({ line: { values: { quota: "6000 則" } }, facebook: {}, kol: { values: { x: "y" } } });
    expect(Object.keys(all)).toEqual(["line"]);
  });
});

describe("給寫手的文字", () => {
  it("平台規則就算沒填也一定帶", () => {
    expect(channelBriefText("line", {})).toContain("推太多會被封鎖");
  });
  it("清單照列；異業合作只帶名單上有的類型那一組", () => {
    const b = cleanChannelBrief("cobrand", {
      rows: [{ name: "全家", partnerType: "retail", scheme: "display" }],
      values: { shelf: "結帳櫃台旁", placement: "專題 1 篇" },
    });
    const text = channelBriefText("cobrand", b);
    expect(text).toContain("全家（通路／店家・店內陳列）");
    expect(text).toContain("陳列位置與檔期：結帳櫃台旁");
    expect(text).not.toContain("專題 1 篇");
    expect(activeGroups("cobrand", b).some((g) => g.whenType === "media")).toBe(false);
  });
  it("自有通路的列名用選項的中文", () => {
    expect(briefRowLabel("facebook", { surface: "group", target: "親子共學團" })).toBe("社團（親子共學團）");
    expect(briefRowLabel("cobrand", { partnerType: "org" })).toBe("公益／協會／學校夥伴");
  });
});

describe("異業合作那條線照夥伴名單展開", () => {
  it("提案信與合作條件每一位各一件，帶 partner", async () => {
    const cards = candidateCards(["cobrand"]);
    const partners = briefPartners("cobrand", cleanChannelBrief("cobrand", {
      rows: [{ name: "全家", partnerType: "retail", scheme: "display" }, { partnerType: "media", scheme: "feature", angle: "上班族專題" }],
    }));
    const r = laneItems("cobrand", { launch: "2026-11-01", end: "2026-12-25", today: "2026-10-01", mechanic: "免費試用", cards, partners });
    const pitches = r.filter((i) => i.taskId === "cb-30-pitch-letter");
    expect(pitches.map((i) => i.partner)).toEqual(["全家（通路／店家・店內陳列）", "媒體／社群夥伴（置入報導）"]);
    expect(pitches[1]!.angle).toContain("上班族專題");
  });
});
