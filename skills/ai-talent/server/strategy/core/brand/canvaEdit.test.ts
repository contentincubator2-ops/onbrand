import { describe, expect, it, vi } from "vitest";

vi.mock("../../../localDb", () => ({ default: { execute: vi.fn(async () => [[]]) } }));

import { newSessionKey, registerCanvaOutputWriter, startCanvaEdit, syncCanvaEdit } from "./canvaEdit";
import {
  CanvaApiError, canvaCanWrite, canvaScopes, clampCanvaSize, createCanvaDesign, uploadCanvaAsset, withCorrelationState,
} from "../../../platform/core/connectors/canvaClient";
import { USER_SUPPLIED_IMAGE_MODEL } from "../../../content/core/image/variantImageUpdate";
import { setOutputOwnImage } from "../../../content/core/image/canvaOutputImage";

// 正式環境由組裝層（server/routers/index.ts）接上；測試裡自己接。
registerCanvaOutputWriter(setOutputOwnImage);
import { permissionNeeded } from "../../../platform/core/teamAccess";

/** 兩張表＋mission_outputs 的極簡假資料庫：只認這支會下的那幾句 SQL。 */
function fakeDb(seed: { refs?: any[]; outputs?: Record<number, { ownerId: number; content: string }> } = {}) {
  const refs: any[] = [...(seed.refs ?? [])];
  const sessions = new Map<string, any>();
  const outputs = seed.outputs ?? {};
  const execute = vi.fn(async (sql: string, p: any[] = []) => {
    const q = sql.replace(/\s+/g, " ").trim();
    if (q.startsWith("INSERT INTO canva_design_refs")) {
      refs.push({ brandId: p[0], actorId: p[1], designId: p[2], pageNo: p[3], photoUrl: p[4] }); return [{ affectedRows: 1 }];
    }
    if (q.startsWith("SELECT designId, pageNo, actorId FROM canva_design_refs")) {
      return [refs.filter((r) => r.brandId === p[0] && r.photoUrl === p[1]).slice(-1)];
    }
    if (q.startsWith("INSERT INTO canva_edit_sessions")) {
      sessions.set(p[0], { skey: p[0], actorId: p[1], ownerId: p[2], brandId: p[3], designId: p[4], pageNo: p[5], title: p[6], outputId: p[7], locator: p[8], syncedUpdatedAt: p[9] });
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith("SELECT * FROM canva_edit_sessions")) return [[sessions.get(p[0])].filter(Boolean)];
    if (q.startsWith("UPDATE canva_edit_sessions SET syncedUpdatedAt = ? WHERE skey = ? AND syncedUpdatedAt <")) {
      const s = sessions.get(p[1]);
      if (s && s.syncedUpdatedAt < p[2]) { s.syncedUpdatedAt = p[0]; return [{ affectedRows: 1 }]; }
      return [{ affectedRows: 0 }];
    }
    if (q.startsWith("UPDATE canva_edit_sessions SET syncedUpdatedAt = ? WHERE skey = ? AND syncedUpdatedAt =")) {
      const s = sessions.get(p[1]);
      if (s && s.syncedUpdatedAt === p[2]) s.syncedUpdatedAt = p[0];
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith("SELECT o.id FROM mission_outputs")) return [outputs[p[0]]?.ownerId === p[1] ? [{ id: p[0] }] : []];
    if (q.startsWith("SELECT o.content FROM mission_outputs")) return [outputs[p[0]]?.ownerId === p[1] ? [{ content: outputs[p[0]]!.content }] : []];
    if (q.startsWith("UPDATE mission_outputs SET content")) { outputs[p[1]]!.content = p[0]; return [{ affectedRows: 1 }]; }
    throw new Error("unexpected sql: " + q.slice(0, 80));
  });
  return { pool: { execute }, refs, sessions, outputs };
}

const design = (over: Partial<{ id: string; updatedAt: number; pageCount: number; title: string }> = {}) => ({
  id: "D1", title: "十月促銷", editUrl: "https://www.canva.com/api/design/tok/edit", updatedAt: 100, pageCount: 3, ...over,
});
const photo = (n: number) => ({
  id: `p${n}`, scope: "brand" as const, scopeId: 7, url: `/static/asset-photos/brand/7/new${n}.png`,
  filename: "x.png", mimeType: "image/png", sizeBytes: 3, isPrimary: false, createdAt: "2026-10-10T00:00:00.000Z",
});
const post = (imageUrl: string) => JSON.stringify({ variants: [{ caption: "文", imageUrl, imageModelId: "gpt-image-2" }] });
const base = { accessToken: "tok", actorId: 22, ownerId: 11, brandId: 7 };

