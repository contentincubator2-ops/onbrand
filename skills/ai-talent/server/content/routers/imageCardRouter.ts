/**
 * imageCardRouter — 各通路「圖片」類別底下的圖片任務卡（2026-09-29）。
 *
 *   list        —— 該通路有哪些圖片卡（規格、張數、構圖提醒、可用模型）
 *   propose     —— 步驟 1：貼文案 → 3 個畫面方向（還沒生圖、不扣點）
 *   render      —— 步驟 2／3：生成、對話修改（帶上一版）、延伸成其他尺寸（帶來源圖、換卡）
 *
 * 扣點與生圖一致：先扣、失敗全退（reconcileImageCharge）。
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../platform/core/trpc";
import { assertBrandOwner } from "../../platform/core/brandAuth";
import { imageActionForRequest, reconcileImageCharge } from "../../platform/core/billing/imageBilling";
import {
  IMAGE_CHANNELS,
  MAX_IMAGE_TRAY,
  PLATFORM_IMAGE_SPECS,
  generationSize,
  getImageSpec,
  nanoRatioFor,
  ratioLabel,
  resolveImageTray,
  type PlatformImageSpec,
} from "../../platform/core/media/platformImageSpecs";
import { loadBrandPositioning } from "../../platform/core/billing/planGate";
import { proposeImageDirections, renderImageCard } from "../core/image/imageCards";
import { resolveBrandVisualContext } from "../core/image/imageGen";
import { localCoverFile } from "../../platform/core/media/imageFetch";
import { brandOwnsProductPhoto } from "./imageRouter";
import { brandOwnsLibraryPhoto } from "../../strategy/core/brand/assetPhotos";

const channel = z.enum(IMAGE_CHANNELS as [string, ...string[]]);

export function publicSpec(s: PlatformImageSpec) {
  return {
    id: s.id,
    channel: s.channel,
    placement: s.placement ?? "organic",
    /** 沒挑過的品牌預設擺出來的兩張。 */
    pinned: !!s.pinned,
    labelZh: s.labelZh,
    labelEn: s.labelEn,
    descZh: s.descZh,
    descEn: s.descEn,
    width: s.width,
    height: s.height,
    ratio: ratioLabel(s.width, s.height),
    maxImages: s.maxImages,
    safeZone: s.safeZone ?? null,
    titleZone: s.titleZone,
    noteZh: s.noteZh,
    format: s.format,
    maxBytes: s.maxBytes ?? null,
    /** Nano Banana 沒有這個原生比例時 false——前台不給選，不靠事後裁切湊。 */
    nanoBanana: !!nanoRatioFor(generationSize(s).width, generationSize(s).height),
    /** 合成版型：AI 只生主體，其餘補背景色。 */
    composed: !!s.compose,
    source: s.source,
  };
}

function specOr404(id: string): PlatformImageSpec {
  const s = getImageSpec(id);
  if (!s) throw new TRPCError({ code: "NOT_FOUND", message: `沒有這張圖片卡：${id}` });
  return s;
}

