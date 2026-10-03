import { describe, expect, it } from "vitest";

// tRPC 在建構期就會拒絕保留字 procedure 名稱（apply/call/bind…），而 tsc 抓不到——
// 所以每個 router 都要有一支真的 import 它的測試。
describe("channelRoleRouter", () => {
  it("builds and exposes list / save / discuss / importPaste", async () => {
    const { channelRoleRouter } = await import("./channelRoleRouter");
    const procs = Object.keys((channelRoleRouter as any)._def.procedures);
    expect(procs.sort()).toEqual(["discuss", "importPaste", "list", "save"]);
  }, 60_000);
});
