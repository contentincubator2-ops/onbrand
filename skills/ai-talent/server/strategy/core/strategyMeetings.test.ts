import { describe, expect, it } from "vitest";
import {
  MAX_ADJUSTMENTS, anchorsFromPositioning, computeNextRunAt, flattenSegment, parseMinutesJson,
  pendingDecisionCount, rowToRun, applyTaskPicks,
} from "./strategyMeetings";
import { strategyMeetingRouter } from "../routers/strategyMeetingRouter";

const tpe = (d: Date) => new Date(d.getTime() + 8 * 3_600_000);

describe("computeNextRunAt", () => {
  it("每週：落在指定星期幾、台北早上 9 點、而且在現在之後", () => {
    const now = new Date("2026-09-26T03:00:00Z"); // 台北週六 11:00
    const next = computeNextRunAt({ frequency: "weekly", dayOfWeek: 1, now });
    expect(tpe(next).getUTCDay()).toBe(1);
    expect(tpe(next).getUTCHours()).toBe(9);
    expect(next.toISOString()).toBe("2026-09-28T01:00:00.000Z");
  });

  it("每週：今天就是那一天但已過 9 點 → 下週", () => {
    const now = new Date("2026-09-28T02:00:00Z"); // 台北週一 10:00
    expect(computeNextRunAt({ frequency: "weekly", dayOfWeek: 1, now }).toISOString()).toBe("2026-10-05T01:00:00.000Z");
  });

  it("雙週：開完一場後至少隔 13 天", () => {
    const last = new Date("2026-09-28T01:05:00Z");
    const next = computeNextRunAt({ frequency: "biweekly", dayOfWeek: 1, now: last, lastRunAt: last });
    expect(next.toISOString()).toBe("2026-10-12T01:00:00.000Z");
  });

  it("每月：指定幾號，已過就到下個月", () => {
    const now = new Date("2026-09-26T03:00:00Z");
    expect(computeNextRunAt({ frequency: "monthly", dayOfMonth: 1, now }).toISOString()).toBe("2026-10-01T01:00:00.000Z");
    expect(computeNextRunAt({ frequency: "monthly", dayOfMonth: 27, now }).toISOString()).toBe("2026-09-27T01:00:00.000Z");
  });

  it("每月：跨年", () => {
    const now = new Date("2026-12-20T03:00:00Z");
    expect(computeNextRunAt({ frequency: "monthly", dayOfMonth: 5, now }).toISOString()).toBe("2027-01-05T01:00:00.000Z");
  });

  it("每季：開完之後下一場至少隔兩個半月", () => {
    const last = new Date("2026-10-01T01:05:00Z");
    const next = computeNextRunAt({ frequency: "quarterly", dayOfMonth: 1, now: last, lastRunAt: last });
    expect(next.toISOString()).toBe("2027-01-01T01:00:00.000Z");
  });
});

describe("anchorsFromPositioning", () => {
  it("品牌：五格固定錨點，現況從定位攤平，底線開頭的 meta 不進來", () => {
    const a = anchorsFromPositioning("brand", {
      audience: { primary: "25–35 歲上班族", _meta: "x" },
      tagline: { zhTagline: "每天多一點顏色" },
    });
    expect(a.map((x) => x.id)).toEqual(["audience", "competition", "differentiation", "tagline", "voice"]);
    expect(a[0]!.current).toBe("25–35 歲上班族");
    expect(a[1]!.current).toBe("");
    expect(a[3]!.current).toBe("每天多一點顏色");
  });

  it("產品：用產品的五格", () => {
    expect(anchorsFromPositioning("product", {}).map((x) => x.id)).toEqual(["core", "audience", "value", "competition", "strategy"]);
  });

  it("flattenSegment 會截斷過長的內容", () => {
    expect(flattenSegment("字".repeat(500), 10)).toBe(`${"字".repeat(10)}…`);
  });
});

describe("parseMinutesJson", () => {
  const anchors = anchorsFromPositioning("brand", { audience: "上班族" });
  const people = [{ agentId: 1, name: "林品妍", title: "品牌定位總監" }, { agentId: 2, name: "陳柏宇", title: "定價策略顧問" }];

  it("清單外的 id 丟掉、漏掉的補成維持、證據編號轉成索引並過濾不存在的", () => {
    const raw = JSON.stringify({
      summary: "受眾要往學生族群延伸。",
      remarks: [{ name: "林品妍", gist: "受眾該調整" }, { name: "路人", gist: "不在會議裡" }],
      checks: [
        { anchorId: "audience", verdict: "adjust", proposal: "上班族＋大學生", reason: "開學季聲量", evidence: ["E1", "E9"], raisedBy: "林品妍" },
        { anchorId: "made_up", verdict: "adjust", proposal: "xxxx", reason: "" },
      ],
      actions: [{ title: "做一檔開學季題材", owner: "林品妍", kind: "content" }, { title: "排三場使用者訪談", owner: "林品妍" }],
    });
    const m = parseMinutesJson(raw, anchors, 2, people)!;
    expect(m.checks.map((c) => c.anchorId)).toEqual(anchors.map((a) => a.id));
    expect(m.checks[0]).toMatchObject({ verdict: "adjust", proposal: "上班族＋大學生", evidence: [0], current: "上班族" });
    expect(m.checks[1]).toMatchObject({ verdict: "keep", reason: "本次會議未討論這一格" });
    expect(m.remarks).toEqual([{ name: "林品妍", gist: "受眾該調整", title: "品牌定位總監" }]);
    expect(m.actions.map((a) => a.kind)).toEqual(["content", "work"]);
  });

  it("adjust 沒有 proposal 就降成 keep；最多 MAX_ADJUSTMENTS 條", () => {
    const checks = anchors.map((a) => ({ anchorId: a.id, verdict: "adjust", proposal: `新的${a.label}內容`, reason: "r" }));
    checks[0]!.proposal = "";
    const m = parseMinutesJson(JSON.stringify({ summary: "s", checks }), anchors, 0, people)!;
    expect(m.checks[0]!.verdict).toBe("keep");
    expect(m.checks.filter((c) => c.verdict === "adjust")).toHaveLength(MAX_ADJUSTMENTS);
  });

  it("包在 ```json 裡也解得開；沒有 summary 視為失敗", () => {
    expect(parseMinutesJson("```json\n{\"summary\":\"ok\",\"checks\":[]}\n```", anchors, 0, people)?.summary).toBe("ok");
    expect(parseMinutesJson("{\"checks\":[]}", anchors, 0, people)).toBeNull();
    expect(parseMinutesJson("not json", anchors, 0, people)).toBeNull();
  });
});

