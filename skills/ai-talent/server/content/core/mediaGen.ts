/**
 * mediaGen — provider adapters for the 3-step media flow's Step 3.
 *
 * Each adapter takes (prompt, options) and returns a normalized result:
 *   { url?, b64?, taskId?, status: "ready"|"submitted"|"failed", errorMsg? }
 *
 * All providers are sync image providers and return ready inline（影片生成 2026-09-08 移除）.
 *
 * Generated assets are persisted to /opt/onbrand/covers/
 * media-<id>.png (same dir as squad covers / agent avatars) and a
 * relative URL like /static/covers/media-<id>.png is returned.
 *
 * NOTE: default changed from /opt/marketing-os/covers → /opt/onbrand/covers
 * on 2026-05-28 to reflect infra rename. Set COVERS_DIR env var to override.
 */

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { fetchImageBuffer } from "./imageFetch";

const COVERS_DIR = process.env.COVERS_DIR ?? "/opt/onbrand/covers";
const COVERS_URL_PREFIX = process.env.COVERS_URL_PREFIX ?? "/static/covers";
mkdirSync(COVERS_DIR, { recursive: true });

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
  /** Negative prompt (things to exclude). Passed to providers that support a
   *  real negative_prompt field (PiAPI Flux / SDXL / Ideogram). Far more
   *  effective than in-prompt negatives — used to suppress hallucinated text. */
  negativePrompt?: string;
  /** Aspect ratio hint — provider-specific mapping. */
  aspectRatio?: "1:1" | "4:3" | "3:4" | "16:9" | "9:16";
  /** Image size when provider supports explicit pixels. */
  size?: "1024x1024" | "1024x1536" | "1536x1024" | "1024x1792" | "1792x1024";
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
function saveB64(b64: string, kind: "img" | "vid"): string {
  const ext = kind === "img" ? "png" : "mp4";
  const id  = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const filePath = join(COVERS_DIR, `media-${id}.${ext}`);
  writeFileSync(filePath, Buffer.from(b64, "base64"));
  return `${COVERS_URL_PREFIX}/media-${id}.${ext}`;
}

async function downloadAndSave(url: string, kind: "img" | "vid"): Promise<string> {
  const ext = kind === "img" ? "png" : "mp4";
  const id  = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const filePath = join(COVERS_DIR, `media-${id}.${ext}`);
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
  writeFileSync(filePath, buf);
  return `${COVERS_URL_PREFIX}/media-${id}.${ext}`;
}

function sizeForAspectRatio(opts: GenOptions): NonNullable<GenOptions["size"]> {
  if (opts.size) return opts.size;
  if (opts.aspectRatio === "16:9" || opts.aspectRatio === "4:3") return "1536x1024";
  if (opts.aspectRatio === "9:16" || opts.aspectRatio === "3:4") return "1024x1536";
  return "1024x1024";
}

// ── 1. OpenAI gpt-image-1 / gpt-image-2 ──────────────────────────────────
// 2026-09-01 (CJ「open ai 我指定使用 gpt image 2」): gpt-image-2 is the
// designated OpenAI image model, so it is the default here too. Callers that
// want the older one must now name it explicitly.
async function genOpenAIImage(opts: GenOptions, model: "gpt-image-1" | "gpt-image-2" = "gpt-image-2"): Promise<GenResult> {
  const key = process.env.OPENAI_API_KEY ?? "";
  if (!key) throw new Error("OPENAI_API_KEY missing");
  // Derive an OpenAI-supported size from the aspect ratio when an explicit
  // size isn't given (the orchestra passes aspectRatio, not size). Without
  // this a 16:9 thumbnail would default to a 1024x1024 square.
  const size = sizeForAspectRatio(opts);
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
  return { status: "ready", modelId: `openai/${model}`, url: saveB64(b64, "img") };
}

// ── 2. Azure gpt-image-2 (existing pattern, reuse) ───────────────────────
async function genAzureImage2(opts: GenOptions): Promise<GenResult> {
  const key = process.env.AZURE_IMAGE_API_KEY ?? process.env.GPT ?? "";
  const endpoint = (
    process.env.AZURE_IMAGE_ENDPOINT
    ?? "https://proj-claude-sweden-resource.cognitiveservices.azure.com"
  ).replace(/\/+$/, "");
  const deployment = process.env.AZURE_IMAGE_DEPLOYMENT ?? "gpt-image-2";
  if (!key) throw new Error("AZURE_IMAGE_API_KEY missing");
  const url = `${endpoint}/openai/deployments/${deployment}/images/generations?api-version=2024-02-01`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: opts.prompt,
      size: sizeForAspectRatio(opts),
      quality: opts.quality ?? "low",
      output_format: "png",
      n: 1,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Azure ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data: any = await resp.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("Azure no b64");
  return { status: "ready", modelId: "azure/gpt-image-2", url: saveB64(b64, "img") };
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
        generationConfig: { responseModalities: ["IMAGE"] },
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
    return { status: "ready", modelId: "google/nano-banana", url: saveB64(b64out, "img") };
  }
  throw new Error(errors.join("\n") || "NanoBanana failed");
}

