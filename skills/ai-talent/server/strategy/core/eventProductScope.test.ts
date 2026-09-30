/**
 * 活動「搭配什麼」的行為測試（單一產品／多產品聯合／純品牌）。
 *
 * 2026-09-30（CJ「要讓用戶可以選擇，該活動是搭配哪個產品 或是好幾個產品聯合或是
 * 純品牌活動」）。守三件事：
 *   1. 「沒綁產品」分得出是還沒選、還是純品牌——這是多存一個欄位的唯一理由。
 *   2. 三種搭配給模型的指示真的不一樣（純品牌擋住自己挑產品、聯合要每個都輪到）。
 *   3. 寫文案時（品牌大腦的活動區塊）讀得到同一段指示；單一產品活動會把那個產品
 *      當成本次聚焦的產品，不用使用者在任務視窗再選一次。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./marketProfiles", () => ({ buildMarketContext: async () => "" }));
vi.mock("../../db", () => ({ getDb: async () => ({ execute: async () => [[]] }) }));

const db = {
  brand: [] as any[], event: [] as any[], eventProducts: [] as any[], products: [] as any[],
};
vi.mock("../../localDb", () => ({
  default: {
    execute: async (sqlText: string, params: any[] = []) => {
      if (/FROM\s+event_products/i.test(sqlText)) return [db.eventProducts];
      if (/SELECT id FROM products/i.test(sqlText)) return [db.products.map((p) => ({ id: p.id }))];
      if (/FROM\s+products/i.test(sqlText)) return [db.products.filter((p) => p.id === params[0])];
      if (/FROM\s+events/i.test(sqlText)) return [db.event];
      if (/FROM\s+brands/i.test(sqlText)) return [db.brand];
      return [[]];
    },
  },
}));

import { resolveProductScope, productScopeBrief, productFactLine, ownedProductIds } from "./eventProductScope";
import { buildBrandPrefix } from "./brandContext";

let nextBrand = 970_001;
beforeEach(() => {
  db.brand = [{ id: nextBrand, name: "測試品牌", positioning: {} }];
  db.event = []; db.eventProducts = []; db.products = [];
});
const freshBrand = () => nextBrand++;

const steak = { id: 11, name: "橫膈牛排", positioning: { facts: { price: "NT$899" }, competition: { uniqueUsp: "每日現切" } } };
const tongue = { id: 12, name: "厚切牛舌", positioning: {} };

describe("resolveProductScope", () => {
  it("有綁產品一律是 products——表是真相", () => {
    expect(resolveProductScope("brand", 2)).toBe("products");
    expect(resolveProductScope(undefined, 1)).toBe("products");
  });
  it("沒綁產品：明說是品牌才是 brand，其餘是還沒選", () => {
    expect(resolveProductScope("brand", 0)).toBe("brand");
    expect(resolveProductScope(undefined, 0)).toBeNull();
    expect(resolveProductScope("products", 0)).toBeNull();
  });
});

describe("productScopeBrief", () => {
  const p1 = { id: 11, name: "橫膈牛排", facts: productFactLine(steak.positioning) };
  const p2 = { id: 12, name: "厚切牛舌", facts: "" };

  it("純品牌：明講不要自己挑產品", () => {
    const t = productScopeBrief("brand", []);
    expect(t).toContain("純品牌活動");
    expect(t).toContain("不要自行挑一個產品當主打");
  });
  it("單一產品：點名那個產品並帶事實", () => {
    const t = productScopeBrief("products", [p1]);
    expect(t).toContain("單一產品活動");
    expect(t).toContain("橫膈牛排：售價 NT$899｜賣點：每日現切");
  });
  it("多產品聯合：每個都列出來，並要求每個都輪到", () => {
    const t = productScopeBrief("products", [p1, p2]);
    expect(t).toContain("多產品聯合活動（2 個產品）");
    expect(t).toContain("- 橫膈牛排");
    expect(t).toContain("- 厚切牛舌");
    expect(t).toContain("每一個都要輪到");
  });
  it("還沒選：不假裝是純品牌", () => {
    expect(productScopeBrief(null, [])).not.toContain("純品牌");
  });
});

describe("ownedProductIds", () => {
  it("只留下這個帳號底下真的有的產品，去掉重複與不合法的 id", async () => {
    db.products = [steak, tongue];
    expect(await ownedProductIds([11, 11, 999, -1, 12], 1, 5)).toEqual([11, 12]);
    expect(await ownedProductIds([], 1, 5)).toEqual([]);
  });
});

describe("寫文案時讀得到活動搭配（品牌大腦的活動區塊）", () => {
  it("純品牌活動：活動區塊寫明不主打產品，也不會冒出產品區塊", async () => {
    const brandId = freshBrand();
    db.event = [{ name: "品牌週年", startAt: null, endAt: null, positioning: { campaign: { productScope: "brand" } } }];
    const prefix = await buildBrandPrefix(brandId, null, 501);
    expect(prefix).toContain("【活動搭配】純品牌活動");
    expect(prefix).not.toContain("本次產出聚焦的產品");
  });

  it("單一產品活動：那個產品成為本次聚焦的產品", async () => {
    const brandId = freshBrand();
    db.products = [steak, tongue];
    db.eventProducts = [steak];
    db.event = [{ name: "中秋檔", startAt: null, endAt: null, positioning: {} }];
    const prefix = await buildBrandPrefix(brandId, null, 502);
    expect(prefix).toContain("【活動搭配】單一產品活動");
    expect(prefix).toContain("本次產出聚焦的產品");
    expect(prefix).toContain("【產品名稱】橫膈牛排");
  });

  it("多產品聯合：全部列在活動區塊，不挑其中一個當唯一主角", async () => {
    const brandId = freshBrand();
    db.products = [steak, tongue];
    db.eventProducts = [steak, tongue];
    db.event = [{ name: "中秋組合", startAt: null, endAt: null, positioning: {} }];
    const prefix = await buildBrandPrefix(brandId, null, 503);
    expect(prefix).toContain("多產品聯合活動（2 個產品）");
    expect(prefix).toContain("厚切牛舌");
    expect(prefix).not.toContain("本次產出聚焦的產品");
  });

  it("還沒選的舊活動：不多寫任何一行", async () => {
    const brandId = freshBrand();
    db.event = [{ name: "舊活動", startAt: null, endAt: null, positioning: {} }];
    const prefix = await buildBrandPrefix(brandId, null, 504);
    expect(prefix).toContain("【活動名稱】舊活動");
    expect(prefix).not.toContain("活動搭配");
  });
});

describe("寫文案時讀得到宣傳企劃的交接內容", () => {
  it("一句話訴求與每一段的訊息都進活動區塊，照檔期順序", async () => {
    const brandId = freshBrand();
    db.event = [{ name: "上市活動", startAt: null, endAt: null, positioning: {
      campaignPlan: { smp: "你的品牌故事，從今天開始被看見", phaseMessages: { lastcall: "只到 12/25", teaser: "品牌越發越模糊" }, items: [] },
    } }];
    const prefix = await buildBrandPrefix(brandId, null, 505);
    expect(prefix).toContain("【活動訴求】你的品牌故事，從今天開始被看見");
    expect(prefix).toContain("【各段訊息】預熱：品牌越發越模糊；倒數：只到 12/25");
  });
});
