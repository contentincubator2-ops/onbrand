/**
 * geoRouter — GEO (AI 能見度) monitoring for the market-intel preview.
 * Runs a live scan of how the picked brand + competitors appear in AI engines'
 * answers. Ownership-checked; gated in the UI to sowork@sowork.tw like the rest
 * of the market-intel workspace. See _core/geoScout.ts.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { loadBrandCtx } from "../_core/listeningScopes";
import { runGeoScan } from "../_core/geoScout";

export const geoRouter = router({
  runScan: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      engines: z.array(z.enum(["gemini"])).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const brand = await loadBrandCtx(input.brandId, ctx.user!.id);
      if (!brand) throw new TRPCError({ code: "NOT_FOUND", message: "brand not found" });
      return runGeoScan(brand, input.engines ?? ["gemini"]);
    }),
});
