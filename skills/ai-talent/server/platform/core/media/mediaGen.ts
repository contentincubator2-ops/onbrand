/**
 * mediaGen — provider adapters for the 3-step media flow's Step 3.
 *
 * Adapters: OpenAI gpt-image-2, Google Nano Banana, and PiAPI Kling try-on
 * (garment on a model — a separate feature, not a picker option).
 * Each adapter takes (prompt, options) and returns a normalized result:
 *   { url?, b64?, taskId?, status: "ready"|"submitted"|"failed", errorMsg? }
 *
 * All providers are sync image providers and return ready inline（影片生成 2026-09-08 移除）.
 *
 * Generated assets are persisted through mediaStore (local covers or Azure Blob).
 *
 * NOTE: default changed from /opt/marketing-os/covers → /opt/onbrand/covers
 * on 2026-05-28 to reflect infra rename. Set COVERS_DIR env var to override.
 */

import { readFile } from "node:fs/promises";
import { coverContentType, getMediaStore } from "./mediaStore";
import { join } from "path";
import { fetchImageBuffer } from "./imageFetch";

const COVERS_DIR = process.env.COVERS_DIR ?? "/opt/onbrand/covers";
const COVERS_URL_PREFIX = process.env.COVERS_URL_PREFIX ?? "/static/covers";

function redactProviderSecrets(text: string): string {
  return String(text)
    .replace(/api_key:[A-Za-z0-9_\-]+/g, "api_key:[REDACTED]")
    .replace(/key=([A-Za-z0-9_\-]+)/g, "key=[REDACTED]")
    .replace(/AIza[0-9A-Za-z_\-]{20,}/g, "[REDACTED_GOOGLE_KEY]");
}

function googleApiKeyPool(): string[] {
  const raw = [
    ...(process.env.GEMINI_API_KEY_POOL ?? "").split(","),
    process.env.GEMINI_API_KEY ?? "",
    process.env.GOOGLE_AI_API_KEY ?? "",
    process.env.GOOGLE_API_KEY ?? "",
  ];
  return Array.from(new Set(raw.map((s) => s.trim()).filter(Boolean)));
}

function isRetryableGoogleKeyError(text: string): boolean {
  return /suspended|permission_denied|api[_ ]key|consumer|unauthorized|forbidden|403|429|rate.?limit|quota|resource_exhausted/i.test(text);
}

export type GenStatus = "ready" | "submitted" | "failed";

export interface GenResult {
  status: GenStatus;
  modelId: string;
  url?: string;
  b64?: string;
  taskId?: string;
  errorMsg?: string;
  meta?: Record<string, any>;
}

