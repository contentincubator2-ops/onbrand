/**
 * imageCardRouter — 各通路「圖片」類別底下的圖片任務卡（2026-09-29）。
 *
 *   list        —— 該通路有哪些圖片卡（規格、張數、構圖提醒、可用模型）
 *   propose     —— 步驟 1：貼文案 → 3 個畫面方向（還沒生圖、不扣點）
 *   render      —— 步驟 2／3：生成、對話修改（帶上一版）、延伸成其他尺寸（帶來源圖、換卡）
 *   saveAsPost  —— 圖做好後存成一篇「圖＋文」產出（或寫回來源那篇文案），才能排進行事曆
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
import { proposeImageDirections, planSeriesSlides, renderImageCard, saveTitledImage, fitPhotoToCard, solidBackgroundForCard, MAX_SERIES } from "../core/image/imageCards";
import { IMAGE_STYLES, IMAGE_STYLE_IDS } from "../core/image/imageStyles";
import { contentSelectorFields, updateOutputContent } from "../core/engine/outputContentEnvelope";
import { applyVariantImageUpdate } from "../core/image/variantImageUpdate";
import { recordTaskRun } from "../../platform/core/ops/recordTaskRun";
import { resolveBrandVisualContext } from "../core/image/imageGen";
import { fetchImageBuffer } from "../../platform/core/media/imageFetch";
import { isOwnCoverUrl } from "../../platform/core/media/mediaStore";
import { brandOwnsProductPhoto } from "./imageRouter";
import { brandOwnsLibraryPhoto } from "../../strategy/core/brand/assetPhotos";

const channel = z.enum(IMAGE_CHANNELS as [string, ...string[]]);

/**
 * 用戶選的主體照片 → 給 LLM 看的縮圖（data URL）。必須是這個品牌的照片；讀不到就當沒有（不擋提方向）。
 * 2026-10-04（CJ「上傳了照片，三個方向都沒有用到」）：以前只有「產品清單裡的產品」才會讓 AI 知道有照片，
 * 上傳／素材庫挑的照片根本沒傳進提方向，方向全是憑文案想像。
 */
async function subjectPhotoForLLM(brandId: number, url?: string): Promise<string | undefined> {
  if (!url || !(await productPhotoAllowed(brandId, url))) return undefined;
  try {
    const { buffer } = await fetchImageBuffer(url, { timeoutMs: 15_000, maxBytes: 20 * 1024 * 1024 });
    const sharp = (await import("sharp")).default;
    const small = await sharp(buffer).rotate().resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    return `data:image/jpeg;base64,${small.toString("base64")}`;
  } catch { return undefined; }
}

