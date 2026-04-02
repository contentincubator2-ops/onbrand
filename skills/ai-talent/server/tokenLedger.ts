/**
 * Token Usage Ledger
 * Records every LLM API call with provider, tokens used, and cost.
 * Central billing source-of-truth for SoWork Marketing Enterprise.
 */

import { getDb } from "./db";

// Provider cost per 1K tokens (USD)
export const PROVIDER_COST_PER_1K: Record<string, { input: number; output: number }> = {
  openai:     { input: 0.0025,   output: 0.010  },
  zhipu:      { input: 0.0010,   output: 0.0010 },
  qwen:       { input: 0.0008,   output: 0.0020 },
  perplexity: { input: 0.0010,   output: 0.0010 },
  google:     { input: 0.000075, output: 0.0003 },
  cohere:     { input: 0.0003,   output: 0.0006 },
  forge:      { input: 0.0005,   output: 0.0015 },
};

/** Markup factor applied on top of raw LLM cost */
export const MARKUP_FACTOR = 5.0;

/** 1 USD = 100 credits (at NT$0.01/credit + exchange rate) */
export const CREDITS_PER_USD = 100;

/**
 * Calculate raw USD cost from token counts.
 * Falls back to openai pricing if provider is unknown.
 */
export function calcCostFromTokens(
  provider: string,
  promptTokens: number,
  completionTokens: number
): number {
  const cost = PROVIDER_COST_PER_1K[provider] ?? PROVIDER_COST_PER_1K.openai;
  return (promptTokens / 1000) * cost.input + (completionTokens / 1000) * cost.output;
}

/**
 * Convert raw USD cost to credits charged to the user (with markup).
 * Always rounds up to the nearest whole credit.
 */
export function usdToCredits(usd: number): number {
  return Math.ceil(usd * MARKUP_FACTOR * CREDITS_PER_USD);
}

export interface TokenLogInput {
  userId: number;
  userApiKey: string;
  tenantId?: number;
  taskId?: number;
  agentId?: number;
  actionType: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  rawCostUsd: number;
  creditsCharged: number;
  latencyMs?: number;
}

/**
 * Insert a token usage log record.
 * Call this after every LLM API response.
 */
export async function insertTokenLog(input: TokenLogInput): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const { randomUUID } = await import("crypto");

  await db.execute(
    `INSERT INTO token_usage_logs
      (id, userId, userApiKey, tenantId, taskId, agentId, actionType,
       provider, model, promptTokens, completionTokens, totalTokens,
       rawCostUsd, markupFactor, creditsCharged, latencyMs, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      randomUUID(),
      input.userId,
      input.userApiKey,
      input.tenantId ?? null,
      input.taskId ?? null,
      input.agentId ?? null,
      input.actionType,
      input.provider,
      input.model,
      input.promptTokens,
      input.completionTokens,
      input.totalTokens,
      input.rawCostUsd.toFixed(6),
      MARKUP_FACTOR,
      input.creditsCharged,
      input.latencyMs ?? null,
    ]
  );
}

/**
 * Return a per-provider breakdown of token usage for a user over the last N days.
 */
export async function getUserTokenSummary(userId: number, days = 30) {
  const db = await getDb();
  if (!db) return [];

  const rows = await db.execute(
    `SELECT
       provider,
       model,
       SUM(promptTokens)     AS totalPromptTokens,
       SUM(completionTokens) AS totalCompletionTokens,
       SUM(totalTokens)      AS totalTokens,
       SUM(rawCostUsd)       AS totalCostUsd,
       SUM(creditsCharged)   AS totalCreditsCharged,
       COUNT(*)              AS callCount
     FROM token_usage_logs
     WHERE userId = ?
       AND createdAt >= DATE_SUB(NOW(), INTERVAL ? DAY)
     GROUP BY provider, model
     ORDER BY totalCreditsCharged DESC`,
    [userId, days]
  );

  return rows as any[];
}

/**
 * Return daily aggregated usage for a user (for charts/dashboards).
 */
export async function getUserDailyUsage(userId: number, days = 30) {
  const db = await getDb();
  if (!db) return [];

  const rows = await db.execute(
    `SELECT
       DATE(createdAt)      AS date,
       SUM(totalTokens)     AS totalTokens,
       SUM(rawCostUsd)      AS totalCostUsd,
       SUM(creditsCharged)  AS totalCreditsCharged,
       COUNT(*)             AS callCount
     FROM token_usage_logs
     WHERE userId = ?
       AND createdAt >= DATE_SUB(NOW(), INTERVAL ? DAY)
     GROUP BY DATE(createdAt)
     ORDER BY date ASC`,
    [userId, days]
  );

  return rows as any[];
}
