/**
 * 客戶資料隔離：protectedProcedure 的每個呼叫，只要 input 裡帶了品牌／產品／
 * 活動／任務的編號，就必須是呼叫者碰得到的。這裡同時測「找編號」「判斷」與
 * 「真的掛在 protectedProcedure 上」三層。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

// 用戶 1 擁有品牌 5、產品 50、活動 500、任務 5000；其餘一律不是他的。
const OWNED: Record<string, number[]> = { brand: [5], product: [50], event: [500], mission: [5000] };
const guard = (kind: string) => async (_userId: number, id: number) => {
  if (!OWNED[kind].includes(id)) throw new TRPCError({ code: "NOT_FOUND", message: `${kind} not found` });
};
vi.mock("./brandAuth", () => ({
  assertBrandAccess: (u: number, id: number) => guard("brand")(u, id),
  assertProductAccess: (u: number, id: number) => guard("product")(u, id),
  assertEventAccess: (u: number, id: number) => guard("event")(u, id),
  assertMissionOwner: (u: number, id: number) => guard("mission")(u, id),
}));

let adminIds: number[] = [];
vi.mock("../../localDb", () => ({
  default: {
    execute: async (_sql: string, params: any[]) => [[{ role: adminIds.includes(params[0]) ? "admin" : "user", email: "u@example.com" }]],
  },
}));

import { _resetGrantCache, assertInputScopes, collectScopeIds, isExemptPath } from "./tenantGuard";
import { protectedProcedure, router } from "./trpc";

beforeEach(() => { _resetGrantCache(); adminIds = []; });

describe("collectScopeIds", () => {
  it("找出各種欄位名稱與陣列", () => {
    expect(collectScopeIds({
      brandId: 5, scopeProductId: 50, eventId: 500, missionId: 5000, productIds: [50, 51], brandIds: [5],
    })).toEqual([
      { kind: "brand", id: 5 }, { kind: "product", id: 50 }, { kind: "event", id: 500 },
      { kind: "mission", id: 5000 }, { kind: "product", id: 51 },
    ]);
  });

  it("巢狀物件與陣列裡的也找得到", () => {
    expect(collectScopeIds({ scope: { brandId: 7 }, items: [{ eventId: 8 }] }))
      .toEqual([{ kind: "brand", id: 7 }, { kind: "event", id: 8 }]);
  });

  it("null、0、負數、字串、小數都不算編號", () => {
    expect(collectScopeIds({ brandId: null, productId: 0, eventId: -1, missionId: "12", scopeBrandId: 1.5 })).toEqual([]);
  });

  it("沒有 input 或不是物件時回空陣列", () => {
    expect(collectScopeIds(undefined)).toEqual([]);
    expect(collectScopeIds("brandId")).toEqual([]);
  });

  it("其他名稱的編號不在涵蓋範圍（要由 procedure 自己檢查）", () => {
    expect(collectScopeIds({ id: 5, outputId: 9, conversationId: 3 })).toEqual([]);
  });
});

describe("assertInputScopes", () => {
  const deps = { isAdmin: async () => false };

  it("自己的編號放行", async () => {
    await expect(assertInputScopes(1, "x.y", { brandId: 5, productId: 50, eventId: 500, missionId: 5000 }, deps)).resolves.toBeUndefined();
  });

  it.each([
    ["別人的品牌", { brandId: 6 }],
    ["自己的品牌配別人的產品", { brandId: 5, productId: 51 }],
    ["自己的品牌配別人的活動", { brandId: 5, scopeEventId: 501 }],
    ["別人的任務", { missionId: 5001 }],
    ["產品清單裡混了一個別人的", { productIds: [50, 51] }],
  ])("%s → NOT_FOUND", async (_label, input) => {
    await expect(assertInputScopes(1, "x.y", input, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("內部管理者可以開任何客戶的資料", async () => {
    await expect(assertInputScopes(1, "x.y", { brandId: 6 }, { isAdmin: async () => true })).resolves.toBeUndefined();
  });

  it("豁免的路徑不檢查", async () => {
    expect(isExemptPath("support.sendMessage")).toBe(true);
    expect(isExemptPath("quickTask.setChannels")).toBe(false);
    await expect(assertInputScopes(1, "support.sendMessage", { brandId: 6 }, deps)).resolves.toBeUndefined();
  });

  it("權限以外的錯誤（例如資料庫掛了）照樣丟出，不當成沒權限", async () => {
    const check = {
      brand: async () => { throw new Error("db down"); },
      product: guard("product"), event: guard("event"), mission: guard("mission"),
    };
    await expect(assertInputScopes(1, "x.y", { brandId: 5 }, { ...deps, check })).rejects.toThrow("db down");
  });

  it("放行結果只快取 30 秒，之後重新檢查", async () => {
    let calls = 0;
    let now = 1_000_000;
    const check = {
      brand: async () => { calls++; },
      product: guard("product"), event: guard("event"), mission: guard("mission"),
    };
    const d = { ...deps, check, now: () => now };
    await assertInputScopes(1, "x.y", { brandId: 5 }, d);
    await assertInputScopes(1, "x.y", { brandId: 5 }, d);
    expect(calls).toBe(1);
    now += 31_000;
    await assertInputScopes(1, "x.y", { brandId: 5 }, d);
    expect(calls).toBe(2);
  });

  it("被拒絕的結果不快取，也不會讓另一位用戶沿用別人的放行", async () => {
    await assertInputScopes(1, "x.y", { brandId: 5 }, deps);
    const check = {
      brand: async () => { throw new TRPCError({ code: "NOT_FOUND" }); },
      product: guard("product"), event: guard("event"), mission: guard("mission"),
    };
    await expect(assertInputScopes(2, "x.y", { brandId: 5 }, { ...deps, check })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("protectedProcedure 真的掛著這道檢查", () => {
  const app = router({
    // 模擬一支「忘了自己檢查」的 procedure。
    readBrand: protectedProcedure
      .input(z.object({ brandId: z.number(), productId: z.number().optional() }))
      .query(({ input }) => `brand ${input.brandId}`),
    noScope: protectedProcedure.query(() => "ok"),
  });
  const as = (id: number) => app.createCaller({ user: { id } } as any);

  it("自己的品牌讀得到", async () => {
    await expect(as(1).readBrand({ brandId: 5 })).resolves.toBe("brand 5");
  });

  it("別人的品牌在進入 procedure 之前就被擋下", async () => {
    await expect(as(1).readBrand({ brandId: 6 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(as(1).readBrand({ brandId: 5, productId: 51 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("管理者帳號不受限", async () => {
    adminIds = [9];
    await expect(as(9).readBrand({ brandId: 6 })).resolves.toBe("brand 6");
  });

  it("沒帶編號的呼叫不受影響", async () => {
    await expect(as(1).noScope()).resolves.toBe("ok");
  });

  it("沒登入仍然是 UNAUTHORIZED", async () => {
    await expect(app.createCaller({ user: null } as any).readBrand({ brandId: 5 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
