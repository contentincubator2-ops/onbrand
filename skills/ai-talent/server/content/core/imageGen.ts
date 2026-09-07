/**
 * imageGen — Decision AI publish-gate image generation service.
 *
 * Primary:  OpenAI gpt-image-2 (best prompt adherence, brand-context friendly)
 * Fallback: Google gemini image surface (Imagen is gone from this key tier)
 *
 * Every generation is persisted to `generated_images` for auditability and
 * linked back to the originating decision/option.
 *
 * Brand context is injected into every prompt: positioning, voice, archetype,
 * audience segment — so the image doesn't drift from the approved strategy.
 */

import { getDb } from "../../db";
import { sql } from "drizzle-orm";
import { loadLineage } from "../../strategy/core/decisionBridge";
import { translateImagePromptToEnglish } from "./imagePromptTranslation";

export type ImageProvider = "openai" | "google" | "stability" | "piapi";
export type ImageSize = "1024x1024" | "1024x1536" | "1536x1024";

/**
 * 2026-07-20 (CJ「EDM 換圖後出現錯誤中文字」): the anti-garbled-CJK rules
 * lived only inside buildPrompt/runPiapi here, so the THIRD generation
 * path (media.generate ← MediaGenFlow/ImageSlotFlow 手動生圖/換圖) shipped
 * raw prompts and models baked fake Chinese onto packaging. Exported as
 * shared constants so every image path uses the same guard.
 * Policy (project_image_text_overlay): AI 圖一律不烤字 — text is overlaid
 * later on a separate editable layer.
 */
export const NO_TEXT_PROMPT_BLOCK =
  "ABSOLUTELY NO TEXT — this is the most important rule: do NOT render any " +
  "text, letters, words, numbers, Chinese / Japanese / Korean characters, " +
  "titles, headlines, captions, subtitles, labels, badges, stickers, signage, " +
  "logos, watermarks, or typography ANYWHERE in the image. This includes text " +
  "on product packaging, bottles, boxes, and signs — render those surfaces as " +
  "clean, unlabeled designs. The image must contain ZERO written characters — " +
  "it is a clean background; any title text is added afterwards on a separate " +
  "layer. If you are tempted to add a title or label, leave that area as empty " +
  "visual space instead.";
/**
 * 2026-07-25 (CJ product-faithful gen): when a REAL product photo is the
 * subject reference, the NO-TEXT rule must NOT strip the product's own
 * label — fidelity criteria per project_product_faithful_imagegen memory:
 * product pixel-true (shape/material/colors/label text verbatim), natural
 * placement (matching light, perspective, contact shadow), and still zero
 * GENERATED text anywhere else in the frame.
 */
export const PRODUCT_FAITHFUL_PROMPT_BLOCK =
  "PRODUCT REFERENCE OVERRIDES ALL CONFLICTING TEXT — the attached reference " +
  "image is the sole source of truth for the product or garment. If any scene " +
  "text conflicts with the reference image about the product, clothing, color, " +
  "style, cut, shape, proportions, material, pattern, details, label, or logo, " +
  "ignore that conflicting text and follow the reference image. Use scene text " +
  "only for the environment, lighting, composition, pose, and atmosphere; never " +
  "replace the referenced product or garment with one described by the scene. " +
  "PRODUCT FIDELITY — the attached image is the REAL product; this is the " +
  "most important rule: reproduce the product EXACTLY as shown — identical " +
  "shape, proportions, materials, colors, and every printed label, logo and " +
  "text on the product itself must remain letter-perfect and unaltered. Do " +
  "NOT redraw, restyle, re-color or re-label the product. Place it naturally " +
  "into the scene: lighting direction consistent with the environment, " +
  "correct perspective and scale, realistic contact shadows and reflections " +
  "— it must look photographed in place, never pasted on. " +
  // 2026-08-19 (客戶回報「勾選真實產品後再產圖，出現錯誤中文字」): the old
  // wording ("apart from the product's own label, no other text") left the
  // model room to treat the BRAND NAME as label-ish and stamp a garbled CJK
  // watermark across the frame. State the allowance as a closed set — only
  // glyphs visibly printed on the attached photo, copied, never invented —
  // and name the failure modes we actually saw.
  "TEXT — closed rule: the ONLY characters allowed anywhere in the output are " +
  "the ones already visibly printed on the attached product photo, copied " +
  "pixel-for-pixel. Do not invent, extend, translate, re-letter or repeat " +
  "them. Do NOT render or repeat the brand name anywhere except where it is " +
  "already printed on the product itself. Do not add a watermark (including " +
  "large translucent or tiled brand marks), signage, captions, badges, stickers or " +
  "any Chinese / Japanese / Korean characters elsewhere in the frame — not on " +
  "the background, surfaces, props, or as an overlay. If the attached photo " +
  "itself carries a watermark, leave it out. Every surface other than the " +
  "product is blank.";

