/**
 * mediaModels — the still-image models the picker offers.
 *
 * 2026-09-21 (CJ「我建議，我們就只留 NANO BANANA 跟 GPT IMAGE 2 兩個選項……其他的 MODEL 都不需要了」):
 * exactly two. GPT Image 2 is the default for everything (with or without a
 * product photo); Nano Banana is the alternative the user picks — typically
 * after GPT Image 2 fails. There is no automatic switching between them.
 *
 * Mirrors server/content/core/stillImageModels.ts (the ids must match; a
 * server test reads this file to keep the two lists in step).
 */

export type MediaKind = "image";
export type MediaProvider = "openai" | "google-gemini";

export interface MediaModel {
  id: string;
  name: string;
  vendor: string;
  provider: MediaProvider;
  kind: MediaKind;
  /** Short marketing strap — what this model is best at. */
  strengths: string;
  /** Rough cost estimate per generation (USD). */
  costEstimateUsd?: number;
  /** Wall-clock estimate per generation. */
  durationSecEstimate?: number;
  /** Aspect ratios / resolutions the picker exposes. */
  formats?: string[];
  /** Tags help squad-runner auto-pick by need: "realism" | "product-staging" | etc. */
  tags?: string[];
}

export const GPT_IMAGE_2_ID = "openai/gpt-image-2";
export const NANO_BANANA_ID = "google/nano-banana";

// ── Image ────────────────────────────────────────────────────────────────
export const IMAGE_MODELS: MediaModel[] = [
  {
    id: GPT_IMAGE_2_ID,
    name: "GPT Image 2（預設）",
    vendor: "OpenAI",
    provider: "openai",
    kind: "image",
    strengths: "預設用它：prompt 服從性高、光影自然；上傳產品照時會以產品照為基準編輯，保留標籤與外觀",
    costEstimateUsd: 0.04,
    durationSecEstimate: 20,
    formats: ["1024×1024", "1024×1536", "1536×1024"],
    tags: ["brand-kv", "editorial", "ecommerce-edit", "prompt-fidelity", "product-staging", "realism"],
  },
  {
    id: NANO_BANANA_ID,
    name: "Nano Banana",
    vendor: "Google",
    provider: "google-gemini",
    kind: "image",
    strengths: "GPT Image 2 不行時的替代選項：風格與構圖不同，也吃產品照。只有你選它才會用",
    costEstimateUsd: 0.04,
    durationSecEstimate: 15,
    formats: ["1:1", "4:3", "16:9", "9:16"],
    tags: ["product-staging", "subject-reference", "ecommerce-edit", "realism"],
  },
];

export function findModel(id: string): MediaModel | undefined {
  return IMAGE_MODELS.find((m) => m.id === id);
}
