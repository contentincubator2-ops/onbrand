/**
 * mediaGen — provider adapters for the 3-step media flow's Step 3.
 *
 * Each adapter takes (prompt, options) and returns a normalized result:
 *   { url?, b64?, taskId?, status: "ready"|"submitted"|"failed", errorMsg? }
 *
 * Sync image providers return ready immediately. Async video providers
 * return submitted + taskId; client polls media.checkJob.
 *
 * Generated assets are persisted to /opt/marketing-os/covers/
 * media-<id>.png (same dir as squad covers / agent avatars) and a
 * relative URL like /static/covers/media-<id>.png is returned.
 */

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const COVERS_DIR = process.env.COVERS_DIR ?? "/opt/marketing-os/covers";
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
async function genFalFlux(opts: GenOptions): Promise<GenResult> {
  const key = process.env.FAL_API_KEY ?? process.env.FAL_AI_API_KEY ?? "";
  if (!key) throw new Error("FAL_API_KEY missing");
  // Submit
  const submitResp = await fetch("https://queue.fal.run/fal-ai/flux/dev", {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: opts.prompt,
      image_size: opts.aspectRatio === "9:16" ? "portrait_9_16"
        : opts.aspectRatio === "16:9" ? "landscape_16_9"
        : "square_hd",
      num_inference_steps: 28,
      guidance_scale: 3.5,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!submitResp.ok) {
    const t = await submitResp.text();
    throw new Error(`fal submit ${submitResp.status}: ${t.slice(0, 200)}`);
  }
  const submitted: any = await submitResp.json();
  const requestId = submitted?.request_id;
  if (!requestId) throw new Error("fal: no request_id");

  // Poll (FLUX dev finishes in ~5-10s)
  const start = Date.now();
  while (Date.now() - start < 120_000) {
    await new Promise((r) => setTimeout(r, 2500));
    const statusResp = await fetch(
      `https://queue.fal.run/fal-ai/flux/dev/requests/${requestId}/status`,
      { headers: { Authorization: `Key ${key}` } }
    );
    if (!statusResp.ok) continue;
    const s: any = await statusResp.json();
    if (s?.status === "COMPLETED") {
      const resultResp = await fetch(
        `https://queue.fal.run/fal-ai/flux/dev/requests/${requestId}`,
        { headers: { Authorization: `Key ${key}` } }
      );
      const result: any = await resultResp.json();
      const remoteUrl = result?.images?.[0]?.url;
      if (!remoteUrl) throw new Error("fal: no image url in completed result");
      const localUrl = await downloadAndSave(remoteUrl, "img");
      return { status: "ready", modelId: "fal/flux-dev", url: localUrl, meta: { remoteUrl, requestId } };
    }
    if (s?.status === "FAILED") throw new Error("fal generation failed");
  }
  throw new Error("fal generation timed out");
}

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

// ── Dispatcher ────────────────────────────────────────────────────────────
export async function dispatchGenerate(modelId: string, opts: GenOptions): Promise<GenResult> {
  switch (modelId) {
    case "openai/gpt-image-1":     return genOpenAIImage(opts);
    case "azure/gpt-image-2":      return genAzureImage2(opts);
    // Imagen 3 → Imagen 4 (real model on account)
    case "google/imagen-3":
    case "google/imagen-4":
    case "google/imagen-4-default": return genImagen4(opts, "default");
    case "google/imagen-4-fast":    return genImagen4(opts, "fast");
    case "google/imagen-4-ultra":   return genImagen4(opts, "ultra");
    case "hailuo/image":           return genHailuoImage(opts);
    case "fal/flux-dev":           return genFalFlux(opts);
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
  if (modelId.startsWith("hailuo/")) return pollHailuoVideo(taskId);
  if (modelId.startsWith("google/veo-3")) return pollVeo3(taskId);
  return {
    status: "failed",
    modelId,
    taskId,
    errorMsg: `checkJob not implemented for ${modelId}`,
  };
}
