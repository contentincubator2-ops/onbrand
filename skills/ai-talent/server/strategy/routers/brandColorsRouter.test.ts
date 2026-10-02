import { describe, expect, it } from "vitest";

// tRPC 在建構期就會拒絕保留字 procedure 名稱（apply/call/bind…），而 tsc 抓不到——
// 所以每個 router 都要有一支真的 import 它的測試。
// 2026-10-02：generateBrandedVariants（品牌變體）已移除，確認沒有回來。
describe("brandColorsRouter", () => {
  it("builds and exposes getCurrent / extractForBrand / setOverrides / reset", async () => {
    const { brandColorsRouter } = await import("./brandColorsRouter");
    const procs = Object.keys((brandColorsRouter as any)._def.procedures);
    expect(procs.sort()).toEqual(["extractForBrand", "getCurrent", "reset", "setOverrides"]);
  }, 60_000);
});
