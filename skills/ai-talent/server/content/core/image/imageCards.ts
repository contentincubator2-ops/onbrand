/**
 * 圖片任務卡的三個步驟（2026-09-29 CJ「圖片獨立成任務卡」）：
 *   1. proposeImageDirections —— 先用文字提 3 個畫面方向（便宜、幾秒），用戶選了才生圖。
 *   2. renderImageCard        —— 依卡片規格生成；也負責「對話修改」與「延伸成其他尺寸」
 *                                （都是拿上一張當參考圖，在新規格的原生比例下重新生成）。
 *   3. 標題不烤進圖：AI 圖一律無字，標題由前台疊層，用戶可直接改。
 *
 * 比例鐵律見 platformImageSpecs.ts：生成當下鎖死，事後只等比縮放，比例不符就算失敗。
 */

import { coverContentType, getMediaStore } from "../../../platform/core/media/mediaStore";
import {
  type PlatformImageSpec,
  canvasPromptBlock,
  generationSize,
  gptSizeFor,
  nanoRatioFor,
  ratioError,
  RATIO_TOLERANCE,
} from "../../../platform/core/media/platformImageSpecs";
import { generateStillImage, resolveStillImageModel, NANO_BANANA, type StillImageModelId } from "../../../platform/core/media/stillImageModels";
import {
  NO_TEXT_PROMPT_BLOCK,
  NO_MIRROR_PROMPT_BLOCK,
  PRODUCT_FAITHFUL_PROMPT_BLOCK,
  type BrandVisualContext,
} from "./imageGen";
import { fetchImageBuffer } from "../../../platform/core/media/imageFetch";
import { getImageStyle } from "./imageStyles";
import type { ImageFailureKind } from "../../../platform/core/media/stillImageModels";

export interface ImageDirection {
  id: string;
  titleZh: string;
  sceneZh: string;
  paletteZh: string;
  whyZh: string;
  promptEn: string;
}

/** 使用者訊息：有主體照片就把圖一起附上（文字在前），沒有就維持純文字。 */
export function withSubjectImage(text: string, dataUrl?: string): any {
  if (!dataUrl) return text;
  return [{ type: "text", text }, { type: "image_url", image_url: { url: dataUrl } }];
}

export interface ProposeResult {
  headlineZh: string;
  directions: ImageDirection[];
}

function brandBlock(bc: BrandVisualContext): string {
  return [
    bc.brandName ? `Brand name: ${bc.brandName}` : "",
    bc.positioning ? `Positioning: ${bc.positioning}` : "",
    bc.archetype ? `Archetype: ${bc.archetype}` : "",
    bc.voiceTone ? `Voice/Tone: ${bc.voiceTone}` : "",
    bc.audience ? `Target audience: ${bc.audience}` : "",
    bc.colourHints?.length ? `Brand colours: ${bc.colourHints.join(", ")}` : "",
    bc.imageryStyle ? `Imagery style: ${bc.imageryStyle}` : "",
  ].filter(Boolean).join("\n");
}

