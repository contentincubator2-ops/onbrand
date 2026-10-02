/**
 * 活動頁對話讀回畫面（rowsToMessages）：只有最新一次還沒復原的修改帶快照。
 */
import { describe, it, expect } from "vitest";
import { rowsToMessages } from "./campaignChatStore";

const row = (k: string, extra: Record<string, any> = {}) => ({ clientKey: k, role: "assistant", content: k, speaker: "planner", name: "朱怡君", truncated: 0, undone: 0, ...extra });

describe("rowsToMessages", () => {
  it("只有最新一則還沒復原的修改帶 before／beforeBasis", () => {
    const out = rowsToMessages([
      row("a", { proposal: '{"ops":[1]}', beforePlan: '{"v":1}' }),
      row("b", { proposal: '{"ops":[2]}', beforePlan: '{"v":2}', beforeBasis: '{"x":null}' }),
      row("c"),
    ]);
    expect(out.map((m) => !!m.before)).toEqual([false, true, false]);
    expect(out[1]!.beforeBasis).toEqual({ x: null });
    expect(out[0]!.proposal).toEqual({ ops: [1] });
  });
  it("最新那則已復原：往前一則（快照還在）可以復原", () => {
    const out = rowsToMessages([
      row("a", { proposal: '{"ops":[1]}', beforePlan: '{"v":1}' }),
      row("b", { proposal: '{"ops":[2]}', undone: 1 }),
    ]);
    expect(out[0]!.before).toEqual({ v: 1 });
    expect(out[1]!.undone).toBe(true);
  });
  it("壞掉的 JSON 當沒有；不認得的 role 當 assistant", () => {
    const [m] = rowsToMessages([row("a", { role: "x", proposal: "{壞", speaker: null })]);
    expect(m).toEqual({ key: "a", role: "assistant", content: "a", name: "朱怡君" });
  });
});