/** 圖上標題是會被看見的字——跟文案一樣過禁用詞／替換對照，再過法規合規檢查。 */
async function cleanOverlayTitle(brandId: number, text: string): Promise<string> {
  const { enforceBrandRulesOnText } = await import("../../strategy/core/brand/brandContext");
  const { enforceRegulationsOnText } = await import("../core/engine/regulationCompliance");
  let out = await enforceBrandRulesOnText(brandId, text).catch(() => text);
  const reg = await enforceRegulationsOnText(brandId, out);
  if (reg.record?.status === "fixed") out = await enforceBrandRulesOnText(brandId, reg.text).catch(() => reg.text);
  return out;
}

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
      return {
        cards: specs.map(publicSpec),
        /** 畫面樣式清單（換底圖／換樣式的選項）；只給 id 與名稱，prompt 留在伺服器。 */
        styles: IMAGE_STYLES.map((x) => ({ id: x.id, labelZh: x.labelZh, labelEn: x.labelEn })),
      };
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
      /** 一組幾張（輪播／相簿）；不傳＝單張。 */
      count: z.number().int().min(1).max(MAX_SERIES).optional(),
      /** 用戶選的主體照片（上傳／素材庫／產品照都算）；給了 AI 會看這張照片再提方向。 */
      subjectImageUrl: z.string().max(2048).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertBrandOwner(ctx.user.id, input.brandId);
      const spec = specOr404(input.cardId);
      if ((input.count ?? 1) > spec.maxImages) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `這張卡最多 ${spec.maxImages} 張。` });
      }
      const brand = await resolveBrandVisualContext(input.brandId);
      const { buildBrandPrefix } = await import("../../strategy/core/brand/brandContext");
      // 2026-10-03：這張圖發在哪個平台 → 讀該平台的「通路角色」（構圖與標題的取向跟著平台走）。
      const brainPrefix = await buildBrandPrefix(input.brandId, null, null, "full", spec.channel).catch(() => "");
      try {
        const out = await proposeImageDirections({
          spec, copy: input.copy, brand, productName: input.productName, brainPrefix, count: input.count,
          subjectImageDataUrl: await subjectPhotoForLLM(input.brandId, input.subjectImageUrl),
        });
        out.headlineZh = await cleanOverlayTitle(input.brandId, out.headlineZh);
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
      /** previous＝同一張的上一版（預設）；style＝整組第 1 張，只借風格、畫面另外寫。 */
      referenceMode: z.enum(["previous", "style", "restyle"]).optional(),
      /** 畫面樣式（imageStyles 的 id）；不傳＝不指定。 */
      styleId: z.enum(IMAGE_STYLE_IDS).optional(),
      instruction: z.string().max(600).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertBrandOwner(ctx.user.id, input.brandId);
      const spec = specOr404(input.cardId);
      if (input.referenceImageUrl && !isOwnCoverUrl(input.referenceImageUrl)) {
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
          referenceMode: input.referenceMode,
          styleId: input.styleId,
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

  /**
   * 2026-10-04（CJ「張數可以讓用戶選，選擇幾張後，AI 再提供每一張的建議」）：
   * 整組方向選定後，依文案結構拆成 count 張，每張給角色、圖上標題與畫面。不扣點（只有文字）。
   */
  planSeries: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      cardId: z.string().max(60),
      copy: z.string().min(2).max(6000),
      count: z.number().int().min(2).max(MAX_SERIES),
      direction: z.object({
        titleZh: z.string().max(60),
        sceneZh: z.string().max(400),
        paletteZh: z.string().max(200).default(""),
        promptEn: z.string().min(2).max(4000),
      }),
      productName: z.string().max(200).optional(),
      subjectImageUrl: z.string().max(2048).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertBrandOwner(ctx.user.id, input.brandId);
      const spec = specOr404(input.cardId);
      if (input.count > spec.maxImages) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `這張卡最多 ${spec.maxImages} 張。` });
      }
      const brand = await resolveBrandVisualContext(input.brandId);
      const { buildBrandPrefix } = await import("../../strategy/core/brand/brandContext");
      const brainPrefix = await buildBrandPrefix(input.brandId, null, null, "full", spec.channel).catch(() => "");
      try {
        const slides = await planSeriesSlides({
          spec, copy: input.copy, count: input.count, direction: input.direction,
          brand, productName: input.productName, brainPrefix,
          subjectImageDataUrl: await subjectPhotoForLLM(input.brandId, input.subjectImageUrl),
        });
        for (const sl of slides) sl.titleZh = await cleanOverlayTitle(input.brandId, sl.titleZh);
        return { slides };
      } catch (e) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e instanceof Error ? e.message : String(e) });
      }
    }),

  /** 換底圖：純色／漸層底，不經 AI、不扣點。 */
  solidBackground: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      cardId: z.string().max(60),
      color: z.string().max(7),
      color2: z.string().max(7).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertBrandOwner(ctx.user.id, input.brandId);
      const out = await solidBackgroundForCard({ spec: specOr404(input.cardId), color: input.color, color2: input.color2 });
      if (!out.ok) throw new TRPCError({ code: "BAD_REQUEST", message: out.reason });
      return { url: out.url };
    }),

  /** 品牌色（換底圖的純色底色票）：取自品牌視覺設定，沒有就空陣列。 */
  brandColours: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertBrandOwner(ctx.user.id, input.brandId);
      const bc = await resolveBrandVisualContext(input.brandId);
      const hexes = (bc.colourHints ?? []).flatMap((h) => String(h).match(/#[0-9a-fA-F]{6}/g) ?? []).map((h) => h.toUpperCase());
      return { colours: Array.from(new Set(hexes)).slice(0, 8) };
    }),

  /**
   * 「原圖直接用」：不經 AI、不扣點，把用戶自己的照片放進這張卡的畫布（見 fitPhotoToCard）。
   * 照片必須是這個品牌的（上傳／素材庫／產品照）。
   */
  fitPhoto: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      cardId: z.string().max(60),
      photoUrl: z.string().max(2048),
      fit: z.enum(["cover", "contain"]).default("cover"),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertBrandOwner(ctx.user.id, input.brandId);
      const spec = specOr404(input.cardId);
      if (!(await productPhotoAllowed(input.brandId, input.photoUrl))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "這張照片不屬於這個品牌。" });
      }
      let buffer: Buffer;
      try {
        ({ buffer } = await fetchImageBuffer(input.photoUrl, { timeoutMs: 20_000, maxBytes: 25 * 1024 * 1024 }));
      } catch (e) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e instanceof Error ? e.message : "讀不到這張照片。" });
      }
      const out = await fitPhotoToCard({ buffer, spec, fit: input.fit });
      if (!out.ok) throw new TRPCError({ code: "BAD_REQUEST", message: out.reason });
      return { url: out.url, card: publicSpec(spec) };
    }),

  /**
   * 組圖時每一張都可能疊了自己的標題；一張一個請求（base64 不要全塞進同一包）存成交付檔，
   * 回傳網址，之後 saveAsPost 只收網址。欄位名一定要叫 imageB64（見 saveAsPost 的說明）。
   */
  uploadTitled: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      cardId: z.string().max(60),
      imageB64: z.string().max(24_000_000),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertBrandOwner(ctx.user.id, input.brandId);
      const saved = await saveTitledImage(input.imageB64, specOr404(input.cardId));
      if (!saved.ok) throw new TRPCError({ code: "BAD_REQUEST", message: saved.reason });
      return { url: saved.url };
    }),

  /**
   * 2026-10-04（CJ「產出圖片後，想要有圖文搭配預覽，並且一起排程……目前圖片修改完後，
   * 就直接下載而已，無法一起排程到行事曆」）。行事曆排的是「產出」（mission_outputs），
   * 圖片卡原本只留下圖檔——這裡把圖和文案變成一篇產出：
   *   · 從文字任務帶文案過來的（fromOutputId）：圖寫回那一篇的那一則，文案不動。
   *   · 直接在圖片卡貼文案的：新建一篇，taskId 用卡片 id，成品頁照卡片的平台／形式套版型。
   * 回傳 outputId＋定位，前台接著呼叫 calendar.schedule。
   */
  saveAsPost: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      cardId: z.string().max(60),
      copy: z.string().max(8000),
      /** 這一組圖（單張＝1；輪播／相簿＝多張），依序。只收本站產出的圖。 */
      imageUrls: z.array(z.string().max(2048)).min(1).max(35),
      /** 第一張疊好標題的畫布（data URL，交付像素）。沒標題就不傳。
       *  欄位一定要叫 imageB64：server/index.ts 的單欄 5 萬字上限只對白名單欄位名放行圖片資料，
       *  換名字會被擋成 413（2026-10-04 dev 實測踩到）。 */
      imageB64: z.string().max(24_000_000).optional(),
      fromOutputId: z.number().int().positive().optional(),
      ...contentSelectorFields,
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertBrandOwner(ctx.user.id, input.brandId);
      const spec = specOr404(input.cardId);
      if (input.imageUrls.some((u) => !isOwnCoverUrl(u))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "只能存這裡產出的圖片。" });
      }
      if (input.imageUrls.length > spec.maxImages) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `這張卡最多 ${spec.maxImages} 張。` });
      }
      const urls = [...input.imageUrls];
      if (input.imageB64) {
        const saved = await saveTitledImage(input.imageB64, spec);
        if (!saved.ok) throw new TRPCError({ code: "BAD_REQUEST", message: saved.reason });
        urls[0] = saved.url;
      }
      const first = urls[0]!;

      if (input.fromOutputId) {
        const { default: localPool } = await import("../../localDb");
        const [rows]: any = await localPool.execute(
          `SELECT o.content FROM mission_outputs o JOIN missions m ON m.id = o.missionId
           WHERE o.id = ? AND m.userId = ? LIMIT 1`,
          [input.fromOutputId, ctx.user.id],
        );
        const row = (rows as any[])[0];
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "找不到來源那篇文案。" });
        const updated = updateOutputContent(row.content, input, (item) => applyVariantImageUpdate(item, { imageUrl: first }));
        await localPool.execute(
          `UPDATE mission_outputs SET content = ?, updatedAt = NOW() WHERE id = ?`,
          [updated.content, input.fromOutputId],
        );
        return {
          outputId: input.fromOutputId, created: false, imageUrl: first,
          // 原樣回傳前台給的定位（舊格式用 variantIndex、IG 策略包用 contentKind＋contentIndex）。
          locator: input.contentKind
            ? { contentKind: input.contentKind, contentIndex: input.contentIndex ?? 0 }
            : { variantIndex: input.variantIndex },
        };
      }

      const copy = input.copy.trim();
      if (copy.length < 2) throw new TRPCError({ code: "BAD_REQUEST", message: "先填上文案，才能存成貼文。" });
      const item: Record<string, unknown> = {
        label: spec.labelZh, caption: copy,
        imageUrl: first, imageStatus: "ready", image: { url: first, status: "ready" },
        ...(urls.length > 1
          ? { cards: urls.map((u) => ({ headline: "", body: "", image: { style: null, url: u, status: "ready" } })) }
          : {}),
      };
      const rec = await recordTaskRun({
        userId: ctx.user.id, brandId: input.brandId,
        workspace: spec.channel, taskId: spec.id, taskLabel: `${spec.labelZh}（圖＋文）`, tier: "30s",
        title: copy.split("\n")[0]!.slice(0, 60) || spec.labelZh,
        content: JSON.stringify([item], null, 2),
        metadata: { platform: spec.channel, source: "image-card", cardId: spec.id },
        thumbnailUrl: first,
      });
      if (!rec.outputId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "存成貼文失敗，請再試一次。" });
      return { outputId: rec.outputId, created: true, imageUrl: first, locator: { variantIndex: 0 } };
    }),
});