export interface GenOptions {
  prompt: string;
  /** Aspect ratio hint — provider-specific mapping. */
  aspectRatio?: "1:1" | "4:3" | "3:4" | "16:9" | "9:16" | "2:3" | "3:2" | "4:5" | "5:4" | "21:9";
  /** Image size when provider supports explicit pixels. gpt-image-2 accepts any
   *  WxH (multiples of 16, ratio 1:3–3:1) — see platformImageSpecs.gptSizeFor. */
  size?: "1024x1024" | "1024x1536" | "1536x1024" | "1024x1792" | "1792x1024" | `${number}x${number}`;
  /**
   * 2026-09-29 圖片任務卡：比例必須在生成當下鎖死（CJ「不能生成後再裁」）。
   * true 時 Nano Banana 會把 aspectRatio 放進 generationConfig.imageConfig（原生比例），
   * 而不只是 prompt 裡的一句提示。
   */
  strictAspect?: boolean;
  /** For i2v: source image URL. Also doubles as the MODEL/person photo for
   *  garment try-on (piapi/kling-try-on) — see garmentImageUrl below. */
  imageUrl?: string;
  /**
   * 2026-09-10（CJ「model 跟衣服要分開的」）：服飾上身用——衣服的照片，跟
   * 上面 imageUrl（真人模特照）是兩張分開的圖，不是同一張裁出來的。
   * 只有 piapi/kling-try-on 用得到。
   */
  garmentImageUrl?: string;
  /** 這件衣服要套在 model_input 的哪個部位。預設 "dress"（單件連身/上下合一）。
   *  Kling 的 API 規則：dress_input 不能跟 upper_input/lower_input 混用。 */
  garmentSlot?: "dress" | "upper" | "lower";
  /** Quality / detail level (provider-dependent). */
  quality?: "low" | "medium" | "high";
  /** Brand id — used for filename + audit. */
  brandId?: number | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────
/** covers URL → 磁碟路徑（只認自己產的 URL，其他回 null）。 */
export function coverFilePath(url: string): string | null {
  if (!url.startsWith(COVERS_URL_PREFIX + "/")) return null;
  const name = url.slice(COVERS_URL_PREFIX.length + 1);
  return /^[\w.-]+$/.test(name) && name !== "." && name !== ".." ? join(COVERS_DIR, name) : null;
}

/** 先讀目前的 store；舊的相對路徑仍可退回本機 covers。 */
export async function readCoverBytes(url: string): Promise<Buffer | null> {
  const bytes = await getMediaStore().get(url);
  if (bytes !== null) return bytes;
  const file = coverFilePath(url);
  if (!file) return null;
  try {
    return await readFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** 把已處理好的位元組存進 covers，回傳公開 URL。 */
export async function saveCoverFile(buf: Buffer, name: string): Promise<string> {
  return await getMediaStore().put(name, buf, coverContentType(name));
}

async function saveB64(b64: string, kind: "img" | "vid"): Promise<string> {
  const ext = kind === "img" ? "png" : "mp4";
  const id = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return await saveCoverFile(Buffer.from(b64, "base64"), `media-${id}.${ext}`);
}

async function downloadAndSave(url: string, kind: "img" | "vid"): Promise<string> {
  const ext = kind === "img" ? "png" : "mp4";
  const id  = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let buf: Buffer;
  if (kind === "img") {
    // Provider result URLs can expire into an HTML landing page just like
    // product URLs. Validate bytes before persisting a success-shaped .png.
    ({ buffer: buf } = await fetchImageBuffer(url, { timeoutMs: 60_000 }));
  } else {
    const resp = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!resp.ok) throw new Error(`download ${resp.status}`);
    buf = Buffer.from(await resp.arrayBuffer());
  }
  return await saveCoverFile(buf, `media-${id}.${ext}`);
}

function sizeForAspectRatio(opts: GenOptions): NonNullable<GenOptions["size"]> {
  if (opts.size) return opts.size;
  if (opts.aspectRatio === "16:9" || opts.aspectRatio === "4:3") return "1536x1024";
  if (opts.aspectRatio === "9:16" || opts.aspectRatio === "3:4") return "1024x1536";
  return "1024x1024";
}

// ── 1. OpenAI gpt-image-2 ────────────────────────────────────────────────
// 2026-09-01 (CJ「open ai 我指定使用 gpt image 2」): gpt-image-2 is the
// designated OpenAI image model. 2026-09-21: it is now the ONLY OpenAI image
// model here — gpt-image-1 was slower (58s vs 24s on the same photo),
// ~9x the tokens, and garbled the label text.
const OPENAI_IMAGE_MODEL = "gpt-image-2";

async function genOpenAIImage(opts: GenOptions): Promise<GenResult> {
  const model = OPENAI_IMAGE_MODEL;
  const key = process.env.OPENAI_API_KEY ?? "";
  if (!key) throw new Error("OPENAI_API_KEY missing");
  // Derive an OpenAI-supported size from the aspect ratio when an explicit
  // size isn't given (the orchestra passes aspectRatio, not size). Without
  // this a 16:9 thumbnail would default to a 1024x1024 square.
  const size = sizeForAspectRatio(opts);
  // 2026-09-21（CJ「不論是否有產品圖，都只用 gpt image 2 生成」）：有參考圖（產品照）就走
  // /images/edits，沒有才是 /images/generations。dev VM 上用同一張香水瓶照片實測過：
  // gpt-image-2 編輯端點 24 秒、標籤文字完整；不吃 input_fidelity（400），也不需要。
  if (opts.imageUrl) return genOpenAIImageEdit(opts, key, size);
  const resp = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: opts.prompt,
      size,
      // 2026-09-01: do NOT default this to "high". Measured on the prod key,
      // gpt-image-2 at 1536x1024 takes 73.8s with quality=high and 14.1s with
      // the parameter omitted — and the omitted-quality image comes back
      // LARGER (1.40M vs 1.32M b64). "high" was 5x slower for a smaller
      // result, and it blew genOneImage's 35s cap, so every task pinned to
      // openai/gpt-image-2 silently fell back to Flux Schnell. Send quality
      // only when a caller asks for a specific one.
      ...(opts.quality ? { quality: opts.quality } : {}),
      n: 1,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data: any = await resp.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI no b64");
  return { status: "ready", modelId: `openai/${model}`, url: await saveB64(b64, "img") };
}

/**
 * 帶參考圖的 gpt-image-2：multipart 送 /v1/images/edits，`image[]` 放產品照。
 * 照片先縮到最長邊 2048（用戶上傳最大 15MB，token 與時間都跟圖片大小成正比）；
 * sharp 處理不了就送原始位元組，不因為縮圖失敗而讓整張圖失敗。
 * 不送 quality（實測 high 慢 5 倍且沒更好，見 genOpenAIImage 的說明）、不送
 * input_fidelity（gpt-image-2 回 400 不支援）。
 */
async function genOpenAIImageEdit(opts: GenOptions, key: string, size: string): Promise<GenResult> {
  const { buffer, mime } = await fetchImageBuffer(opts.imageUrl!, { timeoutMs: 30_000 });
  let bytes: Buffer = buffer;
  let type = mime;
  try {
    const sharp = (await import("sharp")).default;
    bytes = await sharp(buffer).rotate().resize(2048, 2048, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
    type = "image/png";
  } catch { /* 保留原始位元組 */ }

  const form = new FormData();
  form.append("model", OPENAI_IMAGE_MODEL);
  form.append("prompt", opts.prompt);
  form.append("size", size);
  form.append("n", "1");
  if (opts.quality) form.append("quality", opts.quality);
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  form.append("image[]", new Blob([new Uint8Array(bytes)], { type }), `reference.${ext}`);

  const resp = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(180_000),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data: any = await resp.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI no b64");
  return { status: "ready", modelId: `openai/${OPENAI_IMAGE_MODEL}`, url: await saveB64(b64, "img") };
}

// ── 2.5 Google Gemini 2.5 Flash Image（Nano Banana）— image edit / subject
// reference. 2026-07-25 (CJ「合成 IRIS 真實產品」product-faithful gen):
// takes the REAL product photo via opts.imageUrl and composites it into
// the prompted scene while preserving the product exactly (the quality
async function genNanoBanana(opts: GenOptions): Promise<GenResult> {
  const keys = googleApiKeyPool();
  if (!keys.length) throw new Error("GEMINI_API_KEY missing");
  const model = process.env.NANO_BANANA_MODEL ?? "gemini-2.5-flash-image";

  const parts: any[] = [];
  if (opts.imageUrl) {
    const { buffer, mime } = await fetchImageBuffer(opts.imageUrl, { timeoutMs: 30_000 });
    const b64 = buffer.toString("base64");
    parts.push({ inline_data: { mime_type: mime, data: b64 } });
  }
  // Aspect-ratio hint goes in-prompt — flash-image has no size parameter.
  const arHint = opts.aspectRatio ? `

Output aspect ratio: ${opts.aspectRatio}.` : "";
  parts.push({ text: `${opts.prompt}${arHint}` });

  const errors: string[] = [];
  for (const key of keys) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          ...(opts.strictAspect && opts.aspectRatio ? { imageConfig: { aspectRatio: opts.aspectRatio } } : {}),
        },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!resp.ok) {
      const t = redactProviderSecrets(await resp.text());
      errors.push(`NanoBanana ${resp.status}: ${t.slice(0, 200)}`);
      if (isRetryableGoogleKeyError(t)) continue;
      break;
    }
    const data: any = await resp.json();
    const outParts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
    const imgPart = outParts.find((p) => p?.inlineData?.data || p?.inline_data?.data);
    const b64out = imgPart?.inlineData?.data ?? imgPart?.inline_data?.data;
    if (!b64out) {
      const finish = data?.candidates?.[0]?.finishReason ?? "no image part";
      throw new Error(`NanoBanana no image (${finish})`);
    }
    return { status: "ready", modelId: "google/nano-banana", url: await saveB64(b64out, "img") };
  }
  throw new Error(errors.join("\n") || "NanoBanana failed");
}

