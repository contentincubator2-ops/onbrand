import { describe, expect, it } from "vitest";

// tRPC 在建構期就會拒絕保留字 procedure 名稱（apply/call/bind…），而 tsc 抓不到——
// 所以每個 router 都要有一支真的 import 它的測試。
describe("positioningBookRouter", () => {
  it("builds and exposes its procedures", async () => {
    const { positioningBookRouter } = await import("./positioningBookRouter");
    const procs = Object.keys((positioningBookRouter as any)._def.procedures);
    expect(procs.sort()).toEqual(["addCard", "discuss", "draftProposal", "get", "importPaste", "removeCard", "reorder", "saveCard"]);
  }, 60_000);
});