describe("startCanvaEdit", () => {
  it("圖是這個人從 Canva 匯入的：開原設計、記住是第幾頁，不需要寫入權限", async () => {
    const db = fakeDb({
      refs: [{ brandId: 7, actorId: 22, designId: "D1", pageNo: 2, photoUrl: "/static/asset-photos/brand/7/a.png" }],
      outputs: { 5: { ownerId: 11, content: post("/static/asset-photos/brand/7/a.png") } },
    });
    const createDesign = vi.fn();
    const r = await startCanvaEdit(
      { ...base, imageUrl: "/static/asset-photos/brand/7/a.png", outputId: 5, locator: { variantIndex: 0 } },
      { pool: db.pool, getDesign: vi.fn(async () => design()), createDesign: createDesign as any, canWrite: () => false },
    );
    expect(r.created).toBe(false);
    expect(createDesign).not.toHaveBeenCalled();
    const url = new URL(r.editUrl);
    expect(url.searchParams.get("correlation_state")).toBe(r.skey);
    expect(db.sessions.get(r.skey)).toMatchObject({ designId: "D1", pageNo: 2, outputId: 5, actorId: 22, ownerId: 11, syncedUpdatedAt: 100 });
  });

  it("圖不是從 Canva 來的：先送進用戶的 Canva，再開一張放著它的新設計", async () => {
    const db = fakeDb({ outputs: { 5: { ownerId: 11, content: post("/static/covers/ai.png") } } });
    const uploadAsset = vi.fn(async () => "ASSET1");
    const createDesign = vi.fn(async () => design({ id: "NEW", updatedAt: 50 }));
    const r = await startCanvaEdit(
      { ...base, imageUrl: "/static/covers/ai.png", outputId: 5, locator: { variantIndex: 0 }, width: 1080, height: 1350, title: "十月新品" },
      { pool: db.pool, uploadAsset: uploadAsset as any, createDesign: createDesign as any, fetchBytes: async () => Buffer.from("img"), canWrite: () => true },
    );
    expect(r.created).toBe(true);
    expect(uploadAsset).toHaveBeenCalledWith("tok", { bytes: Buffer.from("img"), name: "十月新品" });
    expect(createDesign).toHaveBeenCalledWith("tok", { width: 1080, height: 1350, title: "十月新品", assetId: "ASSET1" });
    expect(db.sessions.get(r.skey)).toMatchObject({ designId: "NEW", pageNo: 1, syncedUpdatedAt: 50 });
  });

  it("沒有圖：開空白設計，不上傳任何東西", async () => {
    const db = fakeDb({ outputs: { 5: { ownerId: 11, content: post("") } } });
    const uploadAsset = vi.fn();
    const createDesign = vi.fn(async () => design({ id: "BLANK" }));
    await startCanvaEdit({ ...base, outputId: 5, locator: { variantIndex: 0 } },
      { pool: db.pool, uploadAsset: uploadAsset as any, createDesign: createDesign as any, canWrite: () => true });
    expect(uploadAsset).not.toHaveBeenCalled();
    expect(createDesign).toHaveBeenCalledWith("tok", expect.objectContaining({ assetId: undefined }));
  });

  it("別人匯入的 Canva 圖對這個人來說不是 Canva 圖（編輯連結只有本人打得開）", async () => {
    const db = fakeDb({ refs: [{ brandId: 7, actorId: 99, designId: "D1", pageNo: 1, photoUrl: "/static/asset-photos/brand/7/a.png" }] });
    const getDesign = vi.fn();
    await expect(startCanvaEdit({ ...base, imageUrl: "/static/asset-photos/brand/7/a.png" },
      { pool: db.pool, getDesign: getDesign as any, canWrite: () => false })).rejects.toMatchObject({ code: "write_not_enabled" });
    expect(getDesign).not.toHaveBeenCalled();
  });

  it("別人的貼文不能當成寫回的目標", async () => {
    const db = fakeDb({ outputs: { 5: { ownerId: 999, content: post("") } } });
    await expect(startCanvaEdit({ ...base, outputId: 5, locator: { variantIndex: 0 } }, { pool: db.pool, canWrite: () => true }))
      .rejects.toMatchObject({ code: "output_not_found" });
    expect(db.sessions.size).toBe(0);
  });

  it("Canva 用 403 擋下寫入＝這位用戶連接時還沒有那個 scope，要講得出來", async () => {
    const db = fakeDb();
    const createDesign = vi.fn(async () => { throw new CanvaApiError("permission_denied", "no", 403); });
    await expect(startCanvaEdit({ ...base }, { pool: db.pool, createDesign: createDesign as any, canWrite: () => true }))
      .rejects.toMatchObject({ code: "missing_scope" });
  });
});

