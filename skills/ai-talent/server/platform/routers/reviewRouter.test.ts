/**
 * router 建得起來，而且 procedure 名字沒撞 tRPC 保留字。
 *
 * 2026-09-02 的前例：一個叫 `apply` 的 procedure 讓 `router({})` 在建構當下就丟
 * "Reserved words used in router({}) call" —— server tsc 綠、client tsc 綠、
 * 測試全過，部署上去伺服器直接起不來。型別系統看不到保留字清單。
 *
 * 這支特別值得測：reviewRouter 有 `submit` 與 `approve`，都是很容易和
 * Function.prototype / tRPC 內部字撞名的動詞。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { reviewRouter } from "./reviewRouter";

describe("reviewRouter", () => {
  // 2026-10-02：listPending 用了 `LIMIT ?`，正式資料庫回 "Incorrect arguments to
  // mysqld_stmt_execute"，活動頁右下角一直跳載入失敗。mysql2 execute() 不吃 LIMIT 參數。
  it("SQL 裡沒有 LIMIT ? —— LIMIT 一律寫成夾過的整數", () => {
    const src = readFileSync(new URL("./reviewRouter.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/LIMIT\s*\?/);
  });

  it("建得起來，procedure 名單如預期", () => {
    const names = Object.keys((reviewRouter as any)._def.procedures).sort();
    expect(names).toEqual([
      "approve", "listMine", "listPending", "pendingCount", "requestRevision",
      "reviewers", "statusFor", "submit",
    ]);
  });

  it("procedure 名稱不可以撞 Function.prototype 上的東西", () => {
    for (const n of Object.keys((reviewRouter as any)._def.procedures)) {
      expect(Object.getOwnPropertyNames(Function.prototype), `「${n}」tRPC 會拒絕`).not.toContain(n);
    }
  });

  it("退回修改一定要附理由 —— 沒有理由的退件只會來回三次", () => {
    const def = (reviewRouter as any)._def.procedures.requestRevision._def;
    const schema = def.inputs?.[0];
    expect(schema, "requestRevision 應該有輸入驗證").toBeTruthy();
    // note 少於 2 個字要被擋下
    expect(() => schema.parse({ id: 1, note: "" })).toThrow();
    expect(() => schema.parse({ id: 1, note: "圖換掉" })).not.toThrow();
  });

  it("送審預設是內部審核，且審核人上限 10", () => {
    const schema = (reviewRouter as any)._def.procedures.submit._def.inputs?.[0];
    const ok = schema.parse({ missionId: 1, outputId: 2 });
    expect(ok.reviewType).toBe("internal");
    expect(ok.isUrgent).toBe(false);
    expect(() => schema.parse({
      missionId: 1, outputId: 2, reviewerIds: Array.from({ length: 11 }, (_, i) => i),
    })).toThrow();
  });
});
