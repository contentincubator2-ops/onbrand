/**
 * mediaRouter — 3-step image generation flow（影片生成 2026-09-08 移除）.
 *
 * Per CJ direction 2026-04-29:
 *   Step 1  proposeDirection(brief, kind) — agent suggests 3-5 design
 *           directions (構圖/色彩/情緒/腳本) for user to pick.
 *   Step 2  craftPrompt(direction, kind, modelId)
 *           — agent writes the actual AI prompt (English for image
 *           models).
 *   Step 3  generate(prompt, modelId, options)
 *           — dispatches to the chosen provider (gpt-image / Imagen /
 *           Hailuo / Seedance / etc.) and returns the asset URL/b64.
 *
 * Users can skip steps 1 and 2 (per CJ "不一定要走完三步") — they may
 * call generate() directly with a hand-crafted prompt + model choice.
 */

import { z } from "zod";

function redactProviderSecrets(text: string): string {
  return String(text)
    .replace(/api_key:[A-Za-z0-9_\-]+/g, "api_key:[REDACTED]")
    .replace(/key=([A-Za-z0-9_\-]+)/g, "key=[REDACTED]")
    .replace(/API KEY\s*:?\s*[A-Za-z0-9_\-]+/gi, "API KEY:[REDACTED]")
    .replace(/AIza[0-9A-Za-z_\-]{20,}/g, "[REDACTED_GOOGLE_KEY]");
}

function isProviderKeyError(text: string): boolean {
  return /key|unauthorized|api_key|permission_denied|suspended|consumer|forbidden|403/i.test(text);
}
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../platform/core/trpc";
import { callLLM } from "../../platform/core/llmRouter";
import { dispatchGenerate, type GenOptions } from "../core/mediaGen";
import localPool from "../../localDb";
import { probeImageUrl } from "../core/imageFetch";

const PRODUCT_IMAGE_CACHE_TTL_MS = 5 * 60_000;
const PRODUCT_IMAGE_CACHE_MAX_ENTRIES = 1_000;
const productImageProbeCache = new Map<string, { result: Promise<boolean>; expiresAt: number }>();

async function probeProductImageCached(url: string): Promise<boolean> {
  const cached = productImageProbeCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  if (productImageProbeCache.size >= PRODUCT_IMAGE_CACHE_MAX_ENTRIES) {
    const now = Date.now();
    for (const [key, entry] of productImageProbeCache) {
      if (entry.expiresAt <= now) productImageProbeCache.delete(key);
    }
    if (productImageProbeCache.size >= PRODUCT_IMAGE_CACHE_MAX_ENTRIES) {
      const oldestKey = productImageProbeCache.keys().next().value;
      if (oldestKey) productImageProbeCache.delete(oldestKey);
    }
  }
  const result = probeImageUrl(url, 5_000);
  productImageProbeCache.set(url, { result, expiresAt: Date.now() + PRODUCT_IMAGE_CACHE_TTL_MS });
  return result;
}

async function filterUsableProductImages<T extends { imageUrl: string }>(items: T[]): Promise<T[]> {
  const usable: T[] = [];
  for (let offset = 0; offset < items.length; offset += 8) {
    const batch = items.slice(offset, offset + 8);
    const results = await Promise.all(batch.map(async (item) => ({ item, ok: await probeProductImageCached(item.imageUrl) })));
    usable.push(...results.filter((result) => result.ok).map((result) => result.item));
  }
  return usable;
}