describe("syncCanvaEdit", () => {
  async function started(outputContent = post("/static/asset-photos/brand/7/a.png")) {
    const db = fakeDb({
      refs: [{ brandId: 7, actorId: 22, designId: "D1", pageNo: 2, photoUrl: "/static/asset-photos/brand/7/a.png" }],
      outputs: { 5: { ownerId: 11, content: outputContent } },
    });
    const { skey } = await startCanvaEdit(
      { ...base, imageUrl: "/static/asset-photos/brand/7/a.png", outputId: 5, locator: { variantIndex: 0 } },
      { pool: db.pool, getDesign: async () => design({ updatedAt: 100 }) },
    );
    return { db, skey };
  }

  it("Canva 那邊沒改：什麼都不做（不匯出、不存圖、不動貼文）", async () => {
    const { db, skey } = await started();
    const exportPng = vi.fn();
    const r = await syncCanvaEdit({ skey, actorId: 22, accessToken: "tok" },
      { pool: db.pool, getDesign: async () => design({ updatedAt: 100 }), exportPng: exportPng as any });
    expect(r).toMatchObject({ changed: false, photo: null, outputUpdated: false });
    expect(exportPng).not.toHaveBeenCalled();
  });

  it("改過了：只匯出原本那一頁，存進素材庫，寫回貼文並標成自己的圖，前一張留版本", async () => {
    const { db, skey } = await started();
    const exportPng = vi.fn(async () => ["https://export-download.canva.com/x.png"]);
    const store = vi.fn(async () => photo(1));
    const r = await syncCanvaEdit({ skey, actorId: 22, accessToken: "tok" },
      { pool: db.pool, getDesign: async () => design({ updatedAt: 200 }), exportPng: exportPng as any, fetchBytes: async () => Buffer.from("png"), store: store as any });
    expect(exportPng).toHaveBeenCalledWith("tok", { designId: "D1", pages: [2] });
    expect(store).toHaveBeenCalledWith(expect.objectContaining({ userId: 11, uploadedBy: 22, brandId: 7, scope: "brand" }));
    expect(r).toMatchObject({ changed: true, outputId: 5, outputUpdated: true });
    const item = JSON.parse(db.outputs[5]!.content).variants[0];
    expect(item.imageUrl ?? item.image?.url).toBe("/static/asset-photos/brand/7/new1.png");
    expect(item.image?.modelId ?? item.imageModelId).toBe(USER_SUPPLIED_IMAGE_MODEL);
    expect(JSON.stringify(item)).toContain("/static/asset-photos/brand/7/a.png"); // 舊圖還在版本裡
    // 新圖也記成來自同一份設計——下次還能再回 Canva 改。
    expect(db.refs.at(-1)).toMatchObject({ designId: "D1", pageNo: 2, photoUrl: "/static/asset-photos/brand/7/new1.png", actorId: 22 });
  });

  it("「返回按鈕」和「切回分頁」同時到：只處理一次", async () => {
    const { db, skey } = await started();
    const exportPng = vi.fn(async () => ["https://export-download.canva.com/x.png"]);
    const deps = { pool: db.pool, getDesign: async () => design({ updatedAt: 200 }), exportPng: exportPng as any, fetchBytes: async () => Buffer.from("png"), store: (async () => photo(1)) as any };
    const [a, b] = await Promise.all([
      syncCanvaEdit({ skey, actorId: 22, accessToken: "tok" }, deps),
      syncCanvaEdit({ skey, actorId: 22, accessToken: "tok" }, deps),
    ]);
    expect([a.changed, b.changed].sort()).toEqual([false, true]);
    expect(exportPng).toHaveBeenCalledTimes(1);
  });

  it("帶回失敗（例如付費素材沒授權）：占位退掉，下次回來還能再試", async () => {
    const { db, skey } = await started();
    const fail = vi.fn(async () => { throw new CanvaApiError("license_required", "x"); });
    await expect(syncCanvaEdit({ skey, actorId: 22, accessToken: "tok" },
      { pool: db.pool, getDesign: async () => design({ updatedAt: 200 }), exportPng: fail as any })).rejects.toMatchObject({ code: "license_required" });
    expect(db.sessions.get(skey).syncedUpdatedAt).toBe(100);
    const ok = await syncCanvaEdit({ skey, actorId: 22, accessToken: "tok" },
      { pool: db.pool, getDesign: async () => design({ updatedAt: 200 }), exportPng: (async () => ["https://export-download.canva.com/x.png"]) as any, fetchBytes: async () => Buffer.from("png"), store: (async () => photo(2)) as any });
    expect(ok.changed).toBe(true);
  });

  it("別人的鑰匙、亂打的鑰匙都找不到", async () => {
    const { db, skey } = await started();
    await expect(syncCanvaEdit({ skey, actorId: 999, accessToken: "tok" }, { pool: db.pool })).rejects.toMatchObject({ code: "session_not_found" });
    await expect(syncCanvaEdit({ skey: "../../etc/passwd", actorId: 22, accessToken: "tok" }, { pool: db.pool })).rejects.toMatchObject({ code: "session_not_found" });
  });

  it("用戶在 Canva 把頁刪到比原本少：抓最後一頁，不要求一個不存在的頁碼", async () => {
    const { db, skey } = await started();
    const exportPng = vi.fn(async () => ["https://export-download.canva.com/x.png"]);
    await syncCanvaEdit({ skey, actorId: 22, accessToken: "tok" },
      { pool: db.pool, getDesign: async () => design({ updatedAt: 200, pageCount: 1 }), exportPng: exportPng as any, fetchBytes: async () => Buffer.from("png"), store: (async () => photo(1)) as any });
    expect(exportPng).toHaveBeenCalledWith("tok", { designId: "D1", pages: [1] });
  });
});

