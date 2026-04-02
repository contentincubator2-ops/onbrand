/**
 * Token Usage Ledger
 * Records every LLM API call with provider, tokens used, and cost.
 * Central billing source-of-truth for SoWork Marketing Enterprise.
 *
 * SEC-5: SELECT queries migrated to Drizzle ORM query builder (no raw SQL).
 */

import { getDb } from "./db";
import { tokenUsageLogs } from "../drizzle/schema";
import { sql, desc } from "drizzle-orm";
import { randomUUID } from "crypto";

// Provider cost per 1K tokens (USD)
export const PROVIDER_COST_PER_1K: Record<
  string,
  { input: number; output: number }
> = {
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
  const cost =
    PROVIDER_COST_PER_1K[provider] ?? PROVIDER_COST_PER_1K["openai"]!;
  return (
    (promptTokens / 1000) * cost.input +
    (completionTokens / 1000) * cost.output
  );
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

  await db.insert(tokenUsageLogs).values({
    id:               randomUUID(),
    userId:           input.userId,
    userApiKey:       input.userApiKey,
    tenantId:         input.tenantId    ?? null,
    taskId:           input.taskId      ?? null,
    agentId:          input.agentId     ?? null,
    actionType:       input.actionType,
    provider:         input.provider    as any, // enum validated at DB level
    model:            input.model,
    promptTokens:     input.promptTokens,
    completionTokens: input.completionTokens,
    totalTokens:      input.totalTokens,
    rawCostUsd:       input.rawCostUsd.toFixed(6),
    markupFactor:     String(MARKUP_FACTOR),
    creditsCharged:   input.creditsCharged,
    latencyMs:        input.latencyMs   ?? null,
  });
}

/**
 * Return a per-provider breakdown of token usage for a user over the last N days.
 * SEC-5: Uses Drizzle ORM query builder — no raw SQL string interpolation.
 */
export async function getUserTokenSummary(userId: number, days = 30) {
  const db = await getDb();
  if (!db) return [];

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return db
    .select({
      provider:              tokenUsageLogs.provider,
      model:                 tokenUsageLogs.model,
      totalPromptTokens:     sql<number>`SUM(${tokenUsageLogs.promptTokens})`,
      totalCompletionTokens: sql<number>`SUM(${tokenUsageLogs.completionTokens})`,
      totalTokens:           sql<number>`SUM(${tokenUsageLogs.totalTokens})`,
      totalCostUsd:          sql<number>`SUM(${tokenUsageLogs.rawCostUsd})`,
      totalCreditsCharged:   sql<number>`SUM(${tokenUsageLogs.creditsCharged})`,
      callCount:             sql<number>`COUNT(*)`,
    })
    .from(tokenUsageLogs)
    .where(
      sql`${tokenUsageLogs.userId} = ${userId} AND ${tokenUsageLogs.createdAt} >= ${since}`
    )
    .groupBy(tokenUsageLogs.provider, tokenUsageLogs.model)
    .orderBy(desc(sql`SUM(${tokenUsageLogs.creditsCharged})`));
}

/**
 * Return daily aggregated usage for a user (for charts/dashboards).
 * SEC-5: Uses Drizzle ORM query builder — no raw SQL string interpolation.
 */
export async function getUserDailyUsage(userId: number, days = 30) {
  const db = await getDb();
  if (!db) return [];

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return db
    .select({
      date:                sql<string>`DATE(${tokenUsageLogs.createdAt})`,
      totalTokens:         sql<number>`SUM(${tokenUsageLogs.totalTokens})`,
      totalCostUsd:        sql<number>`SUM(${tokenUsageLogs.rawCostUsd})`,
      totalCreditsCharged: sql<number>`SUM(${tokenUsageLogs.creditsCharged})`,
      callCount:           sql<number>`COUNT(*)`,
    })
    .from(tokenUsageLogs)
    .where(
      sql`${tokenUsageLogs.userId} = ${userId} AND ${tokenUsageLogs.createdAt} >= ${since}`
    )
    .groupBy(sql`DATE(${tokenUsageLogs.createdAt})`)
    .orderBy(sql`DATE(${tokenUsageLogs.createdAt})`);
}
