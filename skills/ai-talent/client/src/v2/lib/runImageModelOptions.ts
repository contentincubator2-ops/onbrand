export interface RunImageModelOption {
  value: string;
  en: string;
  zh: string;
}

/** GPT Image 2 by default; Nano Banana runs only when the user chooses it. */
export const RUN_IMAGE_MODEL_OPTIONS: readonly RunImageModelOption[] = [
  { value: "gpt-image-2", en: "GPT Image-2 (OpenAI)", zh: "GPT Image-2（OpenAI）" },
  { value: "nano-banana", en: "Nano Banana (Google)", zh: "Nano Banana（Google）" },
] as const;
