import { describe, expect, it } from "vitest";

// tRPC 在建構期就會拒絕保留字 procedure 名稱（apply/call/bind…），而 tsc 抓不到——
// 所以每個 router 都要有一支真的 import 它的測試。
describe("brandRegulationRouter", () => {
  it("builds and exposes list / create / update / setEnabled / remove", async () => {
    const { brandRegulationRouter } = await import("./brandRegulationRouter");
    const procs = Object.keys((brandRegulationRouter as any)._def.procedures);
    expect(procs.sort()).toEqual(["create", "list", "remove", "setEnabled", "update"]);
  }, 60_000);
});