/**
 * 2026-07-27 (CJ「鏡子裡的她，跟實際的髮型或頭的轉向不同」): mirror /
 * reflective-surface compositions are a well-known failure mode for every
 * text-to-image model — the reflection never stays physically consistent
 * with the subject's actual pose/hair/head angle. Same philosophy as
 * NO_TEXT_PROMPT_BLOCK: route around what models structurally can't do
 * right rather than trying to prompt our way to a correct reflection.
 */
export const NO_MIRROR_PROMPT_BLOCK =
  "Do NOT include a mirror, reflective surface, reflection, or any shot " +
  "composed as \"person looking at their own reflection\" — reflections " +
  "never stay physically consistent with the subject's actual pose/hair/" +
  "head angle. Show the subject directly instead.";

export const NO_TEXT_NEGATIVE_PROMPT =
  "text, letters, words, numbers, chinese characters, japanese characters, " +
  "korean characters, cjk, title, headline, caption, subtitle, label, badge, " +
  "sticker, signage, watermark, signature, logo, typography, gibberish glyphs, " +
  "fake characters, writing, packaging text, product label text, mirror, " +
  "reflection, reflective surface";

/**
 * Mirror-only negative prompt for product-subject mode, where the blanket
 * NO_TEXT_NEGATIVE_PROMPT can't be used (it would fight the real product
 * label's text). See NO_MIRROR_PROMPT_BLOCK.
 */
export const NO_MIRROR_NEGATIVE_PROMPT = "mirror, reflection, reflective surface";

// 2026-05-12 (CJ「改圖要給用戶選 model」): user-facing model IDs.
// "auto" = use IMAGE_GEN_PROVIDER_PRIMARY env (currently openai).
// Other values map to specific providers in generateImage's switch.
export type ImageModelChoice =
  | "auto"
  | "flux-schnell"      // PiAPI Flux Schnell — fast (5-10s), 4-step
  | "gpt-image-1"       // OpenAI gpt-image-1 — strong realism
  | "gpt-image-2"       // OpenAI gpt-image-2 — latest, higher quality
  | "flux-realism"      // PiAPI Flux Dev with realism LoRA
  | "ideogram-v3"       // PiAPI Ideogram — strongest at text-in-image
  | "imagen-3";         // Google Imagen 3

function redactProviderSecrets(text: string): string {
  return String(text)
    .replace(/api_key:[A-Za-z0-9_\-]+/g, "api_key:[REDACTED]")
    .replace(/key=([A-Za-z0-9_\-]+)/g, "key=[REDACTED]")
    .replace(/AIza[0-9A-Za-z_\-]{20,}/g, "[REDACTED_GOOGLE_KEY]");
}

function googleApiKeys(): string[] {
  return Array.from(new Set([
    ...(process.env.GEMINI_API_KEY_POOL ?? "").split(","),
    process.env.GEMINI_API_KEY ?? "",
    process.env.GOOGLE_AI_API_KEY ?? "",
    process.env.GOOGLE_API_KEY ?? "",
  ].map((value) => value.trim()).filter(Boolean)));
}

function isRetryableGoogleKeyError(text: string): boolean {
  return /suspended|permission_denied|api[_ ]key|consumer|unauthorized|forbidden|403|429|rate.?limit|quota|resource_exhausted/i.test(text);
}

export interface BrandVisualContext {
  brandName?: string;
  positioning?: string;
  voiceTone?: string;
  archetype?: string;
  audience?: string;
  colourHints?: string[];
}

export interface ImageGenInput {
  brandId: number;
  decisionId?: number;
  optionId?: number;
  prompt: string;
  channel?: "fb" | "ig" | "linkedin" | "youtube" | "tiktok" | "email" | "pr";
  size?: ImageSize;
  brandContext?: BrandVisualContext;
  /** 2026-05-12: user-selected model. "auto" or undefined = env default. */
  modelChoice?: ImageModelChoice;
  /** 2026-07-25 (CJ product-faithful gen): URL of the REAL product photo.
   *  When set, generation routes to Nano Banana subject-reference with the
   *  PRODUCT-FIDELITY guard, and does NOT fall back to text-only providers
   *  on failure — a hallucinated product is worse than a failed run. */
  subjectImageUrl?: string;
}

