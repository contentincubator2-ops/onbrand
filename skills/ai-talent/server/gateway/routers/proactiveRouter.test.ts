import { describe, it, expect } from "vitest";
import { KIND_ACTIONS, proactiveRouter } from "./proactiveRouter";
import { isPersonalPath } from "../../platform/core/teamAccess";

describe("proactiveRouter", () => {
  // tRPC 保留字（apply／call／bind…）會讓 router 在建構期就炸，而 tsc 與其他測試全綠。
  it("router 建得起來，三支 procedure 都在", () => {
    const names = Object.keys((proactiveRouter as any)._def.procedures ?? (proactiveRouter as any)._def.record ?? {});
    expect(names.sort()).toEqual(["act", "count", "inbox"]);
  });

  it("收件匣是個人的：團隊成員看自己的，不切成品牌擁有者", () => {
    expect(isPersonalPath("proactive.inbox")).toBe(true);
    expect(isPersonalPath("proactive.act")).toBe(true);
  });

  it("只有排好的一週可以直接照做；其餘帶去處理的頁面", () => {
    expect(KIND_ACTIONS.week_plan_ready.approve).toBe(true);
    expect(KIND_ACTIONS.review_overdue.approve).toBe(false);
    expect(KIND_ACTIONS.publish_unapproved.approve).toBe(false);
  });
});
