/**
 * mediaGen — provider adapters for the 3-step media flow's Step 3.
 *
 * Each adapter takes (prompt, options) and returns a normalized result:
 *   { url?, b64?, taskId?, status: "ready"|"submitted"|"failed", errorMsg? }
 *
 * Sync image providers return ready immediately. Async video providers
 * return submitted + taskId; client polls media.checkJob.
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

const COVERS_DIR = process.env.COVERS_DIR ?? "/opt/onbrand/covers";
const COVERS_URL_PREFIX = process.env.COVERS_URL_PREFIX ?? "/static/covers";
mkdirSync(COVERS_DIR, { recursive: true });

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
  /** For i2v: source image URL. */
  imageUrl?: string;
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
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`download ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  writeFileSync(filePath, buf);
  return `${COVERS_URL_PREFIX}/media-${id}.${ext}`;
}

// ── 1. OpenAI gpt-image-1 ─────────────────────────────────────────────────
async function genOpenAIImage(opts: GenOptions): Promise<GenResult> {
  const key = process.env.OPENAI_API_KEY ?? "";
  if (!key) throw new Error("OPENAI_API_KEY missing");
  const resp = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt: opts.prompt,
      size: opts.size ?? "1024x1024",
      quality: opts.quality ?? "high",
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
  return { status: "ready", modelId: "openai/gpt-image-1", url: saveB64(b64, "img") };
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
      size: opts.size ?? "1024x1024",
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

// ── 3. Google Imagen 4 (current available model on the account) ──────────
async function genImagen4(opts: GenOptions, variant: "fast" | "default" | "ultra" = "default"): Promise<GenResult> {
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
  if (!key) throw new Error("GEMINI_API_KEY missing");
  const model = variant === "fast" ? "imagen-4.0-fast-generate-001"
              : variant === "ultra" ? "imagen-4.0-ultra-generate-001"
              : "imagen-4.0-generate-001";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${key}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instances: [{ prompt: opts.prompt }],
      parameters: { sampleCount: 1 },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Imagen ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data: any = await resp.json();
  const b64 = data?.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error("Imagen no b64");
  return { status: "ready", modelId: `google/imagen-4-${variant}`, url: saveB64(b64, "img") };
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

// ── 6. Hailuo t2v / i2v (async, returns taskId) ──────────────────────────
async function submitHailuoVideo(opts: GenOptions, mode: "t2v" | "i2v"): Promise<GenResult> {
  const key = process.env.HAILUO_API_KEY ?? process.env.MINIMAX_API_KEY ?? "";
  if (!key) throw new Error("HAILUO_API_KEY missing");
  const model = mode === "i2v" ? "I2V-01-Director" : "T2V-01";
  const body: any = { model, prompt: opts.prompt };
  if (mode === "i2v" && opts.imageUrl) body.first_frame_image = opts.imageUrl;
  const resp = await fetch("https://api.minimax.chat/v1/video_generation", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`MiniMax video ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data: any = await resp.json();
  const taskId = data?.task_id;
  if (!taskId) throw new Error("MiniMax: no task_id");
  return { status: "submitted", modelId: `hailuo/${mode}`, taskId, meta: { model } };
}

