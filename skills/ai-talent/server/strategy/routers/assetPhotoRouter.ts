/**
 * assetPhotoRouter — list／setPrimary／remove for brand and product photo
 * galleries. Uploading the actual bytes is a plain Express route
 * (server/strategy/routes/assetPhotoRoute.ts) — tRPC's body parser is
 * JSON-only, so raw image bytes can't go through it.
 *
 * 2026-09-10 (CJ「允許用戶上傳照片到品牌或個別產品」).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, actorIdOf } from "../../platform/core/trpc";
import { canRemovePhoto, REMOVE_OTHERS_PHOTO_DENIED } from "../../platform/core/teamAccess";
import localPool from "../../localDb";
import { listPhotos, listBrandLibrary, setPrimaryPhoto, removePhoto, savePhotoFromUrl, photoUploaderId, type PhotoScope } from "../core/brand/assetPhotos";
import { STORAGE_ROOT } from "../routes/assetPhotoRoute";
import { importCanvaDesign, MAX_CANVA_PAGES } from "../core/brand/canvaImport";
import { getValidAccessToken, CANVA_ACCOUNT_SCOPE } from "../../platform/core/connectors/cloudTokens";
import { canvaErrorMessage, canvaCanWrite } from "../../platform/core/connectors/canvaClient";
import { contentSelectorFields } from "../../content/core/engine/outputContentEnvelope";
import { findCanvaRef, recordCanvaRef, startCanvaEdit, syncCanvaEdit } from "../core/brand/canvaEdit";

const scopeInput = z.object({
  brandId: z.number(),
  scope: z.enum(["brand", "product"]),
  scopeId: z.number(),
});

async function assertScopeOwner(userId: number, brandId: number, scope: PhotoScope, scopeId: number): Promise<void> {
  const [bRows]: any = await localPool.execute(
    `SELECT b.id FROM brands b
       LEFT JOIN brand_members bm ON bm.brandId = b.id AND bm.userId = ?
      WHERE b.id = ? AND (b.userId = ? OR bm.userId IS NOT NULL) LIMIT 1`,
    [userId, brandId, userId],
  );
  if (!Array.isArray(bRows) || bRows.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: `品牌 #${brandId} 不存在或不屬於這個帳號` });
  }
  if (scope === "product") {
    const [pRows]: any = await localPool.execute(
      `SELECT id FROM products WHERE id = ? AND userId = ? LIMIT 1`, [scopeId, userId],
    );
    if (!Array.isArray(pRows) || pRows.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND", message: `產品 #${scopeId} 不存在或不屬於這個帳號` });
    }
  } else if (scopeId !== brandId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "brand scope 的 scopeId 必須等於 brandId" });
  }
}

export const assetPhotoRouter = router({
  list: protectedProcedure
    .input(scopeInput)
    .query(async ({ ctx, input }) => {
      await assertScopeOwner(ctx.user!.id, input.brandId, input.scope, input.scopeId);
      return listPhotos(input.scope, input.scopeId);
    }),

  /**
   * 素材庫：這個品牌在網站任何地方上傳過的圖，不分品牌／產品一次列出來
   * （2026-09-30 CJ「客戶在網站任何地方上傳的視覺，都要集結起來處理」）。
   */
  library: protectedProcedure
    .input(z.object({ brandId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertScopeOwner(ctx.user!.id, input.brandId, "brand", input.brandId);
      return listBrandLibrary(input.brandId);
    }),

  setPrimary: protectedProcedure
    .input(scopeInput.extend({ photoId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      await assertScopeOwner(ctx.user!.id, input.brandId, input.scope, input.scopeId);
      await setPrimaryPhoto({ userId: ctx.user!.id, scope: input.scope, scopeId: input.scopeId, photoId: input.photoId });
      return { ok: true };
    }),

  /**
   * 把一張已經生成好的圖存進這個產品（或品牌）的照片庫。
   *
   * 2026-09-25（CJ「剛剛用了新的AI修圖功能，將產品的光線調得不錯，可惜的是，只能
   * 下載和修改提示詞，我想增加一個功能，可以儲存在現有產品下，或是取代原圖」）。
   *
   * 收的是 generated_images 的 **id**，不是網址。差別很重要：收網址等於開一個
   * 「叫伺服器去抓任意網址」的入口（SSRF）；收 id 就只能存這個品牌自己生成過的圖，
   * 網址由我們從 DB 讀出來。
   */
  saveGeneratedImage: protectedProcedure
    .input(scopeInput.extend({
      imageId: z.number().int().positive(),
      filename: z.string().max(120).optional(),
      makePrimary: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertScopeOwner(ctx.user!.id, input.brandId, input.scope, input.scopeId);

      const [rows]: any = await localPool.execute(
        `SELECT url, status FROM generated_images WHERE id = ? AND brandId = ? LIMIT 1`,
        [input.imageId, input.brandId],
      );
      const row = (rows as any[])[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這張生成圖（或它不屬於這個品牌）" });
      if (row.status !== "ready" || !row.url) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "這張圖還沒生成完成，沒有東西可以存" });
      }

      const saved = await savePhotoFromUrl({
        userId: ctx.user!.id, brandId: input.brandId, scope: input.scope, scopeId: input.scopeId,
        sourceUrl: String(row.url),
        filename: input.filename ?? `AI 場景圖-${new Date().toISOString().slice(0, 10)}`,
        makePrimary: input.makePrimary ?? false,
        storageRoot: STORAGE_ROOT,
        uploadedBy: actorIdOf(ctx),
      });
      // 存不進去是「結果」不是例外（檔案太大、張數滿了…），訊息要原樣帶回前端顯示。
      if ("error" in saved) throw new TRPCError({ code: "BAD_REQUEST", message: saved.error });
      return saved;
    }),

  /**
   * 把一份 Canva 設計匯出成圖，存進這個品牌的素材庫（2026-10-09）。
   *
   * 收的是設計的 **id**，不是網址——跟 saveGeneratedImage 同一個理由：不開「叫伺服器
   * 抓任意網址」的入口。下載網址由 Canva 的匯出工作回給我們，且只認 canva.com 網域。
   * Canva 連接用的是按下按鈕的那個人（actorIdOf），圖存在品牌擁有者名下。
   */
  importCanvaDesign: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      designId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
      title: z.string().max(255).optional(),
      pages: z.array(z.number().int().min(1).max(500)).max(MAX_CANVA_PAGES).optional(),
      lang: z.enum(["zh-TW", "en"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertScopeOwner(ctx.user!.id, input.brandId, "brand", input.brandId);
      const en = input.lang === "en";
      let accessToken: string;
      try {
        accessToken = await getValidAccessToken(actorIdOf(ctx), CANVA_ACCOUNT_SCOPE, "canva");
      } catch {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: en ? "Connect Canva first." : "請先連接 Canva。" });
      }
      try {
        const result = await importCanvaDesign({
          accessToken, designId: input.designId, title: input.title ?? "", pages: input.pages,
          userId: ctx.user!.id, brandId: input.brandId, uploadedBy: actorIdOf(ctx), storageRoot: STORAGE_ROOT,
        });
        if (result.photos.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: result.skippedReason ?? canvaErrorMessage(null, en) });
        }
        // 記下每張圖來自哪份設計的第幾頁——之後才能「在 Canva 編輯」。記不成不擋匯入。
        for (const [i, p] of result.photos.entries()) {
          await recordCanvaRef({
            brandId: input.brandId, actorId: actorIdOf(ctx), designId: input.designId, pageNo: result.pageNos[i] ?? i + 1, photoUrl: p.url,
          }).catch((e) => console.warn("[canva] ref not recorded:", (e as Error)?.message ?? e));
        }
        return result;
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        console.warn("[canva] import failed:", (e as any)?.code ?? "", (e as Error)?.message ?? e);
        throw new TRPCError({ code: "BAD_REQUEST", message: canvaErrorMessage(e, en) });
      }
    }),

  /**
   * 這張圖能不能「在 Canva 編輯」：它是這個人從 Canva 匯入的（開原設計），或這個環境可以替用戶
   * 開新設計（把圖送進 Canva）。前端靠它決定要不要顯示那顆按鈕。
   */
  canvaRef: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), imageUrl: z.string().max(500) }))
    .query(async ({ ctx, input }) => {
      await assertScopeOwner(ctx.user!.id, input.brandId, "brand", input.brandId);
      const ref = input.imageUrl ? await findCanvaRef(input.brandId, input.imageUrl).catch(() => null) : null;
      return { fromCanva: !!ref && ref.actorId === actorIdOf(ctx), canCreate: canvaCanWrite() };
    }),

  /**
   * 開始一次「在 Canva 編輯」的來回，回編輯連結（前端開新分頁）。
   * 圖是從 Canva 來的就開原設計；不是就把它送進用戶的 Canva 開新設計；沒有圖就開空白設計。
   * imageUrl 只收本站自己的圖（/static/…）——不開「叫伺服器抓任意網址再轉送出去」的入口。
   */
  startCanvaEdit: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      imageUrl: z.string().max(500).refine((s) => s === "" || s.startsWith("/static/"), { message: "imageUrl must be a site image" }).optional(),
      outputId: z.number().int().positive().optional(),
      locator: z.object(contentSelectorFields).optional(),
      width: z.number().int().min(40).max(8000).optional(),
      height: z.number().int().min(40).max(8000).optional(),
      title: z.string().max(255).optional(),
      lang: z.enum(["zh-TW", "en"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertScopeOwner(ctx.user!.id, input.brandId, "brand", input.brandId);
      const en = input.lang === "en";
      let accessToken: string;
      try {
        accessToken = await getValidAccessToken(actorIdOf(ctx), CANVA_ACCOUNT_SCOPE, "canva");
      } catch {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: en ? "Connect Canva first." : "請先連接 Canva。" });
      }
      try {
        return await startCanvaEdit({
          accessToken, actorId: actorIdOf(ctx), ownerId: ctx.user!.id, brandId: input.brandId,
          imageUrl: input.imageUrl, outputId: input.outputId, locator: input.outputId ? (input.locator ?? { variantIndex: 0 }) : null,
          width: input.width, height: input.height, title: input.title,
        });
      } catch (e) {
        console.warn("[canva] start edit failed:", (e as any)?.code ?? "", (e as Error)?.message ?? e);
        throw new TRPCError({ code: "BAD_REQUEST", message: canvaErrorMessage(e, en) });
      }
    }),

  /**
   * 用戶切回 onBrand 的分頁時呼叫：Canva 那邊改過就把最新版帶回來，沒改就什麼都不做。
   * Canva 的返回按鈕走 /api/oauth/canva/return，做的是同一件事——哪一個先到都可以。
   */
  syncCanvaEdit: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      skey: z.string().min(16).max(40).regex(/^[A-Za-z0-9_-]+$/),
      lang: z.enum(["zh-TW", "en"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertScopeOwner(ctx.user!.id, input.brandId, "brand", input.brandId);
      const en = input.lang === "en";
      try {
        const accessToken = await getValidAccessToken(actorIdOf(ctx), CANVA_ACCOUNT_SCOPE, "canva");
        const r = await syncCanvaEdit({ skey: input.skey, actorId: actorIdOf(ctx), accessToken, storageRoot: STORAGE_ROOT });
        return { changed: r.changed, url: r.photo?.url ?? null, outputId: r.outputId, outputUpdated: r.outputUpdated };
      } catch (e) {
        console.warn("[canva] sync failed:", (e as any)?.code ?? "", (e as Error)?.message ?? e);
        throw new TRPCError({ code: "BAD_REQUEST", message: canvaErrorMessage(e, en) });
      }
    }),

  remove: protectedProcedure
    .input(scopeInput.extend({ photoId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      await assertScopeOwner(ctx.user!.id, input.brandId, input.scope, input.scopeId);
      // 沒有定位權限的團隊成員只能刪自己上傳的（2026-10-06 CJ「小編也該能刪自己傳錯的照片」）。
      if (ctx.actor && !canRemovePhoto(ctx.actor, await photoUploaderId(input.photoId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: REMOVE_OTHERS_PHOTO_DENIED });
      }
      await removePhoto({ userId: ctx.user!.id, scope: input.scope, scopeId: input.scopeId, photoId: input.photoId, storageRoot: STORAGE_ROOT });
      return { ok: true };
    }),
});
