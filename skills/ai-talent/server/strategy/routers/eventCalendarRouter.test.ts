import { describe, expect, it } from "vitest";

// tRPC 在建構期就會拒絕保留字 procedure 名稱（apply/call/bind…），而 tsc 抓不到——
// 所以每個 router 都要有一支真的 import 它的測試。
describe("eventCalendarRouter", () => {
  it("builds and exposes nodes / addNode / updateNode / removeNode / hideBuiltin / showBuiltin", async () => {
    const { eventCalendarRouter } = await import("./eventCalendarRouter");
    const procs = Object.keys((eventCalendarRouter as any)._def.procedures);
    expect(procs.sort()).toEqual(["addNode", "hideBuiltin", "nodes", "removeNode", "showBuiltin", "updateNode"]);
  }, 60_000);
});
