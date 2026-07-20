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
import { dispatchGenerate, checkJob, type GenOptions } from "../_core/mediaGen";

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

  // ── Step 3 — real media generation via dispatchGenerate ────────────────
  generate: protectedProcedure
    .input(z.object({
      kind: z.enum(["image", "video"]),
      modelId: z.string(),
      promptEn: z.string().min(2).max(8000),
      brandId: z.number().nullable().optional(),
      aspectRatio: z.enum(["1:1", "4:3", "3:4", "16:9", "9:16"]).optional(),
      size: z.enum(["1024x1024", "1024x1536", "1536x1024", "1024x1792", "1792x1024"]).optional(),
      imageUrl: z.string().optional(),
      quality: z.enum(["low", "medium", "high"]).optional(),
    }))
    .mutation(async ({ input }) => {
      // 2026-07-20 (CJ「EDM 換圖後出現錯誤中文字」): this was the ONE image
      // path that shipped the raw prompt — models baked garbled fake-CJK
      // onto packaging/labels. Same guard as imageGen's buildPrompt:
      // dominant NO-TEXT directive + negative_prompt (PiAPI models honour
      // the negative; gpt-image/Imagen honour the in-prompt directive).
      const { NO_TEXT_PROMPT_BLOCK, NO_TEXT_NEGATIVE_PROMPT } = await import("../_core/imageGen");
      const isImage = input.kind === "image";
      const opts: GenOptions = {
        prompt: isImage ? `${input.promptEn}\n\n${NO_TEXT_PROMPT_BLOCK}` : input.promptEn,
        negativePrompt: isImage ? NO_TEXT_NEGATIVE_PROMPT : undefined,
        aspectRatio: input.aspectRatio,
        size: input.size,
        imageUrl: input.imageUrl,
        quality: input.quality,
        brandId: input.brandId ?? null,
      };
      try {
        const res = await dispatchGenerate(input.modelId, opts);
        return {
          ok: res.status === "ready",
          status: res.status,
          modelId: res.modelId,
          url: res.url,
          taskId: res.taskId,
          message: res.errorMsg ??
            (res.status === "ready"   ? "生成完成"
            : res.status === "submitted" ? "已提交，等候生成（請稍後輪詢）"
            : "生成失敗"),
        };
      } catch (e) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }),

  /** Poll an async generation (video) by taskId. */
  checkJob: protectedProcedure
    .input(z.object({
      modelId: z.string(),
      taskId: z.string(),
    }))
    .query(async ({ input }) => {
      try {
        const res = await checkJob(input.modelId, input.taskId);
        return {
          ok: res.status === "ready",
          status: res.status,
          url: res.url,
          taskId: res.taskId,
          message: res.errorMsg ?? "",
        };
      } catch (e) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }),
});
