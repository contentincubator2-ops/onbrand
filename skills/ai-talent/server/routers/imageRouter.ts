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
      // 2026-05-14: per-model image point cost.
      // Flux (default) = 30 pts ≈ 30s task; gpt-image-1 premium = 100 pts;
      // Imagen/Ideogram middle = 50 pts.
      const { assertPoints, deductPoints } = await import("../_core/pointsService");
      const imageAction =
        input.modelChoice === "gpt-image-1"   ? "image_gpt"      :
        input.modelChoice === "imagen-3"      ? "image_imagen"   :
        input.modelChoice === "ideogram-v3"   ? "image_ideogram" :
        /* default flux-schnell / flux-realism / auto */          "image_flux";
      await assertPoints(ctx.user.id, imageAction as any);
      await deductPoints(ctx.user.id, imageAction as any, { kind: "brand", id: input.brandId });

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
      // 2026-05-12: surface actual provider failures to the client.
      // Previously a failed result still returned 200 with url:null, leading
      // to the misleading "產圖完成但沒拿到 URL/b64" toast.
      if (result.status === "failed") {
        // 2026-05-14: translate raw provider errors into human-readable
        // Chinese messages so users know what to do, not just what broke.
        const raw = String(result.errorMsg ?? "unknown");
        let friendly = "生圖失敗，請稍後再試";
        if (/safety system|content_policy|rejected by the safety|moderation/i.test(raw)) {
          friendly = "OpenAI 的內容政策擋下了這個 prompt（常見原因：提到版權角色如 Pokémon / Disney / 寶可夢）。已嘗試切換到 Flux 但也失敗。建議修改 prompt — 把角色名稱換成形容（例：「圓滾滾的卡通生物」）。";
        } else if (/quota|insufficient.*credit|balance/i.test(raw)) {
          friendly = "AI 圖片額度暫時不足，已通知 SoWork 團隊。";
        } else if (/rate.?limit|429/i.test(raw)) {
          friendly = "AI 圖片服務速率限制中，請等 30 秒再試。";
        } else if (/timeout|timed out/i.test(raw)) {
          friendly = "生圖超時（>60 秒）。建議用 Flux Schnell 模型（最快 5-10 秒）。";
        } else if (/key|unauthorized|api_key/i.test(raw)) {
          friendly = "AI 圖片服務的金鑰異常，SoWork 已收到通知正在處理。";
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `${friendly}\n\n[技術細節] ${raw.slice(0, 300)}`,
        });
      }
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