function parseJsonLoose(text: string): any {
  const t = String(text ?? "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  try { return JSON.parse(t); } catch { /* fallthrough */ }
  const s = t.indexOf("{"); const e = t.lastIndexOf("}");
  if (s >= 0 && e > s) { try { return JSON.parse(t.slice(s, e + 1)); } catch { /* ignore */ } }
  return null;
}

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

/** 把 LLM 回覆整理成固定形狀；缺欄位的方向直接丟掉，不補假內容。 */
export function normalizeDirections(raw: any, copy: string): ProposeResult {
  const list: any[] = Array.isArray(raw?.directions) ? raw.directions : [];
  const directions = list
    .map((d, i) => ({
      id: clip(d?.id, 20) || `dir_${i + 1}`,
      titleZh: clip(d?.titleZh ?? d?.title, 24),
      sceneZh: clip(d?.sceneZh ?? d?.scene, 200),
      paletteZh: clip(d?.paletteZh ?? d?.palette, 80),
      whyZh: clip(d?.whyZh ?? d?.why, 120),
      promptEn: clip(d?.promptEn ?? d?.prompt, 1500),
    }))
    .filter((d) => d.titleZh && d.sceneZh && d.promptEn)
    .slice(0, 3);
  const headlineZh = clip(raw?.headlineZh ?? raw?.headline, 30) || clip(copy.split(/\n/)[0], 20);
  return { headlineZh, directions };
}

export function directionsSystemPrompt(spec: PlatformImageSpec, withProduct: boolean, count = 1): string {
  const series = count > 1
    ? `這次是一組 ${count} 張的系列圖（輪播／相簿）：每個方向要是「能貫穿整組」的視覺概念（統一的色調、光線、構圖語言），之後會再逐張規劃每一張的內容。promptEn 描述整組的共同風格與第一張（封面）的畫面。
`
    : "";
  return `你是資深商業攝影美術指導。使用者貼了一段社群文案，要做${count > 1 ? `一組 ${count} 張的` : "一張"}「${spec.labelZh}」（${spec.width}×${spec.height}）。
${series}
先不要生圖——提出 3 個截然不同的畫面方向讓使用者挑（場景、構圖、光線、情緒要真的不同，不能只換顏色）。

每個方向：
- titleZh：方向名稱 4–8 字
- sceneZh：畫面描述 40–80 字，讓不懂攝影的人一看就懂會拍出什麼
- paletteZh：色調一句話（優先用品牌色）
- whyZh：為什麼適合這篇文案 20–40 字
- promptEn：給圖片模型的英文場景描述 60–120 字（主體、環境、光線、鏡頭、情緒），必須符合這張卡的構圖規則：${spec.compositionEn}
${spec.compose ? "- 這是細長 Banner 的方形主體圖：promptEn 只描述單一主體，放在一整片純色背景上（不要場景、桌面、窗戶、地平線），四周留白。\n" : ""}${withProduct ? "- 使用者附上了一張真實照片（會一起給你看）：先看懂照片裡的主體是什麼，3 個方向都必須以這個主體為主角，sceneZh 要寫出主體在畫面裡怎麼出現；promptEn 只描述主體以外的場景、光線、擺放位置，不要重新描述或改寫主體的外觀。\n" : ""}
另外給 headlineZh：從文案濃縮一句 6–14 字的圖上標題（會疊在圖上，不是畫進圖裡）。

規則：畫面裡不能有任何文字、招牌字、logo 字樣；不要提到競品品牌。
只輸出 JSON：{"headlineZh":"...","directions":[{"id":"a","titleZh":"...","sceneZh":"...","paletteZh":"...","whyZh":"...","promptEn":"..."}]}`;
}

export async function proposeImageDirections(args: {
  spec: PlatformImageSpec;
  copy: string;
  brand: BrandVisualContext;
  productName?: string;
  /**
   * 2026-09-29（CJ「圖片卡要讀品牌大腦」）：圖上標題是會被看見的字，方向也要扣回
   * 品牌——以前只有 BrandVisualContext 那幾行摘要。這裡帶同一份品牌大腦
   * （buildBrandPrefix，也就是「大腦」tray 上列出的那一份）。
   */
  brainPrefix?: string;
  /** 一組幾張（輪播／相簿）；預設單張。 */
  count?: number;
  /** 用戶選的主體照片（縮小後的 data URL）。給了就讓 AI 真的看到它，方向以它為主角。 */
  subjectImageDataUrl?: string;
}): Promise<ProposeResult> {
  const { invokeLLM } = await import("../../../platform/core/llm/llm");
  const brain = args.brainPrefix?.trim() ? `品牌大腦（標題的用詞、語氣與畫面方向都要符合）：${args.brainPrefix}\n\n` : "";
  const user = `${brain}品牌資訊：\n${brandBlock(args.brand) || "（尚未設定）"}\n\n${args.productName ? `產品：${args.productName}\n\n` : ""}文案：\n${args.copy}`;
  const res = await invokeLLM({
    messages: [
      { role: "system", content: directionsSystemPrompt(args.spec, !!args.productName || !!args.subjectImageDataUrl, args.count ?? 1) },
      { role: "user", content: withSubjectImage(user, args.subjectImageDataUrl) },
    ],
    maxTokens: 2200,
  });
  const out = normalizeDirections(parseJsonLoose(res.choices?.[0]?.message?.content as any), args.copy);
  if (!out.directions.length) throw new Error("AI 沒有提出可用的畫面方向，請再試一次。");
  return out;
}

/** 生成用的完整 prompt：品牌 → 畫布規則 → 場景 →（修改指令）→ 無字／產品保真守則。 */
export function buildImageCardPrompt(args: {
  spec: PlatformImageSpec;
  scenePromptEn: string;
  brand: BrandVisualContext;
  withProduct: boolean;
  reference?: "previous" | "style" | "restyle" | null;
  instruction?: string;
  /** 畫面樣式（imageStyles.ts 的 id）。 */
  styleId?: string | null;
  /** 用戶上傳的風格參考圖張數（排在產品照／上一版之後一起送給模型）。 */
  styleRefCount?: number;
}): string {
  const lines: string[] = [];
  const nRef = Math.max(0, args.styleRefCount ?? 0);
  // 風格參考圖放在最前面講：實測（2026-10-10 dev）放在中段時 gpt-image-2 只學到配色、畫法仍是照片，
  // 帶產品照時更是整段被產品保真那一塊蓋過去。所以先講清楚「哪張是什麼」，結尾再提醒一次。
  if (nRef > 0) {
    const lead = args.withProduct || !!args.reference;
    const refs = nRef === 1 ? "STYLE REFERENCE" : "STYLE REFERENCES";
    const which = lead
      ? `Image 1 is ${args.reference ? "the current visual" : "the REAL product/subject photo"}. ${nRef === 1 ? "Image 2 is a" : `Images 2–${nRef + 1} are`} ${refs} supplied by the user`
      : `The attached ${nRef === 1 ? "image is a" : `${nRef} images are`} ${refs} supplied by the user`;
    lines.push(
      `ATTACHED IMAGES — ${which}.`,
      `STYLE REFERENCE (top priority for how the image looks): the new image must look as if it was made by the same ` +
      `artist or photographer as the ${refs.toLowerCase()} — the SAME MEDIUM (if ${nRef === 1 ? "it is" : "they are"} flat illustration, ` +
      "paper cut-out, watercolour, 3D render or film photography, the output must be that too, not a default photograph), " +
      "the same colour palette, lighting, texture, level of detail, shapes and mood. This overrides any style words in the " +
      "scene and any brand imagery guidance below. " +
      // 2026-10-10 CJ「就是要學得很像啊」：構圖、版面、人物畫法也跟著學，只把內容換成這次的場景。
      (args.reference === "restyle" ? "" :
        `Follow ${nRef === 1 ? "it" : "them"} CLOSELY, the way a designer makes the next piece of the same campaign: also match the ` +
        "composition and layout (where the subject sits, how much empty space, framing, camera angle and distance), the way people, " +
        "objects and backgrounds are drawn or photographed, and recurring graphic elements and shapes. ") +
      "Only the subject matter changes: show the scene described below instead of what the references depict. " +
      "Do not reproduce any logo, watermark, signature or written text from the references." +
      (args.withProduct
        ? " The product/subject from image 1 stays exactly as photographed (shape, colours, label); render everything around it — " +
          "background, props, surfaces, lighting and overall palette — in the look of the style references."
        : "") +
      (args.reference === "restyle" ? " Keep the subject, content and composition of the current visual; change only how it is rendered." : ""),
      "",
    );
  }
  if (args.withProduct) { lines.push(PRODUCT_FAITHFUL_PROMPT_BLOCK, ""); }
  const bb = brandBlock({ ...args.brand, ...(args.withProduct ? { brandName: undefined } : {}) });
  if (bb) { lines.push(bb, ""); }
  lines.push(canvasPromptBlock(args.spec), "");
  if (args.reference === "previous") {
    lines.push(
      "REFERENCE IMAGE: the attached image is the previous version of this visual. Keep the same subject, " +
      "product, palette, lighting and mood, but re-compose it natively for the CANVAS above (do not stretch, " +
      "letterbox, or simply crop it).",
      "",
    );
  }
  if (args.reference === "style") {
    lines.push(
      "REFERENCE IMAGE: the attached image is slide 1 of a multi-image set. Match its colour palette, lighting, " +
      "art direction, texture and mood exactly so every slide looks like one family. Do NOT copy its subject or " +
      "composition: depict the NEW scene below. If the same product or object appears, keep it identical to the reference.",
      "",
    );
  }
  if (args.reference === "restyle") {
    lines.push(
      "REFERENCE IMAGE: the attached image is the current version. Keep the same subject, scene content and composition, " +
      "but re-render the WHOLE image in the ART STYLE / STYLE REFERENCE given in this prompt (colours may shift to suit the style).",
      "",
    );
  }
  // 用戶給了自己的風格參考圖時，預設樣式不再疊上去（兩種風格指令會互相打架）。
  const style = nRef > 0 ? null : getImageStyle(args.styleId);
  if (style) {
    lines.push(
      `ART STYLE (applies to the whole image): ${style.promptEn}` +
      (args.withProduct ? " Apply it to the scene, lighting and rendering; keep any real product or subject from the reference photo faithful." : ""),
      "",
    );
  }
  lines.push("Scene:", args.scenePromptEn, "");
  if (args.spec.compose) {
    lines.push(
      "OVERRIDE for this banner tile (takes priority over the scene above): show ONLY the main subject, isolated, " +
      "on one flat solid-colour background that fills every edge of the frame — no room, window, table edge, horizon, " +
      "gradient or texture reaching the borders. Keep the subject compact, centred, with at least 15% empty margin on every side.",
      "",
    );
  }
  if (args.instruction) {
    lines.push(`CHANGE REQUEST from the user (apply this, keep everything else the same): ${args.instruction}`, "");
  }
  if (args.withProduct) {
    lines.push(NO_MIRROR_PROMPT_BLOCK);
  } else {
    lines.push(NO_TEXT_PROMPT_BLOCK, "", NO_MIRROR_PROMPT_BLOCK);
  }
  if (nRef > 0) {
    lines.push(
      "",
      "FINAL CHECK — style: placed next to the style reference" + (nRef === 1 ? "" : "s") + ", the result must clearly belong to the same series " +
      "(same medium, palette, texture and layout feel) — a viewer should assume the same person made both" + (args.withProduct ? ", with the real product unchanged." : "."),
    );
  }
  return lines.join("\n");
}

export interface RenderOutcome {
  status: "ready" | "failed";
  modelId: StillImageModelId;
  url?: string;
  width?: number;
  height?: number;
  bytes?: number;
  errorMsg?: string;
  failureKind?: ImageFailureKind | "ratio_mismatch" | "model_unsupported";
  canSwitchTo?: "nano-banana";
}

/**
 * 合成版型：方形主體等比縮到交付高度，放在 side 那一端；其餘畫布用主體「朝向空白那一側」
 * 邊緣顏色的中位數補滿，並把那一側 35% 寬度羽化進底色——就算模型的背景不夠平，
 * 也不會出現硬接縫。只做混色，不裁切、不拉伸。
 */
export const COMPOSE_FEATHER = 0.35;

async function composeBanner(
  buffer: Buffer,
  spec: PlatformImageSpec,
  gen: { width: number; height: number },
): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const W = gen.width, H = gen.height;
  const tile = await sharp(buffer).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const toRight = spec.compose!.side === "right";            // 主體在右 → 空白在左
  const edgeX = toRight ? 0 : W - 1;
  const cols: number[][] = [[], [], []];
  for (let y = 0; y < H; y++) for (let dx = 0; dx < Math.max(2, Math.round(W * 0.03)); dx++) {
    const x = toRight ? edgeX + dx : edgeX - dx;
    const i = (y * W + x) * 3;
    for (let c = 0; c < 3; c++) cols[c]!.push(tile[i + c]!);
  }
  const median = (a: number[]) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)]!;
  const [r, g, b] = cols.map(median) as [number, number, number];
  // 主體加 alpha：朝空白那側從 0 漸變到 1（smoothstep），其餘不透明。
  const rgba = Buffer.alloc(W * H * 4);
  const band = W * COMPOSE_FEATHER;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = toRight ? x : W - 1 - x;
    const t = Math.min(1, d / band);
    const a = t * t * (3 - 2 * t);
    const si = (y * W + x) * 3, di = (y * W + x) * 4;
    rgba[di] = tile[si]!; rgba[di + 1] = tile[si + 1]!; rgba[di + 2] = tile[si + 2]!; rgba[di + 3] = Math.round(a * 255);
  }
  const subject = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
  return sharp({ create: { width: spec.width, height: spec.height, channels: 3, background: { r, g, b } } })
    .composite([{ input: subject, top: 0, left: toRight ? spec.width - W : 0 }])
    .png()
    .toBuffer();
}

