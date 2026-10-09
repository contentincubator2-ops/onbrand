import { describe, expect, it } from "vitest";
import { alignmentIsEmpty, applyAlignmentToPlan, applyAlignmentToSections, draftProgress, proposalDocHtml, proposalFilename, scheduleRows, splitSections } from "./campaignProposal";

const item = (over: Record<string, any> = {}) => ({
  id: "a", phase: "teaser" as const, date: "2026-10-08", platform: "facebook", taskId: "t", taskLabel: "單篇貼文",
  angle: "用冷知識口吻切入", enabled: true, ...over,
});

describe("scheduleRows", () => {
  const plan = {
    phaseNames: { teaser: "暖身" },
    items: [
      item({ id: "c", date: "2026-10-19", phase: "launch", platform: "instagram", paid: true }),
      item({ id: "a" }),
      item({ id: "b", enabled: false }),
    ],
  };
  const rows = scheduleRows(plan as any, { c: { title: "", text: " 那道光 " } }, false);
  it("只列要做的，照日期排", () => {
    expect(rows.map((r) => r.id)).toEqual(["a", "c"]);
  });
  it("階段用使用者取的名稱，沒取的用預設；寫好的帶全文", () => {
    expect(rows[0]).toMatchObject({ phaseName: "暖身", channel: "Facebook", text: null });
    expect(rows[1]).toMatchObject({ phaseName: "開賣", channel: "Instagram", paid: true, text: "那道光" });
  });
});

describe("proposalDocHtml", () => {
  const html = proposalDocHtml({
    eventName: "小隕星 <活動>", range: "2026-10-19 → 2026-10-26", smp: "有東西正朝你飛來",
    sections: [{ id: "background", title: "活動背景", body: "第一段\n\n第二段\n同一段第二行" }, { id: "insight", title: "關鍵洞察", body: "  " }],
    kpiLines: [],
    rows: scheduleRows({ items: [item(), item({ id: "c", date: "2026-10-19", phase: "launch" })] } as any, { c: { title: "", text: "全文 & 內容" } }, false),
    en: false,
  });
  it("段落、排程表、每一篇的全文都在；特殊字元有跳脫", () => {
    expect(html).toContain("<h1>小隕星 &lt;活動&gt;　宣傳提案</h1>");
    expect(html).toContain("<h2>活動背景</h2><p>第一段</p><p>第二段<br>同一段第二行</p>");
    expect(html).toContain("<td style=\"vertical-align:top\">10/08</td>");
    expect(html).toContain("<p>全文 &amp; 內容</p>");
    expect(html).toContain("（尚未撰寫）");
  });
  it("空的段落、沒設定的 KPI 不出現", () => {
    expect(html).not.toContain("關鍵洞察");
    expect(html).not.toContain("預算與 KPI");
  });
});

describe("排程前後的段落", () => {
  const sections = [
    { id: "background", title: "背景與挑戰", body: "背景內文" },
    { id: "adBudget", title: "廣告預算分配", body: "廣告總預算：NT$＿＿" },
    { id: "recap", title: "整體回顧", body: "回顧內文" },
  ];
  it("預算、廣告預算分配、整體回顧排在排程後面", () => {
    const { head, tail } = splitSections(sections);
    expect(head.map((s) => s.id)).toEqual(["background"]);
    expect(tail.map((s) => s.id)).toEqual(["adBudget", "recap"]);
  });
  it("下載的檔案照同一個順序：策略 → 排程 → 每篇 → 預算 → 回顧", () => {
    const html = proposalDocHtml({ eventName: "活動", range: "", smp: "", sections, kpiLines: ["總預算：NT$1"], rows: [], en: false });
    const at = (t: string) => html.indexOf(t);
    expect(at("背景內文")).toBeLessThan(at("<h2>內容排程</h2>"));
    expect(at("<h2>每一篇的內容</h2>")).toBeLessThan(at("<h2>廣告預算分配</h2>"));
    expect(at("<h2>廣告預算分配</h2>")).toBeLessThan(at("<h2>整體回顧</h2>"));
  });
});

describe("proposalFilename／draftProgress", () => {
  it("檔名拿掉不能用的字元", () => {
    expect(proposalFilename("小隕星 活動: 第一波", false)).toBe("小隕星-活動-第一波-提案.doc");
    expect(proposalFilename("  ", true)).toBe("campaign-proposal.doc");
  });
  it("進度一路往上、沒寫完之前不到 100", () => {
    expect(draftProgress(0)).toBe(0);
    expect(draftProgress(10_000)).toBeLessThan(draftProgress(30_000));
    expect(draftProgress(600_000)).toBe(94);
  });
});

describe("套用梳理結果", () => {
  const plan = { smp: "舊標語", phaseMessages: { teaser: "舊訊息" }, items: [item({ id: "a" }), item({ id: "b", outputId: 9 })] } as any;
  const a = { reply: "", sections: { summary: "新摘要" }, smp: "新標語", phaseMessages: { launch: "新訊息" }, items: [{ id: "a", angle: "新方向" }, { id: "b", angle: "不該套用" }], rewrite: [] };
  it("企劃：標語、各段訊息合併，還沒寫的貼文換方向；寫好的那一篇不動", () => {
    const next = applyAlignmentToPlan(plan, a);
    expect(next.smp).toBe("新標語");
    expect(next.phaseMessages).toEqual({ teaser: "舊訊息", launch: "新訊息" });
    expect(next.items.map((i: any) => i.angle)).toEqual(["新方向", "用冷知識口吻切入"]);
  });
  it("提案：只換有給的段落", () => {
    expect(applyAlignmentToSections([{ id: "summary", title: "摘要", body: "舊" }, { id: "recap", title: "回顧", body: "不動" }], a))
      .toEqual([{ id: "summary", title: "摘要", body: "新摘要" }, { id: "recap", title: "回顧", body: "不動" }]);
  });
  it("什麼都沒有要動", () => {
    expect(alignmentIsEmpty({ reply: "都對得上", sections: {}, items: [], rewrite: [] })).toBe(true);
    expect(alignmentIsEmpty(a)).toBe(false);
  });
});