// ── 3. Google Imagen 4 (current available model on the account) ──────────
async function genImagen4(opts: GenOptions, variant: "fast" | "default" | "ultra" = "default"): Promise<GenResult> {
  const keys = googleApiKeyPool();
  if (!keys.length) throw new Error("GEMINI_API_KEY missing");
  const model = variant === "fast" ? "imagen-4.0-fast-generate-001"
              : variant === "ultra" ? "imagen-4.0-ultra-generate-001"
              : "imagen-4.0-generate-001";
  const errors: string[] = [];
  for (const key of keys) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${key}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt: opts.prompt }],
        parameters: { sampleCount: 1, aspectRatio: opts.aspectRatio ?? "1:1" },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!resp.ok) {
      const t = redactProviderSecrets(await resp.text());
      const error = `Imagen ${resp.status}: ${t.slice(0, 200)}`;
      errors.push(error);
      if (isRetryableGoogleKeyError(`${resp.status} ${t}`)) continue;
      throw new Error(error);
    }
    const data: any = await resp.json();
    const b64 = data?.predictions?.[0]?.bytesBase64Encoded;
    if (!b64) throw new Error("Imagen no b64");
    return { status: "ready", modelId: `google/imagen-4-${variant}`, url: saveB64(b64, "img") };
  }
  throw new Error(errors.join("\n") || "Imagen failed");
}

