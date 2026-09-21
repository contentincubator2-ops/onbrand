/**
 * stillImageModels — OnBrand's still-image model policy, in one place.
 *
 * 2026-09-21 (CJ「只留 NANO BANANA 跟 GPT IMAGE 2 兩個選項，不論是否有產品圖，
 * 都只用 gpt image 2 生成，不行的時候，再讓用戶選 NANO BANANA」):
 *
 *   1. gpt-image-2 is the default for EVERY still image — with or without a
 *      product photo (a photo makes it use the image-edit endpoint, see
 *      mediaGen.genOpenAIImageEdit).
 *   2. Nano Banana runs ONLY when the user picks it — never automatically.
 *   3. When gpt-image-2 fails we retry it ONCE (same model), then report the
 *      failure and offer Nano Banana as a button. We never swap models behind
 *      the user's back: a picture from a model they didn't choose is exactly
 *      what made "換了 model，想用回上一張卻生不出來" hard to reason about.
 *
 * Every image entry point (image.generate, media.generate, the task
 * orchestra, theater) goes through generateStillImage so those three rules
 * cannot drift apart per call site the way the old per-path fallback chains
 * (Imagen → Flux, primary → Flux Schnell, PiAPI → OpenAI) did.
 */

import { dispatchGenerate, type GenOptions, type GenResult } from "./mediaGen";

export const GPT_IMAGE_2 = "openai/gpt-image-2" as const;
export const NANO_BANANA = "google/nano-banana" as const;
export const STILL_IMAGE_MODELS = [GPT_IMAGE_2, NANO_BANANA] as const;
export type StillImageModelId = (typeof STILL_IMAGE_MODELS)[number];

/** Short user-facing choice ids — what the client picker and the tRPC input use. */
export type StillImageChoice = "gpt-image-2" | "nano-banana";

export const DEFAULT_STILL_IMAGE_MODEL: StillImageModelId = GPT_IMAGE_2;

/**
 * Map anything a caller might still send onto one of the two models.
 *
 * Legacy values keep resolving so stale browser tabs and variants that stored
 * an old id don't 400: "imagen-3" was already labelled — and served by —
 * Nano Banana since 2026-08-31, so it stays Nano Banana (the user did pick it);
 * every other retired id (Flux, Ideogram, gpt-image-1, "auto", …) becomes the
 * default. Nothing else may reach Nano Banana implicitly.
 */
export function resolveStillImageModel(raw?: string | null): StillImageModelId {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "nano-banana" || v === NANO_BANANA || v === "imagen-3") return NANO_BANANA;
  return GPT_IMAGE_2;
}

export function toStillImageChoice(model: StillImageModelId): StillImageChoice {
  return model === NANO_BANANA ? "nano-banana" : "gpt-image-2";
}

export type ImageFailureKind =
  | "content_policy"
  | "quota"
  | "auth"
  | "rate_limit"
  | "timeout"
  | "provider";

/** What went wrong, from a provider error string. Order matters: most specific first. */
export function classifyImageFailure(message: string): ImageFailureKind {
  const m = String(message ?? "");
  if (/safety system|content[_ ]policy|rejected by the safety|moderation|blocked|PROHIBITED_CONTENT|IMAGE_SAFETY/i.test(m)) return "content_policy";
  if (/insufficient.{0,20}(credit|quota|fund)|billing|exceeded your current quota|balance|out of credit/i.test(m)) return "quota";
  if (/\b40[13]\b|unauthorized|invalid.{0,10}api.?key|incorrect api key|permission_denied|suspended|forbidden|_API_KEY (missing|not set)|key missing/i.test(m)) return "auth";
  if (/\b429\b|rate.?limit|resource_exhausted|too many requests/i.test(m)) return "rate_limit";
  if (/timeout|timed out|exceeded|aborted|AbortError/i.test(m)) return "timeout";
  return "provider";
}

/** Retrying the same model only helps when the failure could be transient. */
export function isRetryableImageFailure(kind: ImageFailureKind): boolean {
  return kind === "rate_limit" || kind === "timeout" || kind === "provider";
}

export interface StillImageOptions extends Omit<GenOptions, "negativePrompt"> {}

export interface StillImageConfig {
  /** Per-attempt ceiling. The provider call is abandoned (not the model swapped) when it passes. */
  attemptTimeoutMs?: number;
  /** Pause before the single retry. */
  retryDelayMs?: number;
  /** Test seam. */
  dispatch?: (modelId: string, opts: GenOptions) => Promise<GenResult>;
}

export interface StillImageOutcome {
  status: "ready" | "failed";
  /** The model that was asked for — and, on success, the one that produced the image. Never substituted. */
  modelId: StillImageModelId;
  url?: string;
  errorMsg?: string;
  failureKind?: ImageFailureKind;
  /** 1 or 2 — how many times this same model was tried. */
  attempts: number;
  /**
   * Set only when gpt-image-2 failed: the one alternative the UI may offer.
   * It is an offer, never something this module runs.
   */
  canSwitchTo?: StillImageChoice;
}

function withTimeout<T>(p: Promise<T>, ms: number | undefined, label: string): Promise<T> {
  if (!ms) return p;
  let timer: ReturnType<typeof setTimeout>;
  const cap = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([p, cap]).finally(() => clearTimeout(timer));
}

async function attemptOnce(
  model: StillImageModelId, opts: GenOptions, cfg: StillImageConfig,
): Promise<{ url: string } | { error: string }> {
  const dispatch = cfg.dispatch ?? dispatchGenerate;
  try {
    const r = await withTimeout(dispatch(model, opts), cfg.attemptTimeoutMs, model);
    if (r.status === "ready" && r.url) return { url: r.url };
    return { error: r.errorMsg ?? `${model} returned ${r.status} without an image` };
  } catch (e: any) {
    return { error: String(e?.message ?? e) };
  }
}

/**
 * Generate one still image with exactly the requested model.
 * Never throws: a failure comes back as `status: "failed"` so every caller can
 * refund, log, and show the same "try again / switch to Nano Banana" state.
 */
export async function generateStillImage(
  requested: string | null | undefined,
  opts: StillImageOptions,
  cfg: StillImageConfig = {},
): Promise<StillImageOutcome> {
  const modelId = resolveStillImageModel(requested);
  let attempts = 0;
  let last = "";
  let kind: ImageFailureKind = "provider";

  for (let i = 0; i < 2; i++) {
    attempts++;
    const r = await attemptOnce(modelId, opts as GenOptions, cfg);
    if ("url" in r) return { status: "ready", modelId, url: r.url, attempts };
    last = r.error;
    kind = classifyImageFailure(last);
    if (!isRetryableImageFailure(kind)) break;
    if (i === 0) await new Promise((res) => setTimeout(res, cfg.retryDelayMs ?? 1_500));
  }

  return {
    status: "failed",
    modelId,
    errorMsg: last,
    failureKind: kind,
    attempts,
    ...(modelId === GPT_IMAGE_2 ? { canSwitchTo: "nano-banana" as const } : {}),
  };
}
