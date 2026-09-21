/**
 * imageGen — Decision AI publish-gate image generation service.
 *
 * gpt-image-2 for everything (with or without a product photo); Nano Banana
 * only when the user picks it. One same-model retry, no silent model swap —
 * the policy lives in stillImageModels.ts.
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
import {
  NANO_BANANA,
  generateStillImage,
  resolveStillImageModel,
  toStillImageChoice,
  type ImageFailureKind,
  type StillImageChoice,
} from "./stillImageModels";

export type ImageProvider = "openai" | "google";
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

/**
 * User-facing model choice. Only two exist (CJ 2026-09-21); "auto" and every
 * retired id (flux-*, ideogram-v3, gpt-image-1, …) are still ACCEPTED as input
 * so stale tabs and stored variants keep resolving — see resolveStillImageModel.
 */
export type ImageModelChoice = StillImageChoice | "auto";

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
  /** User-selected model. "auto" / undefined = gpt-image-2. Nano Banana only when asked for. */
  modelChoice?: ImageModelChoice | (string & {});
  /** 2026-07-25 (CJ product-faithful gen): URL of the REAL product photo.
   *  Sent as the reference image (gpt-image-2 edits endpoint, or Nano Banana
   *  when the user picked it) with the PRODUCT-FIDELITY guard. There is no
   *  text-only fallback — a hallucinated product is worse than a failed run. */
  subjectImageUrl?: string;
}

export interface ImageGenResult {
  id: number;
  provider: ImageProvider;
  /** The model that ran — always the one requested, never a substitute. */
  model: StillImageChoice;
  url: string | null;
  status: "ready" | "failed";
  /** User scene prompt after optional CJK→English translation, before guards/context. */
  effectivePrompt: string;
  requestedModel: StillImageChoice;
  errorMsg?: string;
  failureKind?: ImageFailureKind;
  /** Set when gpt-image-2 failed: the UI may OFFER this; the server never runs it on its own. */
  canSwitchTo?: StillImageChoice;
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

export async function generateImage(input: ImageGenInput): Promise<ImageGenResult> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const size = input.size ?? channelSize(input.channel);
  const translated = await translateImagePromptToEnglish(input.prompt);
  const effectivePrompt = translated.prompt;
  const promptText = buildPrompt({ ...input, prompt: effectivePrompt });

  const modelId = resolveStillImageModel(input.modelChoice);
  const choice = toStillImageChoice(modelId);
  const provider: ImageProvider = modelId === NANO_BANANA ? "google" : "openai";

  // Pre-insert a pending row so we can retrieve it even if provider crashes.
  const [ins] = (await db.execute(sql`
    INSERT INTO generated_images
      (brandId, decisionId, optionId, provider, model, prompt, sizeSpec, status)
    VALUES
      (${input.brandId}, ${input.decisionId ?? null}, ${input.optionId ?? null},
       ${provider}, ${choice}, ${promptText}, ${size}, 'pending')
  `)) as any;
  const id = Number(ins?.insertId ?? 0);

  // One request → the model the user asked for (default gpt-image-2), retried
  // once on a transient failure, never swapped. The reference photo (when
  // there is one) rides along to whichever of the two models runs.
  const outcome = await generateStillImage(modelId, {
    prompt: promptText,
    size,
    aspectRatio: size === "1536x1024" ? "16:9" : size === "1024x1536" ? "9:16" : "1:1",
    imageUrl: input.subjectImageUrl,
    brandId: input.brandId,
  }, { attemptTimeoutMs: 60_000 });

  if (outcome.status === "ready" && outcome.url) {
    await db.execute(sql`
      UPDATE generated_images
      SET url = ${outcome.url}, status = 'ready', errorMsg = NULL
      WHERE id = ${id}
    `);
    return { id, provider, model: choice, url: outcome.url, status: "ready", effectivePrompt, requestedModel: choice };
  }

  const errorMsg = redactProviderSecrets(outcome.errorMsg ?? "unknown").slice(0, 800);
  await db.execute(sql`UPDATE generated_images SET status = 'failed', errorMsg = ${errorMsg} WHERE id = ${id}`);
  return {
    id, provider, model: choice, url: null, status: "failed", effectivePrompt, requestedModel: choice,
    errorMsg, failureKind: outcome.failureKind, canSwitchTo: outcome.canSwitchTo,
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