async function productPhotoAllowed(brandId: number, url: string): Promise<boolean> {
  if (await brandOwnsProductPhoto(brandId, url)) return true;
  // 2026-09-30：素材庫的任何一張（品牌照、標誌、存下來的 AI 圖）也能當主體照片作圖。
  if (await brandOwnsLibraryPhoto(brandId, url)) return true;
  // 產品主圖也可能存在 positioning 的其他欄位（listProductImages 的候選）。
  try {
    const { default: localPool } = await import("../../localDb");
    const like = `%${url.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const [rows]: any = await localPool.execute(
      `SELECT 1 FROM products WHERE brandId = ? AND positioning LIKE ? LIMIT 1`, [brandId, like],
    );
    return (rows as any[]).length > 0;
  } catch { return false; }
}

export const imageCardRouter = router({
  list: protectedProcedure
    .input(z.object({ channel: channel.optional() }).optional())
    .query(({ input }) => {
      const specs = input?.channel
        ? PLATFORM_IMAGE_SPECS.filter((s) => s.channel === input.channel)
        : PLATFORM_IMAGE_SPECS;
      return { cards: specs.map(publicSpec) };
    }),

  /** 這個品牌在這個通路擺哪幾張圖片卡（沒挑過＝每通路預設兩張）。 */
  tray: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), channel }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertBrandOwner(ctx.user.id, input.brandId);
      const positioning = await loadBrandPositioning(input.brandId);
      return { ...resolveImageTray(positioning, input.channel), max: MAX_IMAGE_TRAY };
    }),

  /** 存這個通路要擺的圖片卡。空陣列＝回到預設兩張。 */
  setTray: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      channel,
      cardIds: z.array(z.string().min(1).max(60)).max(MAX_IMAGE_TRAY),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertBrandOwner(ctx.user.id, input.brandId);
      const bad = input.cardIds.find((id) => getImageSpec(id)?.channel !== input.channel);
      if (bad) throw new TRPCError({ code: "BAD_REQUEST", message: `這個通路沒有這張圖片卡：${bad}` });
      const positioning = await loadBrandPositioning(input.brandId);
      const base = positioning && typeof positioning === "object" ? (positioning as Record<string, unknown>) : {};
      const tray = { ...((base.__imageTray as Record<string, string[]> | undefined) ?? {}) };
      if (input.cardIds.length) tray[input.channel] = [...new Set(input.cardIds)];
      else delete tray[input.channel];
      const { default: localPool } = await import("../../localDb");
      await localPool.execute(
        `UPDATE brands SET positioning = ? WHERE id = ?`,
        [JSON.stringify({ ...base, __imageTray: tray }), input.brandId],
      );
      return resolveImageTray({ __imageTray: tray }, input.channel);
    }),

  propose: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      cardId: z.string().max(60),
      copy: z.string().min(2).max(6000),
      productName: z.string().max(200).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertBrandOwner(ctx.user.id, input.brandId);
      const spec = specOr404(input.cardId);
      const brand = await resolveBrandVisualContext(input.brandId);
      const { buildBrandPrefix, enforceBrandRulesOnText } = await import("../../strategy/core/brand/brandContext");
      const brainPrefix = await buildBrandPrefix(input.brandId, null, null, "full").catch(() => "");
      try {
        const out = await proposeImageDirections({ spec, copy: input.copy, brand, productName: input.productName, brainPrefix });
        // 圖上標題是會被看見的字——跟文案一樣過禁用詞／替換對照。
        // 2026-09-30：再過法規合規檢查（圖上的字一樣會被看見）。
        const { enforceRegulationsOnText } = await import("../core/engine/regulationCompliance");
        out.headlineZh = await enforceBrandRulesOnText(input.brandId, out.headlineZh).catch(() => out.headlineZh);
        const reg = await enforceRegulationsOnText(input.brandId, out.headlineZh);
        if (reg.record?.status === "fixed") out.headlineZh = await enforceBrandRulesOnText(input.brandId, reg.text).catch(() => reg.text);
        return out;
      } catch (e) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e instanceof Error ? e.message : String(e) });
      }
    }),

  render: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      cardId: z.string().max(60),
      scenePromptEn: z.string().min(2).max(4000),
      modelChoice: z.string().max(40).optional(),
      productImageUrl: z.string().max(2048).optional(),
      /** 對話修改：上一版；延伸尺寸：來源圖。只收本站產出的圖。 */
      referenceImageUrl: z.string().max(2048).optional(),
      instruction: z.string().max(600).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertBrandOwner(ctx.user.id, input.brandId);
      const spec = specOr404(input.cardId);
      if (input.referenceImageUrl && !localCoverFile(input.referenceImageUrl)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "參考圖只能是這裡產出的圖片。" });
      }
      if (input.productImageUrl && !(await productPhotoAllowed(input.brandId, input.productImageUrl))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "這張產品照不屬於這個品牌。" });
      }

      const { assertPoints, deductPoints } = await import("../../platform/core/billing/pointsService");
      const action = imageActionForRequest({ modelChoice: input.modelChoice });
      await assertPoints(ctx.user.id, action);
      await deductPoints(ctx.user.id, action, { kind: "brand", id: input.brandId });

      let out;
      try {
        const brand = await resolveBrandVisualContext(input.brandId);
        out = await renderImageCard({
          spec, brand, brandId: input.brandId,
          scenePromptEn: input.scenePromptEn,
          modelChoice: input.modelChoice,
          productImageUrl: input.productImageUrl,
          referenceImageUrl: input.referenceImageUrl,
          instruction: input.instruction?.trim() || undefined,
        });
      } catch (e) {
        await reconcileImageCharge({ userId: ctx.user.id, prepaidAction: action, result: { status: "failed" } });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e instanceof Error ? e.message : String(e) });
      }
      await reconcileImageCharge({ userId: ctx.user.id, prepaidAction: action, result: { status: out.status } });
      const scrub = (m?: string) => String(m ?? "")
        .replace(/key=([A-Za-z0-9_\-]+)/g, "key=[REDACTED]")
        .replace(/AIza[0-9A-Za-z_\-]{20,}/g, "[REDACTED]")
        .replace(/sk-[A-Za-z0-9_\-]{16,}/g, "[REDACTED]")
        .slice(0, 400);
      return { ...out, errorMsg: out.errorMsg ? scrub(out.errorMsg) : undefined, card: publicSpec(spec) };
    }),
});
