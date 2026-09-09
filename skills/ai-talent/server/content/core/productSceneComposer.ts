/**
 * productSceneComposer — 產品照片放進一個「AI 生成、但沒有產品在裡面」的
 * 照片級場景，用真的合成（cutout + composite），不是重畫。
 *
 * 2026-09-10（CJ「用戶會先關心自己的產品圖，是否有因為 AI 所以變形…我剛剛看到
 * Photoroom 的做法，是否有類似的做法可以改善我們生圖時，改變產品的問題」，
 * 之後同意照建議的順序執行）。
 *
 * ── 跟 brandedComposer.ts 的分工 ──────────────────────────────────────
 * brandedComposer 做的是「平面設計版型」（純色/雙色塊背景 + 文字疊層，四種
 * 固定版面）——那是海報，不是照片。這支做的是「看起來像真的拍出來的」照片級
 * 情境（桌面、木紋、自然光），背景本身也是生成的，但**畫面裡完全沒有產品**——
 * 產品是事後用真實照片的去背圖疊上去的，AI 從頭到尾沒有機會重畫產品本身。
 *
 * ── 為什麼這樣做能避開「產品變形」────────────────────────────────────
 * Nano Banana 那條路（subjectImageUrl／PRODUCT_FAITHFUL_PROMPT_BLOCK）是
 * 「拿參考圖去重畫」——不管 prompt 寫得多嚴，模型還是在重新生成每一個像素，
 * 標籤、比例、顏色都有機會漂。這支完全不同：產品的像素從頭到尾沒有被任何
 * AI 模型碰過，只是換了背景。物理上不可能變形，因為根本沒有重畫的步驟。
 *
 * ── 流程 ──────────────────────────────────────────────────────────────
 *   1. removeProductBackground(真實產品照) → 去背 PNG（Replicate BiRefNet，
 *      productImageCutout.ts 既有）
 *   2. generateImage({ 純文字場景 prompt，不帶 subjectImageUrl }) → 照片級
 *      背景（走既有的 imageGen.ts 一般文字生圖，不是 Nano Banana 那條路，
 *      因為背景本身不需要保真——它本來就沒有「原本」的樣子）
 *   3. sharp 合成：背景 → 陰影（從去背圖的 alpha 通道算出來，不是另一次 AI
 *      呼叫） → 產品去背圖，三層疊起來
 *
 * 陰影是確定性算出來的（模糊＋位移＋調暗 alpha 遮罩），不是叫 AI 畫陰影——
 * 這樣陰影的形狀保證跟產品輪廓對得上，Photoroom 的「AI Shadow」也是同一個
 * 原理（自然陰影，不是另一張生成圖）。
 */
import sharp from "sharp";
import { removeProductBackground } from "./productImageCutout";
import { generateImage } from "./imageGen";
import { fetchImageBuffer } from "./imageFetch";

export interface SceneComposeInput {
  /** 真實產品照的網址（使用者上傳的，見 assetPhotos.ts）。 */
  productImageUrl: string;
  brandId: number;
  /** 場景描述，例如「淺色木紋桌面，早晨自然光」。留空用預設中性場景。 */
  scenePrompt?: string;
  width?: number;
  height?: number;
}

export interface SceneComposeResult {
  pngBuffer: Buffer;
  /** 背景生成時實際用的 prompt（含守則）——存進 caption/telemetry 用。 */
  backgroundPrompt: string;
  /** 產品那層是不是真的去背了（false=去背服務不可用，退回原圖裁切）。 */
  hadCutout: boolean;
  /** 背景生成失敗時用中性色塊墊底而不是整個拋錯——寧可素一點也不要失敗。 */
  usedFallbackBackground: boolean;
}

const DEFAULT_SCENE =
  "a softly lit neutral surface for commercial product photography, " +
  "shallow depth of field, gentle natural shadow area, minimal styling";

/**
 * 場景背景的 prompt。守則只有一條，但很重要：不准出現任何物件——這裡生的是
 *「舞台」，不是「照片」，產品由後面的合成步驟自己放上去。
 */
export function buildScenePrompt(hint?: string): string {
  const scene = (hint ?? "").trim() || DEFAULT_SCENE;
  return (
    `${scene}. Empty surface or environment only — absolutely no product, no object, ` +
    `no packaging, no person, no hands, no text, no logo, no watermark anywhere in the ` +
    `frame. This is a background plate that something will be composited onto afterward; ` +
    `any object you add would be in the way. Photographic, not illustrated — real camera ` +
    `lens characteristics (natural depth of field, realistic light falloff).`
  );
}

/** 目標畫布內，產品要縮放／置中到哪個矩形——留一點底部空間放陰影。 */
export function productPlacement(
  canvasW: number, canvasH: number, productW: number, productH: number,
): { left: number; top: number; width: number; height: number } {
  // 產品最高佔畫面 62% 高、78% 寬，且置中偏下（模擬「立在桌面上」，不是飄浮在正中央）。
  const maxH = Math.round(canvasH * 0.62);
  const maxW = Math.round(canvasW * 0.78);
  const scale = Math.min(maxW / productW, maxH / productH, 1);
  const w = Math.round(productW * scale);
  const h = Math.round(productH * scale);
  return {
    left: Math.round((canvasW - w) / 2),
    top: Math.round(canvasH * 0.85 - h),
    width: w,
    height: h,
  };
}

