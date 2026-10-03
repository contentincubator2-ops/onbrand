/**
 * 編排器的圖片步驟：產品圖載入與每個版本的生圖。
 */
import localPool from "../../../../localDb";
import { isLocalUploadPath, probeImageUrl } from "../../../../platform/core/media/imageFetch";
import { type BrandIdentityForImage, captionToBilingualVisualBrief } from "../../image/visualBrief";
import type { OrchestraConfig } from "../../catalog/quickTaskFB";
import { GPT_IMAGE_2, generateStillImage } from "../../../../platform/core/media/stillImageModels";
import { PRODUCT_SUBJECT_UNAVAILABLE_ERROR } from "../productSubjectPolicy";
import { buildImageGuardBlock } from "../../image/imagePromptGuards";
import { OrchestraVariant, PRIMARY_IMAGE_CAP_MS } from "./orchestraTypes";

// 2026-05-18 (CJ「fb-60-carousel-5 mockup 沒套用」根因): recordTaskRun
// never received an outputType, so it defaulted to "post" → RunPage
// Layer-2 resolved every task to facebook:feed whenever taskId metadata
// was absent (legacy / edge rows). Map the task's post_type to a SAFE
// outputType that RunPage's outputTypeToFormat resolves correctly
// (notably carousel → "slide" → carousel mockup). Belt-and-braces with
// the taskId Layer-1 path so the right mockup shows regardless.
export function safeOutputTypeForPostType(
  postType: string | undefined | null,
): "post" | "story" | "reel" | "ad_copy" | "slide" {
  switch (String(postType ?? "post")) {
    case "carousel": return "slide";       // RunPage: slide → carousel
    case "story":    return "story";
    case "reel":     return "reel";
    case "ad":       return "ad_copy";     // RunPage: ad_copy → ad
    case "pinned":
    case "feed":
    case "post":
    default:         return "post";        // RunPage: post → feed
  }
}

