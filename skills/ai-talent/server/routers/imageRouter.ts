/**
 * imageRouter — tRPC surface for Publish Gate image generation.
 *
 * UI flow: user clicks "Generate Image" on a FB/IG content card →
 * we resolve brand visual context from the upstream decision chain →
 * call the selected GPT Image 2 / Nano Banana model → persist → return image or recoverable failure.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { generateImage, resolveBrandVisualContext } from "../_core/imageGen";
import { assertBrandOwner } from "../_core/brandAuth";
import { imageActionForRequest, reconcileImageCharge } from "../_core/imageBilling";
import {
  parseBilingualBriefChoice,
  normalizeImagePromptInput,
} from "../_core/bilingualVisualBrief";

// 2026-08-02 (CJ「產圖失敗 invalid_enum_value tiktok」): this enum had
// drifted out of sync with promptFromCaption's below — TikTok (and email)
// shipped as a platform long ago but never got added here, so any TikTok
// image-generate call 400'd on the client's `channel: "tiktok"`. Both
// procedures now share this one list so they can't drift apart again.
const channel = z.enum(["fb", "ig", "linkedin", "youtube", "tiktok", "email", "pr"]);
const size = z.enum(["1024x1024", "1024x1536", "1536x1024"]);
// 2026-05-12 (CJ「給用戶選 image model」): user-facing model picker.
// 2026-06-15: added gpt-image-2 (OpenAI latest, now the global default).
const modelChoice = z.enum([
  "nano-banana",
  "auto",
  "flux-schnell",
  "gpt-image-1",
  "gpt-image-2",
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
        /** 2026-07-25 (CJ product-faithful gen): real product photo URL —
         *  routes to gpt-image-2 subject-reference with the fidelity guard. */
        subjectImageUrl: z.string().url().max(2048).optional(),
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
      const normalizedPrompt = normalizeImagePromptInput(input.prompt);
      if (normalizedPrompt === null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "圖片指令包含不完整的 JSON，請重新產生圖片指令後再試。",
        });
      }
      const { modelPrompt, displayPrompt } = normalizedPrompt;
      // 2026-05-14: per-model image point cost.
      // Flux (default) = 30 pts ≈ 30s task; gpt-image-1 premium = 100 pts;
      // Imagen/Ideogram middle = 50 pts.
      const { assertPoints, deductPoints } = await import("../_core/pointsService");
      const imageAction = imageActionForRequest(input);
      await assertPoints(ctx.user.id, imageAction);
      await deductPoints(ctx.user.id, imageAction, { kind: "brand", id: input.brandId });

      let result;
      try {
        const resolved = await resolveBrandVisualContext(
          input.brandId,
          input.upstreamDecisionId ?? input.decisionId
        );
        const brandContext = { ...resolved, ...(input.overrideBrandContext ?? {}) };

        result = await generateImage({
          brandId: input.brandId,
          decisionId: input.decisionId,
          optionId: input.optionId,
          prompt: modelPrompt,
          channel: input.channel,
          size: input.size,
          modelChoice: input.modelChoice,
          subjectImageUrl: input.subjectImageUrl,
          brandContext,
        });
      } catch (error) {
        await reconcileImageCharge({
          userId: ctx.user.id,
          prepaidAction: imageAction,
          result: { status: "failed" },
        });
        throw error;
      }
      await reconcileImageCharge({
        userId: ctx.user.id,
        prepaidAction: imageAction,
        result,
      });
      // A provider failure is recoverable UI state. Points were refunded above.
      // Auth / input / ownership errors still throw before reaching this result.
      if (result.status === "failed") {
        return {
          ...result,
          errorMsg: "圖片生成失敗，請重試或選擇其他模型。",
          canSwitchTo: input.modelChoice === "nano-banana" ? undefined : "nano-banana" as const,
          normalizedDisplayPrompt: displayPrompt,
        };
      }
      return { ...result, normalizedDisplayPrompt: displayPrompt };
    }),

  /**
   * 2026-06-15: Generate an image prompt from a post caption.
   * Reads the caption + brand context → asks the LLM to produce a
   * concise, model-ready image generation prompt in English.
   * The client can then drop this into the imagePrompt textarea and
   * generate with any model (GPT, Flux, Imagen, etc.).
   */
  promptFromCaption: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      caption: z.string().min(1).max(6000),
      channel: channel.optional(),
      size: size.optional(),
      // 3000 chars: plain-text Nano-Banana templates can reach ~2600 chars;
      // JSON-converted templates are ~200-530 chars after nanoBananaJsonToPrompt.
      imageStyle: z.string().max(3000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertBrandOwner(ctx.user.id, input.brandId);

      const resolved = await resolveBrandVisualContext(input.brandId);
      const { invokeLLM } = await import("../_core/llm");

      const brandBlock = [
        resolved.brandName   ? `Brand name: ${resolved.brandName}`     : "",
        resolved.positioning ? `Positioning: ${resolved.positioning}`   : "",
        resolved.archetype   ? `Archetype: ${resolved.archetype}`       : "",
        resolved.voiceTone   ? `Voice/Tone: ${resolved.voiceTone}`      : "",
        resolved.audience    ? `Target audience: ${resolved.audience}`  : "",
        resolved.colourHints?.length ? `Brand colours: ${resolved.colourHints.join(", ")}` : "",
      ].filter(Boolean).join("\n");

      const channelHint =
        input.channel === "ig" && input.size === "1024x1536"
                                  ? "Instagram Story, Reel, or Live creative (portrait 9:16)" :
        input.channel === "ig"        ? "Instagram feed post (square 1:1)"     :
        input.channel === "fb"        ? "Facebook post (landscape 4:3)"        :
        input.channel === "linkedin"  ? "LinkedIn post (landscape 16:9)"       :
        input.channel === "youtube"   ? "YouTube thumbnail (landscape 16:9)"   :
        input.channel === "tiktok"    ? "TikTok post (portrait 9:16)"          :
        "social media post";

      const styleHint = input.imageStyle
        ? `\nVisual brief already drafted by art director:\n${input.imageStyle}`
        : "";

      const systemPrompt = `You are a senior commercial photography art director.
Given a social media caption and brand context, write one concise, specific image-generation prompt (80–160 English words), then provide a natural Traditional Chinese version for a Taiwan user. Both versions must describe exactly the same scene.

Rules:
- Describe: main subject, environment/setting, lighting, mood, camera angle/framing
- Reflect the caption's core message visually — do NOT illustrate literally (no text in frame)
- Use the brand's visual identity (colours, archetype, tone)
- Do NOT mention any competitor brand names
- Output JSON only in exactly this shape: {"prompt":"English prompt","promptZh":"繁體中文版"}`;

      const userMsg = `Brand context:\n${brandBlock}\n\nPlatform: ${channelHint}${styleHint}\n\nCaption:\n${input.caption}`;

      const result = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userMsg },
        ],
        // 160 English words (~220 tokens) plus a natural Traditional Chinese
        // rendering (~200-350 tokens) and JSON escaping need ample headroom.
        maxTokens: 1200,
      });

      return parseBilingualBriefChoice(result.choices?.[0], input.caption);
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