/**
 * 生成後的唯一處理：確認比例與規格一致（≤1%），再「等比例」縮放到交付像素、
 * 依規格轉檔並壓到檔案上限內。比例不符直接判失敗——不裁切。
 */
export async function finalizeToSpec(buffer: Buffer, spec: PlatformImageSpec): Promise<
  { ok: true; buffer: Buffer; bytes: number } | { ok: false; reason: string }
> {
  const sharp = (await import("sharp")).default;
  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) return { ok: false, reason: "讀不到生成圖片的尺寸" };
  const gen = generationSize(spec);
  const err = ratioError(meta.width / meta.height, gen.width / gen.height);
  if (err > RATIO_TOLERANCE) {
    return { ok: false, reason: `模型回傳 ${meta.width}×${meta.height}，與 ${gen.width}×${gen.height} 的比例不符（差 ${(err * 100).toFixed(1)}%）。已擋下，不裁切。` };
  }
  if (spec.compose) buffer = await composeBanner(buffer, spec, gen);
  // 比例已一致（≤1%），fill 只是把最後幾個像素的差對齊，不會切掉畫面。
  const resized = sharp(buffer).resize(spec.width, spec.height, { fit: "fill" });
  if (spec.format === "png") {
    const out = await resized.png({ compressionLevel: 9 }).toBuffer();
    if (!spec.maxBytes || out.length <= spec.maxBytes) return { ok: true, buffer: out, bytes: out.length };
    // 規格指定 PNG 又有上限（例如 LINE 錢包蓋板 600KB）：改用調色盤量化逐步壓，不改尺寸。
    for (const colours of [256, 192, 128, 96, 64]) {
      const q = await sharp(buffer).resize(spec.width, spec.height, { fit: "fill" })
        .png({ palette: true, colours, quality: 90, effort: 10, compressionLevel: 9, dither: 1 }).toBuffer();
      if (q.length <= spec.maxBytes) return { ok: true, buffer: q, bytes: q.length };
    }
    return { ok: false, reason: `PNG 量化到 64 色仍超過 ${Math.round(spec.maxBytes / 1024)}KB 上限` };
  }
  for (const q of [90, 82, 74, 66, 58, 50]) {
    const out = await sharp(buffer).resize(spec.width, spec.height, { fit: "fill" }).jpeg({ quality: q, mozjpeg: true }).toBuffer();
    if (!spec.maxBytes || out.length <= spec.maxBytes) return { ok: true, buffer: out, bytes: out.length };
  }
  return { ok: false, reason: `壓到品質 50 仍超過 ${Math.round((spec.maxBytes ?? 0) / 1024)}KB 上限` };
}

