/**
 * taskExecutor.ts — LLM invocation utilities.
 * Wraps invokeLLM with retry, validation, and multi-provider support.
 * All calls are routed through llmGateway for semaphore + budget enforcement.
 */
import { type InvokeParams } from "../_core/llm";
import { gatewayInvokeLLM } from "../services/llmGateway";

/** Validate LLM response has expected JSON structure */
export function validateResponse(response: string | null | undefined): boolean {
  if (!response) return false;
  try {
    const cleaned = response.replace(/^```(?:json)?\s*/m, "").replace(/```\s*$/m, "");
    const parsed = JSON.parse(cleaned);
    return typeof parsed === "object" && parsed !== null;
  } catch {
    return false;
  }
}

/** Retry with exponential backoff */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, baseDelayMs * 2 ** attempt));
    }
  }
  throw new Error("retryWithBackoff: unreachable");
}

/** Call LLM with system prompt and user message */
export async function callOpenAI(
  systemPrompt: string,
  userMessage: string,
  params?: Partial<InvokeParams>,
  userId = 0
): Promise<string> {
  // Route through gateway for semaphore + daily budget enforcement.
  // userId=0 is the system sentinel; callers with a real user should pass it.
  const result = await gatewayInvokeLLM(
    {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      provider: "openrouter",
      model: "anthropic/claude-sonnet-4-6",
      ...params,
    },
    { userId }
  );
  const msg = result.choices[0]?.message?.content; return typeof msg === "string" ? msg : "";
}