describe("rowToRun / pendingDecisionCount", () => {
  const minutes = {
    summary: "s", remarks: [], actions: [],
    checks: [
      { anchorId: "audience", verdict: "adjust" }, { anchorId: "tagline", verdict: "adjust" }, { anchorId: "voice", verdict: "keep" },
    ],
  };
  it("只數還沒決定的建議調整", () => {
    const run = rowToRun({ id: 1, meetingId: 1, status: "done", minutes: JSON.stringify(minutes), decisions: JSON.stringify({ audience: { status: "adopted" } }), createdAt: new Date() });
    expect(pendingDecisionCount(run)).toBe(1);
  });
  it("running 超過 30 分鐘視為中斷", () => {
    const old = new Date(Date.now() - 31 * 60_000);
    expect(rowToRun({ id: 1, meetingId: 1, status: "running", createdAt: old }).status).toBe("failed");
    expect(rowToRun({ id: 1, meetingId: 1, status: "running", createdAt: new Date() }).status).toBe("running");
  });
});

describe("strategyMeetingRouter", () => {
  it("建得起來，procedure 名字沒撞 tRPC 保留字", () => {
    const names = Object.keys((strategyMeetingRouter as any)._def.procedures).sort();
    expect(names).toEqual(["adopt", "create", "decide", "getRun", "list", "previewAdopt", "remove", "runNow", "runs", "update"]);
    for (const n of names) expect(Object.getOwnPropertyNames(Function.prototype)).not.toContain(n);
  });
});

describe("出處（S 編號）與任務卡", () => {
  const sources = [
    { code: "S1", label: "品牌定位・品牌語氣", href: "/brands/edit?cat=positioning&b=1", text: "輕鬆自嘲／直白有溫度／不過度推銷" },
    { code: "S2", label: "產品「雪花牛排」", href: "/brands/edit?cat=positioning&b=1&p=9", text: "售價：NT$560｜Slogan：讓家人眼睛一亮的儀式感" },
  ];
  const anchors = anchorsFromPositioning("brand", {});
  const people = [{ agentId: 1, name: "張雅琪", title: "品牌策略師" }];

  it("S 引用：來源要存在；quote 必須是來源原文的子字串，不是就丟掉 quote", () => {
    const raw = JSON.stringify({
      summary: "s",
      checks: [{ anchorId: "voice", verdict: "adjust", proposal: "產品頁語氣拉回自嘲", reason: "r",
        cites: [{ code: "S2", quote: "讓家人眼睛一亮" }, { code: "S1", quote: "頂級尊榮" }, { code: "S9", quote: "x" }, { code: "E1" }] }],
    });
    const m = parseMinutesJson(raw, anchors, 1, people, sources)!;
    const voice = m.checks.find((c) => c.anchorId === "voice")!;
    expect(voice.cites).toEqual([{ code: "S2", quote: "讓家人眼睛一亮" }, { code: "S1", quote: null }]);
    expect(voice.evidence).toEqual([0]);
    expect(m.sources).toBe(sources);
  });

  it("任務卡：只收目錄裡有的 id，只給內容類行動", () => {
    const cards = [{ id: "fb-story-post", platform: "facebook", labelZh: "品牌故事貼文" }];
    const actions = [
      { title: "開學季題材", owner: "a", kind: "content" as const, cites: [] },
      { title: "排訪談", owner: "b", kind: "work" as const, cites: [] },
      { title: "不存在的卡", owner: "c", kind: "content" as const, cites: [] },
    ];
    const out = applyTaskPicks(actions, { picks: [{ index: 0, taskId: "fb-story-post" }, { index: 1, taskId: "fb-story-post" }, { index: 2, taskId: "nope" }] }, cards);
    expect(out[0]).toMatchObject({ taskId: "fb-story-post", taskLabel: "Facebook・品牌故事貼文", platform: "facebook" });
    expect(out[1]!.taskId).toBeUndefined();
    expect(out[2]!.taskId).toBeUndefined();
  });
});
