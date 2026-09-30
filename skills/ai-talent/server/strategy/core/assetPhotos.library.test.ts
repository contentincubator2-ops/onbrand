/**
 * 素材庫彙整（2026-09-30 CJ「客戶在網站任何地方上傳的視覺，都要集結起來處理」）。
 *
 * 最容易錯的兩件事：
 *   · 漏掉不在 asset_photos 的圖——FB 抓的頭像、早期貼網址的產品主圖，使用者會以為不見了。
 *   · 同一張圖列兩次——上傳的標誌同時在 asset_photos 與 brands.logoUrl。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("../../localDb", () => ({ default: { execute } }));

import { listBrandLibrary, maxPhotosFor, MAX_PHOTOS_PER_SCOPE, MAX_BRAND_LIBRARY_PHOTOS } from "./assetPhotos";

function answer(sqlMatch: string, rows: unknown[]) {
  return { sqlMatch, rows };
}

function wire(...answers: ReturnType<typeof answer>[]) {
  execute.mockImplementation(async (sql: unknown) => {
    const text = String(sql ?? "");
    const hit = answers.find((a) => text.includes(a.sqlMatch));
    return [hit ? hit.rows : []];
  });
}

beforeEach(() => execute.mockReset());

describe("listBrandLibrary", () => {
  it("品牌照、產品照、標誌都收進來，而且各自標出處", async () => {
    wire(
      answer("FROM asset_photos ap", [
        { id: "a", scope: "brand", scopeId: 7, url: "/static/asset-photos/brand/7/logo.png", filename: "logo.png", createdAt: "2026-09-30" },
        { id: "b", scope: "brand", scopeId: 7, url: "/static/asset-photos/brand/7/shop.jpg", filename: "shop.jpg", createdAt: "2026-09-29" },
        { id: "c", scope: "product", scopeId: 3, url: "/static/asset-photos/product/3/p.jpg", filename: "p.jpg", productName: "香氛蠟燭", createdAt: "2026-09-28" },
      ]),
      answer("SELECT logoUrl, positioning FROM brands", [
        { logoUrl: "/static/asset-photos/brand/7/logo.png", positioning: JSON.stringify({ _assets: { logo: { primaryUrl: "/static/asset-photos/brand/7/logo.png" } } }) },
      ]),
      answer("FROM products WHERE brandId", []),
    );
    const items = await listBrandLibrary(7);
    expect(items.map((i) => [i.key, i.source, i.sourceLabel])).toEqual([
      ["a", "logo", "標誌"],
      ["b", "brand", "品牌"],
      ["c", "product", "香氛蠟燭"],
    ]);
  });

  it("標誌同時在 asset_photos 與 logoUrl：只列一次", async () => {
    wire(
      answer("FROM asset_photos ap", [
        { id: "a", scope: "brand", scopeId: 7, url: "/static/asset-photos/brand/7/logo.png", filename: "logo.png", createdAt: "2026-09-30" },
      ]),
      answer("SELECT logoUrl, positioning FROM brands", [{ logoUrl: "/static/asset-photos/brand/7/logo.png", positioning: null }]),
    );
    const items = await listBrandLibrary(7);
    expect(items).toHaveLength(1);
  });

  it("不在 asset_photos 的圖也看得到（FB 頭像、產品資料裡的網址），但不能在素材庫刪", async () => {
    wire(
      answer("FROM asset_photos ap", []),
      answer("SELECT logoUrl, positioning FROM brands", [{ logoUrl: "/static/covers/fb-avatar.jpg", positioning: "{}" }]),
      answer("FROM products WHERE brandId", [
        { id: 3, name: "禮盒", imageUrl: "https://shop.example.com/box.jpg" },
        { id: 4, name: "空的", imageUrl: null },
        { id: 5, name: "壞的", imageUrl: "javascript:alert(1)" },
      ]),
    );
    const items = await listBrandLibrary(7);
    expect(items.map((i) => [i.source, i.url, i.photoId])).toEqual([
      ["logo", "/static/covers/fb-avatar.jpg", null],
      ["product", "https://shop.example.com/box.jpg", null],
    ]);
  });
});

describe("maxPhotosFor", () => {
  it("品牌 scope 是素材庫的收件匣，上限比單一產品高", () => {
    expect(maxPhotosFor("product")).toBe(MAX_PHOTOS_PER_SCOPE);
    expect(maxPhotosFor("brand")).toBe(MAX_BRAND_LIBRARY_PHOTOS);
    expect(MAX_BRAND_LIBRARY_PHOTOS).toBeGreaterThan(MAX_PHOTOS_PER_SCOPE);
  });
});