export interface ImageGenResult {
  id: number;
  provider: ImageProvider;
  model: string;
  url: string | null;
  b64: string | null;
  status: "ready" | "failed";
  /** User scene prompt after optional CJK→English translation, before guards/context. */
  effectivePrompt: string;
  /** User selection before provider fallback (or nano-banana in subject mode). */
  requestedModel: string;
  /** True when the returned image came from a fallback, not the requested/default primary. */
  usedFallback: boolean;
  errorMsg?: string;
}

function channelSize(channel?: string): ImageSize {
  switch (channel) {
    case "ig":
      return "1024x1024"; // square feed
    case "fb":
      return "1024x1024";
    case "linkedin":
      return "1536x1024"; // landscape
    case "youtube":
      return "1536x1024";
    case "tiktok":
      return "1024x1536"; // 9:16 vertical
    case "email":
      return "1536x1024"; // banner-style landscape
    case "pr":
      return "1024x1536"; // portrait
    default:
      return "1024x1024";
  }
}

function buildPrompt(input: ImageGenInput): string {
  const bc = input.brandContext ?? {};
  const lines: string[] = [];
  // Product-reference arbitration must precede all scene/context prose. Models
  // otherwise tend to follow a later, concrete clothing description instead of
  // the attached customer's product photo.
  if (input.subjectImageUrl) {
    lines.push(PRODUCT_FAITHFUL_PROMPT_BLOCK);
    lines.push("");
  }
  // 2026-08-19 (客戶回報「勾選真實產品後再產圖，出現錯誤中文字」): in
  // subject-reference mode the blanket NO-TEXT guard is deliberately relaxed
  // so the real product's own printed label survives — which means anything
  // else text-shaped in the prompt becomes fair game for the model to paint.
  // The brand name is a CJK string ("小安素"), and Nano Banana duly stamped a
  // garbled approximation of it across the frame as a watermark. The attached
  // photo already IS this brand's product, so naming the brand adds nothing
  // here: withhold it (and the brand-substitution paragraph below, which only
  // exists to swap OTHER brands' products out of template scenes — impossible
  // when the real product is the subject).
  const nameBrandInPrompt = !input.subjectImageUrl;
  if (bc.brandName && nameBrandInPrompt) lines.push(`Brand: ${bc.brandName}`);
  if (bc.positioning) lines.push(`Positioning: ${bc.positioning}`);
  if (bc.archetype) lines.push(`Archetype: ${bc.archetype}`);
  if (bc.voiceTone) lines.push(`Voice: ${bc.voiceTone}`);
  if (bc.audience) lines.push(`Audience: ${bc.audience}`);
  if (bc.colourHints?.length) lines.push(`Colour palette: ${bc.colourHints.join(", ")}`);
  if (input.channel) lines.push(`Channel: ${input.channel.toUpperCase()}`);
  // Brand override: the scene may come from a commercial-photography
  // template that references another brand's product (e.g. Coca-Cola,
  // Sprite). Instruct the model to adapt the style for this brand instead.
  if (bc.brandName && nameBrandInPrompt) {
    lines.push("");
    lines.push(
      `BRAND ADAPTATION: This image represents ${bc.brandName}. ` +
      `If the scene below references any other brand or product by name, ` +
      `visually replace it with ${bc.brandName}'s product while keeping ` +
      `the exact same composition, lighting, and atmosphere.`
    );
  }
  lines.push("");
  lines.push(input.subjectImageUrl
    ? "Scene (environment, lighting, composition, pose, and atmosphere only):"
    : "Scene:");
  lines.push(input.prompt);
  lines.push("");
  // 2026-07-07 (CJ「YT 縮圖出現不是國字的國字」): image models (Flux /
  // gpt-image / Imagen) cannot render CJK text — they hallucinate glyphs that
  // look Chinese but are gibberish. For "YouTube"/thumbnail 16:9 framing they
  // lean HARD into adding a big title, producing exactly that garbage. The
  // real title is overlaid later in the mockup layer, so the generated image
  // must be a CLEAN, TEXT-FREE background. This must be a dominant, explicit
  // directive — a weak trailing "no text" clause gets ignored.
  // 2026-07-25 product-faithful: with a real product photo attached, the
  // blanket NO-TEXT rule would strip the product's own label — use the
  // fidelity guard instead (label letter-perfect, no OTHER generated text).
  if (input.subjectImageUrl) {
    lines.push(NO_MIRROR_PROMPT_BLOCK);
    lines.push("");
    lines.push(
      "Rendering: editorial product photography, natural light, realistic contact shadows, clean composition, no watermarks."
    );
  } else {
    lines.push(NO_TEXT_PROMPT_BLOCK);
    lines.push("");
    lines.push(NO_MIRROR_PROMPT_BLOCK);
    lines.push("");
    lines.push(
      "Rendering: editorial photography, natural light, clean composition, no text, no watermarks."
    );
  }
  return lines.join("\n");
}

