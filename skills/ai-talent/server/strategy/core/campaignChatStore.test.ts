/**
 * 活動頁對話（分段討論）的純函式：讀回畫面、標題、接哪一段、伺服器摘要。
 */
import { describe, it, expect } from "vitest";
import { rowsToMessages, threadTitle, pickCurrentThread, autoSummary, IDLE_MS } from "./campaignChatStore";

const row = (k: string, extra: Record<string, any> = {}) => ({ clientKey: k, role: "assistant", content: k, speaker: "planner", name: "朱怡君", truncated: 0, undone: 0, ...extra });

describe("rowsToMessages", () => {
  it("沒指定時：這段最新一則還沒復原的修改帶快照", () => {
    const out = rowsToMessages([
      row("a", { proposal: '{"ops":[1]}', beforePlan: '{"v":1}' }),
      row("b", { proposal: '{"ops":[2]}', beforePlan: '{"v":2}', beforeBasis: '{"x":null}' }),
      row("c"),
    ]);
    expect(out.map((m) => !!m.before)).toEqual([false, true, false]);
    expect(out[1]!.beforeBasis).toEqual({ x: null });
  });
  it("指定整檔最新的那則：不在這段就誰都不帶（舊的那段不能復原，免得蓋掉後來的修改）", () => {
    const rows = [row("a", { proposal: '{"ops":[1]}', beforePlan: '{"v":1}' })];
    expect(rowsToMessages(rows, "z")[0]!.before).toBeUndefined();
    expect(rowsToMessages(rows, "a")[0]!.before).toEqual({ v: 1 });
    expect(rowsToMessages(rows, null)[0]!.before).toBeUndefined();
  });
  it("壞掉的 JSON 當沒有；不認得的 role 當 assistant", () => {
    const [m] = rowsToMessages([row("a", { role: "x", proposal: "{壞", speaker: null })]);
    expect(m).toEqual({ key: "a", role: "assistant", content: "a", name: "朱怡君" });
  });
});

describe("threadTitle", () => {
  it("取第一句、去掉 @人、太長截斷", () => {
    expect(threadTitle("@謝曉雯 開賣那幾篇哪些值得下廣告？")).toBe("開賣那幾篇哪些值得下廣告？");
    expect(threadTitle("一".repeat(40))).toBe(`${"一".repeat(27)}…`);
    expect(threadTitle("")).toBe("討論");
  });
});

describe("pickCurrentThread", () => {
  const now = Date.parse("2026-10-02T12:00:00Z");
  it("最近動過、還開著的那段", () => {
    expect(pickCurrentThread([{ id: 2, status: "open", updatedAt: "2026-10-02T11:00:00Z" }, { id: 1, status: "closed", updatedAt: "2026-10-02T11:30:00Z" }], now)).toBe(2);
  });
  it("放超過一天、或全都結束了：從新的一段開始", () => {
    expect(pickCurrentThread([{ id: 2, status: "open", updatedAt: new Date(now - IDLE_MS - 1).toISOString() }], now)).toBeNull();
    expect(pickCurrentThread([{ id: 1, status: "closed", updatedAt: "2026-10-02T11:30:00Z" }], now)).toBeNull();
  });
});

describe("autoSummary", () => {
  it("改了幾次＋最後一句回覆的第一句", () => {
    expect(autoSummary([
      { role: "user", content: "下廣告？" },
      { role: "assistant", content: "選三篇。理由是…", proposal: "{}", undone: 0 },
      { role: "assistant", content: "復原了那次。", proposal: "{}", undone: 1 },
    ])).toBe("改了企劃 1 次・復原了那次。");
    expect(autoSummary([{ role: "user", content: "問問" }])).toBe("只有討論，沒改企劃");
    expect(autoSummary([])).toBeNull();
  });
});

describe("英文介面（伺服器自己產的字）", () => {
  it("預設標題與自動摘要跟著語言", () => {
    expect(threadTitle("", "en")).toBe("Discussion");
    expect(autoSummary([{ role: "assistant", content: "Picked three posts. Because…", proposal: "{}", undone: 0 }], "en"))
      .toBe("Changed the plan 1 time · Picked three posts.");
    expect(autoSummary([{ role: "user", content: "q" }], "en")).toBe("Discussion only, no plan changes");
  });
});
