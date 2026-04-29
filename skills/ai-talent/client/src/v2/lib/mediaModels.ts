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
    status: "soon", // VERIFY: 401 with current AZURE_IMAGE_API_KEY — needs key refresh
    strengths: "與 GPT Image 1 同核心，走 Azure 配額；squad cover / agent avatar 用此",
    costEstimateUsd: 0.013,
    durationSecEstimate: 15,
    formats: ["1024×1024"],
  },
  {
    id: "google/imagen-4-fast",
    name: "Imagen 4 Fast",
    vendor: "Google",
    kind: "image",
    status: "ready", // VERIFIED working with GEMINI_API_KEY
    strengths: "快速生成、攝影寫實，Gemini API 直接整合",
    costEstimateUsd: 0.02,
    durationSecEstimate: 5,
    formats: ["1024×1024"],
  },
  {
    id: "google/imagen-4-default",
    name: "Imagen 4",
    vendor: "Google",
    kind: "image",
    status: "ready",
    strengths: "標準品質，攝影寫實 / 真人場景強",
    costEstimateUsd: 0.04,
    durationSecEstimate: 12,
    formats: ["1024×1024", "1024×1792", "1792×1024"],
  },
  {
    id: "google/imagen-4-ultra",
    name: "Imagen 4 Ultra",
    vendor: "Google",
    kind: "image",
    status: "ready",
    strengths: "最高品質，細節與光影最佳，適合品牌主視覺",
    costEstimateUsd: 0.08,
    durationSecEstimate: 25,
    formats: ["1024×1024", "1792×1024", "1024×1792"],
  },
  {
    id: "hailuo/image",
    name: "Hailuo (MiniMax) Image",
    vendor: "MiniMax",
    kind: "image",
    status: "soon", // VERIFY: HAILUO_API_KEY + MINIMAX_API_KEY both rejected (status 2049). Need fresh keys.
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
    status: "soon", // VERIFY: fal.ai account is admin-locked. Needs to contact support@fal.ai
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
    id: "google/veo-3",
    name: "Veo 3",
    vendor: "Google",
    kind: "video",
    status: "ready", // VERIFIED — GEMINI_API_KEY works, model available
    strengths: "高解析、影片長度可達 30+ 秒、聲音 + 字幕同步生成",
    costEstimateUsd: 0.50,
    durationSecEstimate: 180,
    formats: ["8s", "16s", "1080p"],
  },
  {
    id: "google/veo-3-fast",
    name: "Veo 3 Fast",
    vendor: "Google",
    kind: "video",
    status: "ready",
    strengths: "Veo 3 快速版，價格 / 速度更佳",
    costEstimateUsd: 0.25,
    durationSecEstimate: 60,
    formats: ["8s", "1080p"],
  },
  {
    id: "fal/seedance-v1-5-lite",
    name: "Seedance 2.0",
    vendor: "ByteDance via fal.ai",
    kind: "video",
    status: "soon", // fal.ai account locked
    strengths: "8 秒場景、1080p、東方臉孔 / 動作流暢",
    costEstimateUsd: 0.20,
    durationSecEstimate: 90,
    formats: ["8s", "1080p"],
  },
  {
    id: "hailuo/i2v",
    name: "Hailuo i2v (MiniMax)",
    vendor: "MiniMax",
    kind: "video",
    status: "soon", // MiniMax key rejected
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
    status: "soon", // MiniMax key rejected
    strengths: "純文字生影片，國風 / 寫實 / 動畫風格皆強",
    costEstimateUsd: 0.18,
    durationSecEstimate: 75,
    formats: ["6s", "720p"],
  },
];

export const ALL_MODELS = [...IMAGE_MODELS, ...VIDEO_MODELS];

export function modelsByKind(kind: MediaKind): MediaModel[] {
  return ALL_MODELS.filter((m) => m.kind === kind);
}

export function findModel(id: string): MediaModel | undefined {
  return ALL_MODELS.find((m) => m.id === id);
}
