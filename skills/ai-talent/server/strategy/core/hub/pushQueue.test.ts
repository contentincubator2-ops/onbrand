import { describe, expect, it } from "vitest";
import { buildRecipients, parseOptOut, pushText } from "./pushQueue";

const reps = [
  { id: 1, name: "陳怡君", lineUserId: "U1" },
  { id: 2, name: "林志豪", lineUserId: null },
  { id: 3, name: "王雅婷", lineUserId: "U3" },
];

describe("buildRecipients", () => {
  it("lists everyone in the audience, including the people it cannot reach", () => {
    const got = buildRecipients({ audience: [1, 2, 3], reps, optedOut: new Set([3]) });
    expect(got.map((r) => [r.repId, r.deliverable, r.blockedBy])).toEqual([
      [1, true, null],
      [2, false, "no_line_account"],
      [3, false, "opted_out"],
    ]);
  });

  // 按下送出之後才發現「其實只送到兩個人」，那個清單就沒有存在的意義。
  it("never silently drops a blocked recipient", () => {
    const got = buildRecipients({ audience: [2], reps, optedOut: new Set() });
    expect(got).toHaveLength(1);
    expect(got[0].deliverable).toBe(false);
  });

  // 退訂的人就算之後綁了帳號也不該收到 —— 退訂贏過「技術上送得到」。
  it("puts opting out ahead of having an account", () => {
    const got = buildRecipients({ audience: [1], reps, optedOut: new Set([1]) });
    expect(got[0].blockedBy).toBe("opted_out");
  });

  it("copes with an id that has no rep row", () => {
    const got = buildRecipients({ audience: [99], reps, optedOut: new Set() });
    expect(got[0]).toMatchObject({ repId: 99, deliverable: false, blockedBy: "no_line_account" });
  });
});

describe("parseOptOut", () => {
  it("reads the category out of a plain reply", () => {
    expect(parseOptOut("停止補助")).toEqual({ kind: "subsidy", intent: "stop" });
    expect(parseOptOut("取消市場統計")).toEqual({ kind: "market", intent: "stop" });
    expect(parseOptOut("stop subsidy")).toEqual({ kind: "subsidy", intent: "stop" });
  });

  it("handles resuming", () => {
    expect(parseOptOut("恢復補助")).toEqual({ kind: "subsidy", intent: "resume" });
  });

  // 說了「停止」但沒講哪一類 —— 不猜。認錯一個退訂比漏認一個糟得多。
  it("refuses to guess the category when none was named", () => {
    expect(parseOptOut("停止")).toEqual({ kind: null, intent: "stop" });
  });

  it("stays out of the way of an ordinary message", () => {
    expect(parseOptOut("幫我寫一篇補助的貼文")).toEqual({ kind: null, intent: null });
  });

  it("reads stop, not resume, when both words appear", () => {
    expect(parseOptOut("先停止補助，之後再恢復").intent).toBe("stop");
  });
});

describe("pushText", () => {
  const base = { statement: "補助上限 5 萬點", sourceName: "IDA", kindLabel: "補助方案", zh: true };

  // 沒有退訂就不該有推播。
  it("always ends with how to stop receiving this category", () => {
    const text = pushText({ ...base, expiresOn: null });
    expect(text).toContain("停止補助方案");
  });

  it("puts the deadline in when there is one", () => {
    expect(pushText({ ...base, expiresOn: "2026-09-29" })).toContain("截止：2026-09-29");
    expect(pushText({ ...base, expiresOn: null })).not.toContain("截止");
  });

  it("always carries the source", () => {
    expect(pushText({ ...base, expiresOn: null })).toContain("出處：IDA");
  });

  it("writes English for an English market", () => {
    const text = pushText({ ...base, kindLabel: "Subsidy", zh: false, expiresOn: "2026-09-29" });
    expect(text).toContain("Deadline: 2026-09-29");
    expect(text).toContain('Reply "stop Subsidy"');
  });
});
