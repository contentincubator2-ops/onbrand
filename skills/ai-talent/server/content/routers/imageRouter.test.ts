/**
 * router 建得起來 —— 啟動期的第一道門。見 workbenchRouter.test.ts 的長註解：
 * procedure 名稱撞到 Function.prototype 成員（apply/call/bind…）時，tRPC 在
 * router({}) 建構當下就炸，但 tsc 與單元測試不會發現，直到伺服器實際啟動才
 * 現形。所以測法是「真的 import 一次，看得到 procedure 名字」。
 *
 * 2026-09-24：imageRouter 原本沒有這支守門測試，這輪加 refineScenePrompt 時補上。
 */
import { describe, expect, it } from "vitest";
import { imageRouter } from "./imageRouter";

describe("imageRouter", () => {
  it("router 建得起來，procedure 清單如預期", () => {
    const names = Object.keys((imageRouter as any)._def.procedures);
    expect(names.sort()).toEqual([
      "generate", "generateGarmentTryOn", "listForDecision", "promptFromCaption", "refineScenePrompt",
    ]);
  });

  it("procedure 名稱不可以撞 Function.prototype 上的東西", () => {
    const names = Object.keys((imageRouter as any)._def.procedures);
    for (const n of names) {
      expect(Object.getOwnPropertyNames(Function.prototype), `「${n}」是 Function.prototype 的成員，tRPC 會拒絕`)
        .not.toContain(n);
    }
  });
});
