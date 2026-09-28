/**
 * router 建得起來 —— 啟動期的第一道門。見 workbenchRouter.test.ts 的長註解：
 * procedure 名稱撞到 Function.prototype 成員（apply/call/bind…）時，tRPC 在
 * router({}) 建構當下就炸，但 tsc 與單元測試不會發現，直到伺服器實際啟動才
 * 現形。所以測法是「真的 import 一次，看得到 procedure 名字」。
 *
 * 2026-09-24：imageRouter 原本沒有這支守門測試，這輪加 refineScenePrompt 時補上。
 */
import { describe, expect, it } from "vitest";
import { imageRouter, productScenePromptSystem } from "./imageRouter";

describe("有真實產品照時的圖片指令", () => {
  it("帶產品名、只寫場景、不准描述或替換產品", () => {
    const sys = productScenePromptSystem("【香氣炸裂！肉質軟嫩！下酒必備】美國橫膈牛排");
    expect(sys).toContain("美國橫膈牛排");
    expect(sys).toMatch(/ONLY the scene/);
    expect(sys).toMatch(/Never describe its appearance/);
    expect(sys).toMatch(/Never name or depict any other food/);
    expect(sys).toMatch(/do not decide whether the product is raw, cooked/);
  });
  it("沒有產品名也不會壞", () => {
    expect(productScenePromptSystem("   ")).toContain("the brand's product");
  });
});

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
