export interface RunImageModelOption {
  value: string;
  en: string;
  zh: string;
}

export const RUN_IMAGE_MODEL_OPTIONS: readonly RunImageModelOption[] = [
  { value: "auto", en: "Auto (default)", zh: "自動（預設）" },
  { value: "flux-schnell", en: "Fast — Flux Schnell (5-10s)", zh: "快速 — Flux Schnell（5-10 秒）" },
  { value: "gpt-image-2", en: "Best — GPT Image-2 (20-30s, OpenAI latest)", zh: "最佳 — GPT Image-2（20-30 秒，OpenAI 最新）" },
  { value: "gpt-image-1", en: "Photo-real — GPT Image-1 (15-25s)", zh: "寫實 — GPT Image-1（15-25 秒）" },
  { value: "flux-realism", en: "Photographic — Flux Realism (15-30s)", zh: "攝影感 — Flux Realism（15-30 秒）" },
  // Every manual image path appends the system-wide zero-text guard. Do not
  // advertise Ideogram as a way to render text that the server forbids.
  { value: "ideogram-v3", en: "Graphic design — Ideogram V3 (text disabled)", zh: "平面設計 — Ideogram V3（依規範不生成圖中文字）" },
  { value: "imagen-3", en: "Google Imagen 4", zh: "Google Imagen 4" },
] as const;
