/**
 * imageRouter — tRPC surface for Publish Gate image generation.
 *
 * UI flow: user clicks "Generate Image" on a FB/IG content card →
 * we resolve brand visual context from the upstream decision chain →
 * call gpt-image-1 (fallback Imagen 3) → persist result → return URL / b64.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { generateImage, resolveBrandVisualContext } from "../_core/imageGen";
import { assertBrandOwner } from "../_core/brandAuth";

const channel = z.enum(["fb", "ig", "linkedin", "youtube", "pr"]);
const size = z.enum(["1024x1024", "1024x1536", "1536x1024"]);
// 2026-05-12 (CJ「給用戶選 image model」): user-facing model picker.
const modelChoice = z.enum([
  "auto",
  "flux-schnell",
  "gpt-image-1",
  "flux-realism",
  "ideogram-v3",
  "imagen-3",
]);

export const imageRouter = router({
  generate: protectedProcedure
    .input(
      z.object({
        brandId: z.number().int().positive(),
        prompt: z.string().min(1).max(4000),
        channel: channel.optional(),
        decisionId: z.number().int().positive().optional(),
        optionId: z.number().int().positive().optional(),
        upstreamDecisionId: z.number().int().positive().optional(),
        size: size.optional(),
        modelChoice: modelChoice.optional(),
        overrideBrandContext: z
          .object({
            positioning: z.string().optional(),
            voiceTone: z.string().optional(),
            archetype: z.string().optional(),
            audience: z.string().optional(),
            colourHints: z.array(z.string()).optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertBrandOwner(ctx.user.id, input.brandId);
      // 2026-05-12: paywall quota check (plan image_gen cap)
      const { assertWithinPlan, recordQuotaUsage } = await import("./billingRouter");
      await assertWithinPlan(ctx.user.id, "image_gen");
      await recordQuotaUsage(ctx.user.id, "image_gen", "brand", input.brandId);

      const resolved = await resolveBrandVisualContext(
        input.brandId,
        input.upstreamDecisionId ?? input.decisionId
      );
      const brandContext = { ...resolved, ...(input.overrideBrandContext ?? {}) };

      const result = await generateImage({
        brandId: input.brandId,
        decisionId: input.decisionId,
        optionId: input.optionId,
        prompt: input.prompt,
        channel: input.channel,
        size: input.size,
        modelChoice: input.modelChoice,
        brandContext,
      });
      return result;
    }),

  listForDecision: protectedProcedure
    .input(z.object({ decisionId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [rows] = (await db.execute(sql`
        SELECT i.id, i.provider, i.model, i.prompt, i.sizeSpec, i.url,
               i.status, i.errorMsg, i.createdAt, i.brandId
        FROM generated_images i
        WHERE i.decisionId = ${input.decisionId}
        ORDER BY i.createdAt DESC
        LIMIT 100
      `)) as any;
      const all = Array.isArray(rows) ? rows : [];
      if (all.length && all[0].brandId) await assertBrandOwner(ctx.user.id, all[0].brandId);
      return all;
    }),
});
