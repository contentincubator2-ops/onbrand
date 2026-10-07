/**
 * router 建得起來，而且 procedure 名字沒撞 tRPC 保留字（前例見 brandTaskCardRouter.test.ts）。
 */
import { describe, expect, it } from "vitest";
import { brandVoiceRouter } from "./brandVoiceRouter";

describe("brandVoiceRouter", () => {
  it("建得起來，procedure 名單如預期", () => {
    const names = Object.keys((brandVoiceRouter as any)._def.procedures).sort();
    expect(names).toEqual(["categories", "classify", "feedback", "finish", "retry", "start", "status"]);
  });

  it("procedure 名稱不可以撞 Function.prototype 上的東西", () => {
    for (const n of Object.keys((brandVoiceRouter as any)._def.procedures)) {
      expect(Object.getOwnPropertyNames(Function.prototype), `「${n}」tRPC 會拒絕`).not.toContain(n);
    }
  });
});
