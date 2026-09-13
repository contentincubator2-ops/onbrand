/**
 * router 建得起來，procedure 名字沒撞 tRPC 保留字（見 project_trpc_reserved_words 的前例）。
 */
import { describe, expect, it } from "vitest";
import { competitorRouter } from "./competitorRouter";

describe("competitorRouter", () => {
  it("建得起來，procedure 名單如預期", () => {
    const names = Object.keys((competitorRouter as any)._def.procedures).sort();
    expect(names).toEqual(["list", "snapshot"]);
  });

  it("procedure 名稱不可以撞 Function.prototype 上的東西", () => {
    for (const n of Object.keys((competitorRouter as any)._def.procedures)) {
      expect(Object.getOwnPropertyNames(Function.prototype), `「${n}」tRPC 會拒絕`).not.toContain(n);
    }
  });
});