/**
 * 從去背圖的 alpha 通道算陰影：取 alpha 當形狀 → 模糊 → 往下偏一點 →
 * 壓成半透明黑。形狀跟著產品輪廓走，不會是一個跟產品對不上的橢圓。
 */
async function renderShadow(
  cutout: Buffer, placement: { left: number; top: number; width: number; height: number },
  canvasW: number, canvasH: number,
): Promise<Buffer | null> {
  try {
    const alpha = await sharp(cutout)
      .resize(placement.width, placement.height, { fit: "fill" })
      .ensureAlpha()
      .extractChannel("alpha")
      .toBuffer();
    const shadowShape = await sharp(alpha)
      .blur(Math.max(4, Math.round(placement.width * 0.03)))
      .toBuffer();
    // alpha-only 圖轉成半透明黑：用它當 mask 蓋在一塊黑色矩形上。
    const black = await sharp({
      create: { width: placement.width, height: placement.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.38 } },
    }).png().toBuffer();
    const shadow = await sharp(black)
      .composite([{ input: shadowShape, blend: "dest-in" }])
      .png().toBuffer();
    // 貼在畫布上：稍微往下、往右偏移，並壓扁成薄薄一層（乘法縮放高度）貼地。
    const offsetY = Math.round(placement.height * 0.06);
    const flat = await sharp(shadow)
      .resize(placement.width, Math.max(8, Math.round(placement.height * 0.22)), { fit: "fill" })
      .toBuffer();
    return await sharp({ create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: flat, left: placement.left, top: placement.top + placement.height - Math.round(placement.height * 0.22) + offsetY }])
      .png().toBuffer();
  } catch {
    return null; // 陰影是加分，算不出來就沒有陰影，不影響主流程
  }
}

export async function composeProductScene(input: SceneComposeInput): Promise<SceneComposeResult> {
  const width = input.width ?? 1080;
  const height = input.height ?? 1080;

  // 1. 產品去背
  const cutout = await removeProductBackground(input.productImageUrl);
  const productMeta = await sharp(cutout.pngBuffer).metadata();
  const pW = productMeta.width ?? width;
  const pH = productMeta.height ?? height;
  const placement = productPlacement(width, height, pW, pH);
  const productLayer = await sharp(cutout.pngBuffer)
    .resize(placement.width, placement.height, { fit: "inside", withoutEnlargement: true })
    .png().toBuffer();
  const productLayerMeta = await sharp(productLayer).metadata();
  // resize fit:"inside" 可能沒有精確填滿 placement 的寬高（維持比例），重算實際置中位置。
  const actualLeft = placement.left + Math.round((placement.width - (productLayerMeta.width ?? placement.width)) / 2);
  const actualTop = placement.top + Math.round((placement.height - (productLayerMeta.height ?? placement.height)) / 2);

  // 2. 背景生成（純文字，不帶 subjectImageUrl——背景沒有「保真」這回事）
  const backgroundPrompt = buildScenePrompt(input.scenePrompt);
  let backgroundBuffer: Buffer;
  let usedFallbackBackground = false;
  try {
    const gen = await generateImage({
      brandId: input.brandId,
      prompt: backgroundPrompt,
      size: width >= height ? (width === height ? "1024x1024" : "1536x1024") : "1024x1536",
    });
    if (gen.status === "ready" && gen.url) {
      const { buffer } = await fetchImageBuffer(gen.url, { timeoutMs: 15_000 });
      backgroundBuffer = await sharp(buffer).resize(width, height, { fit: "cover" }).png().toBuffer();
    } else if (gen.status === "ready" && gen.b64) {
      backgroundBuffer = await sharp(Buffer.from(gen.b64, "base64")).resize(width, height, { fit: "cover" }).png().toBuffer();
    } else {
      throw new Error(gen.errorMsg ?? "background generation failed");
    }
  } catch (e) {
    // 背景生不出來：退回中性淺灰墊底，寧可素一點也不要整個 fail——產品去背圖
    // 還是乾淨的，使用者拿到的東西還能用，只是背景平淡。
    usedFallbackBackground = true;
    backgroundBuffer = await sharp({
      create: { width, height, channels: 4, background: { r: 244, g: 243, b: 240, alpha: 1 } },
    }).png().toBuffer();
    console.warn("[productSceneComposer] background generation failed, using flat fallback:", (e as Error).message);
  }

  // 3. 合成：背景 → 陰影 → 產品
  const shadow = await renderShadow(cutout.pngBuffer, placement, width, height);
  const layers: Array<{ input: Buffer; left: number; top: number }> = [];
  if (shadow) layers.push({ input: shadow, left: 0, top: 0 });
  layers.push({ input: productLayer, left: actualLeft, top: actualTop });

  const pngBuffer = await sharp(backgroundBuffer).composite(layers).png().toBuffer();

  return { pngBuffer, backgroundPrompt, hadCutout: cutout.hadAlpha, usedFallbackBackground };
}
