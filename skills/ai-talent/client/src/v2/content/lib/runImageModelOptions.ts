export interface RunImageModelOption {
  value: string;
  en: string;
  zh: string;
}

/**
 * 2026-09-21 (CJ「只留 NANO BANANA 跟 GPT IMAGE 2 兩個選項」): two choices, no "auto" and no
 * per-style models. GPT Image 2 is the default; Nano Banana runs only when picked.
 * Retired values stored on old variants (flux-schnell, imagen-3, …) still resolve on the
 * server (resolveStillImageModel) — they just aren't offered here any more.
 */
export const RUN_IMAGE_MODEL_OPTIONS: readonly RunImageModelOption[] = [
  { value: "gpt-image-2", en: "GPT Image 2 (default, ~20s)", zh: "GPT Image 2（預設，約 20 秒）" },
  { value: "nano-banana", en: "Nano Banana (Google) — if GPT Image 2 doesn't work out", zh: "Nano Banana（Google）— GPT Image 2 不行時再選" },
] as const;
