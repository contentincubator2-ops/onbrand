/**
 * router 建得起來 —— 見 workbenchRouter.test.ts 的長註解：procedure 名稱撞到
 * Function.prototype 的成員（apply/call/bind…）時，tRPC 在 router({}) 建構當下
 * 就炸，但 tsc 與單元測試不會發現，直到伺服器實際啟動才現形。
 */
import { describe, expect, it } from "vitest";
import { campaignRouter } from "./campaignRouter";

describe("campaignRouter", () => {
  it("router 建得起來，procedure 名稱如預期", () => {
    const names = Object.keys((campaignRouter as any)._def.procedures).sort();
    expect(names).toEqual(["addOptions", "briefSpecs", "chat", "chatAppend", "chatCloseThread", "chatHistory", "chatReopenThread", "chatThreads", "chatUndone", "draftItem", "generate", "get", "infer", "itemThumbs", "kpiAgent", "markPublished", "markWritten", "planKpi", "saveBasis", "saveChannelBrief", "saveKolBrief", "savePlan", "saveSettings", "setDates", "setInPlanner", "setLock", "team", "trayList"]);
  });

  it("procedure 名稱不可以撞 Function.prototype 上的東西", () => {
    for (const n of Object.keys((campaignRouter as any)._def.procedures)) {
      expect(Object.getOwnPropertyNames(Function.prototype), `「${n}」是 Function.prototype 的成員`)
        .not.toContain(n);
    }
  });
});
