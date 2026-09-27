import { describe, expect, it } from "vitest";
import { DEFAULT_NAV_ITEMS, NAV_ITEM_IDS, navPrefsRouter, sanitizeNavItems } from "./navPrefsRouter";

describe("navPrefsRouter", () => {
  it("建得起來，procedure 名稱沒撞 tRPC 保留字", () => {
    const names = Object.keys((navPrefsRouter as any)._def.procedures).sort();
    expect(names).toEqual(["get", "save"]);
    for (const n of names) expect(Object.getOwnPropertyNames(Function.prototype)).not.toContain(n);
  });
  it("預設是 Facebook＋Instagram（CJ 2026-09-27 選的）", () => {
    expect(DEFAULT_NAV_ITEMS).toEqual(["fb", "ig"]);
  });
  it("只留認得的 id、去重、保留順序；專案／行事曆／活動是固定的，不能存", () => {
    expect(sanitizeNavItems(["ig", "fb", "ig", "projects", "calendar", "campaigns", "nope", "web"])).toEqual(["ig", "fb", "web"]);
    expect(sanitizeNavItems(null)).toEqual([]);
    expect(NAV_ITEM_IDS).not.toContain("projects");
  });
});
