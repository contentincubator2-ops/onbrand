export interface RunImageModelOption {
  value: string;
  en: string;
  zh: string;
}

/**
 * 2026-09-21 (CJ「生圖，正式環境的生圖，都採用 gpt image 2」): the 改圖
 * dropdown offers gpt-image-2 and nothing else. Flux / Ideogram / Gemini were
 * removed as CHOICES, not as code — imageRouter's enum and imageGen's switch
 * still accept the old values so variants that stored one keep resolving, and
 * Flux Schnell remains the server-side reliability fallback when gpt-image-2
 * fails (the run panel flags that with the orange "fallback" note).
 */
export const RUN_IMAGE_MODEL_OPTIONS: readonly RunImageModelOption[] = [
  { value: "gpt-image-2", en: "GPT Image-2 (OpenAI)", zh: "GPT Image-2（OpenAI）" },
] as const;
