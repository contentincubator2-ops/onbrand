import { getBrandRuleAssetsWithStatus } from "../../strategy/core/brandContext";
import {
  buildIgStrategyPrivateTerms,
  findIgStrategyInternalLeaks,
  redactIgStrategySynthesisContext,
  sanitizeIgStrategyPublicCaption,
  type StrategyStepDescriptor,
} from "./igStrategyPublicOutput";
import {
  assertPrivateStrategyArtifactsReady,
  assertRedactedStrategyContextReady,
  buildIgStrategySynthesisMessages,
  parseIgStrategyPublicVariants,
  runSynthesisBatchesWithDeadline,
  type IgStrategyPrivateArtifact,
  type IgStrategyPublicSlot,
  type IgStrategyPublicVariant,
} from "./igStrategyPublicSynthesis";
import { snapshot as llmCircuitSnapshot } from "../../platform/core/llmCircuitBreaker";
import { callModelStrict } from "../../platform/core/multiModelRouter";

interface StrategyAgentDescriptor {
  name?: unknown;
  title?: unknown;
  specialty?: unknown;
  methodology?: unknown;
}

// Five slots can contain roughly 2,500 zh-TW caption characters plus up to 60
// hashtags, image directions, and JSON framing. 8,192 doubles the old default
// cap and leaves headroom for the upper end of the 1–2 tokens/character range.
export const IG_STRATEGY_SYNTHESIS_MAX_TOKENS = 8_192;
export const IG_STRATEGY_SYNTHESIS_BATCH_TIMEOUT_MS = 26_000;
export const IG_STRATEGY_SYNTHESIS_MAX_ATTEMPTS = 2;
export const IG_STRATEGY_SYNTHESIS_CONCURRENCY = 3;
export const IG_STRATEGY_SYNTHESIS_DEADLINE_HEADROOM_MS = 3_000;
export const IG_STRATEGY_SYNTHESIS_MIN_DEADLINE_MS = 55_000;

export function isIgStrategyPublicSynthesisTruncated(
  finishReason: string | null | undefined,
): boolean {
  const normalized = finishReason?.trim().toLowerCase();
  return normalized === "max_tokens" || normalized === "length";
}

/** Worst-case finite budget: optional serial probe plus two attempts per wave. */
export function getIgStrategyPublicSynthesisDeadlineMs(args: {
  batchCount: number;
  serialProbe: boolean;
  concurrency?: number;
  perAttemptTimeoutMs?: number;
  maxAttempts?: number;
}): number {
  const concurrency = Math.max(1, args.concurrency ?? IG_STRATEGY_SYNTHESIS_CONCURRENCY);
  const perAttemptTimeoutMs = args.perAttemptTimeoutMs
    ?? IG_STRATEGY_SYNTHESIS_BATCH_TIMEOUT_MS;
  const maxAttempts = Math.max(1, args.maxAttempts ?? IG_STRATEGY_SYNTHESIS_MAX_ATTEMPTS);
  const probeBatchCount = args.serialProbe && args.batchCount > 0 ? 1 : 0;
  const parallelBatchCount = Math.max(0, args.batchCount - probeBatchCount);
  const waves = probeBatchCount + Math.ceil(parallelBatchCount / concurrency);
  return Math.max(
    IG_STRATEGY_SYNTHESIS_MIN_DEADLINE_MS,
    waves * perAttemptTimeoutMs * maxAttempts
      + IG_STRATEGY_SYNTHESIS_DEADLINE_HEADROOM_MS,
  );
}

export interface SynthesizeIgStrategyPublicSlotsArgs {
  idOrSlug: string;
  topic: string;
  brandContext: string;
  brandId?: number | null;
  outputLanguage: string;
  slots: readonly IgStrategyPublicSlot[];
  privateArtifacts: readonly IgStrategyPrivateArtifact[];
  steps: readonly (StrategyStepDescriptor & { assignedAgentName?: unknown })[];
  squadName?: unknown;
  methodology?: unknown;
  agents: readonly StrategyAgentDescriptor[];
  /** 品牌一致性檢查結果（每篇對外貼文一筆），給呼叫端寫進 metadata。 */
  onBrandConsistency?: (results: IgStrategyBrandConsistencyEntry[]) => void;
}

export interface IgStrategyBrandConsistencyEntry {
  variantId: string;
  status: string;
  issues: Array<{ aspect: string; detail: string }>;
  reason?: string;
  before?: string;
}

export function assertIgStrategyPublicCampaignSafe(args: {
  idOrSlug: string;
  variants: readonly IgStrategyPublicVariant[];
  steps: readonly StrategyStepDescriptor[];
  outputLanguage: string;
  privateTerms: ReturnType<typeof buildIgStrategyPrivateTerms>;
}): void {
  // Audience address and paragraph perspective are per-post rules. Keep the
  // final leak boundary across every public field without treating separate
  // variants (which may come from independent batches) as one caption.
  for (const variant of args.variants) {
    sanitizeIgStrategyPublicCaption(
      args.idOrSlug,
      [
        variant.caption,
        ...variant.hashtags,
        variant.image.style ?? "",
      ].filter(Boolean).join("\n"),
      {
        steps: args.steps,
        outputLanguage: args.outputLanguage,
        privateTerms: args.privateTerms,
      },
    );
  }
}