describe("Canva 來回的小零件", () => {
  it("鑰匙符合 Canva 對 correlation_state 的規定（50 字元內、網址安全、每次不同）", () => {
    const k = newSessionKey();
    expect(k).toMatch(/^[A-Za-z0-9_-]{16,40}$/);
    expect(newSessionKey()).not.toBe(k);
    expect(withCorrelationState("https://www.canva.com/api/design/t/edit", k)).toBe(`https://www.canva.com/api/design/t/edit?correlation_state=${k}`);
    expect(() => withCorrelationState("https://www.canva.com/x", "a b")).toThrow();
    expect(() => withCorrelationState("https://www.canva.com/x", "x".repeat(51))).toThrow();
  });

  it("scope：沒設＝只讀三個；設了才要求寫入類，亂七八糟的值會被濾掉", () => {
    expect(canvaScopes("")).toBe("design:meta:read design:content:read profile:read");
    expect(canvaCanWrite("")).toBe(false);
    const full = "design:meta:read design:content:read design:content:write asset:write profile:read";
    expect(canvaScopes(full)).toBe(full);
    expect(canvaCanWrite(full)).toBe(true);
    expect(canvaCanWrite("design:meta:read design:content:write")).toBe(false);
    expect(canvaScopes("design:meta:read, <script> asset:write")).toBe("design:meta:read asset:write");
  });

  it("新設計的尺寸：超出 Canva 上限就等比縮進去", () => {
    expect(clampCanvaSize(1080, 1350)).toEqual({ width: 1080, height: 1350 });
    const big = clampCanvaSize(10000, 10000);
    expect(big.width).toBeLessThanOrEqual(8000);
    expect(big.width * big.height).toBeLessThanOrEqual(25_000_000);
    expect(big.width).toBe(big.height);
    expect(clampCanvaSize(10, 0)).toEqual({ width: 40, height: 1080 });
  });

  it("送圖進 Canva：位元組原樣送、名稱 base64、輪詢到成功；開設計帶 asset 與自訂尺寸", async () => {
    const calls: any[] = [];
    const replies = [
      { job: { id: "U1", status: "in_progress" } },
      { job: { id: "U1", status: "success", asset: { id: "A9" } } },
      { design: { id: "N1", title: "t", urls: { edit_url: "https://www.canva.com/api/design/z/edit" }, updated_at: 7, page_count: 1 } },
    ];
    const impl = (async (url: any, init: any) => { calls.push({ url: String(url), init }); return { ok: true, status: 200, json: async () => replies[calls.length - 1] } as any; }) as typeof fetch;
    const id = await uploadCanvaAsset("tok", { bytes: Buffer.from("png"), name: "十月新品" }, { fetchImpl: impl, pollMs: 1 });
    expect(id).toBe("A9");
    expect(calls[0].url).toBe("https://api.canva.com/rest/v1/asset-uploads");
    expect(calls[0].init.headers["Content-Type"]).toBe("application/octet-stream");
    expect(JSON.parse(calls[0].init.headers["Asset-Upload-Metadata"]).name_base64).toBe(Buffer.from("十月新品").toString("base64"));
    expect(calls[1].url).toBe("https://api.canva.com/rest/v1/asset-uploads/U1");
    const d = await createCanvaDesign("tok", { width: 1080, height: 1350, title: "十月新品", assetId: "A9" }, impl);
    expect(d).toMatchObject({ id: "N1", updatedAt: 7 });
    expect(JSON.parse(calls[2].init.body)).toEqual({ design_type: { type: "custom", width: 1080, height: 1350 }, asset_id: "A9", title: "十月新品" });
  });

  it("團隊權限：開始編輯與帶回新版都要有寫內容的權限", () => {
    expect(permissionNeeded("assetPhoto.startCanvaEdit", "mutation")).toBe("write");
    expect(permissionNeeded("assetPhoto.syncCanvaEdit", "mutation")).toBe("write");
  });
});
