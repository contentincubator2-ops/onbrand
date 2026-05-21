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

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { invokeLLM, type InvokeParams, type InvokeResult } from "./_core/llm";
import { deductCredits, checkEnoughCredits } from "./deductCredits";
import {
  insertTokenLog,
  calcCostFromTokens,
  usdToCredits,
  type TokenLogInput,
} from "./tokenLedger";
import {
  withTimeout,
  LLM_HARD_TIMEOUT_MS,
  DAILY_USD_CAP_TRIAL,
  DAILY_USD_CAP_PAID,
  MIN_CREDITS_TO_RUN,
} from "./_core/timeout";
import localPool from "./localDb";

/**
 * 2026-05-08 (P0-D): pre-flight cost guard — checks both rolling 24h
 * spend (via usage_log SUM) and current wallet floor. Trial users
 * capped at $5/day, paid at $50/day. Prevents runaway concurrent
 * 30s/60s/100s tasks burning the budget.
 */
export async function preflightCostCheck(userId: number): Promise<{ ok: true } | { ok: false; reason: string }> {
  // 0. Enterprise plan bypass — internal/team accounts (planCode='enterprise')
  // skip all preflight caps. They share infra cost, not subject to trial caps.
  // 2026-05-12 (CJ「移除 sowork.tw 帳號的額度限制」).
  try {
    const [prows]: any = await localPool.execute(
      `SELECT planCode, planStatus, planEndsAt FROM users WHERE id = ? LIMIT 1`,
      [userId],
    );
    const p = (prows as any[])[0];
    if (p?.planCode === "enterprise") {
      return { ok: true };
    }
    // 2026-05-16 (CJ「金流＋試用到期」audit): enforce expiry at the single
    // chokepoint every task path already calls. Before this, an expired
    // trial / lapsed subscription was NOT blocked here (only the points
    // quota was) — assertWithinPlan exists but was wired only to video.
    const endsAt = p?.planEndsAt
      ? (p.planEndsAt instanceof Date ? p.planEndsAt : new Date(p.planEndsAt))
      : null;
    const expired = endsAt != null && endsAt.getTime() < Date.now();
    if (expired) {
      if (p?.planStatus === "trial" || p?.planCode === "trial") {
        return { ok: false, reason:
          "免費試用已到期。升級方案即可繼續使用 —— 前往「方案」頁面開通（Starter NT$750/月 · Solo NT$3,000/月）。" };
      }
      if (p?.planStatus === "active") {
        return { ok: false, reason:
          "訂閱已到期或續訂失敗，請至「方案」頁面更新付款方式以恢復使用。" };
      }
    }
  } catch {/* if plan lookup fails, fall through to standard checks */}

  // 1. Wallet floor check (re-uses checkEnoughCredits from deductCredits)
  //    2026-05-15 (CJ「完整後端測試」): SEC — fail CLOSED. Previously this
  //    catch swallowed DB blips, letting a $0 user start a $$-burning task.
  try {
    const c = await checkEnoughCredits(userId, MIN_CREDITS_TO_RUN);
    if (!c.enough) {
      return { ok: false, reason: `餘額不足（剩 ${c.totalAvailable} credits，需要至少 ${MIN_CREDITS_TO_RUN}）。請充值或聯絡客服。` };
    }
  } catch (err) {
    console.error("[preflightCostCheck] wallet check failed", err);
    return { ok: false, reason: "計費系統暫時無法驗證額度，請稍後再試或聯絡客服。" };
  }

  // 2. Rolling 24h $ cap from usage_log — plan-aware:
  //    Trial=$3 · Solo=$5 · Studio=$15 · Agency/Enterprise=∞ (returned earlier).
  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");
    const [rows]: any = await localPool.execute(
      `SELECT COALESCE(SUM(costUsd), 0) AS total FROM usage_log WHERE userId = ? AND ts > ?`,
      [userId, since],
    );
    const total = Number((rows as any[])[0]?.total ?? 0);
    const [pRows]: any = await localPool.execute(
      `SELECT planCode FROM users WHERE id = ? LIMIT 1`,
      [userId],
    );
    const planCode = (pRows as any[])[0]?.planCode ?? "trial";
    const { DAILY_USD_CAP_SOLO, DAILY_USD_CAP_STUDIO } = await import("./_core/timeout");
    const cap =
      planCode === "drop_team" ? DAILY_USD_CAP_STUDIO :
      planCode === "drop_pro"  ? DAILY_USD_CAP_SOLO :
      DAILY_USD_CAP_TRIAL;
    if (total >= cap) {
      const planLabel =
        planCode === "drop_team" ? "Studio" :
        planCode === "drop_pro"  ? "Solo" :
        "試用";
      return { ok: false, reason: `今日 LLM 成本已達 ${planLabel} 方案上限（$${total.toFixed(2)} / $${cap}）。明天 24 小時後重置，或聯繫業務洽詢 Agency 方案。` };
    }
  } catch {/* daily-cap check best-effort; don't block on DB transient */}

  // 3. 2026-05-10 (pre-launch): rolling 1h task-count cap. Stops a single
  // user (or scripted abuse) from burst-running 100s of tasks in minutes.
  // 50/hour matches "heavy human user" upper bound; bots get blocked.
  try {
    const hourAgo = new Date(Date.now() - 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");
    const [rows]: any = await localPool.execute(
      `SELECT COUNT(*) AS n FROM mission_outputs o
       JOIN missions m ON m.id = o.missionId
       WHERE m.userId = ? AND o.createdAt > ?`,
      [userId, hourAgo],
    );
    const n = Number((rows as any[])[0]?.n ?? 0);
    if (n >= 50) {
      return { ok: false, reason: `1 小時內已執行 ${n} 個任務（trial 上限 50/hr，防止過度使用）。請稍後再試。` };
    }
  } catch {/* best-effort */}

  return { ok: true };
}