// ── 4. Hailuo / MiniMax image ────────────────────────────────────────────
async function genHailuoImage(opts: GenOptions): Promise<GenResult> {
  const key = process.env.HAILUO_API_KEY ?? process.env.MINIMAX_API_KEY ?? "";
  if (!key) throw new Error("HAILUO_API_KEY missing");
  // MiniMax image_generation endpoint
  const resp = await fetch("https://api.minimax.chat/v1/image_generation", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "image-01",
      prompt: opts.prompt,
      aspect_ratio: opts.aspectRatio ?? "1:1",
      response_format: "url",
      n: 1,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`MiniMax ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data: any = await resp.json();
  const remoteUrl = data?.data?.image_urls?.[0] ?? data?.data?.[0]?.url;
  if (!remoteUrl) throw new Error("MiniMax no image url");
  const localUrl = await downloadAndSave(remoteUrl, "img");
  return { status: "ready", modelId: "hailuo/image", url: localUrl, meta: { remoteUrl } };
}

// ── 5. fal.ai FLUX.1 dev ──────────────────────────────────────────────────
// ── DISABLED 2026-05-05 ──────────────────────────────────────────────────
// fal.ai removed site-wide per CJ direction (billing dispute irrecoverable).
// Use piapi/flux-pro for image gen and azure/gpt-image-2 for high-quality.
// Function bodies kept as failed stubs so any stray caller fails loudly.
async function genFalFlux(_opts: GenOptions): Promise<GenResult> {
  return {
    status: "failed",
    modelId: "fal/flux-dev",
    errorMsg: "fal.ai removed site-wide 2026-05-05. Use piapi/flux-pro or azure/gpt-image-2.",
  };
}
async function genFalFluxSchnell(_opts: GenOptions): Promise<GenResult> {
  return {
    status: "failed",
    modelId: "fal/flux-schnell",
    errorMsg: "fal.ai removed site-wide 2026-05-05. Use piapi/flux-pro or azure/gpt-image-2.",
  };
}

// (Original fal.ai bodies removed 2026-05-05 — see git history for reference.)

// ── 8. PiAPI unified aggregator (Ideogram / FLUX / SDXL) ─
//
// PiAPI exposes one POST /api/v1/task endpoint that takes {model, task_type, input}
// and returns {data: {task_id, status}}. We poll GET /api/v1/task/{task_id} until
// status === "completed" (or "failed"). Auth via x-api-key header.
//
// Image task_types finish in seconds (we await in-line). 2026-09-08：影片模型
// （Kling／Runway／Pika／Hedra）隨影片生成功能移除。
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
  "piapi/flux-pro": {
    // 2026-05-05: PiAPI deprecated "Qubico/flux1-pro" model id. The verified
    // working FLUX endpoint via PiAPI is Qubico/flux1-schnell (4-step, fast).
    // We keep the public id "piapi/flux-pro" for backward compatibility and
    // route it under the schnell model.
    model: "Qubico/flux1-schnell",
    task_type: "txt2img",
    sync: true,
    buildInput: (o) => ({
      prompt: o.prompt,
      width:  o.aspectRatio === "9:16" ? 768  : o.aspectRatio === "16:9" ? 1344 : 1024,
      height: o.aspectRatio === "9:16" ? 1344 : o.aspectRatio === "16:9" ? 768  : 1024,
    }),
  },
  "piapi/flux-schnell": {
    model: "Qubico/flux1-schnell",
    task_type: "txt2img",
    sync: true,
    buildInput: (o) => ({
      prompt: o.prompt,
      ...(o.negativePrompt ? { negative_prompt: o.negativePrompt } : {}),
      width:  o.aspectRatio === "9:16" ? 768  : o.aspectRatio === "16:9" ? 1344 : 1024,
      height: o.aspectRatio === "9:16" ? 1344 : o.aspectRatio === "16:9" ? 768  : 1024,
    }),
  },
  "piapi/flux-realism": {
    model: "Qubico/flux1-dev",
    task_type: "txt2img-lora",
    sync: true,
    buildInput: (o) => ({
      prompt: o.prompt,
      ...(o.negativePrompt ? { negative_prompt: o.negativePrompt } : {}),
      lora_settings: [{ lora_type: "realism", lora_strength: 1.0 }],
    }),
  },
  "piapi/ideogram-v3": {
    // PiAPI namespaces Ideogram under Qubico (verified 2026-04-29 — bare
    // "ideogram" returns 400 invalid model).
    model: "Qubico/ideogram",
    task_type: "txt2img",
    sync: true,
    buildInput: (o) => ({
      prompt: o.prompt,
      ...(o.negativePrompt ? { negative_prompt: o.negativePrompt } : {}),
      aspect_ratio: o.aspectRatio ?? "1:1",
      style_type: "AUTO",
      magic_prompt_option: "AUTO",
    }),
  },
  "piapi/sd-3-5-large": {
    // PiAPI uses Qubico namespace for Stability AI as well.
    model: "Qubico/sdxl",
    task_type: "txt2img",
    sync: true,
    buildInput: (o) => ({
      prompt: o.prompt,
      ...(o.negativePrompt ? { negative_prompt: o.negativePrompt } : {}),
      aspect_ratio: o.aspectRatio ?? "1:1",
    }),
  },
  /**
   * 2026-09-10（CJ「model 跟衣服要分開的」，避開產品變形計畫的服飾分支）：
   * 服飾上身——衣服（garmentImageUrl）跟真人模特（imageUrl）是兩張分開的圖，
   * 各自的像素都不重畫，Kling 只負責「把這件衣服穿到這個人身上」這個合成
   * 動作。這是原本 2026-07-24 決議裡「Phase 2b：PiAPI Kling AI Try-On」，
   * 之前沒有真的接上；同一批 2026-09-08 影片生成清理只刪了 Kling 的
   * 「文字/圖片生片」task_type，這支圖片級 API 是分開的端點，沒有被動到。
   *
   * 跟 productSceneComposer.ts 的分工：那支是「產品換背景，產品像素不重畫」；
   * 這支是「衣服穿到人身上，衣服與人的像素個別由 Kling 處理，不是我們合成
   * 出來的」——服飾上身這個動作本身必然是生成式的（沒有「剪貼」這回事），
   * 保真的重點在「別把兩者的身份互相污染」（衣服不能被套錯版型、人不能被
   * 換臉），不是像素級不變形。
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
export async function dispatchGenerate(modelId: string, opts: GenOptions): Promise<GenResult> {
  // PiAPI catch-all (image models) — handle before the explicit switch
  if (modelId.startsWith("piapi/")) return genPiapi(modelId, opts);
  // Atlas Cloud — registered in mediaModels but endpoint not yet wired
  if (modelId.startsWith("atlas/")) {
    return {
      status: "failed",
      modelId,
      errorMsg: "Atlas Cloud media adapter not yet wired. Run scripts/verify-piapi.ts first to confirm endpoint shape.",
    };
  }

  switch (modelId) {
    case "openai/gpt-image-1":     return genOpenAIImage(opts, "gpt-image-1");
    case "openai/gpt-image-2":     return genOpenAIImage(opts, "gpt-image-2");
    case "google/nano-banana":     return genNanoBanana(opts);
    case "azure/gpt-image-2":      return genAzureImage2(opts);
    // Imagen 4 (real model on account). Removed legacy imagen-3 /
    // imagen-4 alias cases 2026-04-30 — client registry uses explicit
    // -default / -fast / -ultra suffixes only.
    case "google/imagen-4-default": return genImagen4(opts, "default");
    case "google/imagen-4-fast":    return genImagen4(opts, "fast");
    case "google/imagen-4-ultra":   return genImagen4(opts, "ultra");
    case "hailuo/image":           return genHailuoImage(opts);
    case "fal/flux-dev":           return genFalFlux(opts);
    case "fal/flux-schnell":       return genFalFluxSchnell(opts);
    case "midjourney/v7":
      return {
        status: "failed",
        modelId,
        errorMsg: "Midjourney has no API. Copy the prompt to Discord manually.",
      };
    default:
      return {
        status: "failed",
        modelId,
        errorMsg: `Unknown modelId: ${modelId}`,
      };
  }
}