async function saveFinal(buf: Buffer, spec: PlatformImageSpec): Promise<string> {
  const ext = spec.format === "png" ? "png" : "jpg";
  const name = `imgcard-${spec.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  return await getMediaStore().put(name, buf, coverContentType(name));
}

/**
 * 帶標題的成品圖（2026-10-04 CJ「圖文搭配預覽，並且一起排程」）。標題是前台疊上去的
 * （AI 圖不烤字），排程／發布要用的卻是伺服器上的檔案——所以前台把疊好標題的畫布傳上來，
 * 這裡確認它就是這張卡的交付像素，再依規格轉檔存檔。不符尺寸一律拒收，不縮放、不裁切。
 */
export async function saveTitledImage(dataUrl: string, spec: PlatformImageSpec): Promise<
  { ok: true; url: string; bytes: number } | { ok: false; reason: string }
> {
  const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return { ok: false, reason: "帶標題的圖片格式不正確" };
  const buffer = Buffer.from(m[2]!, "base64");
  const sharp = (await import("sharp")).default;
  const meta = await sharp(buffer).metadata().catch(() => null);
  if (!meta?.width || !meta.height) return { ok: false, reason: "讀不到帶標題圖片的尺寸" };
  if (meta.width !== spec.width || meta.height !== spec.height) {
    return { ok: false, reason: `帶標題的圖片是 ${meta.width}×${meta.height}，不是這張卡的 ${spec.width}×${spec.height}` };
  }
  // 已經是交付尺寸：只做轉檔與檔案上限（合成版型也一樣，這時不再走「方形主體」那條路）。
  const fin = await finalizeToSpec(buffer, { ...spec, compose: undefined });
  if (!fin.ok) return fin;
  return { ok: true, url: await saveFinal(fin.buffer, spec), bytes: fin.bytes };
}

/**
 * 原圖直接用（2026-10-04 CJ「上傳了照片，還是沒用到，也是自己合成新的圖」）：不經 AI，把用戶自己的照片
 * 放進這張卡的畫布。cover＝填滿（會裁掉超出的邊，置中）；contain＝完整保留（照片置中，
 * 四周用同一張照片放大糊化的底補滿）。標題一樣是前台疊層。
 */
export async function fitPhotoToCard(args: {
  buffer: Buffer;
  spec: PlatformImageSpec;
  fit: "cover" | "contain";
}): Promise<{ ok: true; url: string; bytes: number } | { ok: false; reason: string }> {
  const sharp = (await import("sharp")).default;
  const { spec } = args;
  const W = spec.width, H = spec.height;
  let canvas: Buffer;
  try {
    if (args.fit === "cover") {
      canvas = await sharp(args.buffer).rotate().resize(W, H, { fit: "cover", position: "centre" }).png().toBuffer();
    } else {
      const bg = await sharp(args.buffer).rotate().resize(W, H, { fit: "cover" }).blur(40).modulate({ brightness: 0.75 }).png().toBuffer();
      const fg = await sharp(args.buffer).rotate().resize(W, H, { fit: "inside" }).png().toBuffer();
      canvas = await sharp(bg).composite([{ input: fg, gravity: "centre" }]).png().toBuffer();
    }
  } catch {
    return { ok: false, reason: "這張照片讀不出來，請換一張（PNG／JPG／WebP）。" };
  }
  // 已經是交付尺寸：只做轉檔與檔案上限。
  const fin = await finalizeToSpec(canvas, { ...spec, compose: undefined });
  if (!fin.ok) return fin;
  return { ok: true, url: await saveFinal(fin.buffer, spec), bytes: fin.bytes };
}

/** 純色／雙色漸層底（不經 AI）：換底圖的選項之一，純文字的輪播頁最適合。 */
export async function solidBackgroundForCard(args: {
  spec: PlatformImageSpec;
  color: string;
  color2?: string;
}): Promise<{ ok: true; url: string; bytes: number } | { ok: false; reason: string }> {
  const hex = /^#[0-9a-fA-F]{6}$/;
  if (!hex.test(args.color) || (args.color2 && !hex.test(args.color2))) return { ok: false, reason: "顏色格式不正確。" };
  const { spec } = args;
  const fill = args.color2
    ? `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${args.color}"/><stop offset="1" stop-color="${args.color2}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>`
    : `<rect width="100%" height="100%" fill="${args.color}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.width}" height="${spec.height}">${fill}</svg>`;
  const sharp = (await import("sharp")).default;
  const canvas = await sharp(Buffer.from(svg)).png().toBuffer();
  const fin = await finalizeToSpec(canvas, { ...spec, compose: undefined });
  if (!fin.ok) return fin;
  return { ok: true, url: await saveFinal(fin.buffer, spec), bytes: fin.bytes };
}

/** 一次最多帶幾張風格參考圖（再多模型也分不清每張要學什麼，時間與費用也跟著漲）。 */
export const MAX_STYLE_REFS = 3;

export async function renderImageCard(args: {
  spec: PlatformImageSpec;
  scenePromptEn: string;
  brand: BrandVisualContext;
  brandId: number;
  modelChoice?: string;
  productImageUrl?: string;
  /** 上一版（對話修改）或來源圖（延伸尺寸）。只接受本站產出的圖。 */
  referenceImageUrl?: string;
  /** previous＝同一張的上一版（預設）；style＝整組的第 1 張，只借風格、畫面另外寫。 */
  referenceMode?: "previous" | "style" | "restyle";
  instruction?: string;
  styleId?: string;
  /** 用戶上傳的風格參考圖（只學畫風，不照抄內容）；最多 MAX_STYLE_REFS 張。 */
  styleReferenceUrls?: string[];
}): Promise<RenderOutcome> {
  const modelId = resolveStillImageModel(args.modelChoice);
  const gen = generationSize(args.spec);
  const nano = nanoRatioFor(gen.width, gen.height);
  if (modelId === NANO_BANANA && !nano) {
    return {
      status: "failed", modelId, failureKind: "model_unsupported",
      errorMsg: `Nano Banana 沒有 ${gen.width}×${gen.height} 這個比例，無法在生成時鎖定尺寸。這張卡請用 GPT Image 2。`,
    };
  }
  const { w, h } = gptSizeFor(gen.width, gen.height);
  // 參考圖只能帶一張：有上一版就用上一版（它已經含產品），否則用產品照。
  const imageUrl = args.referenceImageUrl ?? args.productImageUrl;
  // 風格參考圖是另外幾張，排在後面；每張代表什麼由 prompt 說明。
  const styleRefs = (args.styleReferenceUrls ?? []).filter(Boolean).slice(0, MAX_STYLE_REFS);
  const prompt = buildImageCardPrompt({
    spec: args.spec,
    scenePromptEn: args.scenePromptEn,
    brand: args.brand,
    withProduct: !!args.productImageUrl,
    reference: args.referenceImageUrl ? (args.referenceMode ?? "previous") : null,
    instruction: args.instruction,
    styleId: args.styleId,
    styleRefCount: styleRefs.length,
  });
  const outcome = await generateStillImage(modelId, {
    prompt,
    size: `${w}x${h}`,
    aspectRatio: nano ?? undefined,
    strictAspect: true,
    imageUrl,
    extraImageUrls: styleRefs.length ? styleRefs : undefined,
    brandId: args.brandId,
  }, { attemptTimeoutMs: 120_000 });

  if (outcome.status !== "ready" || !outcome.url) {
    return {
      status: "failed", modelId, errorMsg: outcome.errorMsg, failureKind: outcome.failureKind,
      ...(outcome.canSwitchTo === "nano-banana" && nano ? { canSwitchTo: "nano-banana" as const } : {}),
    };
  }
  const { buffer } = await fetchImageBuffer(outcome.url, { timeoutMs: 30_000 });
  const fin = await finalizeToSpec(buffer, args.spec);
  if (!fin.ok) return { status: "failed", modelId, failureKind: "ratio_mismatch", errorMsg: fin.reason };
  return {
    status: "ready", modelId, url: await saveFinal(fin.buffer, args.spec),
    width: args.spec.width, height: args.spec.height, bytes: fin.bytes,
  };
}


// ── 整組（輪播／相簿）：依文案結構逐張規劃 ──────────────────────────────

export interface SeriesSlide {
  /** 這張在整組裡的角色：封面／重點／結尾（給人看的一個詞）。 */
  roleZh: string;
  /** 圖上標題（會疊在圖上，不是 AI 畫的）。 */
  titleZh: string;
  /** 這張畫什麼（給人看的說明）。 */
  sceneZh: string;
  /** 給圖片模型的英文場景描述。 */
  promptEn: string;
}

export const MAX_SERIES = 10;

export function seriesSystemPrompt(spec: PlatformImageSpec, count: number, withProduct: boolean): string {
  return `你是社群內容的資深美術指導。使用者貼了一段文案，要把它做成一組 ${count} 張的「${spec.labelZh}」（${spec.width}×${spec.height}），而且已經選定了整組的視覺方向。
請「依文案的結構」把內容拆成恰好 ${count} 張，每張只講一件事：
- 第 1 張＝封面：用最能讓人停下來的那句話／概念。
- 中間幾張＝依文案原本的順序，一張一個重點（不要自己編文案沒有的事實、數字、人名）。
- 最後 1 張＝收尾：結論、行動呼籲或情緒收束。
${count === 2 ? "（只有 2 張時：封面＋收尾。）" : ""}
每張輸出：
- roleZh：角色，2–4 字（封面／重點一／重點二…／收尾）
- titleZh：圖上標題 6–14 字，從文案濃縮；標題之間要接得起來、不重複
- sceneZh：這張的畫面 30–60 字，讓不懂攝影的人看得懂
- promptEn：給圖片模型的英文場景描述 50–110 字。每張的畫面都要不同，但共用方向的色調、光線與質感；必須符合構圖規則：${spec.compositionEn}
${withProduct ? "使用者附上了一張真實照片（會一起給你看）：只有第 1 張會直接帶入這個主體，第 1 張要以它為主角；其餘張的 promptEn 不要重新描述主體外觀，需要出現時寫「the same subject as in the reference」。" : ""}
規則：畫面裡不能有任何文字、招牌字、logo 字樣；不要提到競品品牌。
只輸出 JSON：{"slides":[{"roleZh":"...","titleZh":"...","sceneZh":"...","promptEn":"..."}]}`;
}

/** 把 LLM 回覆整理成恰好 count 張；缺欄位的張直接丟掉，數量對不上就回空（由呼叫端報錯，不補假內容）。 */
export function normalizeSeriesSlides(raw: any, count: number): SeriesSlide[] {
  const list: any[] = Array.isArray(raw?.slides) ? raw.slides : [];
  const slides = list
    .map((d) => ({
      roleZh: clip(d?.roleZh ?? d?.role, 8),
      titleZh: clip(d?.titleZh ?? d?.title, 24),
      sceneZh: clip(d?.sceneZh ?? d?.scene, 160),
      promptEn: clip(d?.promptEn ?? d?.prompt, 1500),
    }))
    .filter((d) => d.titleZh && d.sceneZh && d.promptEn);
  return slides.length >= count ? slides.slice(0, count) : [];
}

export async function planSeriesSlides(args: {
  spec: PlatformImageSpec;
  copy: string;
  count: number;
  direction: { titleZh: string; sceneZh: string; paletteZh: string; promptEn: string };
  brand: BrandVisualContext;
  productName?: string;
  brainPrefix?: string;
  subjectImageDataUrl?: string;
}): Promise<SeriesSlide[]> {
  const { invokeLLM } = await import("../../../platform/core/llm/llm");
  const brain = args.brainPrefix?.trim() ? `品牌大腦（標題的用詞、語氣與畫面方向都要符合）：${args.brainPrefix}

` : "";
  const d = args.direction;
  const user = `${brain}品牌資訊：
${brandBlock(args.brand) || "（尚未設定）"}

${args.productName ? `產品：${args.productName}

` : ""}`
    + `已選定的整組方向：${d.titleZh}
畫面：${d.sceneZh}
色調：${d.paletteZh}
風格 prompt：${d.promptEn}

文案：
${args.copy}`;
  const res = await invokeLLM({
    messages: [
      { role: "system", content: seriesSystemPrompt(args.spec, args.count, !!args.productName || !!args.subjectImageDataUrl) },
      { role: "user", content: withSubjectImage(user, args.subjectImageDataUrl) },
    ],
    maxTokens: 400 + args.count * 450,
  });
  const slides = normalizeSeriesSlides(parseJsonLoose(res.choices?.[0]?.message?.content as any), args.count);
  if (!slides.length) throw new Error(`AI 沒有規劃出 ${args.count} 張可用的內容，請再試一次。`);
  return slides;
}
