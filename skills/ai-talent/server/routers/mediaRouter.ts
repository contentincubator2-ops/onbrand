/**
 * mediaRouter — 3-step image / video generation flow.
 *
 * Per CJ direction 2026-04-29:
 *   Step 1  proposeDirection(brief, kind) — agent suggests 3-5 design
 *           directions (構圖/色彩/情緒/腳本) for user to pick.
 *   Step 2  craftPrompt(direction, kind, modelId)
 *           — agent writes the actual AI prompt (English for image
 *           models, scene-by-scene for video).
 *   Step 3  generate(prompt, modelId, options)
 *           — dispatches to the chosen provider (gpt-image / Imagen /
 *           Hailuo / Seedance / etc.) and returns the asset URL/b64.
 *
 * Users can skip steps 1 and 2 (per CJ "不一定要走完三步") — they may
 * call generate() directly with a hand-crafted prompt + model choice.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { callLLM } from "../_core/llmRouter";

// ── Step 1 — design direction proposal (LLM, no media gen) ───────────────
export const mediaRouter = router({
  proposeDirection: protectedProcedure
    .input(z.object({
      kind: z.enum(["image", "video"]),
      brief: z.string().min(2).max(2000),
      brandContext: z.string().optional(),
      audienceContext: z.string().optional(),
      /** How many directions to propose (default 4). */
      count: z.number().int().min(1).max(8).optional(),
    }))
    .mutation(async ({ input }) => {
      const count = input.count ?? 4;
      const isVideo = input.kind === "video";
      const dimensionList = isVideo
        ? "構圖 / 色彩 / 情緒 / 鏡頭與分鏡 / 風格參考"
        : "構圖 / 色彩 / 情緒 / 視覺風格 / 風格參考";
      const sys = `你是 SoWork 視覺策略顧問。任務：為使用者的 brief 提出 ${count} 個截然不同的設計方向，讓使用者挑選。

輸出嚴格 JSON：
{
  "directions": [
    {
      "id": "dir_a",
      "title": "方向名稱（4-8 字）",
      "tone": "情緒一句話",
      "composition": "構圖 / 視覺重心 50-100 字",
      "palette": "色彩策略（含主色、輔色、Hex 範例）50-80 字",
      "mood": "情緒氛圍 30-50 字",
      "styleRef": "風格參考（攝影 / 插畫 / 3D / 拼貼 / 寫實 / 動畫）+ 知名案例 30-80 字",
${isVideo ? '      "shotList": "分鏡腳本 3-5 個鏡頭，每個 1-2 句說明",\n' : ""}      "rationale": "為何這個方向適合本 brief（與品牌調性 / 受眾的關聯）50-100 字"
    }
  ]
}

每個方向必須**截然不同**（不可只是色彩變化），涵蓋不同調性 / 風格 / 訴求。每個欄位都要填，不可空。語言：繁體中文。`;

      const user = `Brief：${input.brief}
${input.brandContext ? `品牌語境：${input.brandContext}` : ""}
${input.audienceContext ? `受眾：${input.audienceContext}` : ""}
類型：${isVideo ? "影片" : "圖片"}
請提出 ${count} 個跨度大的視覺方向（${dimensionList}）。`;

      try {
        const result = await callLLM({ system: sys, user, maxTokens: 3000 });
        const cleaned = result.text.trim()
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/i, "");
        const obj = JSON.parse(cleaned);
        return {
          directions: Array.isArray(obj?.directions) ? obj.directions : [],
        };
      } catch (e) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `proposeDirection failed: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }),

  // ── Step 2 — craft AI prompt from approved direction ────────────────────
  craftPrompt: protectedProcedure
    .input(z.object({
      kind: z.enum(["image", "video"]),
      direction: z.any(),         // the picked direction object
      brief: z.string(),
      modelId: z.string(),        // helps tailor wording (some models prefer English)
    }))
    .mutation(async ({ input }) => {
      const isVideo = input.kind === "video";
      const sys = `你是 SoWork AI prompt 工程師。根據已批准的設計方向 + brief，寫一段適合送給「${input.modelId}」的 prompt。

規則：
- ${isVideo ? "影片 prompt 用英文，分鏡逐句寫；包含鏡頭、動作、節奏、色調、情緒。" : "圖片 prompt 用英文（accentuated style + composition + lighting + colour + mood + camera/lens hint）。"}
- 中文摘要：另附 50-150 字繁體中文摘要說明這個 prompt 想表達什麼。
- 不寫 negative prompt（除非 brief 明確要求避開某些元素）。
- 輸出嚴格 JSON：{"promptEn": "...", "summaryZh": "..."}`;

      const user = `Brief：${input.brief}
設計方向：${JSON.stringify(input.direction, null, 2)}
目標模型：${input.modelId}`;

      try {
        const result = await callLLM({ system: sys, user, maxTokens: 1500 });
        const cleaned = result.text.trim()
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/i, "");
        const obj = JSON.parse(cleaned);
        return {
          promptEn: String(obj?.promptEn ?? ""),
          summaryZh: String(obj?.summaryZh ?? ""),
        };
      } catch (e) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `craftPrompt failed: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }),

  // ── Step 3 — actual media generation (model-aware dispatch) ─────────────
  // For Phase 1 we only wire the existing imageRouter / videoRouter paths.
  // Phase 2 adds Hailuo / fal.ai flux / Veo direct adapters.
  generate: protectedProcedure
    .input(z.object({
      kind: z.enum(["image", "video"]),
      modelId: z.string(),
      promptEn: z.string().min(2).max(8000),
      brandId: z.number().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      // Stub — actual provider dispatch is Phase 2. For now return
      // a sentinel so the UI can render "尚未實作此 provider" gracefully.
      return {
        ok: false,
        modelId: input.modelId,
        message: `Phase 2 will wire ${input.modelId} provider. Prompt copied to clipboard for manual use; UI will add per-model adapters next.`,
        promptEn: input.promptEn,
      };
    }),
});
