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
/** Which backend route serves this model. */
export type MediaProvider =
  | "openai"
  | "azure-openai"
  | "google-gemini"
  | "minimax-direct"
  | "fal-direct"
  | "piapi"        // 62a5ff21… aggregator: kling / runway / pika / ideogram / hedra / flux pro / sd3.5 / topaz
  | "atlas-cloud"  // apikey-aa7918… aggregator
  | "manual";      // user copies prompt to external tool (Midjourney Discord)

export interface MediaModel {
  id: string;
  name: string;
  vendor: string;
  provider: MediaProvider;
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
  /** Tags help squad-runner auto-pick by need: "logo" | "realism" | "asian-face" | "cinematic" | "lipsync" | "vector" | etc. */
  tags?: string[];
}

// ── Image ────────────────────────────────────────────────────────────────
export const IMAGE_MODELS: MediaModel[] = [
  {
    id: "openai/gpt-image-1",
    name: "GPT Image 1",
    vendor: "OpenAI",
    provider: "openai",
    kind: "image",
    status: "ready",
    strengths: "高 prompt 服從性、品牌語境理解最佳，適合品牌主視覺、編輯封面",
    costEstimateUsd: 0.04,
    durationSecEstimate: 12,
    formats: ["1024×1024", "1024×1536", "1536×1024"],
    tags: ["brand-kv", "editorial", "ecommerce-edit", "prompt-fidelity"],
  },
  {
    id: "azure/gpt-image-2",
    name: "GPT Image 2 (Azure)",
    vendor: "Azure OpenAI",
    provider: "azure-openai",
    kind: "image",
    status: "soon", // VERIFY: 401 with current AZURE_IMAGE_API_KEY — needs key refresh
    strengths: "與 GPT Image 1 同核心，走 Azure 配額；squad cover / agent avatar 用此",
    costEstimateUsd: 0.013,
    durationSecEstimate: 15,
    formats: ["1024×1024"],
    tags: ["system-asset", "avatar"],
  },
  {
    id: "google/imagen-4-fast",
    name: "Imagen 4 Fast",
    vendor: "Google",
    provider: "google-gemini",
    kind: "image",
    status: "ready", // VERIFIED working with GEMINI_API_KEY
    strengths: "快速生成、攝影寫實，Gemini API 直接整合",
    costEstimateUsd: 0.02,
    durationSecEstimate: 5,
    formats: ["1024×1024"],
    tags: ["realism", "fast"],
  },
  {
    id: "google/imagen-4-default",
    name: "Imagen 4",
    vendor: "Google",
    provider: "google-gemini",
    kind: "image",
    status: "ready",
    strengths: "標準品質，攝影寫實 / 真人場景強",
    costEstimateUsd: 0.04,
    durationSecEstimate: 12,
    formats: ["1024×1024", "1024×1792", "1792×1024"],
    tags: ["realism", "lifestyle", "portrait"],
  },
  {
    id: "google/imagen-4-ultra",
    name: "Imagen 4 Ultra",
    vendor: "Google",
    provider: "google-gemini",
    kind: "image",
    status: "ready",
    strengths: "最高品質，細節與光影最佳，適合品牌主視覺",
    costEstimateUsd: 0.08,
    durationSecEstimate: 25,
    formats: ["1024×1024", "1792×1024", "1024×1792"],
    tags: ["brand-kv", "premium", "realism"],
  },
  {
    id: "hailuo/image",
    name: "Hailuo (MiniMax) Image",
    vendor: "MiniMax",
    provider: "minimax-direct",
    kind: "image",
    status: "soon", // VERIFY: HAILUO_API_KEY + MINIMAX_API_KEY both rejected (status 2049). Need fresh keys.
    strengths: "亞洲臉孔、東方審美 / 中文文字呈現較好",
    costEstimateUsd: 0.02,
    durationSecEstimate: 10,
    formats: ["1024×1024", "1024×1792"],
    tags: ["asian-face", "chinese-text"],
  },
  {
    id: "fal/flux-dev",
    name: "FLUX.1 [dev] (fal.ai)",
    vendor: "Black Forest Labs via fal.ai",
    provider: "fal-direct",
    kind: "image",
    status: "soon", // VERIFY: fal.ai account is admin-locked. Needs to contact support@fal.ai
    strengths: "風格多樣、藝術插畫品質高、寫實 / 抽象都強",
    costEstimateUsd: 0.025,
    durationSecEstimate: 8,
    formats: ["1024×1024", "1024×1792", "1792×1024"],
    tags: ["illustration", "stylized"],
  },
  // ── PiAPI aggregator (62a5ff21…) ──
  {
    id: "piapi/flux-pro",
    name: "FLUX Pro",
    vendor: "Black Forest Labs via PiAPI",
    provider: "piapi",
    kind: "image",
    status: "ready",
    strengths: "FLUX 商業版，廣告 KV / banner 質感最強",
    costEstimateUsd: 0.05,
    durationSecEstimate: 10,
    formats: ["1024×1024", "1024×1792", "1792×1024"],
    tags: ["brand-kv", "ad-banner", "premium"],
  },
  {
    id: "piapi/flux-realism",
    name: "FLUX Realism",
    vendor: "Black Forest Labs via PiAPI",
    provider: "piapi",
    kind: "image",
    status: "ready",
    strengths: "極致寫實、人像細節，適合 lifestyle / 真人代言情境",
    costEstimateUsd: 0.04,
    durationSecEstimate: 10,
    formats: ["1024×1024", "1024×1792"],
    tags: ["realism", "portrait", "lifestyle"],
  },
  {
    id: "piapi/ideogram-v3",
    name: "Ideogram v3",
    vendor: "Ideogram via PiAPI",
    provider: "piapi",
    kind: "image",
    status: "soon", // VERIFY 2026-04-29: PiAPI rejected both "ideogram" and "Qubico/ideogram" with 400 invalid model. Need exact model identifier from PiAPI dashboard.
    strengths: "字體 / 標誌 / 海報文字合成最強，logo 設計首選",
    costEstimateUsd: 0.04,
    durationSecEstimate: 12,
    formats: ["1024×1024", "1024×1792", "1792×1024"],
    tags: ["logo", "typography", "poster"],
  },
  {
    id: "piapi/sd-3-5-large",
    name: "Stable Diffusion 3.5 Large",
    vendor: "Stability AI via PiAPI",
    provider: "piapi",
    kind: "image",
    status: "soon", // VERIFY 2026-04-29: pending exact PiAPI model identifier — try Qubico/sdxl first.
    strengths: "開源 LoRA 生態最廣，風格化 / 二次元 / 客製化訓練",
    costEstimateUsd: 0.02,
    durationSecEstimate: 8,
    formats: ["1024×1024"],
    tags: ["stylized", "lora", "anime"],
  },
  // ── Atlas Cloud aggregator (apikey-aa7918…) ──
  {
    id: "atlas/recraft-v3",
    name: "Recraft v3",
    vendor: "Recraft via Atlas Cloud",
    provider: "atlas-cloud",
    kind: "image",
    status: "soon", // Atlas Cloud is primarily an LLM aggregator — image-gen endpoint TBD; flip to "ready" after verify-piapi script confirms.
    strengths: "向量風格 / 扁平插畫 / 品牌設計系統，可輸出 SVG-friendly",
    costEstimateUsd: 0.04,
    durationSecEstimate: 10,
    formats: ["1024×1024", "1024×1792"],
    tags: ["vector", "flat-illustration", "brand-system"],
  },
  {
    id: "midjourney/v7",
    name: "Midjourney v7",
    vendor: "Midjourney",
    provider: "manual",
    kind: "image",
    status: "manual",
    strengths: "藝術性、構圖質感最強；無 API，需手動貼到 Discord",
    durationSecEstimate: 60,
    tags: ["premium", "artistic", "brand-kv"],
  },
];

