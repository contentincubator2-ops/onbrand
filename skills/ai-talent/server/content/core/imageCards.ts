/**
 * 圖片任務卡的三個步驟（2026-09-29 CJ「圖片獨立成任務卡」）：
 *   1. proposeImageDirections —— 先用文字提 3 個畫面方向（便宜、幾秒），用戶選了才生圖。
 *   2. renderImageCard        —— 依卡片規格生成；也負責「對話修改」與「延伸成其他尺寸」
 *                                （都是拿上一張當參考圖，在新規格的原生比例下重新生成）。
 *   3. 標題不烤進圖：AI 圖一律無字，標題由前台疊層，用戶可直接改。
 *
 * 比例鐵律見 platformImageSpecs.ts：生成當下鎖死，事後只等比縮放，比例不符就算失敗。
 */

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import {
  type PlatformImageSpec,
  canvasPromptBlock,
  generationSize,
  gptSizeFor,
  nanoRatioFor,
  ratioError,
  RATIO_TOLERANCE,
} from "./platformImageSpecs";
import { generateStillImage, resolveStillImageModel, NANO_BANANA, type StillImageModelId } from "./stillImageModels";
import {
  NO_TEXT_PROMPT_BLOCK,
  NO_MIRROR_PROMPT_BLOCK,
  PRODUCT_FAITHFUL_PROMPT_BLOCK,
  type BrandVisualContext,
} from "./imageGen";
import { fetchImageBuffer } from "./imageFetch";
import type { ImageFailureKind } from "./stillImageModels";

export interface ImageDirection {
  id: string;
  titleZh: string;
  sceneZh: string;
  paletteZh: string;
  whyZh: string;
  promptEn: string;
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

export function directionsSystemPrompt(spec: PlatformImageSpec, withProduct: boolean): string {
  return `你是資深商業攝影美術指導。使用者貼了一段社群文案，要做一張「${spec.labelZh}」（${spec.width}×${spec.height}）。
先不要生圖——提出 3 個截然不同的畫面方向讓使用者挑（場景、構圖、光線、情緒要真的不同，不能只換顏色）。

每個方向：
- titleZh：方向名稱 4–8 字
- sceneZh：畫面描述 40–80 字，讓不懂攝影的人一看就懂會拍出什麼
- paletteZh：色調一句話（優先用品牌色）
- whyZh：為什麼適合這篇文案 20–40 字
- promptEn：給圖片模型的英文場景描述 60–120 字（主體、環境、光線、鏡頭、情緒），必須符合這張卡的構圖規則：${spec.compositionEn}
${spec.compose ? "- 這是細長 Banner 的方形主體圖：promptEn 只描述單一主體，放在一整片純色背景上（不要場景、桌面、窗戶、地平線），四周留白。\n" : ""}${withProduct ? "- 使用者會附上真實產品照：promptEn 只描述產品以外的場景、光線、擺放位置，不要重新描述或改寫產品外觀。\n" : ""}
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
}): Promise<ProposeResult> {
  const { invokeLLM } = await import("../../platform/core/llm");
  const brain = args.brainPrefix?.trim() ? `品牌大腦（標題的用詞、語氣與畫面方向都要符合）：${args.brainPrefix}\n\n` : "";
  const user = `${brain}品牌資訊：\n${brandBlock(args.brand) || "（尚未設定）"}\n\n${args.productName ? `產品：${args.productName}\n\n` : ""}文案：\n${args.copy}`;
  const res = await invokeLLM({
    messages: [
      { role: "system", content: directionsSystemPrompt(args.spec, !!args.productName) },
      { role: "user", content: user },
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
  reference?: "previous" | null;
  instruction?: string;
}): string {
  const lines: string[] = [];
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

const COVERS_DIR = process.env.COVERS_DIR ?? "/opt/onbrand/covers";
const COVERS_URL_PREFIX = process.env.COVERS_URL_PREFIX ?? "/static/covers";

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
    if (spec.maxBytes && out.length > spec.maxBytes) return { ok: false, reason: "PNG 超過檔案上限" };
    return { ok: true, buffer: out, bytes: out.length };
  }
  for (const q of [90, 82, 74, 66, 58, 50]) {
    const out = await sharp(buffer).resize(spec.width, spec.height, { fit: "fill" }).jpeg({ quality: q, mozjpeg: true }).toBuffer();
    if (!spec.maxBytes || out.length <= spec.maxBytes) return { ok: true, buffer: out, bytes: out.length };
  }
  return { ok: false, reason: `壓到品質 50 仍超過 ${Math.round((spec.maxBytes ?? 0) / 1024)}KB 上限` };
}

function saveFinal(buf: Buffer, spec: PlatformImageSpec): string {
  mkdirSync(COVERS_DIR, { recursive: true });
  const ext = spec.format === "png" ? "png" : "jpg";
  const name = `imgcard-${spec.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  writeFileSync(join(COVERS_DIR, name), buf);
  return `${COVERS_URL_PREFIX}/${name}`;
}

export async function renderImageCard(args: {
  spec: PlatformImageSpec;
  scenePromptEn: string;
  brand: BrandVisualContext;
  brandId: number;
  modelChoice?: string;
  productImageUrl?: string;
  /** 上一版（對話修改）或來源圖（延伸尺寸）。只接受本站產出的圖。 */
  referenceImageUrl?: string;
  instruction?: string;
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
  const prompt = buildImageCardPrompt({
    spec: args.spec,
    scenePromptEn: args.scenePromptEn,
    brand: args.brand,
    withProduct: !!args.productImageUrl,
    reference: args.referenceImageUrl ? "previous" : null,
    instruction: args.instruction,
  });
  const outcome = await generateStillImage(modelId, {
    prompt,
    size: `${w}x${h}`,
    aspectRatio: nano ?? undefined,
    strictAspect: true,
    imageUrl,
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
    status: "ready", modelId, url: saveFinal(fin.buffer, args.spec),
    width: args.spec.width, height: args.spec.height, bytes: fin.bytes,
  };
}