async function runOpenAI(
  promptText: string,
  size: ImageSize,
  modelOverride?: string,
): Promise<{ url: string | null; b64: string | null; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  // 2026-09-01 (CJ「open ai 我指定使用 gpt image 2」): gpt-image-2 is the
  // designated OpenAI image model. IMAGE_GEN_MODEL_OPENAI is unset on the VM,
  // so this literal — not the env — was what actually ran, and it was still
  // gpt-image-1 despite imageRouter's comment calling gpt-image-2 the global
  // default. Verified openable on the current key before the switch
  // (op-probe-openai-image: HTTP 200, 17.5s).
  const model = modelOverride || process.env.IMAGE_GEN_MODEL_OPENAI || "gpt-image-2";

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt: promptText,
      size,
      n: 1,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI image gen ${res.status}: ${text.slice(0, 300)}`);
  }
  const json: any = await res.json();
  const item = json?.data?.[0] ?? {};
  if (!item.url && !item.b64_json) throw new Error("OpenAI image gen returned no image");
  return { url: item.url ?? null, b64: item.b64_json ?? null, model };
}

function aspectForSize(size: ImageSize): string {
  return size === "1536x1024" ? "16:9" : size === "1024x1536" ? "9:16" : "1:1";
}

/**
 * 2026-08-31 (CJ「圖片的模型，是否突然都不能使用了」): ListModels on the prod
 * key now returns NO imagen model at all — imagen-3.0-* AND imagen-4.0-*
 * both answer 404 NOT_FOUND for :predict — while gemini-2.5-flash-image /
 * gemini-3-pro-image / gemini-3.1-flash-image ARE listed. Google moved image
 * generation off the Imagen predict surface for this key tier, which took the
 * whole "google" fallback down with it: OpenAI (429 no credits) → Google (404)
 * → PiAPI Flux was the only path still producing pictures.
 *
 * The gemini image surface is generateContent + responseModalities, not
 * predict, so it needs its own request shape. Same wire format genNanoBanana
 * (mediaGen) already uses.
 */
const GEMINI_IMAGE_FALLBACK_MODEL = "gemini-2.5-flash-image";

async function runGeminiImage(
  promptText: string,
  size: ImageSize,
  model: string,
): Promise<{ url: string | null; b64: string | null; model: string }> {
  const keys = googleApiKeys();
  if (!keys.length) throw new Error("GEMINI_API_KEY not set");
  // flash-image takes no size parameter — the aspect ratio goes in-prompt.
  const prompt = `${promptText}\n\nOutput aspect ratio: ${aspectForSize(size)}.`;
  const errors: string[] = [];
  for (const apiKey of keys) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["IMAGE"] },
        }),
        signal: AbortSignal.timeout(120_000),
      }
    );
    if (!res.ok) {
      const text = redactProviderSecrets(await res.text());
      const error = `Google ${model} ${res.status}: ${text.slice(0, 300)}`;
      errors.push(error);
      if (isRetryableGoogleKeyError(`${res.status} ${text}`)) continue;
      throw new Error(error);
    }
    const json: any = await res.json();
    const parts: any[] = json?.candidates?.[0]?.content?.parts ?? [];
    const part = parts.find((p) => p?.inlineData?.data || p?.inline_data?.data);
    const b64 = part?.inlineData?.data ?? part?.inline_data?.data ?? null;
    // A success-shaped response with no image part must throw, not return a
    // null url — otherwise the caller writes status=ready and stops falling
    // back (see the runOpenAI empty-response fix).
    if (!b64) {
      const finish = json?.candidates?.[0]?.finishReason ?? "no image part";
      throw new Error(`Google ${model} returned no image (${finish})`);
    }
    return { url: null, b64, model };
  }
  throw new Error(errors.join("\n") || `Google ${model} failed`);
}

async function runGoogleImagen(
  promptText: string,
  size: ImageSize
): Promise<{ url: string | null; b64: string | null; model: string }> {
  const model = process.env.IMAGE_GEN_MODEL_GOOGLE || GEMINI_IMAGE_FALLBACK_MODEL;
  if (!model.startsWith("imagen-")) return runGeminiImage(promptText, size, model);
  try {
    return await runImagenPredict(promptText, size, model);
  } catch (e: any) {
    // A key without Imagen access answers 404 NOT_FOUND for every imagen
    // model. A stale IMAGE_GEN_MODEL_GOOGLE=imagen-* pinned in an old .env
    // must not take the Google fallback down again — hand off to the gemini
    // surface instead. Any other failure (quota, safety, network) still
    // propagates so the caller's PiAPI fallback runs.
    if (!/\b404\b|NOT_FOUND/i.test(String(e?.message ?? e))) throw e;
    return await runGeminiImage(promptText, size, GEMINI_IMAGE_FALLBACK_MODEL);
  }
}

async function runImagenPredict(
  promptText: string,
  size: ImageSize,
  model: string,
): Promise<{ url: string | null; b64: string | null; model: string }> {
  const keys = googleApiKeys();
  if (!keys.length) throw new Error("GEMINI_API_KEY not set");
  const aspect = aspectForSize(size);
  const errors: string[] = [];
  for (const apiKey of keys) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt: promptText }],
          parameters: { sampleCount: 1, aspectRatio: aspect },
        }),
        signal: AbortSignal.timeout(120_000),
      }
    );
    if (!res.ok) {
      const text = redactProviderSecrets(await res.text());
      const error = `Google Imagen ${res.status}: ${text.slice(0, 300)}`;
      errors.push(error);
      if (isRetryableGoogleKeyError(`${res.status} ${text}`)) continue;
      throw new Error(error);
    }
    const json: any = await res.json();
    const b64 =
      json?.predictions?.[0]?.bytesBase64Encoded ??
      json?.predictions?.[0]?.image?.bytesBase64Encoded ??
      null;
    if (!b64) throw new Error("Google Imagen returned no image");
    return { url: null, b64, model };
  }
  throw new Error(errors.join("\n") || "Google Imagen failed");
}

// 2026-05-12: PiAPI bridge for user-selectable image models.
// Imports dispatchGenerate from mediaGen which handles PiAPI submit + poll.
async function runPiapi(
  prompt: string,
  size: ImageSize,
  modelId: string,
): Promise<{ url: string | null; b64: string | null; model: string }> {
  const { dispatchGenerate } = await import("./mediaGen");
  // Map our 1024x1024 / 1024x1536 / 1536x1024 sizes to PiAPI aspect ratios
  const aspect: "1:1" | "9:16" | "16:9" =
    size === "1024x1536" ? "9:16" :
    size === "1536x1024" ? "16:9" : "1:1";
  // 2026-07-07: Flux/SDXL/Ideogram ignore in-prompt "no text" but honour a
  // real negative_prompt. Suppress the hallucinated (garbled CJK) text baked
  // into thumbnails — the real title is overlaid in the mockup layer.
  const r = await dispatchGenerate(modelId, {
    prompt,
    aspectRatio: aspect,
    negativePrompt: NO_TEXT_NEGATIVE_PROMPT,
  });
  if (r.status !== "ready" || !r.url) {
    throw new Error(`PiAPI ${modelId}: ${r.errorMsg ?? `status=${r.status}`}`);
  }
  return { url: r.url, b64: null, model: r.modelId };
}

export async function generateImage(input: ImageGenInput): Promise<ImageGenResult> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const size = input.size ?? channelSize(input.channel);
  const translated = await translateImagePromptToEnglish(input.prompt);
  const effectivePrompt = translated.prompt;
  const promptText = buildPrompt({ ...input, prompt: effectivePrompt });

  // Pre-insert a pending row so we can retrieve it even if provider crashes.
  const [ins] = (await db.execute(sql`
    INSERT INTO generated_images
      (brandId, decisionId, optionId, provider, model, prompt, sizeSpec, status)
    VALUES
      (${input.brandId}, ${input.decisionId ?? null}, ${input.optionId ?? null},
       ${"openai"}, ${"pending"}, ${promptText}, ${size}, 'pending')
  `)) as any;
  const id = Number(ins?.insertId ?? 0);

  // 2026-07-25 product-faithful: subject-reference runs ONLY on Nano Banana.
  // No fallback to text-only providers — they can't see the real product,
  // and a hallucinated product violates the fidelity bar. Fail loudly.
  if (input.subjectImageUrl) {
    try {
      const { dispatchGenerate } = await import("./mediaGen");
      const aspect = size === "1536x1024" ? "16:9" : size === "1024x1536" ? "9:16" : "1:1";
      const r = await dispatchGenerate("google/nano-banana", {
        prompt: promptText,
        imageUrl: input.subjectImageUrl,
        aspectRatio: aspect as any,
        brandId: input.brandId,
        // The blanket NO_TEXT_NEGATIVE_PROMPT can't be used here — it would
        // fight the real product's own label. Mirror-only, matching what
        // mediaRouter.generate already passes on this same path.
        negativePrompt: NO_MIRROR_NEGATIVE_PROMPT,
      });
      // TODO: Add post-generation vision validation/retry for product fidelity;
      // prompt arbitration reduces conflicts but cannot prove output compliance.
      if (r.status === "ready" && r.url) {
        await db.execute(sql`
          UPDATE generated_images
          SET provider = 'google', model = 'nano-banana', url = ${r.url},
              status = 'ready', errorMsg = NULL
          WHERE id = ${id}
        `);
        return { id, provider: "google", model: "nano-banana", url: r.url, b64: null, status: "ready", effectivePrompt, requestedModel: "nano-banana", usedFallback: false };
      }
      const msg = redactProviderSecrets(r.errorMsg ?? "nano-banana returned no image");
      await db.execute(sql`UPDATE generated_images SET status='failed', errorMsg=${msg} WHERE id=${id}`);
      return { id, provider: "google", model: "nano-banana", url: null, b64: null, status: "failed", effectivePrompt, requestedModel: "nano-banana", usedFallback: false, errorMsg: msg };
    } catch (e: any) {
      const msg = redactProviderSecrets(`nano-banana: ${String(e?.message ?? e).slice(0, 400)}`).slice(0, 240);
      await db.execute(sql`UPDATE generated_images SET status='failed', errorMsg=${msg} WHERE id=${id}`);
      return { id, provider: "google", model: "nano-banana", url: null, b64: null, status: "failed", effectivePrompt, requestedModel: "nano-banana", usedFallback: false, errorMsg: msg };
    }
  }

  const primary = (process.env.IMAGE_GEN_PROVIDER_PRIMARY || "openai") as ImageProvider;
  const fallback = (process.env.IMAGE_GEN_PROVIDER_FALLBACK || "google") as ImageProvider;

  // 2026-05-12: model choice override. When user picks a specific model,
  // it becomes "primary" and the env default becomes "fallback".
  const choice = input.modelChoice ?? "auto";
  const requestedModel = choice;
  let effectivePrimary: ImageProvider = primary;
  let primaryModelId: string | null = null;
  switch (choice) {
    case "flux-schnell":   effectivePrimary = "piapi";  primaryModelId = "piapi/flux-schnell"; break;
    case "gpt-image-1":    effectivePrimary = "openai"; primaryModelId = "gpt-image-1"; break;
    case "gpt-image-2":    effectivePrimary = "openai"; primaryModelId = "gpt-image-2"; break;
    case "flux-realism":   effectivePrimary = "piapi";  primaryModelId = "piapi/flux-realism"; break;
    case "ideogram-v3":    effectivePrimary = "piapi";  primaryModelId = "piapi/ideogram-v3"; break;
    case "imagen-3":       effectivePrimary = "google"; break;
    case "auto":
    default:               /* keep env default */ break;
  }

  const run = async (p: ImageProvider, modelId?: string | null) => {
    if (p === "openai") return await runOpenAI(promptText, size, modelId ?? undefined);
    if (p === "google") return await runGoogleImagen(promptText, size);
    if (p === "piapi")  return await runPiapi(promptText, size, modelId ?? "piapi/flux-schnell");
    throw new Error(`Provider ${p} not implemented`);
  };

  let provider: ImageProvider = effectivePrimary;
  let out: { url: string | null; b64: string | null; model: string } | null = null;
  let errorMsg: string | undefined;
  let usedFallback = false;
  try {
    out = await run(effectivePrimary, primaryModelId);
  } catch (e: any) {
    errorMsg = `${effectivePrimary}: ${e?.message ?? e}`;
    // 2026-05-14 (CJ「生圖生不出來」— Pokémon 角色被 OpenAI safety
    // system 拒絕): when the primary failure is a content-policy /
    // safety-system block, jump STRAIGHT to PiAPI Flux Schnell instead
    // of the env default fallback. Flux has the loosest content policy
    // and is the most likely to succeed for branded characters.
    const isSafetyBlock = /safety system|content_policy|rejected by the safety|content policy|moderation/i.test(errorMsg);
    // Build a 2-step fallback list:
    //   1) preferred fallback (PiAPI if safety-block, else env default)
    //   2) other half of the env default
    const fallbacks: Array<{ p: ImageProvider; modelId?: string | null }> = isSafetyBlock
      ? [{ p: "piapi", modelId: "piapi/flux-schnell" }, { p: fallback }, { p: primary }]
      : [{ p: effectivePrimary === fallback ? primary : fallback }, { p: "piapi", modelId: "piapi/flux-schnell" }];
    // De-duplicate (skip the one we already tried)
    const tried = new Set<string>([`${effectivePrimary}:${primaryModelId ?? ""}`]);
    for (const fb of fallbacks) {
      const key = `${fb.p}:${fb.modelId ?? ""}`;
      if (tried.has(key)) continue;
      tried.add(key);
      try {
        out = await run(fb.p, fb.modelId);
        provider = fb.p;
        usedFallback = true;
        break;
      } catch (e2: any) {
        errorMsg = `${errorMsg}\n${fb.p}: ${String(e2?.message ?? e2).slice(0, 200)}`;
      }
    }
  }

  if (out) {
    await db.execute(sql`
      UPDATE generated_images
      SET provider = ${provider}, model = ${out.model},
          url = ${out.url}, b64DataKey = ${out.b64 ? `inline:${id}` : null},
          status = 'ready', errorMsg = NULL
      WHERE id = ${id}
    `);
    return { id, provider, model: out.model, url: out.url, b64: out.b64, status: "ready", effectivePrompt, requestedModel, usedFallback };
  }
  const safeErrorMsg = redactProviderSecrets(errorMsg ?? "unknown").slice(0, 800);
  await db.execute(sql`
    UPDATE generated_images
    SET status = 'failed', errorMsg = ${safeErrorMsg}
    WHERE id = ${id}
  `);
  return {
    id,
    provider: primary,
    model: "unknown",
    url: null,
    b64: null,
    status: "failed",
    effectivePrompt,
    requestedModel,
    usedFallback: false,
    errorMsg: safeErrorMsg,
  };
}

/**
 * Helper: fetch brand visual context (positioning/voice/archetype/audience)
 * from Brand Brain + upstream decision lineage to inject into prompts.
 */
export async function resolveBrandVisualContext(
  brandId: number,
  upstreamDecisionId?: number
): Promise<BrandVisualContext> {
  const db = await getDb();
  if (!db) return {};
  const [rows] = (await db.execute(sql`
    SELECT name FROM brands WHERE id = ${brandId} LIMIT 1
  `)) as any;
  const brandName = Array.isArray(rows) ? rows[0]?.name : undefined;

  let positioning: string | undefined;
  let archetype: string | undefined;
  let voiceTone: string | undefined;
  let audience: string | undefined;

  if (upstreamDecisionId) {
    const chain = await loadLineage(upstreamDecisionId);
    for (const d of chain) {
      const p = typeof d.payload === "string" ? safeParse(d.payload) : d.payload;
      if (d.decisionType.includes("positioning") && p) {
        positioning = positioning ?? (p.positioningStatement || p.statement || d.summary || undefined);
      }
      if (d.decisionType.includes("archetype") && p) {
        archetype = archetype ?? (p.archetype || p.name || d.title || undefined);
        voiceTone = voiceTone ?? p.voiceTone ?? p.tone ?? undefined;
      }
      if (d.decisionType.includes("stp") || d.decisionType.includes("audience")) {
        audience = audience ?? (p?.targetSegment || p?.persona || d.summary || undefined);
      }
    }
  }
  return { brandName, positioning, archetype, voiceTone, audience };
}

function safeParse(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