/** Hash an API key before storing it — prevents plaintext key storage in logs/DB/disk */
function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
}

export interface InvokeLLMWithBillingOptions extends Omit<InvokeParams, "provider" | "model"> {
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

/** Maximum queue size before falling back to disk-only log to prevent memory exhaustion. */
const MAX_BILLING_QUEUE_SIZE = 500;

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
        if (billingRetryQueue.length >= MAX_BILLING_QUEUE_SIZE) {
          console.error("[billing] retryQueue full, writing to fallback log only");
          try {
            appendFileSync(
              BILLING_FALLBACK_LOG,
              JSON.stringify({ ...input, reason: "queue_full", failedAt: new Date().toISOString() }) + "\n"
            );
          } catch { /* silent */ }
          return;
        }
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

/**
 * STAB-3: Load billing records persisted to disk during a previous crash/restart.
 * Called once at server startup — re-enqueues records for retry and clears the log.
 * Returns the number of records successfully loaded.
 */
export async function loadBillingFallbackLog(): Promise<number> {
  if (!existsSync(BILLING_FALLBACK_LOG)) return 0;
  try {
    const lines = readFileSync(BILLING_FALLBACK_LOG, "utf8")
      .split("\n")
      .filter(Boolean);
    let loaded = 0;
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as TokenLogInput & { reason?: string; failedAt?: string };
        // Strip metadata fields added during persistence
        delete (entry as any).reason;
        delete (entry as any).failedAt;
        if (billingRetryQueue.length < MAX_BILLING_QUEUE_SIZE) {
          billingRetryQueue.push(entry);
          loaded++;
        }
      } catch { /* skip malformed lines */ }
    }
    // Clear the fallback log after loading
    if (loaded > 0) {
      writeFileSync(BILLING_FALLBACK_LOG, "");
      console.log(`[billing] loaded ${loaded} records from fallback log`);
    }
    return loaded;
  } catch (err) {
    console.error("[billing] failed to load fallback log:", err);
    return 0;
  }
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
    provider = "openrouter",
    model = "anthropic/claude-sonnet-4-6",
    ...llmOptions
  } = options;

  // 2026-05-08 (P0-D): pre-flight cost guard. Skipped for skipBilling
  // (internal calls like onboarding agents).
  if (!skipBilling) {
    const guard = await preflightCostCheck(userId);
    if (!guard.ok) {
      const err = new Error(guard.reason) as any;
      err.code = "INSUFFICIENT_CREDITS";
      throw err;
    }
  }

  const startMs = Date.now();
  // 2026-05-08 (P0-D): hard 90s timeout — LLM provider hangs were
  // pinning worker threads; now they fail fast and free the slot.
  const response = await withTimeout(
    invokeLLM({ ...llmOptions, provider: provider as any, model }),
    LLM_HARD_TIMEOUT_MS,
    `LLM ${provider}/${model}`,
  );
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
      userApiKey: userApiKey, // SEC-6: insertTokenLog (tokenLedger.ts) handles hashing — do NOT pre-hash here to avoid double-hash
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
            actionType: actionType as any,
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