// ── 3. PiAPI — garment try-on only ─
//
// PiAPI exposes one POST /api/v1/task endpoint that takes {model, task_type, input}
// and returns {data: {task_id, status}}. We poll GET /api/v1/task/{task_id} until
// status === "completed" (or "failed"). Auth via x-api-key header.
//
// Image task_types finish in seconds (we await in-line). 2026-09-08：影片模型
// （Kling／Runway／Pika／Hedra）隨影片生成功能移除。2026-09-21：Flux／Ideogram／SDXL
// 隨「只留 gpt-image-2 + Nano Banana」移除；這裡只剩服飾上身（不是一般生圖選項）。
const PIAPI_BASE = process.env.PIAPI_BASE_URL ?? "https://api.piapi.ai/api/v1";

interface PiapiSpec {
  /** PiAPI "model" field (vendor namespace). */
  model: string;
  /** PiAPI "task_type" field (operation within vendor). */
  task_type: string;
  /** Output is sync (image) — adapter waits inline; or async (video) — returns submitted. */
  sync: boolean;
  /** Build the input object from GenOptions. */
  buildInput: (opts: GenOptions) => Record<string, any>;
}

const PIAPI_MAP: Record<string, PiapiSpec> = {
  /**
   * 2026-09-10（CJ「model 跟衣服要分開的」，避開產品變形計畫的服飾分支）：
   * 服飾上身——衣服（garmentImageUrl）跟真人模特（imageUrl）是兩張分開的圖，
   * 各自的像素都不重畫，Kling 只負責「把這件衣服穿到這個人身上」這個合成
   * 動作。這是原本 2026-07-24 決議裡「Phase 2b：PiAPI Kling AI Try-On」，
   * 之前沒有真的接上；同一批 2026-09-08 影片生成清理只刪了 Kling 的
   * 「文字/圖片生片」task_type，這支圖片級 API 是分開的端點，沒有被動到。
   *
   * 一般產品照的場景圖走 gpt-image-2 的圖片編輯（2026-09-21 起，去背合成那套已移除）；
   * 這支是「衣服穿到人身上，衣服與人的像素個別由 Kling 處理」——服飾上身這個動作
   * 本身必然是生成式的，保真的重點在「別把兩者的身份互相污染」（衣服不能被套錯版型、
   * 人不能被換臉），不是像素級不變形。
   *
   * $0.07/張（PiAPI 官網報價，2026-09 查證）。API 規則：dress_input 跟
   * upper_input/lower_input 不能同時給，所以 buildInput 只送一種。
   */
  "piapi/kling-try-on": {
    model: "kling",
    task_type: "ai_try_on",
    sync: true,
    buildInput: (o) => {
      if (!o.imageUrl) throw new Error("piapi/kling-try-on: 缺少 model_input（真人模特照）");
      if (!o.garmentImageUrl) throw new Error("piapi/kling-try-on: 缺少衣服照片（garmentImageUrl）");
      const slot = o.garmentSlot ?? "dress";
      const garmentField = slot === "upper" ? "upper_input" : slot === "lower" ? "lower_input" : "dress_input";
      return { model_input: o.imageUrl, [garmentField]: o.garmentImageUrl, batch_size: 1 };
    },
  },
};