// 2026-07-27 (CJ「七日工作台，合成圖也套用真實產品圖片」): the manual
// RunPage 改圖 panel already composites the real product photo via Nano
// Banana (see MediaGenFlow.tsx「📦 使用真實產品圖」+ mediaRouter media.generate).
// The 七日工作台 orchestra never had an equivalent — genOneImage always
// text-to-image'd an AI-imagined product. When a run is scoped to a
// specific product (args.productId set), fetch that product's real photo
// once per run so every variant's image composites the actual product
// instead of hallucinating one. Mirrors mediaRouter.listProductImages'
// positioning-JSON lookup (kept file-local — no tRPC round trip needed
// server-side).
export async function loadProductImageUrl(brandId?: number | null, productId?: number | null): Promise<string | null> {
  if (!brandId || !productId) return null;
  try {
    const [rows]: any = await localPool.execute(
      `SELECT positioning FROM products WHERE id = ? AND brandId = ? LIMIT 1`,
      [productId, brandId],
    );
    let p: any = (rows as any[])?.[0]?.positioning;
    if (!p) return null;
    if (typeof p === "string") p = JSON.parse(p);
    const candidates = [
      p?.imageUrl, p?.image,
      p?._interim?.imageUrl, p?._interim?.image,
      Array.isArray(p?.images) ? p.images[0] : null,
      Array.isArray(p?._interim?.images) ? p._interim.images[0] : null,
      Array.isArray(p?._assets?.photos)
        ? (typeof p._assets.photos[0] === "string" ? p._assets.photos[0] : p._assets.photos[0]?.url)
        : null,
    ];
    for (const c of candidates) {
      if (typeof c === "string" && (/^https?:\/\//.test(c) || isLocalUploadPath(c)) && await probeImageUrl(c, 8_000)) return c;
    }
    return null;
  } catch {
    return null;
  }
}

/* 2026-07-16 (CJ「七日發布台的是標準，不應該被更改，是其他任務要對齊七日
 * 發布台的標準」): the image prompt is now produced EXACTLY the way theater
 * does it — the finished CAPTION is converted to a short English visual
 * brief by the shared captionToVisualBrief (verbatim theater logic: same
 * provider, same prompt, same params). The agent-written Chinese 風格方向
 * (`style`) is display-only and never reaches the model. When no caption is
 * available (empty variant / failure placeholder), the Chinese style text is
 * fed to the same converter instead — identical pipeline either way. */
export async function genOneImage(
  args: {
    content: string; style: string | null; platform?: string; palette?: Array<{ hex: string; role: string }>;
    brandIdentity?: BrandIdentityForImage | null;
    /** 2026-07-27 (CJ「合成圖也套用真實產品圖片」): real product photo URL —
     *  when set, routes to Nano Banana subject-reference compositing instead
     *  of text-to-image, mirroring the manual RunPage「使用真實產品圖」panel. */
    subjectImageUrl?: string | null;
    /** True when the run is product-scoped even if its stored photo is broken. */
    subjectImageRequired?: boolean;
  },
  config: OrchestraConfig,
): Promise<OrchestraVariant["image"]> {
  const prompt = args.style ?? ""; // returned as `style` — what the UI shows
  const source = (args.content || args.style || "").trim();
  if (!source) return { style: args.style, prompt: null, promptZh: null, url: null, status: "skipped" };
  if (args.subjectImageRequired && !args.subjectImageUrl) {
    return {
      style: args.style,
      prompt: null,
      promptZh: null,
      modelId: null,
      requestedModelId: GPT_IMAGE_2,
      url: null,
      status: "failed",
      errorMsg: PRODUCT_SUBJECT_UNAVAILABLE_ERROR,
    };
  }
  // 2026-08-19: hoisted out of the try so every return path can persist the
  // generated visual brief that drove the model (see image.prompt). Provider
  // safety/fidelity guardrails are appended separately and are not UI content.
  let modelPrompt: string | null = null;
  let displayPromptZh: string | null = null;
  try {
    const subjectMode = !!args.subjectImageUrl;
    // 2026-07-19 (CJ「品牌顏色會被貫穿到圖片生成的指令中嗎」): brand palette
    // rides along into the shared brief converter → on-brand color schemes.
    const visualBrief = await captionToBilingualVisualBrief({
      caption: source,
      platform: args.platform,
      palette: args.palette,
      brandIdentity: args.brandIdentity,
      subjectMode,
    });
    modelPrompt = visualBrief.prompt;
    displayPromptZh = visualBrief.promptZh;
    const aspect = (config.aspectRatio === "1.91:1" ? "16:9" : config.aspectRatio) as any;
    // 2026-07-07 (CJ「YT 縮圖出現不是國字的國字」): image models hallucinate
    // garbled CJK text, worst under 16:9 thumbnail framing. The real title is
    // overlaid in the mockup/output layer, so this image must be a CLEAN,
    // text-free background. gpt-image-2 and Nano Banana take no negative_prompt
    // field, so the dominant NO-TEXT directive in the positive prompt
    // (buildImageGuardBlock) is the whole mechanism.
    // 2026-07-27 (CJ「鏡子裡的她，跟實際的髮型或頭的轉向不同」): mirror /
    // reflective-surface compositions are a well-known failure mode for
    // every text-to-image model — they cannot keep a reflection physically
    // consistent with the subject's actual pose. Rather than trying to
    // prompt our way to a correct reflection (unreliable), avoid the
    // composition entirely — same philosophy as the NO-TEXT policy: route
    // around what models can't do, don't ship the broken result.
    // 2026-08-19 (客戶回報「勾選真實產品後再產圖，出現錯誤中文字」): this file
    // used to carry its own paraphrase of the fidelity guard, so tightening
    // imageGen's copy left this path on the old, looser wording. Import the
    // shared constant — one guard, one place to fix it.
    const { PRODUCT_FAITHFUL_PROMPT_BLOCK, NO_MIRROR_PROMPT_BLOCK } = await import("../../image/imageGen");
    const promptNoText = `${modelPrompt}\n\n${buildImageGuardBlock({
      subjectMode,
      productFaithfulBlock: PRODUCT_FAITHFUL_PROMPT_BLOCK,
      noMirrorBlock: NO_MIRROR_PROMPT_BLOCK,
    })}`;
    const opts = {
      prompt: promptNoText,
      aspectRatio: aspect,
      // quality is deliberately unset: forcing "high" made gpt-image-2 take
      // 73.8s instead of 14.1s for a SMALLER image (measured 2026-09-01).
      ...(args.subjectImageUrl ? { imageUrl: args.subjectImageUrl } : {}),
    };
    // 2026-09-21 (CJ「不論是否有產品圖，都只用 gpt image 2 生成，不行的時候，再讓用戶選
    // NANO BANANA」): gpt-image-2 for every task image — a product photo just makes
    // it use the image-edit endpoint. One same-model retry, then a FAILED image
    // that carries canSwitchTo so RunPage can offer「改用 Nano Banana」. No Flux
    // fallback, no per-task model pin: silently shipping a picture from a model
    // the user never chose is what this replaces.
    // Per-attempt cap 35s (5 YT images finished inside it when measured); two
    // attempts stay inside the 100s tier budget with the brief stage.
    const out = await generateStillImage(GPT_IMAGE_2, opts, { attemptTimeoutMs: PRIMARY_IMAGE_CAP_MS });
    if (out.status === "ready" && out.url) {
      return {
        style: prompt,
        prompt: modelPrompt,
        promptZh: displayPromptZh,
        modelId: out.modelId,
        requestedModelId: out.modelId,
        url: out.url,
        status: "ready",
      };
    }
    console.warn(
      `[genOneImage] ${out.modelId} failed after ${out.attempts} attempt(s) (${out.failureKind}) — ` +
      `${String(out.errorMsg ?? "").slice(0, 200)}`,
    );
    return {
      style: prompt,
      prompt: modelPrompt,
      promptZh: displayPromptZh,
      modelId: out.modelId,
      requestedModelId: out.modelId,
      url: null,
      status: "failed",
      errorMsg: out.errorMsg ?? "no url returned",
      canSwitchTo: out.canSwitchTo,
    };
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    return { style: prompt, prompt: modelPrompt, promptZh: displayPromptZh, url: null, status: msg.includes("exceeded") ? "timeout" : "failed", errorMsg: msg };
  }
}
