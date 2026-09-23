/**
 * router 建得起來 —— 這是啟動期的第一道門。
 *
 * 2026-09-01 迴歸：這支 router 原本有一個叫 `apply` 的 procedure。tRPC 把
 * `apply` 列為保留字（撞 Function.prototype.apply），`router({})` 在建構當下
 * 就丟 "Reserved words used in router({}) call"。
 *
 * 那次 server tsc 綠、client tsc 綠、987 個測試全過，**部署上去伺服器直接起不來**
 * ——健康檢查 20 次全部 connection refused，靠 workflow 的 rollback 才救回來。
 * 型別系統看不到保留字清單，單元測試只要沒 import 這個模組就碰不到它。
 *
 * 所以測法就是「真的 import 一次，然後看得到 procedure 名字」。任何未來新增的
 * 保留字名稱（apply / call / bind / name / length…）都會在這裡當場紅。
 */
import { describe, expect, it } from "vitest";
import { positioningDocsRouter } from "./positioningDocsRouter";

describe("positioningDocsRouter", () => {
  it("router 建得起來，而且沒有用到 tRPC 保留字", () => {
    const names = Object.keys((positioningDocsRouter as any)._def.procedures);
    expect(names.sort()).toEqual(["applyMapping", "coverage", "createCustomSegment", "propose", "removeCustomSegment"]);
  });

  it("procedure 名稱不可以撞 Function.prototype 上的東西", () => {
    const names = Object.keys((positioningDocsRouter as any)._def.procedures);
    for (const n of names) {
      expect(Object.getOwnPropertyNames(Function.prototype), `「${n}」是 Function.prototype 的成員，tRPC 會拒絕`)
        .not.toContain(n);
    }
  });
});
