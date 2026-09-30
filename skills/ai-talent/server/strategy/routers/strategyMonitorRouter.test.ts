/**
 * router 建得起來、procedure 名字沒撞到 tRPC 保留字（apply/call/bind…會在
 * router({}) 建構當下就炸，tsc 與單元測試都抓不到）。
 */
import { describe, expect, it } from "vitest";
import { strategyMonitorRouter } from "./strategyMonitorRouter";

describe("strategyMonitorRouter", () => {
  it("router 建得起來，包含 2026-09-30 新增的 unreadSummary", () => {
    const names = Object.keys((strategyMonitorRouter as any)._def.procedures).sort();
    expect(names).toEqual(["overview", "scanNow", "setAlertStatus", "setWatch", "unreadSummary"]);
  });
});
