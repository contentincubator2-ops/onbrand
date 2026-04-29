/**
 * mediaModels — registry of available image / video AI models.
 *
 * Per CJ direction 2026-04-29: every image/video output goes through a
 * 3-step flow — design direction proposal → user approval → prompt + model
 * picker. This file is the single source for "what models can the picker
 * offer". Server-side adapters are wired in mediaRouter.
 *
 * Status:
 *   "ready"  — backend has integration, picker can dispatch
 *   "manual" — no API integration, user copies prompt to external tool
 *   "soon"   — listed for visibility but disabled in UI
 */

export type MediaKind = "image" | "video";
export type MediaStatus = "ready" | "manual" | "soon";

export interface MediaModel {
  id: string;
  name: string;
  vendor: string;
  kind: MediaKind;
  status: MediaStatus;
  /** Short marketing strap — what this model is best at. */
  strengths: string;
  /** Rough cost estimate per generation (USD). */
  costEstimateUsd?: number;
  /** Wall-clock estimate per generation. */
  durationSecEstimate?: number;
  /** Aspect ratios / resolutions the picker exposes. */
  formats?: string[];
}

// ── Image ────────────────────────────────────────────────────────────────
export const IMAGE_MODELS: MediaModel[] = [
  {
    id: "openai/gpt-image-1",
    name: "GPT Image 1",
    vendor: "OpenAI",
    kind: "image",
    status: "ready",
    strengths: "高 prompt 服從性、品牌語境理解最佳，適合品牌主視覺、編輯封面",
    costEstimateUsd: 0.04,
    durationSecEstimate: 12,
    formats: ["1024×1024", "1024×1536", "1536×1024"],
  },
  {
    id: "azure/gpt-image-2",
    name: "GPT Image 2 (Azure)",
    vendor: "Azure OpenAI",
    kind: "image",
    status: "ready",
    strengths: "與 GPT Image 1 同核心，走 Azure 配額；squad cover / agent avatar 用此",
    costEstimateUsd: 0.013,
    durationSecEstimate: 15,
    formats: ["1024×1024"],
  },
  {
    id: "google/imagen-3",
    name: "Imagen 3",
    vendor: "Google",
    kind: "image",
    status: "ready",
    strengths: "攝影寫實 / 真人場景，Gemini API 整合",
    costEstimateUsd: 0.03,
    durationSecEstimate: 8,
    formats: ["1024×1024", "1024×1792", "1792×1024"],
  },
  {
    id: "hailuo/image",
    name: "Hailuo (MiniMax) Image",
    vendor: "MiniMax",
    kind: "image",
    status: "ready", // HAILUO_API_KEY + MINIMAX_API_KEY available
    strengths: "亞洲臉孔、東方審美 / 中文文字呈現較好",
    costEstimateUsd: 0.02,
    durationSecEstimate: 10,
    formats: ["1024×1024", "1024×1792"],
  },
  {
    id: "fal/flux-dev",
    name: "FLUX.1 [dev] (fal.ai)",
    vendor: "Black Forest Labs via fal.ai",
    kind: "image",
    status: "ready",
    strengths: "風格多樣、藝術插畫品質高、寫實 / 抽象都強",
    costEstimateUsd: 0.025,
    durationSecEstimate: 8,
    formats: ["1024×1024", "1024×1792", "1792×1024"],
  },
  {
    id: "midjourney/v7",
    name: "Midjourney v7",
    vendor: "Midjourney",
    kind: "image",
    status: "manual",
    strengths: "藝術性、構圖質感最強；無 API，需手動貼到 Discord",
    durationSecEstimate: 60,
  },
];

// ── Video ────────────────────────────────────────────────────────────────
export const VIDEO_MODELS: MediaModel[] = [
  {
    id: "fal/seedance-v1-5-lite",
    name: "Seedance 2.0",
    vendor: "ByteDance via fal.ai",
    kind: "video",
    status: "ready",
    strengths: "8 秒場景、1080p、東方臉孔 / 動作流暢，目前主力 t2v",
    costEstimateUsd: 0.20,
    durationSecEstimate: 90,
    formats: ["8s", "1080p"],
  },
  {
    id: "hailuo/i2v",
    name: "Hailuo i2v (MiniMax)",
    vendor: "MiniMax",
    kind: "video",
    status: "ready", // HAILUO_API_KEY + MINIMAX_API_KEY available
    strengths: "從靜態圖延伸動態（image-to-video），人臉動作自然",
    costEstimateUsd: 0.15,
    durationSecEstimate: 60,
    formats: ["6s", "720p"],
  },
  {
    id: "hailuo/t2v",
    name: "Hailuo t2v (MiniMax)",
    vendor: "MiniMax",
    kind: "video",
    status: "ready",
    strengths: "純文字生影片，國風 / 寫實 / 動畫風格皆強",
    costEstimateUsd: 0.18,
    durationSecEstimate: 75,
    formats: ["6s", "720p"],
  },
  {
    id: "google/veo-3",
    name: "Veo 3",
    vendor: "Google",
    kind: "video",
    status: "ready", // GEMINI_API_KEY available
    strengths: "高解析、影片長度可達 30+ 秒、聲音 + 字幕同步生成",
    costEstimateUsd: 0.50,
    durationSecEstimate: 180,
    formats: ["8s", "16s", "30s", "1080p", "4K"],
  },
];

export const ALL_MODELS = [...IMAGE_MODELS, ...VIDEO_MODELS];

export function modelsByKind(kind: MediaKind): MediaModel[] {
  return ALL_MODELS.filter((m) => m.kind === kind);
}

export function findModel(id: string): MediaModel | undefined {
  return ALL_MODELS.find((m) => m.id === id);
}
