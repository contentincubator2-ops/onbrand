/**
 * cloudDriveRouter — status/list/disconnect for the persona-agent cloud-file
 * training source (Google Drive, OneDrive). OAuth install/callback lives in
 * server/routes/cloudOAuthRoute.ts (plain Express, not tRPC, since it's a
 * browser redirect flow); this router is what the popup's opener window
 * polls/calls once a connection exists.
 *
 * 2026-08-21 (CJ「怎麼覺得還是不踏實，因為很多人，影音就是放在google drive,
 * one drive or youtube上面」→ 帳號連接型 build).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import localPool from "../localDb";
import { getConnectionStatus, disconnectCloud, getValidAccessToken, CloudNotConnectedError } from "../_core/cloudTokens";
import { listCloudFiles } from "../_core/cloudDriveClient";

const PROVIDERS = ["google_drive", "onedrive"] as const;
const providerSchema = z.enum(PROVIDERS);

async function assertBrandOwner(brandId: number, userId: number): Promise<void> {
  const [rows]: any = await localPool.execute(`SELECT id FROM brands WHERE id = ? AND userId = ? LIMIT 1`, [brandId, userId]);
  if (!(rows as any[])[0]) throw new TRPCError({ code: "NOT_FOUND", message: "brand not found" });
}

export const cloudDriveRouter = router({
  status: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertBrandOwner(input.brandId, ctx.user!.id);
      const [googleDrive, onedrive] = await Promise.all([
        getConnectionStatus(ctx.user!.id, input.brandId, "google_drive"),
        getConnectionStatus(ctx.user!.id, input.brandId, "onedrive"),
      ]);
      return { google_drive: googleDrive, onedrive };
    }),

  disconnect: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), provider: providerSchema }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandOwner(input.brandId, ctx.user!.id);
      await disconnectCloud(ctx.user!.id, input.brandId, input.provider);
      return { ok: true as const };
    }),

  listFiles: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      provider: providerSchema,
      folderId: z.string().min(1).max(500).nullable().default(null),
    }))
    .query(async ({ ctx, input }) => {
      await assertBrandOwner(input.brandId, ctx.user!.id);
      try {
        const accessToken = await getValidAccessToken(ctx.user!.id, input.brandId, input.provider);
        const files = await listCloudFiles(input.provider, accessToken, input.folderId);
        return { ok: true as const, files };
      } catch (e: any) {
        if (e instanceof CloudNotConnectedError) return { ok: false as const, error: "not-connected" as const };
        return { ok: false as const, error: String(e?.message ?? e) };
      }
    }),
});
