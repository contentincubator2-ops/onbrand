export interface BilingualVisualBrief {
  /** Model-ready English brief. */
  prompt: string;
  /** Natural Traditional Chinese rendering for display and editing. */
  promptZh: string;
}

export function fallbackBilingualVisualBrief(caption: string): BilingualVisualBrief {
  const excerpt = caption.slice(0, 120);
  return {
    prompt: `Photorealistic editorial scene representing: ${excerpt}`,
    promptZh: `寫實的編輯攝影場景，呈現：${excerpt}`,
  };
}

function stripJsonFence(raw: string): string {
  return raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

export function isTruncatedFinishReason(finishReason: unknown): boolean {
  return /max_tokens|length/i.test(typeof finishReason === "string" ? finishReason : "");
}

/**
 * Parse a provider's bilingual response without ever treating broken JSON as
 * prose. Some fallback providers ignore JSON-only instructions and return a
 * useful English paragraph; retain that compatibility only when the response
 * does not look like JSON.
 */
export function parseBilingualBrief(raw: string, caption: string): BilingualVisualBrief {
  const fallback = fallbackBilingualVisualBrief(caption);
  const cleaned = stripJsonFence(raw);
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const prompt = typeof parsed.prompt === "string" ? parsed.prompt.trim() : "";
    const promptZh = typeof parsed.promptZh === "string" ? parsed.promptZh.trim() : "";
    if (prompt && promptZh) return { prompt, promptZh };
  } catch {
    // 2026-09-28：回報產品照衝突時，模型常在 JSON 前後多講一句話——整段不是 JSON，但中間那個
    // 物件是完整的。只收「完整、欄位齊全」的物件；壞掉的 JSON 仍然不會被當成文字送去生圖。
    const s = cleaned.indexOf("{");
    const e = cleaned.lastIndexOf("}");
    if (s >= 0 && e > s) {
      try {
        const parsed = JSON.parse(cleaned.slice(s, e + 1)) as Record<string, unknown>;
        const prompt = typeof parsed.prompt === "string" ? parsed.prompt.trim() : "";
        const promptZh = typeof parsed.promptZh === "string" ? parsed.promptZh.trim() : "";
        if (prompt && promptZh) return { prompt, promptZh };
      } catch { /* fall through */ }
    }
    if (cleaned && !cleaned.startsWith("{")) {
      return { prompt: cleaned, promptZh: fallback.promptZh };
    }
  }
  return fallback;
}

export function parseBilingualBriefChoice(
  choice: { message?: { content?: unknown }; finish_reason?: unknown } | undefined,
  caption: string,
): BilingualVisualBrief {
  if (isTruncatedFinishReason(choice?.finish_reason)) {
    return fallbackBilingualVisualBrief(caption);
  }
  const raw = choice?.message?.content;
  return parseBilingualBrief(typeof raw === "string" ? raw : "", caption);
}

/**
 * Repair historical prompt values that accidentally persisted an entire JSON
 * response. `undefined` means ordinary text, `null` means JSON-like but unsafe
 * to send, and a string is a recovered model-ready prompt.
 */
export function recoverModelPromptFromJsonLike(raw: string): string | null | undefined {
  const cleaned = stripJsonFence(raw);
  if (!cleaned.startsWith("{")) return undefined;
  // Structured image prompts are valid user input. Only intervene when the
  // object has the exact bilingual-response field names involved in #87.
  if (!/"prompt(?:Zh)?"\s*:/.test(cleaned)) return undefined;

  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const prompt = typeof parsed.prompt === "string" ? parsed.prompt.trim() : "";
    if (prompt) return prompt;
  } catch {
    // A truncated response commonly still contains a complete English prompt.
    const match = cleaned.match(/"prompt"\s*:\s*("(?:\\.|[^"\\])*")/s);
    if (match?.[1]) {
      try {
        const prompt = JSON.parse(match[1]);
        if (typeof prompt === "string" && prompt.trim()) return prompt.trim();
      } catch {
        // Fall through to the unsafe marker below.
      }
    }
  }
  return null;
}

export interface NormalizedImagePromptInput {
  modelPrompt: string;
  displayPrompt: string;
}

/**
 * Normalize historical bilingual-response JSON for both generation and the
 * value persisted back into RunPage. Cleaning only the model prompt leaves
 * the broken JSON in promptZh, so the same polluted text reappears on reload.
 */
export function normalizeImagePromptInput(raw: string): NormalizedImagePromptInput | null {
  const recovered = recoverModelPromptFromJsonLike(raw);
  if (recovered === null) return null;
  if (recovered === undefined) return { modelPrompt: raw, displayPrompt: raw };

  const cleaned = stripJsonFence(raw);
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const promptZh = typeof parsed.promptZh === "string" ? parsed.promptZh.trim() : "";
    return { modelPrompt: recovered, displayPrompt: promptZh || recovered };
  } catch {
    return { modelPrompt: recovered, displayPrompt: recovered };
  }
}
