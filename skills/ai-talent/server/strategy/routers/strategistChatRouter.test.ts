/**
 * router 建得起來 —— 這是啟動期的第一道門。見 workbenchRouter.test.ts 的
 * 長註解：procedure 名稱撞到 Function.prototype 成員（apply/call/bind…）
 * 時，tRPC 在 router({}) 建構當下就炸，但 tsc 與單元測試不會發現，直到
 * 伺服器實際啟動才會現形。所以測法是「真的 import 一次，看得到 procedure
 * 名字」。
 */
import { describe, expect, it } from "vitest";
import { strategistChatRouter } from "./strategistChatRouter";

describe("strategistChatRouter", () => {
  it("router 建得起來，而且沒有用到 tRPC 保留字", () => {
    const names = Object.keys((strategistChatRouter as any)._def.procedures);
    // 2026-09-23：加了 listDirectors / searchDirectors（三位真實 mos_db
    // 策略總監的人選清單與搜尋，見 strategistDirectory.ts）。
    expect(names.sort()).toEqual(["getConversation", "listDirectors", "searchDirectors", "sendMessage"]);
  });

  it("procedure 名稱不可以撞 Function.prototype 上的東西", () => {
    const names = Object.keys((strategistChatRouter as any)._def.procedures);
    for (const n of names) {
      expect(Object.getOwnPropertyNames(Function.prototype), `「${n}」是 Function.prototype 的成員，tRPC 會拒絕`)
        .not.toContain(n);
    }
  });
});