async function piapiSubmit(modelId: string, opts: GenOptions): Promise<{ taskId: string }> {
  const key = process.env.PIAPI_KEY ?? process.env.PIAPI_API_KEY ?? "";
  if (!key) throw new Error("PIAPI_KEY missing");
  const spec = PIAPI_MAP[modelId];
  if (!spec) throw new Error(`PiAPI: unknown modelId ${modelId}`);
  const requestBody = { model: spec.model, task_type: spec.task_type, input: spec.buildInput(opts) };
  const resp = await fetch(`${PIAPI_BASE}/task`, {
    method: "POST",
    headers: { "x-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) {
    const t = await resp.text();
    // 2026-05-12: full body + tagged hint for common 400 causes
    console.error(`[piapi] submit ${resp.status} for ${modelId}. body=${t.slice(0, 800)}`);
    let hint = "";
    if (/content[_ ]policy|nsfw|violat/i.test(t)) hint = "（內容政策觸發 — 試著移除涉及人物特寫 / 敏感詞）";
    else if (/credit|quota|balance/i.test(t)) hint = "（PiAPI 帳號額度不足）";
    else if (/rate.?limit|429/i.test(t)) hint = "（PiAPI 速率限制 — 等 30 秒再試）";
    else if (/invalid.*key|unauthorized/i.test(t)) hint = "（PiAPI 金鑰失效）";
    throw new Error(`PiAPI submit ${resp.status}${hint}: ${t.slice(0, 500)}`);
  }
  const data: any = await resp.json();
  // 2026-05-12: PiAPI can return code: 200 with HTTP 200 but data with code != 200
  // OR HTTP 200 with empty task_id (the "code:400 in 200" pattern seen in
  // earlier failed rows). Treat both as failure with explicit body.
  const innerCode = data?.code;
  const taskId = data?.data?.task_id ?? data?.task_id;
  if (innerCode && innerCode !== 200) {
    const msg = data?.message ?? data?.data?.error ?? JSON.stringify(data).slice(0, 400);
    throw new Error(`PiAPI inner ${innerCode}: ${msg}`);
  }
  if (!taskId) {
    throw new Error(`PiAPI: no task_id. response=${JSON.stringify(data).slice(0, 400)}`);
  }
  return { taskId };
}

async function piapiPoll(modelId: string, taskId: string): Promise<GenResult> {
  const key = process.env.PIAPI_KEY ?? process.env.PIAPI_API_KEY ?? "";
  if (!key) throw new Error("PIAPI_KEY missing");
  const resp = await fetch(`${PIAPI_BASE}/task/${taskId}`, {
    headers: { "x-api-key": key },
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`PiAPI poll ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data: any = await resp.json();
  const inner = data?.data ?? data;
  const status = String(inner?.status ?? "").toLowerCase();
  if (status === "completed" || status === "success") {
    // Output shape varies — try common keys
    const out = inner?.output ?? inner?.result ?? {};
    const remoteUrl =
      out?.image_url ?? out?.image?.url ??
      out?.video_url ?? out?.video?.url ??
      (Array.isArray(out?.images) ? out.images[0]?.url ?? out.images[0] : null) ??
      (Array.isArray(out?.videos) ? out.videos[0]?.url ?? out.videos[0] : null) ??
      out?.url;
    if (!remoteUrl) {
      return { status: "failed", modelId, taskId, errorMsg: `PiAPI: no output url. body=${JSON.stringify(inner).slice(0, 200)}` };
    }
    const localUrl = await downloadAndSave(remoteUrl, "img");
    return { status: "ready", modelId, url: localUrl, taskId, meta: { remoteUrl } };
  }
  if (status === "failed" || status === "error") {
    return { status: "failed", modelId, taskId, errorMsg: inner?.error?.message ?? inner?.error ?? "PiAPI task failed" };
  }
  return { status: "submitted", modelId, taskId, meta: { progressStatus: status } };
}

/** Sync image: submit + inline-poll up to 120s. */
async function genPiapi(modelId: string, opts: GenOptions): Promise<GenResult> {
  const spec = PIAPI_MAP[modelId];
  if (!spec) return { status: "failed", modelId, errorMsg: `PiAPI: unknown modelId ${modelId}` };
  const { taskId } = await piapiSubmit(modelId, opts);
  if (!spec.sync) return { status: "submitted", modelId, taskId, meta: { provider: "piapi" } };
  // Inline-poll for sync image. Tightened to 1s for orchestra responsiveness
  // (image gen finishes in 5–15s; coarser intervals waste 20s budget).
  const start = Date.now();
  while (Date.now() - start < 120_000) {
    await new Promise((r) => setTimeout(r, 1000));
    const r = await piapiPoll(modelId, taskId);
    if (r.status !== "submitted") return r;
  }
  return { status: "failed", modelId, taskId, errorMsg: "PiAPI image timed out (>120s)" };
}

// ── Dispatcher ────────────────────────────────────────────────────────────
/**
 * The only image models this dispatches (CJ 2026-09-21「只留 NANO BANANA 跟
 * GPT IMAGE 2」): gpt-image-2, Nano Banana, and the garment try-on task.
 * Callers that generate a still image go through stillImageModels.ts, which
 * decides WHICH of the first two runs and owns the retry — this stays a plain
 * "run exactly this model" switch.
 */
export async function dispatchGenerate(modelId: string, opts: GenOptions): Promise<GenResult> {
  switch (modelId) {
    case "openai/gpt-image-2":     return genOpenAIImage(opts);
    case "google/nano-banana":     return genNanoBanana(opts);
    case "piapi/kling-try-on":     return genPiapi(modelId, opts);
    default:
      return {
        status: "failed",
        modelId,
        errorMsg: `Unknown modelId: ${modelId}`,
      };
  }
}
