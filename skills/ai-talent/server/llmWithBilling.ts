/**
 * invokeLLMWithBilling — Billing-aware LLM wrapper
 *
 * Wraps the core invokeLLM function to:
 *  1. Execute the LLM call
 *  2. Parse token usage from the response
 *  3. Calculate raw USD cost and credits to charge
 *  4. Insert a token usage log record (with retry + in-memory fallback)
 *  5. Deduct credits from the user's balance
 *
 * DEBT-5: Billing failures now use exponential-backoff retry + in-memory queue
 *         to prevent silent loss of billing records.
 *
 * Usage:
 *   const result = await invokeLLMWithBilling({
 *     messages, model, provider, userId, userApiKey, actionType, taskId, agentId
 *   });
 */

import { appendFileSync } from "fs";
import { createHash } from "crypto";
import { invokeLLM, type InvokeParams, type InvokeResult } from "./_core/llm";
import { deductCredits } from "./deductCredits";
import {

/** Hash an API key before storing it — prevents plaintext key storage in logs/DB/disk */
function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
}

  insertTokenLog,
  calcCostFromTokens,
  usdToCredits,
  type TokenLogInput,
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

// ─── DEBT-5: Billing retry with in-memory fallback queue ─────────────────────

/** In-memory buffer for billing records that failed all DB retries. */
const billingRetryQueue: TokenLogInput[] = [];

// STABLE-4: Disk fallback path — configure via env for production persistence.
const BILLING_FALLBACK_LOG =
  process.env.BILLING_FALLBACK_LOG ?? "/tmp/billing-retry.jsonl";

/**
 * Attempt to insert a token log with exponential-backoff retries.
 * On final failure, enqueue to in-memory buffer for deferred retry.
 */
async function tryInsertWithRetry(
  input: TokenLogInput,
  retries = 3
): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await insertTokenLog(input);
      return;
    } catch (err) {
      if (i === retries - 1) {
        // Exhausted retries — park in memory so it isn't silently lost
        billingRetryQueue.push(input);
        // STABLE-4: Persist to disk so records survive process restarts.
        try {
          appendFileSync(
            BILLING_FALLBACK_LOG,
            JSON.stringify({ ...input, failedAt: new Date().toISOString() }) + "\n"
          );
        } catch {
          // Disk write also failed — in-memory queue is still the safety net.
        }
        console.error(
          "[billing] Failed to write token log after retries, queued for retry:",
          err
        );
        return;
      }
      // Exponential back-off: 1s, 2s, 3s …
      await new Promise<void>(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

/**
 * Flush the in-memory retry queue (call periodically, e.g. every minute).
 * Returns number of records successfully flushed.
 */
export async function flushBillingRetryQueue(): Promise<number> {
  if (billingRetryQueue.length === 0) return 0;
  const pending = billingRetryQueue.splice(0, billingRetryQueue.length);
  let flushed = 0;
  for (const item of pending) {
    try {
      await insertTokenLog(item);
      flushed++;
    } catch {
      billingRetryQueue.push(item); // re-enqueue on failure
    }
  }
  return flushed;
}

/** Read-only inspection of the retry queue length (for monitoring). */
export function getBillingRetryQueueLength(): number {
  return billingRetryQueue.length;
}

// ─── Token usage parser ───────────────────────────────────────────────────────

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
      usage.prompt_tokens ?? usage.promptTokens ?? usage.input_tokens ?? 0;
    const completionTokens =
      usage.completion_tokens ??
      usage.completionTokens ??
      usage.output_tokens ??
      0;
    const totalTokens =
      usage.total_tokens ?? usage.totalTokens ?? promptTokens + completionTokens;
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

  // Fallback: estimate from text length (~4 chars / token)
  const text = (response as any)?.content ?? (response as any)?.text ?? "";
  const estimated = Math.ceil(text.length / 4);
  return { promptTokens: 0, completionTokens: estimated, totalTokens: estimated };
}

// ─── Main export ──────────────────────────────────────────────────────────────

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
  const response = await invokeLLM({ ...llmOptions, provider: provider as any, model });
  const latencyMs = Date.now() - startMs;

  const usage = parseTokenUsage(response);
  const rawCostUsd = calcCostFromTokens(
    provider,
    usage.promptTokens,
    usage.completionTokens
  );
  const creditsCharged = usdToCredits(rawCostUsd);

  if (!skipBilling) {
    // Fire-and-forget with retry: don't let billing failures block the LLM response
    const billingInput: TokenLogInput = {
      userId,
      userApiKey: hashApiKey(userApiKey), // SEC-6: hash before storing in memory/disk/DB
      tenantId,
      taskId,
      agentId,
      actionType,
      provider,
      model,
      promptTokens:     usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens:      usage.totalTokens,
      rawCostUsd,
      creditsCharged,
      latencyMs,
    };

    Promise.all([
      tryInsertWithRetry(billingInput),
      creditsCharged > 0
        ? deductCredits({
            userId,
            cost: creditsCharged,
            agentId,
            actionType,
            description: `LLM: ${provider}/${model} (${usage.totalTokens} tokens)`,
          })
        : Promise.resolve(),
    ]).catch(err => {
      // Deduct credits failure — log but do not throw
      console.error("[llmWithBilling] credits deduction error:", err);
    });
  }

  return { response, usage, rawCostUsd, creditsCharged, latencyMs };
}
