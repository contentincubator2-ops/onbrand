import { invokeLLM } from "../../platform/core/llm";

const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/u;

export interface ImagePromptTranslation {
  prompt: string;
  translated: boolean;
}

export function containsCjk(text: string): boolean {
  return CJK_RE.test(text);
}

/**
 * The router accepts up to 4,000 characters. A fixed 1,000-token ceiling
 * deterministically truncated long Chinese instructions, which then forced
 * the generation path back to the untranslated input. Scale output headroom
 * with the source while retaining the previous floor for ordinary prompts.
 */
export function translationMaxTokens(prompt: string): number {
  return Math.min(6_000, Math.max(1_000, Math.ceil(prompt.length * 1.5)));
}

/**
 * Translate only user-authored CJK image instructions. Translation is an
 * optional quality layer: any provider/configuration/empty-output failure
 * returns the original prompt so image generation can continue unchanged.
 */
export async function translateImagePromptToEnglish(prompt: string): Promise<ImagePromptTranslation> {
  if (!containsCjk(prompt)) return { prompt, translated: false };

  try {
    const result = await invokeLLM({
      // Translation is non-billable preprocessing within the image action's
      // existing fixed point charge. Prefer a cheap mini deployment, while
      // invokeLLM's provider cascade keeps this working if Foundry is absent.
      provider: "azure-foundry",
      model: "gpt-4o-mini",
      maxTokens: translationMaxTokens(prompt),
      messages: [
        {
          role: "system",
          content:
            "Translate the user's image-generation instruction into fluent, precise English. Preserve every visual detail, constraint, proper noun, structure, and emphasis; do not add ideas or explanations. Output only the translated instruction.",
        },
        { role: "user", content: prompt },
      ],
    });
    const choice = result.choices[0];
    if (/max_tokens|length/i.test(choice?.finish_reason ?? "")) {
      throw new Error("translation was truncated");
    }
    const translated = choice?.message?.content?.toString().trim() ?? "";
    if (!translated) throw new Error("translation returned empty content");
    return { prompt: translated, translated: true };
  } catch (error) {
    console.warn(
      "[imageGen] CJK prompt translation failed; using the original prompt:",
      error instanceof Error ? error.message : String(error),
    );
    return { prompt, translated: false };
  }
}