/**
 * The only public-synthesis path for initial and remaining strategy posts.
 * Anthropic receives de-identified material only and stays strictly pinned:
 * callModelStrict intentionally provides no provider cascade.
 */
export async function synthesizeIgStrategyPublicSlots(
  args: SynthesizeIgStrategyPublicSlotsArgs,
): Promise<IgStrategyPublicVariant[]> {
  const usablePrivateArtifacts = assertPrivateStrategyArtifactsReady(
    args.privateArtifacts,
    args.steps.length,
  );
  if (args.slots.length === 0) return [];

  const privateTerms = buildIgStrategyPrivateTerms({
    squadName: args.squadName,
    methodology: args.methodology,
    steps: args.steps,
    artifactAgentNames: args.privateArtifacts.map((artifact) => artifact.agentName),
    agents: args.agents,
  });
  const redactedStrategyContext = usablePrivateArtifacts.map((artifact) => redactIgStrategySynthesisContext(
    args.idOrSlug,
    artifact.rawContent,
    { steps: args.steps, outputLanguage: args.outputLanguage, privateTerms },
  ));
  const strategyContext = assertRedactedStrategyContextReady(
    redactedStrategyContext,
    args.steps.length,
  );
  const safeTopic = redactIgStrategySynthesisContext(
    args.idOrSlug,
    args.topic,
    { steps: args.steps, outputLanguage: args.outputLanguage, privateTerms },
  );
  const safeBrandContext = redactIgStrategySynthesisContext(
    args.idOrSlug,
    args.brandContext,
    { steps: args.steps, outputLanguage: args.outputLanguage, privateTerms },
  );
  const anthropicUserPayload = [safeTopic, safeBrandContext, ...strategyContext]
    .filter(Boolean)
    .join("\n\n");
  if (findIgStrategyInternalLeaks(anthropicUserPayload, privateTerms).length > 0) {
    throw new Error("Anthropic synthesis payload failed private-term validation");
  }

  const brandRuleLoad = await getBrandRuleAssetsWithStatus(args.brandId ?? undefined);
  if (args.brandId && !brandRuleLoad.loaded) {
    throw new Error("brand rules could not be loaded for public synthesis");
  }
  const brandRules = brandRuleLoad.rules;
  const redactBrandRule = (value: string) => redactIgStrategySynthesisContext(
    args.idOrSlug,
    value,
    { steps: args.steps, outputLanguage: args.outputLanguage, privateTerms },
  );
  const anthropicBrandRules = {
    banned: brandRules.banned.map(redactBrandRule).filter(Boolean),
    subs: brandRules.subs
      .map((pair) => ({ from: redactBrandRule(pair.from), to: redactBrandRule(pair.to) }))
      .filter((pair) => pair.from && pair.to),
    preferred: brandRules.preferred.map(redactBrandRule).filter(Boolean),
  };
  if (findIgStrategyInternalLeaks(JSON.stringify(anthropicBrandRules), privateTerms).length > 0) {
    throw new Error("Anthropic brand rules failed private-term validation");
  }

  const slotBatches = Array.from(
    { length: Math.ceil(args.slots.length / 5) },
    (_, batchIndex) => args.slots.slice(batchIndex * 5, (batchIndex + 1) * 5),
  );
  const anthropicCircuit = llmCircuitSnapshot().find((entry) => entry.provider === "anthropic");
  const needsSerialProbe = !!anthropicCircuit && anthropicCircuit.state !== "CLOSED";
  const synthesisDeadlineAt = Date.now() + getIgStrategyPublicSynthesisDeadlineMs({
    batchCount: slotBatches.length,
    serialProbe: needsSerialProbe,
  });
  const publicBatches: IgStrategyPublicVariant[][] = new Array(slotBatches.length);
  const truncatedBatchIndexes = new Set<number>();
  const executeBatch = async (batchIndex: number, signal: AbortSignal, attempt: number) => {
    const slotBatch = slotBatches[batchIndex]!;
    // A token-limited first response is retried as two smaller requests. This
    // preserves the fixed slot contract while avoiding an identical request
    // that would predictably hit the same output cap again.
    const requestBatches = attempt > 1
      && truncatedBatchIndexes.has(batchIndex)
      && slotBatch.length > 1
      ? [
          slotBatch.slice(0, Math.ceil(slotBatch.length / 2)),
          slotBatch.slice(Math.ceil(slotBatch.length / 2)),
        ]
      : [slotBatch];
    const parsedBatches = await Promise.all(requestBatches.map(async (requestSlots) => {
      const messages = buildIgStrategySynthesisMessages({
        idOrSlug: args.idOrSlug,
        topic: safeTopic,
        brandContext: safeBrandContext,
        outputLanguage: args.outputLanguage,
        slots: requestSlots,
        strategyContext,
        strategyAnalysisComplete: strategyContext.length === args.steps.length,
        brandRules: anthropicBrandRules,
      });
      const result = await callModelStrict(messages, "anthropic", undefined, {
        signal,
        maxTokens: IG_STRATEGY_SYNTHESIS_MAX_TOKENS,
        includeFinishReason: true,
      });
      if (isIgStrategyPublicSynthesisTruncated(result.finishReason)) {
        truncatedBatchIndexes.add(batchIndex);
        throw new Error("strategy public synthesis was truncated");
      }
      return parseIgStrategyPublicVariants({
        idOrSlug: args.idOrSlug,
        modelText: result.content ?? "",
        outputLanguage: args.outputLanguage,
        slots: requestSlots,
        steps: args.steps,
        privateTerms,
        brandRules,
      });
    }));
    publicBatches[batchIndex] = parsedBatches.flat();
  };

  // A HALF_OPEN provider admits one recovery probe. Serialize that probe
  // before the remaining parallel batches so sibling calls cannot reject it.
  let firstParallelBatch = 0;
  let firstSynthesisError: unknown;
  if (needsSerialProbe && slotBatches.length > 0) {
    try {
      await runSynthesisBatchesWithDeadline({
        batchIndexes: [0],
        concurrency: 1,
        deadlineAt: synthesisDeadlineAt,
        perAttemptTimeoutMs: IG_STRATEGY_SYNTHESIS_BATCH_TIMEOUT_MS,
        executeBatch,
      });
    } catch (error) {
      firstSynthesisError = error;
    }
    firstParallelBatch = 1;
  }
  try {
    await runSynthesisBatchesWithDeadline({
      batchIndexes: slotBatches.map((_, index) => index).slice(firstParallelBatch),
      concurrency: IG_STRATEGY_SYNTHESIS_CONCURRENCY,
      deadlineAt: synthesisDeadlineAt,
      perAttemptTimeoutMs: IG_STRATEGY_SYNTHESIS_BATCH_TIMEOUT_MS,
      executeBatch,
    });
  } catch (error) {
    firstSynthesisError ??= error;
  }
  const publicResults = publicBatches.flat();
  if (publicResults.length === 0 && slotBatches.length > 0) {
    throw firstSynthesisError ?? new Error("public synthesis produced no variants");
  }

  // 2026-09-30（CJ「需要你處理活動」）：對外貼文也過品牌一致性檢查（brandConsistency.ts）。
  // 這條路線依用戶授權只把去識別化內容送 Anthropic，所以：品牌脈絡用 safeBrandContext、
  // 只用 Anthropic 不串接；修正稿只做確定性的替換對照（不走會串接其他模型的禁用詞改寫），
  // 仍有禁用詞或洩漏內部名稱就不採用。背景執行，不佔 HTTP 時間，上限 25 秒。
  if (safeBrandContext.trim()) {
    const { checkBrandConsistency } = await import("./brandConsistency");
    const isZhTW = /^zh-TW$/i.test(args.outputLanguage) || /繁體/.test(args.outputLanguage);
    const entries = await Promise.all(publicResults.map(async (variant): Promise<IgStrategyBrandConsistencyEntry> => {
      const res = await checkBrandConsistency({
        caption: variant.caption,
        brandPrefix: safeBrandContext,
        userMsg: safeTopic,
        taskLabel: variant.label,
        isZhTW,
        timeoutMs: 25_000,
        strictProvider: "anthropic",
      });
      const entry: IgStrategyBrandConsistencyEntry = {
        variantId: variant.id, status: res.status, issues: res.issues,
        ...(res.reason ? { reason: res.reason } : {}),
      };
      if (res.status !== "fixed") return entry;
      let fixed = res.caption;
      for (const { from, to } of brandRules.subs) if (from) fixed = fixed.split(from).join(to);
      const bannedLeft = brandRules.banned.filter((b) => b && fixed.includes(b));
      const leaks = findIgStrategyInternalLeaks(fixed, privateTerms);
      if (bannedLeft.length > 0 || leaks.length > 0) {
        return { ...entry, status: "flagged", reason: bannedLeft.length ? "revision reintroduced banned words" : "revision leaked internal terms" };
      }
      variant.caption = fixed;
      return { ...entry, before: res.before };
    }));
    args.onBrandConsistency?.(entries);
  }
  assertIgStrategyPublicCampaignSafe({
    idOrSlug: args.idOrSlug,
    variants: publicResults,
    steps: args.steps,
    outputLanguage: args.outputLanguage,
    privateTerms,
  });
  return publicResults;
}
