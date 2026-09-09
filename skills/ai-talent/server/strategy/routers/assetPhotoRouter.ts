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
import { listPhotos, setPrimaryPhoto, removePhoto, type PhotoScope } from "../core/assetPhotos";
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

  remove: protectedProcedure
    .input(scopeInput.extend({ photoId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      await assertScopeOwner(ctx.user!.id, input.brandId, input.scope, input.scopeId);
      await removePhoto({ userId: ctx.user!.id, scope: input.scope, scopeId: input.scopeId, photoId: input.photoId, storageRoot: STORAGE_ROOT });
      return { ok: true };
    }),
});
