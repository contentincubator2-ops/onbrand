/**
 * router 建得起來，procedure 名字沒撞 tRPC 保留字（見 project_trpc_reserved_words 的前例）。
 */
import { describe, expect, it } from "vitest";
import { missionRouter } from "./missionRouter";

describe("missionRouter", () => {
  it("建得起來，專案頁用的 listProjects 在、舊的 listAllForUser 已拿掉", () => {
    const names = Object.keys((missionRouter as any)._def.procedures);
    expect(names).toContain("listProjects");
    expect(names).not.toContain("listAllForUser");
  });

  it("procedure 名稱不可以撞 Function.prototype 上的東西", () => {
    for (const n of Object.keys((missionRouter as any)._def.procedures)) {
      expect(Object.getOwnPropertyNames(Function.prototype), `「${n}」tRPC 會拒絕`).not.toContain(n);
    }
  });
});
