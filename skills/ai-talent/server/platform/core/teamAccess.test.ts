/**
 * 團隊共用品牌：被邀請的成員能不能看到主帳號的品牌、能做什麼、資料算誰的。
 *
 * 場景：CJ（用戶 1）是團隊 W10 的擁有者，名下有品牌 100、101。
 *   Celine（2）admin；Ting（3）editor，沒開定位與發布；Lucas（4）editor，開了定位與發布；
 *   Viv（5）viewer；Kai（6）editor，只被指派品牌 101；Zed（7）不在團隊裡。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const MEMBERS: Record<number, { role: string; canEditStrategy: number | null; canPublish: number | null }> = {
  1: { role: "owner", canEditStrategy: null, canPublish: null },
  2: { role: "admin", canEditStrategy: null, canPublish: null },
  3: { role: "editor", canEditStrategy: null, canPublish: null },
  4: { role: "editor", canEditStrategy: 1, canPublish: 1 },
  5: { role: "viewer", canEditStrategy: 1, canPublish: 1 },
  6: { role: "editor", canEditStrategy: null, canPublish: null },
};
const LIMITS: Record<number, number[]> = { 6: [101] };
const BRANDS = [{ id: 100, userId: 1, workspaceId: 10, name: "SoWork" }, { id: 101, userId: 1, workspaceId: null, name: "Second" }];
const PRODUCTS: Record<number, number> = { 500: 100 };   // productId → brandId
const MISSIONS: Record<number, { userId: number; brandId: number }> = { 900: { userId: 1, brandId: 100 } };
let hasFlagColumns = true;

const fakeDb = {
  async execute(sql: string, params: any[] = []) {
    const q = sql.replace(/\s+/g, " ");
    if (/m\.canEditStrategy/.test(q) && !hasFlagColumns) {
      throw Object.assign(new Error("Unknown column 'm.canEditStrategy'"), { code: "ER_BAD_FIELD_ERROR" });
    }
    const flags = (m: any) => (hasFlagColumns ? { canEditStrategy: m.canEditStrategy, canPublish: m.canPublish } : { canEditStrategy: null, canPublish: null });
    if (/FROM brands b JOIN workspaces w .* WHERE b\.id = \?/.test(q)) {
      const [userId, brandId] = params;
      const b = BRANDS.find((x) => x.id === brandId);
      const m = MEMBERS[userId];
      if (!b || !m || b.userId === userId) return [[]];
      return [[{ ownerId: b.userId, workspaceId: 10, role: m.role, ...flags(m) }]];
    }
    if (/FROM workspace_members m JOIN workspaces w .* JOIN brands b/.test(q)) {
      const [userId] = params;
      const m = MEMBERS[userId];
      if (!m) return [[]];
      return [BRANDS.filter((b) => b.userId !== userId).map((b) => ({ ...b, teamWorkspaceId: 10, teamName: "摘星", teamRole: m.role, ...flags(m) }))];
    }
    if (/FROM workspace_member_brands WHERE userId/.test(q)) {
      return [(LIMITS[params[0]] ?? []).map((brandId) => ({ workspaceId: 10, brandId }))];
    }
    if (/SELECT brandId FROM products/.test(q)) return [PRODUCTS[params[0]] ? [{ brandId: PRODUCTS[params[0]] }] : []];
    if (/SELECT brandId FROM events/.test(q)) return [[]];
    if (/SELECT brandId FROM missions/.test(q)) return [MISSIONS[params[0]] ? [{ brandId: MISSIONS[params[0]].brandId }] : []];
    if (/FROM users WHERE id/.test(q)) return [[{ role: "user", email: "u@example.com" }]];
    if (/JOIN users u ON u\.id = w\.ownerUserId/.test(q)) return [[]];
    throw new Error(`unexpected SQL: ${q}`);
  },
};
vi.mock("../../localDb", () => ({ default: { execute: (sql: string, params: any[]) => fakeDb.execute(sql, params) } }));

// 歸屬檢查：自己的品牌，或透過團隊碰得到的品牌（跟正式實作同一條規則）。
vi.mock("./brandAuth", async () => {
  const { TRPCError } = await import("@trpc/server");
  const team = await import("./teamAccess");
  const notFound = () => { throw new TRPCError({ code: "NOT_FOUND" }); };
  const brand = async (userId: number, brandId: number) => {
    const b = BRANDS.find((x) => x.id === brandId);
    if (b?.userId === userId) return;
    if (await team.teamAccessForBrand(userId, brandId)) return;
    notFound();
  };
  return {
    assertBrandAccess: brand,
    assertProductAccess: async (u: number, id: number) => (PRODUCTS[id] ? brand(u, PRODUCTS[id]) : notFound()),
    assertEventAccess: async () => notFound(),
    assertMissionOwner: async (u: number, id: number) => (MISSIONS[id] ? brand(u, MISSIONS[id].brandId) : notFound()),
  };
});

import {
  assertTeamPermission, bestTeamPlan, brandAllowed, canRemovePhoto, clearTeamAccessCache, isAllowed, isPersonalPath,
  listTeamBrands, permissionNeeded, PHOTO_UPLOAD_NEED, resolvePermissions, resolveTargetBrand, teamAccessForBrand, teamPlanWins,
} from "./teamAccess";
import { _resetGrantCache, collectScopeIds } from "./tenantGuard";
import { adminProcedure, protectedProcedure, router } from "./trpc";

beforeEach(() => { clearTeamAccessCache(); _resetGrantCache(); hasFlagColumns = true; });

describe("resolvePermissions：角色預設＋邀請時的兩個開關", () => {
  it("owner／admin 全開，開關對他們沒有作用", () => {
    expect(resolvePermissions("admin", { canEditStrategy: 0, canPublish: 0 }))
      .toEqual({ role: "admin", canWrite: true, canEditStrategy: true, canPublish: true, canManage: true });
    expect(resolvePermissions("owner").canManage).toBe(true);
  });

  it("editor 預設只能撰寫；定位與發布要另外開", () => {
    expect(resolvePermissions("editor")).toEqual({ role: "editor", canWrite: true, canEditStrategy: false, canPublish: false, canManage: false });
    expect(resolvePermissions("editor", { canEditStrategy: 1 })).toMatchObject({ canEditStrategy: true, canPublish: false });
    expect(resolvePermissions("editor", { canPublish: true })).toMatchObject({ canEditStrategy: false, canPublish: true });
  });

  it("viewer 永遠唯讀，就算開關被打開；不認得的角色也當 viewer", () => {
    const none = { canWrite: false, canEditStrategy: false, canPublish: false, canManage: false };
    expect(resolvePermissions("viewer", { canEditStrategy: 1, canPublish: 1 })).toMatchObject(none);
    expect(resolvePermissions("whatever")).toMatchObject({ role: "viewer", ...none });
  });
});

describe("brandAllowed：成員看得到哪些品牌", () => {
  it("沒指派＝全部；有指派＝只有那幾個；admin 不受指派限制", () => {
    expect(brandAllowed("editor", [], 100)).toBe(true);
    expect(brandAllowed("editor", [101], 100)).toBe(false);
    expect(brandAllowed("viewer", [101], 101)).toBe(true);
    expect(brandAllowed("admin", [101], 100)).toBe(true);
  });
});

describe("上傳照片：編輯者不必有定位權限", () => {
  it("上傳路由要的是 write；editor 可以、viewer 不行", () => {
    expect(PHOTO_UPLOAD_NEED).toBe("write");
    expect(isAllowed(resolvePermissions("editor"), PHOTO_UPLOAD_NEED)).toBe(true);
    expect(isAllowed(resolvePermissions("viewer"), PHOTO_UPLOAD_NEED)).toBe(false);
  });
  it("editor 可以把生成圖存進照片庫，但不能換主圖", () => {
    const editor = resolvePermissions("editor");
    expect(() => assertTeamPermission(editor, "assetPhoto.saveGeneratedImage", "mutation")).not.toThrow();
    expect(() => assertTeamPermission(editor, "assetPhoto.setPrimary", "mutation")).toThrow(/修改品牌定位/);
  });
  it("刪照片：editor 只能刪自己上傳的；有定位權限或用自己的品牌則都能刪", () => {
    const editor = { id: 7, perms: resolvePermissions("editor") };
    expect(canRemovePhoto(editor, 7)).toBe(true);
    expect(canRemovePhoto(editor, 8)).toBe(false);
    expect(canRemovePhoto(editor, null)).toBe(false);   // 舊照片沒有上傳者紀錄
    expect(canRemovePhoto({ id: 7, perms: resolvePermissions("editor", { canEditStrategy: 1 }) }, 8)).toBe(true);
    expect(canRemovePhoto({ id: 7, perms: resolvePermissions("admin") }, null)).toBe(true);
    expect(canRemovePhoto({ id: 7, perms: resolvePermissions("viewer") }, 7)).toBe(false);
    expect(canRemovePhoto(undefined, null)).toBe(true);
  });
});

describe("permissionNeeded：每種呼叫需要什麼權限", () => {
  it.each([
    ["brand.get", "query", "view"],
    ["quickTask.runOrchestra", "mutation", "write"],
    ["output.update", "mutation", "write"],
    ["brand.update", "mutation", "strategy"],
    ["product.upsert", "mutation", "strategy"],
    ["positioningJobs.start", "mutation", "strategy"],
    ["assetPhoto.saveGeneratedImage", "mutation", "write"],
    ["assetPhoto.remove", "mutation", "write"],
    ["assetPhoto.setPrimary", "mutation", "strategy"],
    ["calendar.schedule", "mutation", "publish"],
    ["calendar.cancel", "mutation", "write"],
    ["zernioConnect.disconnect", "mutation", "manage"],
    ["zernioConnect.getConnectUrl", "mutation", "manage"],
    ["zernioConnect.getConnectionStatus", "mutation", "manage"],
    ["zernioConnect.getProviders", "query", "view"],
    ["zernioConnect.connections", "query", "view"],
  ])("%s（%s）→ %s", (path, type, need) => {
    expect(permissionNeeded(path, type)).toBe(need);
  });

  it.each(["getConnectUrl", "getConnectionStatus", "disconnect"])("Zernio %s retains owner/admin management permission", method => {
    for (const role of ["owner", "admin"]) {
      expect(() => assertTeamPermission(resolvePermissions(role), `zernioConnect.${method}`, "mutation")).not.toThrow();
    }
    for (const role of ["editor", "viewer"]) {
      expect(() => assertTeamPermission(resolvePermissions(role, { canPublish: true, canEditStrategy: true }), `zernioConnect.${method}`, "mutation"))
        .toThrow(/擁有者或管理者/);
    }
  });

  it("沒權限時丟 FORBIDDEN，訊息說明缺的是哪一項", () => {
    const editor = resolvePermissions("editor");
    expect(() => assertTeamPermission(editor, "quickTask.runOrchestra", "mutation")).not.toThrow();
    expect(() => assertTeamPermission(editor, "brand.update", "mutation")).toThrow(/修改品牌定位/);
    expect(() => assertTeamPermission(editor, "calendar.publish", "mutation")).toThrow(/發布/);
    expect(() => assertTeamPermission(resolvePermissions("viewer"), "output.update", "mutation")).toThrow(/檢視/);
    expect(() => assertTeamPermission(resolvePermissions("viewer"), "brand.get", "query")).not.toThrow();
  });

  it("帳號、方案、團隊、審核、「我的品牌清單」不換身分", () => {
    for (const p of ["billing.getStatus", "tenant.invite", "review.submit", "notifications.list", "brand.listByMember", "brand.create", "brand.delete"]) {
      expect(isPersonalPath(p), p).toBe(true);
    }
    for (const p of ["brand.get", "product.list", "quickTask.runOrchestra", "mission.list"]) {
      expect(isPersonalPath(p), p).toBe(false);
    }
  });
});

describe("teamAccessForBrand / listTeamBrands", () => {
  it("成員碰得到擁有者的品牌，並帶出擁有者與權限", async () => {
    expect(await teamAccessForBrand(3, 100)).toEqual({
      brandId: 100, ownerId: 1, workspaceId: 10, perms: resolvePermissions("editor"),
    });
    expect((await teamAccessForBrand(4, 100))?.perms).toMatchObject({ canEditStrategy: true, canPublish: true });
  });

  it("擁有者自己、不在團隊的人 → null", async () => {
    expect(await teamAccessForBrand(1, 100)).toBeNull();
    expect(await teamAccessForBrand(7, 100)).toBeNull();
  });

  it("只被指派品牌 101 的成員碰不到品牌 100", async () => {
    expect(await teamAccessForBrand(6, 100)).toBeNull();
    expect(await teamAccessForBrand(6, 101)).not.toBeNull();
  });

  it("品牌清單：全部成員看到兩個，被限制的只看到一個，並附上權限", async () => {
    expect((await listTeamBrands(3)).map((b) => b.id)).toEqual([100, 101]);
    const kai = await listTeamBrands(6);
    expect(kai.map((b) => b.id)).toEqual([101]);
    expect(kai[0]).toMatchObject({ ownerId: 1, workspaceId: 10, perms: { role: "editor", canWrite: true } });
    expect(await listTeamBrands(7)).toEqual([]);
  });

  it("資料庫還沒有開關欄位時，退回角色預設而不是壞掉", async () => {
    hasFlagColumns = false;
    expect((await teamAccessForBrand(4, 100))?.perms).toEqual(resolvePermissions("editor"));
    expect((await listTeamBrands(4)).length).toBe(2);
  });
});

describe("resolveTargetBrand：這次呼叫是在處理哪個品牌", () => {
  const deps = { collect: collectScopeIds, db: fakeDb };
  it("input 明講的品牌優先於畫面上開著的品牌", async () => {
    expect(await resolveTargetBrand("quickTask.run", { brandId: 100 }, 555, deps)).toBe(100);
  });
  it("brand.* 的 id 就是品牌編號", async () => {
    expect(await resolveTargetBrand("brand.get", { id: 100 }, null, deps)).toBe(100);
    expect(await resolveTargetBrand("output.get", { id: 100 }, null, deps)).toBeNull();
  });
  it("產品、任務會回推到它所屬的品牌", async () => {
    expect(await resolveTargetBrand("product.get", { id: 500 }, null, deps)).toBe(100);
    expect(await resolveTargetBrand("output.list", { missionId: 900 }, null, deps)).toBe(100);
  });
  it("input 沒有任何線索時，用畫面上開著的品牌", async () => {
    expect(await resolveTargetBrand("mission.list", undefined, 100, deps)).toBe(100);
    expect(await resolveTargetBrand("mission.list", {}, null, deps)).toBeNull();
  });
});

describe("方案沿用主帳號", () => {
  const now = new Date("2026-10-05T00:00:00Z");
  const later = new Date("2026-11-05T00:00:00Z");
  const past = new Date("2026-09-01T00:00:00Z");

  it("取還在有效期內、等級最高的那個；試用與過期的不算", () => {
    expect(bestTeamPlan([
      { planCode: "drop_starter", planStatus: "active", planEndsAt: later },
      { planCode: "drop_pro", planStatus: "active", planEndsAt: later },
      { planCode: "enterprise", planStatus: "active", planEndsAt: past },
      { planCode: "trial", planStatus: "trial", planEndsAt: later },
    ], now)?.planCode).toBe("drop_pro");
    expect(bestTeamPlan([{ planCode: "drop_pro", planStatus: "past_due", planEndsAt: later }], now)).toBeNull();
  });

  it("SoWork 內部信箱的團隊視為企業版", () => {
    expect(bestTeamPlan([{ email: "sowork@sowork.tw", planCode: "trial", planStatus: "trial" }], now)?.planCode).toBe("enterprise");
  });

  it("成員自己的試用過期 → 用團隊的；自己已付更高等級 → 用自己的", () => {
    const team = { planCode: "drop_starter", planStatus: "active", planEndsAt: later };
    expect(teamPlanWins({ planCode: "trial", planStatus: "trial", planEndsAt: past }, team, now)).toBe(true);
    expect(teamPlanWins({ planCode: "drop_pro", planStatus: "active", planEndsAt: later }, team, now)).toBe(false);
    expect(teamPlanWins({ planCode: "trial", planStatus: "trial", planEndsAt: past }, null, now)).toBe(false);
  });
});

describe("protectedProcedure：成員的呼叫以擁有者的資料身分執行", () => {
  const who = (ctx: any) => ({ dataUserId: ctx.user.id, actorId: ctx.actor?.id ?? null });
  const brandOnly = z.object({ brandId: z.number() });
  const app = router({
    brand: router({
      get: protectedProcedure.input(z.object({ id: z.number() })).query(({ ctx }) => who(ctx)),
      update: protectedProcedure.input(brandOnly).mutation(({ ctx }) => who(ctx)),
      listByMember: protectedProcedure.query(({ ctx }) => who(ctx)),
    }),
    quickTask: router({ run: protectedProcedure.input(brandOnly).mutation(({ ctx }) => who(ctx)) }),
    calendar: router({ publish: protectedProcedure.input(brandOnly).mutation(({ ctx }) => who(ctx)) }),
    zernioConnect: router({ disconnect: protectedProcedure.input(brandOnly).mutation(({ ctx }) => who(ctx)) }),
    mission: router({ list: protectedProcedure.query(({ ctx }) => who(ctx)) }),
    billing: router({ getStatus: protectedProcedure.query(({ ctx }) => who(ctx)) }),
    adminStats: router({ all: adminProcedure.query(() => "secret") }),
  });
  const as = (id: number, activeBrandId: number | null = null) => app.createCaller({ user: { id }, activeBrandId } as any);

  it("擁有者自己：完全不變，沒有 actor", async () => {
    expect(await as(1).brand.get({ id: 100 })).toEqual({ dataUserId: 1, actorId: null });
    expect(await as(1, 100).mission.list()).toEqual({ dataUserId: 1, actorId: null });
  });

  it("成員讀品牌 → 讀到擁有者的資料，actor 記住是誰", async () => {
    expect(await as(3).brand.get({ id: 100 })).toEqual({ dataUserId: 1, actorId: 3 });
  });

  it("沒帶編號的呼叫，依畫面上開著的品牌決定", async () => {
    expect(await as(3, 100).mission.list()).toEqual({ dataUserId: 1, actorId: 3 });
    expect(await as(3).mission.list()).toEqual({ dataUserId: 3, actorId: null });
  });

  it("editor：可以寫內容，不能改定位、不能發布", async () => {
    expect(await as(3).quickTask.run({ brandId: 100 })).toEqual({ dataUserId: 1, actorId: 3 });
    await expect(as(3).brand.update({ brandId: 100 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(as(3).calendar.publish({ brandId: 100 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("editor 開了定位與發布：都可以，但仍不能動社群帳號連結", async () => {
    expect(await as(4).brand.update({ brandId: 100 })).toEqual({ dataUserId: 1, actorId: 4 });
    expect(await as(4).calendar.publish({ brandId: 100 })).toEqual({ dataUserId: 1, actorId: 4 });
    await expect(as(4).zernioConnect.disconnect({ brandId: 100 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("admin：全部可以", async () => {
    expect(await as(2).zernioConnect.disconnect({ brandId: 100 })).toEqual({ dataUserId: 1, actorId: 2 });
  });

  it("viewer：看得到，任何寫入都被擋", async () => {
    expect(await as(5).brand.get({ id: 100 })).toEqual({ dataUserId: 1, actorId: 5 });
    await expect(as(5).quickTask.run({ brandId: 100 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("只被指派品牌 101 的成員：品牌 100 連讀都不行", async () => {
    await expect(as(6).quickTask.run({ brandId: 100 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await as(6).quickTask.run({ brandId: 101 })).toEqual({ dataUserId: 1, actorId: 6 });
    // brand.get 的 id 不在守門涵蓋的欄位名內：不換身分，用自己的身分查，原本的擁有者條件就查不到
    expect(await as(6).brand.get({ id: 100 })).toEqual({ dataUserId: 6, actorId: null });
  });

  it("不在團隊的人：被擋，且不會換成擁有者", async () => {
    await expect(as(7).quickTask.run({ brandId: 100 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await as(7, 100).mission.list()).toEqual({ dataUserId: 7, actorId: null });
  });

  it("個人範圍的呼叫（方案、我的品牌清單）永遠是自己", async () => {
    expect(await as(3, 100).billing.getStatus()).toEqual({ dataUserId: 3, actorId: null });
    expect(await as(3, 100).brand.listByMember()).toEqual({ dataUserId: 3, actorId: null });
  });

  it("成員不會因為進了管理者的團隊品牌就拿到管理者功能", async () => {
    await expect(as(3, 100).adminStats.all()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
