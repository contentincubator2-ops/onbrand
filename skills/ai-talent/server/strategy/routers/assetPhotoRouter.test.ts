/**
 * router 建得起來 —— 見 workbenchRouter.test.ts 的長註解：procedure 名稱撞到
 * Function.prototype 的成員（apply/call/bind…）時，tRPC 在 router({}) 建構當下
 * 就炸，但 tsc 與單元測試不會發現，直到伺服器實際啟動才現形。
 */
import { describe, expect, it } from "vitest";
import { assetPhotoRouter } from "./assetPhotoRouter";

describe("assetPhotoRouter", () => {
  it("router 建得起來，procedure 名稱如預期", () => {
    const names = Object.keys((assetPhotoRouter as any)._def.procedures).sort();
    // 2026-09-25：加了 saveGeneratedImage（把 AI 生成圖存進產品照片庫／設為主圖）。
    // 2026-09-30：加了 library（素材庫：全站上傳過的圖一次列出來）。
    // 2026-10-09：加了 importCanvaDesign（把 Canva 設計匯出成圖存進素材庫）。
    // 2026-10-10：加了 canvaRef／startCanvaEdit／syncCanvaEdit（在 Canva 編輯的來回）。
    expect(names).toEqual(["canvaRef", "importCanvaDesign", "library", "list", "remove", "saveGeneratedImage", "setPrimary", "startCanvaEdit", "syncCanvaEdit"]);
  });

  it("procedure 名稱不可以撞 Function.prototype 上的東西", () => {
    for (const n of Object.keys((assetPhotoRouter as any)._def.procedures)) {
      expect(Object.getOwnPropertyNames(Function.prototype), `「${n}」是 Function.prototype 的成員`)
        .not.toContain(n);
    }
  });
});
