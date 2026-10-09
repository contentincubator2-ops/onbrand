import { describe, expect, it, vi } from "vitest";

vi.mock("../../../localDb", () => ({ default: { execute: vi.fn(async () => [[]]) } }));

import { importCanvaDesign, MAX_CANVA_PAGES } from "./canvaImport";
import { approvalPostView } from "../../../content/core/approval/approvalStore";
import { USER_SUPPLIED_IMAGE_MODEL, applyVariantImageUpdate } from "../../../content/core/image/variantImageUpdate";
import { isPersonalPath, permissionNeeded } from "../../../platform/core/teamAccess";

const photo = (n: number, filename: string) => ({
  id: `p${n}`, scope: "brand" as const, scopeId: 7, url: `/static/asset-photos/brand/7/${n}.png`,
  filename, mimeType: "image/png", sizeBytes: 3, isPrimary: false, createdAt: "2026-10-09T00:00:00.000Z",
});

function deps(urls: string[], opts: { failFetchAt?: number; storeErrorAt?: number } = {}) {
  let n = 0;
  const exportPng = vi.fn(async () => urls);
  const fetchBytes = vi.fn(async (url: string) => {
    if (opts.failFetchAt !== undefined && urls.indexOf(url) === opts.failFetchAt) throw new Error("下載失敗");
    return Buffer.from(url);
  });
  const store = vi.fn(async (a: any) => {
    n += 1;
    if (opts.storeErrorAt === n) return { error: "這個品牌已經有 200 張照片，先刪掉幾張再存" };
    return photo(n, a.filename);
  });
  return { exportPng, fetchBytes, store };
}

const base = { accessToken: "tok", designId: "D1", title: "十月促銷", userId: 11, brandId: 7, uploadedBy: 22 };

describe("importCanvaDesign", () => {
  it("單頁：存一張進品牌素材庫，擁有者與上傳者分開記", async () => {
    const d = deps(["https://export-download.canva.com/1.png"]);
    const r = await importCanvaDesign(base, d as any);
    expect(r.photos).toHaveLength(1);
    expect(r).toMatchObject({ truncated: false, skipped: 0, skippedReason: null });
    expect(d.store).toHaveBeenCalledWith(expect.objectContaining({
      userId: 11, uploadedBy: 22, brandId: 7, scope: "brand", scopeId: 7, filename: "十月促銷.png",
    }));
  });

  it("多頁：每頁一張、照頁序、檔名帶頁碼", async () => {
    const d = deps(["https://c.canva.com/a", "https://c.canva.com/b", "https://c.canva.com/c"]);
    const r = await importCanvaDesign(base, d as any);
    expect(r.photos.map((p) => p.filename)).toEqual(["十月促銷-1.png", "十月促銷-2.png", "十月促銷-3.png"]);
  });

  it("指定頁碼：去重、排序後送給 Canva，檔名用真正的頁碼", async () => {
    const d = deps(["https://c.canva.com/p2", "https://c.canva.com/p5"]);
    const r = await importCanvaDesign({ ...base, pages: [5, 2, 5] }, d as any);
    expect(d.exportPng).toHaveBeenCalledWith("tok", { designId: "D1", pages: [2, 5] });
    expect(r.photos.map((p) => p.filename)).toEqual(["十月促銷-2.png", "十月促銷-5.png"]);
  });

  it("超過上限只收前 10 頁，並回報還有沒匯入的", async () => {
    const urls = Array.from({ length: MAX_CANVA_PAGES + 4 }, (_, i) => `https://c.canva.com/${i}`);
    const d = deps(urls);
    const r = await importCanvaDesign(base, d as any);
    expect(r.photos).toHaveLength(MAX_CANVA_PAGES);
    expect(r.truncated).toBe(true);
    expect(d.fetchBytes).toHaveBeenCalledTimes(MAX_CANVA_PAGES);
  });

  it("其中一頁抓不到或存不進去：其餘照存，並把原因帶回去", async () => {
    const d = deps(["https://c.canva.com/a", "https://c.canva.com/b", "https://c.canva.com/c"], { failFetchAt: 0, storeErrorAt: 2 });
    const r = await importCanvaDesign(base, d as any);
    expect(r.photos).toHaveLength(1);
    expect(r.skipped).toBe(2);
    expect(r.skippedReason).toContain("200 張");
  });

  it("沒有標題也有檔名", async () => {
    const d = deps(["https://c.canva.com/a"]);
    await importCanvaDesign({ ...base, title: "  " }, d as any);
    expect(d.store).toHaveBeenCalledWith(expect.objectContaining({ filename: "Canva.png" }));
  });
});

describe("自己的圖在核准頁不掛 AI 警語", () => {
  const view = (item: Record<string, any>) => approvalPostView(JSON.stringify({ variants: [item] }), { variantIndex: 0 });

  it("AI 畫的圖：aiImages 為 true；換成自己的圖之後為 false；再換回 AI 又是 true", () => {
    const ai = { caption: "文", imageUrl: "/static/covers/a.png", imageModelId: "gpt-image-2" };
    expect(view(ai)).toMatchObject({ available: true, aiImages: true });

    const own = applyVariantImageUpdate(ai, {
      variantIndex: 0, imageUrl: "/static/asset-photos/brand/7/x.png",
      modelId: USER_SUPPLIED_IMAGE_MODEL, requestedModelId: USER_SUPPLIED_IMAGE_MODEL,
    } as any);
    const v = view(own);
    expect(v.imageUrls).toEqual(["/static/asset-photos/brand/7/x.png"]);
    expect(v.aiImages).toBe(false);

    const back = applyVariantImageUpdate(own, { variantIndex: 0, imageUrl: "/static/covers/b.png", modelId: "gpt-image-2" } as any);
    expect(view(back).aiImages).toBe(true);
  });

  it("沒有圖就沒有警語；輪播只要有一張是 AI 的就要掛", () => {
    expect(view({ caption: "文" }).aiImages).toBe(false);
    const cards = (models: string[]) => ({
      caption: "文",
      cards: models.map((m, i) => ({ headline: `h${i}`, image: { url: `/static/x/${i}.png`, status: "ready", modelId: m } })),
    });
    expect(view(cards([USER_SUPPLIED_IMAGE_MODEL, USER_SUPPLIED_IMAGE_MODEL])).aiImages).toBe(false);
    expect(view(cards([USER_SUPPLIED_IMAGE_MODEL, "gpt-image-2"])).aiImages).toBe(true);
  });
});

describe("團隊權限", () => {
  it("Canva 連接跟著人（personal）；把圖存進品牌要有寫內容的權限", () => {
    expect(isPersonalPath("canva.status")).toBe(true);
    expect(isPersonalPath("canva.listDesigns")).toBe(true);
    expect(isPersonalPath("assetPhoto.importCanvaDesign")).toBe(false);
    expect(permissionNeeded("assetPhoto.importCanvaDesign", "mutation")).toBe("write");
  });
});
