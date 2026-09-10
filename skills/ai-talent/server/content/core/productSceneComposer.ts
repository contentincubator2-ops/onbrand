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
 *
 * ── 不適用：真人模特穿著商品的照片 ──────────────────────────────────────
 * 2026-09-10（CJ 看過用 IRIS Girls 真人模特照跑過的側測後：「model 跟衣服要
 * 分開的」）：這支是設計給「靜物」的——瓶罐、盒裝、單一物件放在桌面上。如果
 * 輸入的照片是「真人模特穿著這件衣服」，去背會把整個人連衣服一起裁下來，
 * 變成把「人」跟「衣服」焊在一起搬到新場景，不是我們要的「保留衣服本身」。
 * 服飾類商品要走 mediaGen.ts 的 piapi/kling-try-on（imageRouter.generateGarmentTryOn）
 * ——衣服的照片跟真人模特照是兩張分開的輸入，各自的身份不互相污染。
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
 * 陰影：量產品「底部一小段」的不透明範圍當接地寬度，畫一個模糊橢圓。
 *
 * 2026-09-10 自己側測抓到的 bug，記在這裡免得又寫回去：原本的做法是把整個
 * 產品的 alpha 遮罩垂直壓扁（resize 到很矮的高度）湊出一條陰影帶。垂直壓扁
 * 一個瓶蓋＋瓶身寬窄不一的形狀，會把「瓶蓋很窄」跟「瓶身比較寬」這些不同
 * 高度的不透明區段疊到同一批輸出列上，結果幾乎每一欄都疊到「某個高度有
 * 不透明」，壓完變成一塊近乎實心的矩形——側測用真的 QA 圖跑過一次，陰影
 * 位置整個是一塊方塊，不是貼著瓶身的柔和陰影，肉眼看就知道不對。
 *
 * 改成只取底部貼地那段（12% 高度）的不透明寬度，畫一個橢圓再模糊——形狀
 * 不會逐像素跟著瓶身輪廓走，但保證是一個乾淨的橢圓陰影，不會變成方塊。
 */
async function renderShadow(
  cutout: Buffer, placement: { left: number; top: number; width: number; height: number },
  canvasW: number, canvasH: number,
): Promise<Buffer | null> {
  try {
    const { data, info } = await sharp(cutout)
      .resize(placement.width, placement.height, { fit: "fill" })
      .ensureAlpha()
      .extractChannel("alpha")
      .raw()
      .toBuffer({ resolveWithObject: true });
    const w = info.width, h = info.height;
    const sampleBand = Math.max(1, Math.round(h * 0.12)); // 底部 12%——貼地那段的寬度才是陰影該有的寬度
    let minX = w, maxX = -1;
    for (let y = Math.max(0, h - sampleBand); y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        if (data[row + x]! > 40) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
    }
    if (maxX < minX) return null; // 底部整段透明（懸浮物件之類）——沒有陰影比錯的陰影好

    const footprintW = Math.max(24, maxX - minX);
    const centerX = placement.left + Math.round((minX + maxX) / 2);
    const shadowW = Math.round(footprintW * 1.15);
    const shadowH = Math.max(10, Math.round(shadowW * 0.22));
    // 2026-09-10 自己側測抓到的第三個 bug：baseY 原本算在產品底部「往上」2%，
    // 幾乎跟產品自己的底邊重疊。橢圓中心在那個位置，等於陰影一大半被畫在產品
    // 底下（後面 composite 順序是背景→陰影→產品，產品蓋在上面），只有橢圓
    // 邊緣模糊到快消失的那一小截露在產品外面，肉眼幾乎看不到——側測比對
    // 「合成後的圖」跟「純背景」在陰影該有的位置幾乎沒有差異，才發現陰影中心
    // 根本沒露出來過。改成往「產品底邊下方」推，橢圓大半段留在產品外面。
    const bottomEdge = placement.top + placement.height;
    const baseY = bottomEdge + Math.round(shadowH * 0.14);

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}">` +
      `<ellipse cx="${centerX}" cy="${baseY}" rx="${Math.round(shadowW / 2)}" ry="${Math.round(shadowH / 2)}" fill="black" opacity="0.32"/>` +
      `</svg>`;
    return await sharp(Buffer.from(svg))
      .blur(Math.max(6, Math.round(shadowW * 0.08)))
      .png().toBuffer();
  } catch {
    return null; // 陰影是加分，算不出來就沒有陰影，不影響主流程
  }
}

export async function composeProductScene(input: SceneComposeInput): Promise<SceneComposeResult> {
  const width = input.width ?? 1080;
  const height = input.height ?? 1080;

  // 1. 產品去背，再裁到「真的有東西」的範圍。
  //
  // 2026-09-10 自己側測抓到的第二個 bug：Replicate 回來的去背圖是跟原圖同一張
  // 畫布（背景變透明，但畫布尺寸不變）——原始照片如果拍的時候產品沒有塞滿整個
  // 畫面（很常見，電商圖常常四周留白），去背圖就會帶著一大圈透明留白。後面的
  // 縮放／置中／陰影全部是照這個畫布的寬高去算的，留白算進去，產品在合成後會
  // 縮得比預期小，陰影的「底部一小段」還可能整段落在留白裡（側測就是踩到這個：
  // 陰影完全不見了，因為採樣的底部 12% 全部是透明的，不是產品本體）。trim()
  // 一律先做，把留白裁掉，兩個問題一次解決。
  const cutout = await removeProductBackground(input.productImageUrl);
  const trimmedCutoutBuffer = await sharp(cutout.pngBuffer).trim().png().toBuffer().catch(() => cutout.pngBuffer);
  const productMeta = await sharp(trimmedCutoutBuffer).metadata();
  const pW = productMeta.width ?? width;
  const pH = productMeta.height ?? height;
  const placement = productPlacement(width, height, pW, pH);
  const productLayer = await sharp(trimmedCutoutBuffer)
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
  const shadow = await renderShadow(trimmedCutoutBuffer, placement, width, height);
  const layers: Array<{ input: Buffer; left: number; top: number }> = [];
  if (shadow) layers.push({ input: shadow, left: 0, top: 0 });
  layers.push({ input: productLayer, left: actualLeft, top: actualTop });

  const pngBuffer = await sharp(backgroundBuffer).composite(layers).png().toBuffer();

  return { pngBuffer, backgroundPrompt, hadCutout: cutout.hadAlpha, usedFallbackBackground };
}
