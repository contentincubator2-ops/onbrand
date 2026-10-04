/**
 * router 建得起來，而且 procedure 名字沒撞 tRPC 保留字。
 *
 * 2026-09-02 的前例：一個叫 `apply` 的 procedure 讓 `router({})` 在建構當下就丟
 * "Reserved words used in router({}) call" —— server tsc 綠、client tsc 綠、
 * 987 個測試全過，部署上去伺服器直接起不來。型別系統看不到保留字清單。
 */
import { describe, expect, it } from "vitest";
import { brandTaskCardRouter } from "./brandTaskCardRouter";

describe("brandTaskCardRouter", () => {
  it("建得起來，procedure 名單如預期", () => {
    const names = Object.keys((brandTaskCardRouter as any)._def.procedures).sort();
    expect(names).toEqual([
      "create", "distil", "dryRun", "duplicate", "extractSamples", "generateIllustration", "get", "list",
      "publish", "remove", "unpublish", "update",
    ]);
  });

  it("procedure 名稱不可以撞 Function.prototype 上的東西", () => {
    for (const n of Object.keys((brandTaskCardRouter as any)._def.procedures)) {
      expect(Object.getOwnPropertyNames(Function.prototype), `「${n}」tRPC 會拒絕`).not.toContain(n);
    }
  });

  it("匯入這個 router 就把自建卡接進 taskRegistry 了（不需要別處記得叫）", async () => {
    const { resolveTask } = await import("../core/catalog/taskRegistry");
    // 這裡沒有資料庫，所以自建卡那條來源會丟連線錯誤。重點是 resolveTask
    // 要把它吞掉並回 null，而不是把 mysql 的錯誤往上冒 —— 呼叫端會把那個
    // 顯示成「任務壞了」，真正的原因只留在 stack 裡。
    await expect(resolveTask("u999999-nope")).resolves.toBeNull();
  });

  it("內建卡不受自建卡來源影響（同步目錄先命中，根本不碰資料庫）", async () => {
    const { resolveTask } = await import("../core/catalog/taskRegistry");
    const r = await resolveTask("fb-30-caption-short");
    expect(r?.source).toBe("30s");
  });
});
