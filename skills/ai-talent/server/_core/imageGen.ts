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

import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { loadLineage } from "./decisionBridge";
import { translateImagePromptToEnglish } from "./imagePromptTranslation";
import { isRetriableImageError } from "./mediaGen";

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
   *  When set, generation routes to gpt-image-2 subject-reference
   *  (/images/edits) with the PRODUCT-FIDELITY guard, and
   *  does NOT fall back to text-only providers on failure — a hallucinated
   *  product is worse than a failed run. */
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
  /** User selection before provider fallback (always gpt-image-2 in subject mode). */
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
  // designated OpenAI image model. Verified openable on the current key
  // before the switch (op-probe-openai-image: HTTP 200, 17.5s).
  // 2026-09-21 (CJ「正式環境的生圖，都採用 gpt image 2」): the
  // IMAGE_GEN_MODEL_OPENAI env read is gone. It was unset on the VM, so it
  // never chose the model — it only left a way for a stale .env line to
  // silently downgrade every production image back to gpt-image-1. Callers
  // that genuinely want another OpenAI model pass modelOverride explicitly.
  const model = modelOverride || "gpt-image-2";

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

  // 2026-07-25 product-faithful: a subject-reference run never falls back to a
  // text-only provider — it can't see the real product, and a hallucinated
  // product violates the fidelity bar.
  // 2026-09-23 (CJ「備援要禁掉」): and now it doesn't fall back at all. The run
  // is gpt-image-2 /images/edits or it is a visible failure. Nano Banana, the
  // other subject-reference model, stays wired for the manual picker but is
  // never substituted behind the user's back.
  if (input.subjectImageUrl) {
    const { dispatchGenerate } = await import("./mediaGen");
    const aspect = size === "1536x1024" ? "16:9" : size === "1024x1536" ? "9:16" : "1:1";
    const failed = async (msg: string) => {
      const safe = redactProviderSecrets(msg).slice(0, 240);
      await db.execute(sql`UPDATE generated_images SET status='failed', errorMsg=${safe} WHERE id=${id}`);
      return {
        id, provider: "openai" as ImageProvider, model: "gpt-image-2", url: null, b64: null,
        status: "failed" as const, effectivePrompt, requestedModel: "gpt-image-2",
        usedFallback: false, errorMsg: safe,
      };
    };
    // 2026-09-23 (CJ「把同模型重試補上」): one retry, same model, only for the
    // failures that are about timing. A refusal or a billing block will answer
    // the same way a second later.
    const runEdit = async () => await dispatchGenerate("openai/gpt-image-2", {
        prompt: promptText,
        imageUrl: input.subjectImageUrl,
        aspectRatio: aspect as any,
        brandId: input.brandId,
        // The blanket NO_TEXT_NEGATIVE_PROMPT can't be used here — it would
        // fight the real product's own label. Mirror-only, matching what
        // mediaRouter.generate already passes on this same path. (OpenAI has
        // no negative_prompt field; its guard rides in promptText.)
        negativePrompt: NO_MIRROR_NEGATIVE_PROMPT,
      });
    try {
      let r = await runEdit();
      if (!(r.status === "ready" && r.url) && isRetriableImageError(r.errorMsg ?? "")) {
        console.warn(`[imageGen] retrying product-reference gpt-image-2 once — ${String(r.errorMsg).slice(0, 160)}`);
        r = await runEdit();
      }
      // TODO: Add post-generation vision validation/retry for product fidelity;
      // prompt arbitration reduces conflicts but cannot prove output compliance.
      if (r.status === "ready" && r.url) {
        await db.execute(sql`
          UPDATE generated_images
          SET provider = 'openai', model = 'gpt-image-2', url = ${r.url},
              status = 'ready', errorMsg = NULL
          WHERE id = ${id}
        `);
        return {
          id, provider: "openai" as ImageProvider, model: "gpt-image-2", url: r.url, b64: null,
          status: "ready" as const, effectivePrompt, requestedModel: "gpt-image-2", usedFallback: false,
        };
      }
      return await failed(r.errorMsg ?? "gpt-image-2 returned no image");
    } catch (e: any) {
      return await failed(`gpt-image-2: ${String(e?.message ?? e).slice(0, 400)}`);
    }
  }

  // 2026-09-23 (CJ「備援要禁掉」): every production image is gpt-image-2.
  //
  // What used to live here: an env-chosen primary/fallback provider pair plus a
  // per-choice switch that sent "flux-schnell" to PiAPI, "imagen-3" to Google
  // and so on. The picker only offers gpt-image-2 now, but a stored legacy
  // value on an old variant — or any API caller — could still steer a
  // production render onto another model. Legacy values are accepted (so old
  // clients don't 400) and collapse to gpt-image-2. The enum in imageRouter
  // stays for the same reason.
  const choice = input.modelChoice ?? "auto";
  const requestedModel = choice;
  const primaryModelId = choice === "gpt-image-1" ? "gpt-image-1" : "gpt-image-2";

  const provider: ImageProvider = "openai";
  let out: { url: string | null; b64: string | null; model: string } | null = null;
  let errorMsg: string | undefined;
  try {
    out = await runOpenAI(promptText, size, primaryModelId);
  } catch (e: any) {
    const firstMsg = String(e?.message ?? e);
    // 2026-09-23 (CJ「把同模型重試補上」): same model, once, timing failures only.
    if (isRetriableImageError(firstMsg)) {
      try {
        console.warn(`[imageGen] retrying ${primaryModelId} once — ${firstMsg.slice(0, 160)}`);
        out = await runOpenAI(promptText, size, primaryModelId);
      } catch (retryError: any) {
        errorMsg = `openai: ${firstMsg} / 重試後：${String(retryError?.message ?? retryError)}`;
      }
    } else {
      errorMsg = `openai: ${firstMsg}`;
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
    return { id, provider, model: out.model, url: out.url, b64: out.b64, status: "ready", effectivePrompt, requestedModel, usedFallback: false };
  }
  const safeErrorMsg = redactProviderSecrets(errorMsg ?? "unknown").slice(0, 800);
  await db.execute(sql`
    UPDATE generated_images
    SET status = 'failed', errorMsg = ${safeErrorMsg}
    WHERE id = ${id}
  `);
  return {
    id,
    provider,
    model: primaryModelId,
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