// ── Step 1 — design direction proposal (LLM, no media gen) ───────────────
export const mediaRouter = router({
  proposeDirection: protectedProcedure
    .input(z.object({
      kind: z.enum(["image"]),
      brief: z.string().min(2).max(2000),
      brandContext: z.string().optional(),
      audienceContext: z.string().optional(),
      /** How many directions to propose (default 4). */
      count: z.number().int().min(1).max(8).optional(),
    }))
    .mutation(async ({ input }) => {
      const count = input.count ?? 4;
      const dimensionList = "構圖 / 色彩 / 情緒 / 視覺風格 / 風格參考";
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
      "rationale": "為何這個方向適合本 brief（與品牌調性 / 受眾的關聯）50-100 字"
    }
  ]
}

每個方向必須**截然不同**（不可只是色彩變化），涵蓋不同調性 / 風格 / 訴求。每個欄位都要填，不可空。語言：繁體中文。`;

      const user = `Brief：${input.brief}
${input.brandContext ? `品牌語境：${input.brandContext}` : ""}
${input.audienceContext ? `受眾：${input.audienceContext}` : ""}
類型：圖片
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
      kind: z.enum(["image"]),
      direction: z.any(),         // the picked direction object
      brief: z.string(),
      modelId: z.string(),        // helps tailor wording (some models prefer English)
    }))
    .mutation(async ({ input }) => {
      const sys = `你是 SoWork AI prompt 工程師。根據已批准的設計方向 + brief，寫一段適合送給「${input.modelId}」的 prompt。

規則：
- 圖片 prompt 用英文（accentuated style + composition + lighting + colour + mood + camera/lens hint）。
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
      kind: z.enum(["image"]),
      modelId: z.string(),
      promptEn: z.string().min(2).max(8000),
      brandId: z.number().nullable().optional(),
      aspectRatio: z.enum(["1:1", "4:3", "3:4", "16:9", "9:16"]).optional(),
      size: z.enum(["1024x1024", "1024x1536", "1536x1024", "1024x1792", "1792x1024"]).optional(),
      imageUrl: z.string().optional(),
      quality: z.enum(["low", "medium", "high"]).optional(),
      /** 2026-07-25 (CJ product-faithful gen): "product" = imageUrl is a
       *  REAL product photo to composite faithfully — swaps the NO-TEXT
       *  guard for the PRODUCT-FIDELITY guard (real label must survive). */
      subjectMode: z.enum(["product"]).optional(),
    }))
    .mutation(async ({ input }) => {
      // 2026-07-20 (CJ「EDM 換圖後出現錯誤中文字」): this was the ONE image
      // path that shipped the raw prompt — models baked garbled fake-CJK
      // onto packaging/labels. Same guard as imageGen's buildPrompt:
      // dominant NO-TEXT directive + negative_prompt (PiAPI models honour
      // the negative; gpt-image/Imagen honour the in-prompt directive).
      // 2026-07-25: product-subject mode uses PRODUCT_FAITHFUL_PROMPT_BLOCK
      // instead — the real product's own label must remain letter-perfect,
      // so the blanket text-suppression negative is NOT sent.
      const {
        NO_TEXT_PROMPT_BLOCK, NO_TEXT_NEGATIVE_PROMPT, PRODUCT_FAITHFUL_PROMPT_BLOCK,
        NO_MIRROR_PROMPT_BLOCK, NO_MIRROR_NEGATIVE_PROMPT,
      } = await import("../core/imageGen");
      const isImage = input.kind === "image";
      const isProductSubject = isImage && input.subjectMode === "product" && !!input.imageUrl;
      const opts: GenOptions = {
        prompt: isProductSubject
          ? `${input.promptEn}\n\n${PRODUCT_FAITHFUL_PROMPT_BLOCK}\n\n${NO_MIRROR_PROMPT_BLOCK}`
          : isImage ? `${input.promptEn}\n\n${NO_TEXT_PROMPT_BLOCK}\n\n${NO_MIRROR_PROMPT_BLOCK}` : input.promptEn,
        negativePrompt: !isImage ? undefined : isProductSubject ? NO_MIRROR_NEGATIVE_PROMPT : NO_TEXT_NEGATIVE_PROMPT,
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
          message: res.errorMsg
            ? (isProviderKeyError(res.errorMsg)
                ? "AI 圖片服務的金鑰異常，SoWork 已收到通知正在處理。"
                : redactProviderSecrets(res.errorMsg))
            : (res.status === "ready"   ? "生成完成"
            : res.status === "submitted" ? "已提交，等候生成（請稍後輪詢）"
            : "生成失敗"),
        };
      } catch (e) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: (() => {
            const msg = redactProviderSecrets(e instanceof Error ? e.message : String(e));
            return isProviderKeyError(msg) ? "AI 圖片服務的金鑰異常，SoWork 已收到通知正在處理。" : msg;
          })(),
        });
      }
    }),

  /**
   * 2026-07-25 (CJ product-faithful gen): list the brand's products that
   * have a REAL photo — drives the「📦 使用真實產品圖」picker in the media
   * flows. Image candidates read from positioning JSON, same locations as
   * brandColorsRouter.generateBrandedVariants.
   */
  listProductImages: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const [bRows]: any = await localPool.execute(
        `SELECT id FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
        [input.brandId, userId],
      );
      if (!(bRows as any[])[0]) return { products: [] as Array<{ productId: number; name: string; imageUrl: string }> };
      const [rows]: any = await localPool.execute(
        `SELECT id, name, positioning FROM products WHERE brandId = ? AND userId = ? LIMIT 100`,
        [input.brandId, userId],
      );
      const products: Array<{ productId: number; name: string; imageUrl: string }> = [];
      for (const row of (rows as any[])) {
        try {
          let p: any = row.positioning;
          if (typeof p === "string") p = JSON.parse(p);
          const candidates = [
            p?.imageUrl, p?.image,
            p?._interim?.imageUrl, p?._interim?.image,
            Array.isArray(p?.images) ? p.images[0] : null,
            Array.isArray(p?._interim?.images) ? p._interim.images[0] : null,
            Array.isArray(p?._assets?.photos) ? (typeof p._assets.photos[0] === "string" ? p._assets.photos[0] : p._assets.photos[0]?.url) : null,
          ];
          for (const c of candidates) {
            if (typeof c === "string" && /^https?:\/\//.test(c)) {
              products.push({ productId: Number(row.id), name: String(row.name ?? ""), imageUrl: c });
              break;
            }
          }
        } catch { /* skip malformed rows */ }
      }
      return { products: await filterUsableProductImages(products) };
    }),
});
