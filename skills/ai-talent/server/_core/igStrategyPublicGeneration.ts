import { getBrandRuleAssetsWithStatus } from "./brandContext";
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
import { snapshot as llmCircuitSnapshot } from "./llmCircuitBreaker";
import { callModelStrict } from "./multiModelRouter";

interface StrategyAgentDescriptor {
  name?: unknown;
  title?: unknown;
  specialty?: unknown;
  methodology?: unknown;
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

  const synthesisBatchTimeoutMs = 26_000;
  const slotBatches = Array.from(
    { length: Math.ceil(args.slots.length / 5) },
    (_, batchIndex) => args.slots.slice(batchIndex * 5, (batchIndex + 1) * 5),
  );
  // Three workers complete fixed-30 campaigns in two waves (the original
  // 55s bound). Input-derived live bundles can be larger, so give each
  // additional wave its real attempt budget instead of making completion
  // mathematically impossible.
  const synthesisDeadlineAt = Date.now() + Math.max(
    55_000,
    Math.ceil(slotBatches.length / 3) * synthesisBatchTimeoutMs + 3_000,
  );
  const publicBatches: IgStrategyPublicVariant[][] = new Array(slotBatches.length);
  const executeBatch = async (batchIndex: number, signal: AbortSignal) => {
    const slotBatch = slotBatches[batchIndex]!;
    const messages = buildIgStrategySynthesisMessages({
      idOrSlug: args.idOrSlug,
      topic: safeTopic,
      brandContext: safeBrandContext,
      outputLanguage: args.outputLanguage,
      slots: slotBatch,
      strategyContext,
      strategyAnalysisComplete: strategyContext.length === args.steps.length,
      brandRules: anthropicBrandRules,
    });
    const result = await callModelStrict(messages, "anthropic", undefined, { signal });
    publicBatches[batchIndex] = parseIgStrategyPublicVariants({
      idOrSlug: args.idOrSlug,
      modelText: result.content ?? "",
      outputLanguage: args.outputLanguage,
      slots: slotBatch,
      steps: args.steps,
      privateTerms,
      brandRules,
    });
  };

  // A HALF_OPEN provider admits one recovery probe. Serialize that probe
  // before the remaining parallel batches so sibling calls cannot reject it.
  const anthropicCircuit = llmCircuitSnapshot().find((entry) => entry.provider === "anthropic");
  let firstParallelBatch = 0;
  if (anthropicCircuit && anthropicCircuit.state !== "CLOSED" && slotBatches.length > 0) {
    await runSynthesisBatchesWithDeadline({
      batchIndexes: [0],
      concurrency: 1,
      deadlineAt: synthesisDeadlineAt,
      perAttemptTimeoutMs: synthesisBatchTimeoutMs,
      executeBatch,
    });
    firstParallelBatch = 1;
  }
  await runSynthesisBatchesWithDeadline({
    batchIndexes: slotBatches.map((_, index) => index).slice(firstParallelBatch),
    concurrency: 3,
    deadlineAt: synthesisDeadlineAt,
    perAttemptTimeoutMs: synthesisBatchTimeoutMs,
    executeBatch,
  });
  const publicResults = publicBatches.flat();
  assertIgStrategyPublicCampaignSafe({
    idOrSlug: args.idOrSlug,
    variants: publicResults,
    steps: args.steps,
    outputLanguage: args.outputLanguage,
    privateTerms,
  });
  return publicResults;
}