// ── Video ────────────────────────────────────────────────────────────────
export const VIDEO_MODELS: MediaModel[] = [
  {
    id: "google/veo-3",
    name: "Veo 3",
    vendor: "Google",
    provider: "google-gemini",
    kind: "video",
    status: "ready", // VERIFIED — GEMINI_API_KEY works, model available
    strengths: "高解析、影片長度可達 30+ 秒、聲音 + 字幕同步生成",
    costEstimateUsd: 0.50,
    durationSecEstimate: 180,
    formats: ["8s", "16s", "1080p"],
    tags: ["cinematic", "audio-sync", "premium"],
  },
  {
    id: "google/veo-3-fast",
    name: "Veo 3 Fast",
    vendor: "Google",
    provider: "google-gemini",
    kind: "video",
    status: "ready",
    strengths: "Veo 3 快速版，價格 / 速度更佳",
    costEstimateUsd: 0.25,
    durationSecEstimate: 60,
    formats: ["8s", "1080p"],
    tags: ["fast", "social-reel"],
  },
  {
    id: "fal/seedance-v1-5-lite",
    name: "Seedance 2.0",
    vendor: "ByteDance via fal.ai",
    provider: "fal-direct",
    kind: "video",
    status: "soon", // fal.ai account locked
    strengths: "8 秒場景、1080p、東方臉孔 / 動作流暢",
    costEstimateUsd: 0.20,
    durationSecEstimate: 90,
    formats: ["8s", "1080p"],
    tags: ["asian-face", "short-clip"],
  },
  {
    id: "hailuo/i2v",
    name: "Hailuo i2v (MiniMax)",
    vendor: "MiniMax",
    provider: "minimax-direct",
    kind: "video",
    status: "soon", // MiniMax key rejected
    strengths: "從靜態圖延伸動態（image-to-video），人臉動作自然",
    costEstimateUsd: 0.15,
    durationSecEstimate: 60,
    formats: ["6s", "720p"],
    tags: ["i2v", "asian-face"],
  },
  {
    id: "hailuo/t2v",
    name: "Hailuo t2v (MiniMax)",
    vendor: "MiniMax",
    provider: "minimax-direct",
    kind: "video",
    status: "soon", // MiniMax key rejected
    strengths: "純文字生影片，國風 / 寫實 / 動畫風格皆強",
    costEstimateUsd: 0.18,
    durationSecEstimate: 75,
    formats: ["6s", "720p"],
    tags: ["t2v", "chinese-style"],
  },
  // ── PiAPI aggregator video (62a5ff21…) ──
  {
    id: "piapi/kling-v2-master",
    name: "Kling v2 Master",
    vendor: "Kuaishou via PiAPI",
    provider: "piapi",
    kind: "video",
    status: "ready",
    strengths: "東方臉孔 / 國風場景頂級，運鏡 + 動作流暢度業界第一",
    costEstimateUsd: 0.35,
    durationSecEstimate: 120,
    formats: ["5s", "10s", "1080p"],
    tags: ["t2v", "asian-face", "cinematic", "chinese-style"],
  },
  {
    id: "piapi/kling-v1-6-i2v",
    name: "Kling v1.6 i2v",
    vendor: "Kuaishou via PiAPI",
    provider: "piapi",
    kind: "video",
    status: "ready",
    strengths: "靜態 KV → 動態廣告（image-to-video）首選，把 logo / 海報動起來",
    costEstimateUsd: 0.20,
    durationSecEstimate: 90,
    formats: ["5s", "10s", "1080p"],
    tags: ["i2v", "kv-animate", "ad-banner"],
  },
  {
    id: "piapi/runway-gen-4",
    name: "Runway Gen-4",
    vendor: "Runway via PiAPI",
    provider: "piapi",
    kind: "video",
    status: "ready",
    strengths: "鏡頭運動 / cinematic 質感最自然，廣告短片首選",
    costEstimateUsd: 0.50,
    durationSecEstimate: 150,
    formats: ["5s", "10s", "1080p"],
    tags: ["cinematic", "camera-motion", "ad-film"],
  },
  {
    id: "piapi/runway-gen-4-turbo",
    name: "Runway Gen-4 Turbo",
    vendor: "Runway via PiAPI",
    provider: "piapi",
    kind: "video",
    status: "ready",
    strengths: "Runway 快速版，社群短影音批量生成",
    costEstimateUsd: 0.25,
    durationSecEstimate: 60,
    formats: ["5s", "1080p"],
    tags: ["fast", "social-reel"],
  },
  {
    id: "piapi/pika-v2",
    name: "Pika v2",
    vendor: "Pika Labs via PiAPI",
    provider: "piapi",
    kind: "video",
    status: "ready",
    strengths: "風格化動畫 / 二次元 / 卡通質感",
    costEstimateUsd: 0.18,
    durationSecEstimate: 75,
    formats: ["3s", "5s", "720p", "1080p"],
    tags: ["stylized", "anime", "cartoon"],
  },
  {
    id: "piapi/hedra-character-3",
    name: "Hedra Character 3",
    vendor: "Hedra via PiAPI",
    provider: "piapi",
    kind: "video",
    status: "ready",
    strengths: "對嘴 / 數位人 / talking head，從照片 + 音訊生成代言人影片",
    costEstimateUsd: 0.30,
    durationSecEstimate: 120,
    formats: ["up-to-30s", "720p"],
    tags: ["lipsync", "digital-human", "spokesperson"],
  },
];

