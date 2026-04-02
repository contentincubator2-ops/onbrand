/**
 * invokeLLMWithBilling — Billing-aware LLM wrapper
 *
 * Wraps the core invokeLLM function to:
 *  1. Execute the LLM call
 *  2. Parse token usage from the response
 *  3. Calculate raw USD cost and credits to charge
 *  4. Insert a token usage log record
 *  5. Deduct credits from the user's balance
 *
 * Usage:
 *   const result = await invokeLLMWithBilling({
 *     messages, model, provider, userId, userApiKey, actionType, taskId, agentId
 *   });
 */

import { invokeLLM, type InvokeParams, type InvokeResult } from "./_core/llm";
import { deductCredits } from "./deductCredits";
import {
  insertTokenLog,
  calcCostFromTokens,
  usdToCredits,
} from "./tokenLedger";

export interface InvokeLLMWithBillingOptions extends InvokeParams {
  /** LLM provider (e.g. "openai", "google", "zhipu") */
  provider: string;
  /** Model name (e.g. "gpt-4o", "gemini-2.5-flash") */
  model: string;
  /** Authenticated user ID */
  userId: number;
  /** The API key used to authenticate this request (for audit log) */
  userApiKey: string;
  /** Optional tenant/enterprise ID */
  tenantId?: number;
  /** Task this call is associated with */
  taskId?: number;
  /** Agent performing the call */
  agentId?: number;
  /** What triggered this LLM call (e.g. 'task_execution', 'chat_message') */
  actionType: string;
  /** Skip credits deduction (for internal/admin calls) */
  skipBilling?: boolean;
}

export interface LLMWithBillingResult {
  /** Raw LLM response */
  response: InvokeResult;
  /** Token counts from the API response */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Raw USD cost before markup */
  rawCostUsd: number;
  /** Credits charged to the user */
  creditsCharged: number;
  /** Wall-clock latency in milliseconds */
  latencyMs: number;
}

/**
 * Parse token usage from an LLM response.
 * Handles different provider response shapes.
 */
function parseTokenUsage(response: InvokeResult): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
} {
  // Standard OpenAI / compatible format
  const usage = (response as any)?.usage;
  if (usage) {
    const promptTokens =
      usage.prompt_tokens ??
      usage.promptTokens ??
      usage.input_tokens ??
      0;
    const completionTokens =
      usage.completion_tokens ??
      usage.completionTokens ??
      usage.output_tokens ??
      0;
    const totalTokens =
      usage.total_tokens ??
      usage.totalTokens ??
      promptTokens + completionTokens;
    return { promptTokens, completionTokens, totalTokens };
  }

  // Anthropic Claude format (some versions)
  const meta = (response as any)?.meta;
  if (meta?.input_tokens !== undefined) {
    const promptTokens = meta.input_tokens ?? 0;
    const completionTokens = meta.output_tokens ?? 0;
    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    };
  }

  // Fallback: estimate from text length (rough heuristic, ~4 chars / token)
  const text = (response as any)?.content ?? (response as any)?.text ?? "";
  const estimated = Math.ceil(text.length / 4);
  return { promptTokens: 0, completionTokens: estimated, totalTokens: estimated };
}

/**
 * Call an LLM and automatically record billing + deduct credits.
 */
export async function invokeLLMWithBilling(
  options: InvokeLLMWithBillingOptions
): Promise<LLMWithBillingResult> {
  const {
    userId,
    userApiKey,
    tenantId,
    taskId,
    agentId,
    actionType,
    skipBilling = false,
    provider = "openai",
    model = "gpt-4o",
    ...llmOptions
  } = options;

  const startMs = Date.now();
  const response = await invokeLLM(llmOptions);
  const latencyMs = Date.now() - startMs;

  const usage = parseTokenUsage(response);

  const rawCostUsd = calcCostFromTokens(
    provider,
    usage.promptTokens,
    usage.completionTokens
  );
  const creditsCharged = usdToCredits(rawCostUsd);

  if (!skipBilling) {
    // Fire-and-forget: don't let billing failures block the LLM response
    Promise.all([
      insertTokenLog({
        userId,
        userApiKey,
        tenantId,
        taskId,
        agentId,
        actionType,
        provider,
        model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        rawCostUsd,
        creditsCharged,
        latencyMs,
      }),
      creditsCharged > 0
        ? deductCredits({
            userId,
            cost: creditsCharged,
            agentId,
            actionType,
            description: `LLM: ${provider}/${model} (${usage.totalTokens} tokens)`,
          })
        : Promise.resolve(),
    ]).catch((err) => {
      // Log but don't throw — billing failure should not fail the request
      console.error("[llmWithBilling] billing error:", err);
    });
  }

  return { response, usage, rawCostUsd, creditsCharged, latencyMs };
}
