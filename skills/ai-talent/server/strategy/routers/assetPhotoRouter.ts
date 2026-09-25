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
import { router, protectedProcedure } from "../../platform/core/trpc";
import localPool from "../../localDb";
import { listPhotos, setPrimaryPhoto, removePhoto, savePhotoFromUrl, type PhotoScope } from "../core/assetPhotos";
import { STORAGE_ROOT } from "../routes/assetPhotoRoute";

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
      });
      // 存不進去是「結果」不是例外（檔案太大、張數滿了…），訊息要原樣帶回前端顯示。
      if ("error" in saved) throw new TRPCError({ code: "BAD_REQUEST", message: saved.error });
      return saved;
    }),

  remove: protectedProcedure
    .input(scopeInput.extend({ photoId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      await assertScopeOwner(ctx.user!.id, input.brandId, input.scope, input.scopeId);
      await removePhoto({ userId: ctx.user!.id, scope: input.scope, scopeId: input.scopeId, photoId: input.photoId, storageRoot: STORAGE_ROOT });
      return { ok: true };
    }),
});