export const ALL_MODELS = [...IMAGE_MODELS, ...VIDEO_MODELS];

export function modelsByKind(kind: MediaKind): MediaModel[] {
  return ALL_MODELS.filter((m) => m.kind === kind);
}

export function findModel(id: string): MediaModel | undefined {
  return ALL_MODELS.find((m) => m.id === id);
}

/** Filter models by status (default: only "ready" + "manual" — hides "soon"). */
export function availableModels(kind?: MediaKind): MediaModel[] {
  return ALL_MODELS.filter(
    (m) => (!kind || m.kind === kind) && m.status !== "soon",
  );
}

/**
 * Pick models matching a need-tag (e.g. "logo", "cinematic", "asian-face").
 * Returns ready models first, then manual, sorted by tag-match strength.
 * Used by squad-runner to pre-select recommended models for a visual step.
 */
export function modelsForTag(tag: string, kind?: MediaKind): MediaModel[] {
  return availableModels(kind)
    .filter((m) => m.tags?.includes(tag))
    .sort((a, b) => {
      const score = (m: MediaModel) => (m.status === "ready" ? 0 : 1);
      return score(a) - score(b);
    });
}

/** Group available models by provider — useful for the picker UI. */
export function modelsByProvider(kind?: MediaKind): Record<MediaProvider, MediaModel[]> {
  const out = {} as Record<MediaProvider, MediaModel[]>;
  for (const m of availableModels(kind)) {
    (out[m.provider] = out[m.provider] ?? []).push(m);
  }
  return out;
}
