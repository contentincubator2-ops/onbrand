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
         *  routes to Nano Banana subject-reference with the fidelity guard. */
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
      // 2026-05-14: per-model image point cost.
      // Flux (default) = 30 pts ≈ 30s task; gpt-image-1 premium = 100 pts;
      // Imagen/Ideogram middle = 50 pts.
      const { assertPoints, deductPoints } = await import("../_core/pointsService");
      const imageAction =
        input.subjectImageUrl                  ? "image_imagen"   : // nano-banana ≈ Gemini tier
        (input.modelChoice === "gpt-image-1" ||
         input.modelChoice === "gpt-image-2")  ? "image_gpt"      :
        input.modelChoice === "imagen-3"       ? "image_imagen"   :
        input.modelChoice === "ideogram-v3"    ? "image_ideogram" :
        /* default flux-schnell / flux-realism / auto */           "image_flux";
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
        subjectImageUrl: input.subjectImageUrl,
        brandContext,
      });
      // 2026-05-12: surface actual provider failures to the client.
      // Previously a failed result still returned 200 with url:null, leading
      // to the misleading "產圖完成但沒拿到 URL/b64" toast.
      if (result.status === "failed") {
        // 2026-05-14: translate raw provider errors into human-readable
        // Chinese messages so users know what to do, not just what broke.
        const raw = String(result.errorMsg ?? "unknown")
          .replace(/api_key:[A-Za-z0-9_\-]+/g, "api_key:[REDACTED]")
          .replace(/key=([A-Za-z0-9_\-]+)/g, "key=[REDACTED]")
          .replace(/AIza[0-9A-Za-z_\-]{20,}/g, "[REDACTED_GOOGLE_KEY]");
        let friendly = "生圖失敗，請稍後再試";
        const isProviderKeyError = /key|unauthorized|api_key|permission_denied|suspended|consumer|forbidden|403/i.test(raw);
        if (/safety system|content_policy|rejected by the safety|moderation/i.test(raw)) {
          friendly = "OpenAI 的內容政策擋下了這個 prompt（常見原因：提到版權角色如 Pokémon / Disney / 寶可夢）。已嘗試切換到 Flux 但也失敗。建議修改 prompt — 把角色名稱換成形容（例：「圓滾滾的卡通生物」）。";
        } else if (/quota|insufficient.*credit|balance/i.test(raw)) {
          friendly = "AI 圖片額度暫時不足，已通知 SoWork 團隊。";
        } else if (/rate.?limit|429/i.test(raw)) {
          friendly = "AI 圖片服務速率限制中，請等 30 秒再試。";
        } else if (/timeout|timed out/i.test(raw)) {
          friendly = "生圖超時（>60 秒）。建議用 Flux Schnell 模型（最快 5-10 秒）。";
        } else if (isProviderKeyError) {
          friendly = "AI 圖片服務的金鑰異常，SoWork 已收到通知正在處理。";
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: isProviderKeyError
            ? friendly
            : `${friendly}\n\n[技術細節] ${raw.slice(0, 300)}`,
        });
      }
      return result;
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
Given a social media caption and brand context, write a concise, specific image-generation prompt in English (80–160 words).

Rules:
- Describe: main subject, environment/setting, lighting, mood, camera angle/framing
- Reflect the caption's core message visually — do NOT illustrate literally (no text in frame)
- Use the brand's visual identity (colours, archetype, tone)
- Do NOT mention any competitor brand names
- Output ONLY the image prompt — no explanation, no preamble, no quotes`;

      const userMsg = `Brand context:\n${brandBlock}\n\nPlatform: ${channelHint}${styleHint}\n\nCaption:\n${input.caption}`;

      const result = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userMsg },
        ],
        maxTokens: 250,
      });

      const raw = result.choices?.[0]?.message?.content ?? "";
      const text = (typeof raw === "string" ? raw : "").trim();
      if (!text) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "LLM returned empty prompt" });
      return { prompt: text };
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
