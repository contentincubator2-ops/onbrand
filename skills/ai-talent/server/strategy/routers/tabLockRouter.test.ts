import { describe, expect, it } from "vitest";

// tRPC 在建構期就會拒絕保留字 procedure 名稱（apply/call/bind…），而 tsc 抓不到——
// 所以每個 router 都要有一支真的 import 它的測試。
describe("tabLockRouter", () => {
  it("builds and exposes get / lock / unlock", async () => {
    const { tabLockRouter } = await import("./tabLockRouter");
    const procs = Object.keys((tabLockRouter as any)._def.procedures);
    expect(procs.sort()).toEqual(["get", "lock", "unlock"]);
  }, 60_000);
});