async function pollHailuoVideo(taskId: string): Promise<GenResult> {
  const key = process.env.HAILUO_API_KEY ?? process.env.MINIMAX_API_KEY ?? "";
  if (!key) throw new Error("HAILUO_API_KEY missing");
  const resp = await fetch(`https://api.minimax.chat/v1/query/video_generation?task_id=${taskId}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`MiniMax query ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data: any = await resp.json();
  const status = data?.status;
  if (status === "Success") {
    const fileUrl = data?.file_id ? `https://api.minimax.chat/v1/files/retrieve_content?file_id=${data.file_id}` : data?.video_url;
    if (!fileUrl) throw new Error("MiniMax: no video url in success");
    const localUrl = await downloadAndSave(fileUrl, "vid");
    return { status: "ready", modelId: "hailuo/video", url: localUrl, taskId };
  }
  if (status === "Failed") {
    return { status: "failed", modelId: "hailuo/video", taskId, errorMsg: data?.error ?? "unknown" };
  }
  return { status: "submitted", modelId: "hailuo/video", taskId, meta: { progressStatus: status } };
}

// ── 7. Google Veo 3 (async-poll via Gemini long-running operations) ─────
async function submitVeo3(opts: GenOptions, fast = false): Promise<GenResult> {
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
  if (!key) throw new Error("GEMINI_API_KEY missing");
  const model = fast ? "veo-3.0-fast-generate-001" : "veo-3.0-generate-001";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predictLongRunning?key=${key}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instances: [{ prompt: opts.prompt, ...(opts.imageUrl ? { image: { imageUri: opts.imageUrl } } : {}) }],
      parameters: { aspectRatio: opts.aspectRatio === "9:16" ? "9:16" : "16:9" },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Veo submit ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data: any = await resp.json();
  const opName = data?.name; // operations/<id>
  if (!opName) throw new Error("Veo: no operation name");
  return { status: "submitted", modelId: `google/veo-3${fast ? "-fast" : ""}`, taskId: opName, meta: { model } };
}

async function pollVeo3(taskId: string): Promise<GenResult> {
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
  if (!key) throw new Error("GEMINI_API_KEY missing");
  const url = `https://generativelanguage.googleapis.com/v1beta/${taskId}?key=${key}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Veo poll ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data: any = await resp.json();
  if (!data?.done) {
    return { status: "submitted", modelId: "google/veo-3", taskId };
  }
  if (data?.error) {
    return { status: "failed", modelId: "google/veo-3", taskId, errorMsg: JSON.stringify(data.error).slice(0, 200) };
  }
  const videoUri = data?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri
    ?? data?.response?.predictions?.[0]?.video?.uri
    ?? data?.response?.predictions?.[0]?.uri;
  if (!videoUri) {
    return { status: "failed", modelId: "google/veo-3", taskId, errorMsg: "no videoUri in response" };
  }
  // videoUri usually requires the API key appended for auth download
  const downloadUrl = videoUri.includes("?") ? `${videoUri}&key=${key}` : `${videoUri}?key=${key}`;
  const localUrl = await downloadAndSave(downloadUrl, "vid");
  return { status: "ready", modelId: "google/veo-3", url: localUrl, taskId };
}

// ── 8. PiAPI unified aggregator (Kling / Runway / Pika / Ideogram / FLUX / Hedra) ─
//
// PiAPI exposes one POST /api/v1/task endpoint that takes {model, task_type, input}
// and returns {data: {task_id, status}}. We poll GET /api/v1/task/{task_id} until
// status === "completed" (or "failed"). Auth via x-api-key header.
//
// Image task_types finish in seconds (we await in-line). Video task_types can
// take 1–3 min so we return "submitted" + taskId for the client to poll via
// media.checkJob.
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
  "piapi/kling-v2-master": {
    model: "kling",
    task_type: "video_generation",
    sync: false,
    buildInput: (o) => ({
      prompt: o.prompt,
      duration: 5,
      aspect_ratio: o.aspectRatio ?? "16:9",
      version: "2.0-master",
      mode: "pro",
    }),
  },
  "piapi/kling-v1-6-i2v": {
    model: "kling",
    task_type: "video_generation",
    sync: false,
    buildInput: (o) => ({
      prompt: o.prompt,
      image_url: o.imageUrl,            // i2v requires source image
      duration: 5,
      aspect_ratio: o.aspectRatio ?? "16:9",
      version: "1.6",
      mode: "std",
    }),
  },
  "piapi/runway-gen-4": {
    model: "runway",
    task_type: "video_generation",
    sync: false,
    buildInput: (o) => ({
      prompt: o.prompt,
      version: "gen4",
      duration: 5,
      aspect_ratio: o.aspectRatio ?? "16:9",
    }),
  },
  "piapi/runway-gen-4-turbo": {
    model: "runway",
    task_type: "video_generation",
    sync: false,
    buildInput: (o) => ({
      prompt: o.prompt,
      version: "gen4-turbo",
      duration: 5,
      aspect_ratio: o.aspectRatio ?? "16:9",
    }),
  },
  "piapi/pika-v2": {
    model: "pika",
    task_type: "video_generation",
    sync: false,
    buildInput: (o) => ({
      prompt: o.prompt,
      version: "2.0",
      duration: 5,
      aspect_ratio: o.aspectRatio ?? "16:9",
    }),
  },
  "piapi/hedra-character-3": {
    model: "hedra",
    task_type: "character",
    sync: false,
    buildInput: (o) => ({
      prompt: o.prompt,
      image_url: o.imageUrl,            // photo of the spokesperson
      // audio_url is optional — caller passes via opts.meta if present
    }),
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
    const isVideo = modelId.includes("kling") || modelId.includes("runway") || modelId.includes("pika") || modelId.includes("hedra");
    const localUrl = await downloadAndSave(remoteUrl, isVideo ? "vid" : "img");
    return { status: "ready", modelId, url: localUrl, taskId, meta: { remoteUrl } };
  }
  if (status === "failed" || status === "error") {
    return { status: "failed", modelId, taskId, errorMsg: inner?.error?.message ?? inner?.error ?? "PiAPI task failed" };
  }
  return { status: "submitted", modelId, taskId, meta: { progressStatus: status } };
}

/** Sync image: submit + inline-poll up to 90s. Async video: just submit. */
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
  // PiAPI catch-all (10 models) — handle before the explicit switch
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
    case "openai/gpt-image-1":     return genOpenAIImage(opts);
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
    case "hailuo/t2v":             return submitHailuoVideo(opts, "t2v");
    case "hailuo/i2v":             return submitHailuoVideo(opts, "i2v");
    case "google/veo-3":           return submitVeo3(opts, false);
    case "google/veo-3-fast":      return submitVeo3(opts, true);
    case "fal/seedance-v1-5-lite":
      return {
        status: "failed",
        modelId,
        errorMsg: "Seedance routed via existing videoService.ts; mediaGen Phase 2.5 will unify.",
      };
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

export async function checkJob(modelId: string, taskId: string): Promise<GenResult> {
  if (modelId.startsWith("piapi/")) return piapiPoll(modelId, taskId);
  if (modelId.startsWith("hailuo/")) return pollHailuoVideo(taskId);
  if (modelId.startsWith("google/veo-3")) return pollVeo3(taskId);
  return {
    status: "failed",
    modelId,
    taskId,
    errorMsg: `checkJob not implemented for ${modelId}`,
  };
}
