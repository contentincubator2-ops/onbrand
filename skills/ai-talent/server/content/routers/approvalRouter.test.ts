/**
 * router 建得起來、procedure 名字沒撞 tRPC 保留字（前例見 reviewRouter.test.ts），
 * 以及免登入入口的幾條輸入規則。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { approvalRouter } from "./approvalRouter";
import { PLANS } from "../../platform/core/billing/plans";

const procs = (approvalRouter as any)._def.procedures;
const schemaOf = (name: string) => procs[name]._def.inputs?.[0];
const TOKEN = "A".repeat(32);

describe("approvalRouter", () => {
  it("建得起來，procedure 名單如預期", () => {
    expect(Object.keys(procs).sort()).toEqual(["comment", "create", "decide", "editCaption", "list", "restore", "revoke", "view"]);
  });

  it("procedure 名稱不可以撞 Function.prototype 上的東西", () => {
    for (const n of Object.keys(procs)) {
      expect(Object.getOwnPropertyNames(Function.prototype), `「${n}」tRPC 會拒絕`).not.toContain(n);
    }
  });

  it("SQL 裡沒有 LIMIT ?（mysql2 execute 不吃）", () => {
    const src = readFileSync(new URL("./approvalRouter.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/LIMIT\s*\?/);
  });

  it("免登入的 procedure 只收 token＋itemId，不收任何可以直接指到別人資料的編號", () => {
    for (const name of ["view", "comment", "editCaption", "decide", "restore"]) {
      const keys = Object.keys((schemaOf(name)._def.schema ?? schemaOf(name)).shape);
      for (const forbidden of ["outputId", "brandId", "missionId", "userId", "linkId"]) {
        expect(keys, `${name} 不該收 ${forbidden}`).not.toContain(forbidden);
      }
      expect(keys).toContain("token");
    }
  });

  it("token 格式不對直接擋掉", () => {
    expect(() => schemaOf("view").parse({ token: "short" })).toThrow();
    expect(() => schemaOf("view").parse({ token: "a/b?c=" + "x".repeat(30) })).toThrow();
    expect(() => schemaOf("view").parse({ token: TOKEN })).not.toThrow();
  });

  it("要修改一定要寫原因；核准不用", () => {
    const s = schemaOf("decide");
    expect(() => s.parse({ token: TOKEN, itemId: 1, decision: "changes_requested" })).toThrow();
    expect(() => s.parse({ token: TOKEN, itemId: 1, decision: "changes_requested", note: " " })).toThrow();
    expect(() => s.parse({ token: TOKEN, itemId: 1, decision: "changes_requested", note: "第二段的價格寫錯了" })).not.toThrow();
    expect(() => s.parse({ token: TOKEN, itemId: 1, decision: "approved" })).not.toThrow();
  });

  it("直接修改一定要帶起始版本（擋兩個人同時改）", () => {
    const s = schemaOf("editCaption");
    expect(() => s.parse({ token: TOKEN, itemId: 1, caption: "新的" })).toThrow();
    expect(() => s.parse({ token: TOKEN, itemId: 1, caption: "新的", base: "舊的" })).not.toThrow();
  });

  it("一條連結最多 60 篇，期限只有 7／14／30 天，預設 14", () => {
    const s = schemaOf("create");
    const one = { outputId: 1 };
    expect(s.parse({ brandId: 1, title: "十月第二週", items: [one] }).expiresInDays).toBe(14);
    expect(() => s.parse({ brandId: 1, title: "x", items: [one], expiresInDays: 90 })).toThrow();
    expect(() => s.parse({ brandId: 1, title: "x", items: [] })).toThrow();
    expect(() => s.parse({ brandId: 1, title: "x", items: Array.from({ length: 61 }, () => one) })).toThrow();
  });

  it("所有付費方案都能建連結，試用不行", () => {
    expect(PLANS.trial.quota.approvalLinks).toBe(false);
    expect(PLANS.drop_starter.quota.approvalLinks).toBe(true);
    expect(PLANS.drop_pro.quota.approvalLinks).toBe(true);
    expect(PLANS.enterprise.quota.approvalLinks).toBe(true);
  });
});
