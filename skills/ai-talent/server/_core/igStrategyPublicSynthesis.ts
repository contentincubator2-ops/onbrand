import {
  type IgPublicFormat,
  type IgPublicDeliverableRule,
} from "./quickTask100Squads";
import {
  buildIgStrategyPublicPromptRules,
  findIgStrategyInternalLeaks,
  getIgStrategyPublicPolicy,
  sanitizeIgStrategyPublicCaption,
  type StrategyPrivateTerm,
  type StrategyStepDescriptor,
} from "./igStrategyPublicOutput";

export interface IgStrategyPrivateArtifact {
  stepOrder: number;
  status: "done" | "failed";
  internalLabel: string;
  outputType: string | null;
  outputKind: string | null;
  agentId: number | null;
  agentName: string | null;
  rawContent: string;
  errorCode: string | null;
  latencyMs: number;
}

export interface IgStrategyPublicSlot {
  slotId: string;
  format: IgPublicFormat;
  label: string;
  instruction: string;
}

export interface IgStrategyPublicVariant {
  id: string;
  label: string;
  format: IgPublicFormat;
  caption: string;
  hashtags: string[];
  image: { style: string | null; url: null; status: "skipped" };
}

export const INITIAL_IG_STRATEGY_PUBLIC_SLOT_COUNT = 3;

/**
 * Keep the complete server-owned contract while deciding which slots a
 * continuation still has to synthesize. Existing public variants are never
 * represented by blank placeholders.
 */
export function splitIgStrategyPublicSlots(
  slots: readonly IgStrategyPublicSlot[],
  existingSlotIds: readonly string[] = [],
  initialCount = INITIAL_IG_STRATEGY_PUBLIC_SLOT_COUNT,
): { initial: IgStrategyPublicSlot[]; remaining: IgStrategyPublicSlot[] } {
  const existing = new Set(existingSlotIds);
  const ungenerated = slots.filter((slot) => !existing.has(slot.slotId));
  return existing.size === 0
    ? {
        initial: ungenerated.slice(0, Math.max(0, initialCount)),
        remaining: ungenerated.slice(Math.max(0, initialCount)),
      }
    : { initial: [], remaining: ungenerated };
}

export type RemainingStrategyPostPermission =
  | { allowed: true }
  | { allowed: false; reason: "not_owner" | "not_strategy" | "busy" | "complete" | "artifacts_incomplete" };

/** Pure authorization/state decision used before the atomic DB claim. */
export function getRemainingStrategyPostPermission(args: {
  isOwner: boolean;
  isStrategyOutput: boolean;
  progress: string;
  remainingSlotCount: number;
  artifactsReady: boolean;
}): RemainingStrategyPostPermission {
  if (!args.isOwner) return { allowed: false, reason: "not_owner" };
  if (!args.isStrategyOutput) return { allowed: false, reason: "not_strategy" };
  if (args.progress === "caption_ready") return { allowed: false, reason: "busy" };
  if (args.remainingSlotCount <= 0) return { allowed: false, reason: "complete" };
  if (!args.artifactsReady) return { allowed: false, reason: "artifacts_incomplete" };
  return { allowed: true };
}

/** Restore the immutable slot order while rejecting duplicates/unknown ids. */
export function mergeIgStrategyPublicVariants(
  slots: readonly IgStrategyPublicSlot[],
  existing: readonly IgStrategyPublicVariant[],
  generated: readonly IgStrategyPublicVariant[],
): IgStrategyPublicVariant[] {
  const byId = new Map<string, IgStrategyPublicVariant>();
  const validIds = new Set(slots.map((slot) => slot.slotId));
  for (const variant of [...existing, ...generated]) {
    if (!validIds.has(variant.id) || byId.has(variant.id)) {
      throw new Error("strategy public variants contain duplicate or unknown slots");
    }
    byId.set(variant.id, variant);
  }
  return slots.flatMap((slot) => {
    const variant = byId.get(slot.slotId);
    return variant ? [variant] : [];
  });
}

interface RunSynthesisBatchesArgs {
  batchIndexes: readonly number[];
  concurrency: number;
  deadlineAt: number;
  perAttemptTimeoutMs: number;
  executeBatch: (batchIndex: number, signal: AbortSignal) => Promise<void>;
  now?: () => number;
}

/** Run each batch at most twice without allowing retries beyond the campaign deadline. */
export async function runSynthesisBatchesWithDeadline({
  batchIndexes,
  concurrency,
  deadlineAt,
  perAttemptTimeoutMs,
  executeBatch,
  now = Date.now,
}: RunSynthesisBatchesArgs): Promise<void> {
  let nextIndex = 0;
  let stopped = false;
  let hasFatalError = false;
  let fatalError: unknown;
  const activeControllers = new Set<AbortController>();

  const abortActive = () => {
    for (const controller of activeControllers) controller.abort();
  };

  const executeWithRetry = async (batchIndex: number) => {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (stopped) throw lastError ?? new Error("public synthesis stopped");
      const remainingMs = deadlineAt - now();
      if (remainingMs <= 0) throw new Error("public synthesis timeout");

      const controller = new AbortController();
      activeControllers.add(controller);
      const timeout = setTimeout(
        () => controller.abort(),
        Math.min(perAttemptTimeoutMs, remainingMs),
      );
      try {
        await executeBatch(batchIndex, controller.signal);
        if (now() > deadlineAt) throw new Error("public synthesis timeout");
        return;
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timeout);
        activeControllers.delete(controller);
        if (!controller.signal.aborted) controller.abort();
      }

      if (deadlineAt - now() <= 0) throw new Error("public synthesis timeout");
    }
    throw lastError;
  };

  const worker = async () => {
    while (!stopped && nextIndex < batchIndexes.length) {
      const batchIndex = batchIndexes[nextIndex]!;
      nextIndex += 1;
      try {
        await executeWithRetry(batchIndex);
      } catch (error) {
        if (!hasFatalError) {
          hasFatalError = true;
          fatalError = error;
        }
        stopped = true;
        abortActive();
      }
    }
  };

  await Promise.all(Array.from(
    { length: Math.min(Math.max(1, concurrency), batchIndexes.length) },
    () => worker(),
  ));
  if (hasFatalError) throw fatalError;
}

export function assertPrivateStrategyArtifactsReady(
  artifacts: readonly IgStrategyPrivateArtifact[],
  expectedCount: number,
): IgStrategyPrivateArtifact[] {
  const usableArtifacts = getUsablePrivateStrategyArtifacts(artifacts);
  if (!hasSufficientPrivateStrategyArtifacts(artifacts, expectedCount)) {
    throw new Error("private strategy analysis is incomplete");
  }
  return usableArtifacts.sort((a, b) => a.stepOrder - b.stepOrder);
}

export function getUsablePrivateStrategyArtifacts(
  artifacts: readonly IgStrategyPrivateArtifact[],
): IgStrategyPrivateArtifact[] {
  return artifacts.filter(
    (artifact) => artifact.status === "done" && !!artifact.rawContent.trim(),
  );
}

export function hasSufficientPrivateStrategyArtifacts(
  artifacts: readonly IgStrategyPrivateArtifact[],
  expectedCount: number,
): boolean {
  const usableArtifacts = getUsablePrivateStrategyArtifacts(artifacts);
  const stepOrders = usableArtifacts.map((artifact) => artifact.stepOrder);
  const validUniqueStepOrders = stepOrders.every(
    (stepOrder) => Number.isInteger(stepOrder) && stepOrder >= 1 && stepOrder <= expectedCount,
  ) && new Set(stepOrders).size === stepOrders.length;
  return validUniqueStepOrders
    && usableArtifacts.length >= minimumPrivateStrategyArtifactCount(expectedCount);
}

/** A usable synthesis needs broad coverage, not merely a bare majority of tiny squads. */
export function minimumPrivateStrategyArtifactCount(expectedCount: number): number {
  return Math.max(3, Math.ceil(expectedCount / 2));
}

export function assertRedactedStrategyContextReady(
  contexts: readonly string[],
  expectedCount: number,
): string[] {
  const usableContexts = contexts.filter((context) => !!context.trim());
  if (usableContexts.length < minimumPrivateStrategyArtifactCount(expectedCount)) {
    throw new Error("de-identified strategy analysis is incomplete");
  }
  return usableContexts;
}

export interface IgStrategyBrandRules {
  banned: readonly string[];
  subs: readonly { from: string; to: string }[];
  preferred: readonly string[];
}

function escapedRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyBrandRulesLocally(text: string, rules?: IgStrategyBrandRules): string {
  if (!rules || !text) return text;
  let next = text;
  for (const pair of rules.subs) {
    if (!pair.from) continue;
    next = /[A-Za-z]/.test(pair.from)
      ? next.replace(new RegExp(escapedRegex(pair.from), "gi"), () => pair.to)
      : next.split(pair.from).join(pair.to);
  }
  const bannedHit = rules.banned.find((term) => {
    if (!term) return false;
    return /[A-Za-z]/.test(term)
      ? new RegExp(escapedRegex(term), "i").test(next)
      : next.includes(term);
  });
  if (bannedHit) throw new Error("strategy public output violates brand word rules");
  return next;
}

function isZh(outputLanguage: string): boolean {
  const language = outputLanguage.replace(/_/g, "-").toLowerCase();
  return language === "zh" || language === "zh-tw" || language === "zh-hant"
    || language.startsWith("zh-hant-") || language === "zh-hk" || language === "zh-mo";
}

function localized(copy: { en: string; zh: string }, outputLanguage: string): string {
  return isZh(outputLanguage) ? copy.zh : copy.en;
}

function explicitLiveSessionCount(topic: string, fallback: number, max: number): number {
  const matches = [
    ...topic.matchAll(/(?:預計|共|安排|規劃)?\s*(\d{1,2})\s*(?:場|次)\s*(?:直播)?/g),
    ...topic.matchAll(/(?:plan(?:ning)?|schedule|total)?\s*(\d{1,2})\s+live\s+sessions?/gi),
  ];
  const value = matches.map((match) => Number(match[1])).find((n) => n > 0);
  return Math.min(max, value ?? fallback);
}

function explicitItemCount(topic: string, fallback: number, max: number): number {
  const stated = topic.match(/(\d{1,2})\s*(?:個|則|項)\s*(?:故事|場景|素材|紀錄)/);
  if (stated && Number(stated[1]) > 0) return Math.min(max, Number(stated[1]));
  const bullets = topic
    .split("\n")
    .filter((line) => /^\s*(?:[-*+]|\d+[.)、])\s*\S/.test(line));
  if (bullets.length >= 2) return Math.min(max, bullets.length);
  const listBody = topic.includes("：") || topic.includes(":")
    ? topic.split(/[:：]/).slice(1).join("：")
    : "";
  const separatedItems = listBody
    .split(/[、；;]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
  return separatedItems.length >= 2 ? Math.min(max, separatedItems.length) : fallback;
}

function itemCount(rule: IgPublicDeliverableRule, topic: string): number {
  if (rule.kind === "fixed") return rule.count;
  if (rule.inputKind === "live-session") {
    return explicitLiveSessionCount(topic, rule.defaultItems, rule.maxItems);
  }
  return explicitItemCount(topic, rule.defaultItems, rule.maxItems);
}

/** Server-owned slots: the model can fill content but cannot choose count or format. */
export function buildIgStrategyPublicSlots(
  idOrSlug: string,
  topic: string,
  outputLanguage = "zh-TW",
): IgStrategyPublicSlot[] | null {
  const resolved = getIgStrategyPublicPolicy(idOrSlug);
  if (!resolved) return null;

  const slots: IgStrategyPublicSlot[] = [];
  for (const rule of resolved.policy.deliverables) {
    const items = itemCount(rule, topic);
    const count = rule.kind === "fixed"
      ? rule.count
      : rule.kind === "per-input-item"
        ? items * rule.multiplier
        : items * rule.perItemCount;
    for (let index = 0; index < count; index += 1) {
      const format = rule.kind === "allocated-bundle"
        ? rule.formats[index % rule.formats.length]!
        : rule.format;
      slots.push({
        slotId: `${rule.id}-${index + 1}`,
        format,
        label: `${localized(rule.label, outputLanguage)} ${index + 1}`,
        instruction: localized(rule.instruction, outputLanguage),
      });
    }
  }
  return slots;
}

export function buildIgStrategySynthesisMessages(args: {
  idOrSlug: string;
  topic: string;
  brandContext: string;
  outputLanguage: string;
  slots: readonly IgStrategyPublicSlot[];
  /** Redacted analysis conclusions; never raw artifact rows or identities. */
  strategyContext: readonly string[];
  strategyAnalysisComplete?: boolean;
  brandRules?: IgStrategyBrandRules;
}): Array<{ role: "system" | "user"; content: string }> {
  const slotContract = args.slots.map((slot) => ({
    slotId: slot.slotId,
    format: slot.format,
    instruction: slot.instruction,
  }));
  const safeContext = args.strategyContext.filter(Boolean).map((text) => text.slice(0, 12_000));
  const visibleRules = buildIgStrategyPublicPromptRules("Instagram public deliverables", args.outputLanguage);
  const system = `You are the final public-content editor for Instagram.${visibleRules}
Use the private strategy material only as reasoning input. Do not summarize the strategy and do not expose its names, workflow, people, keys, or status.
Return JSON only in this exact shape: {"variants":[{"slotId":"...","caption":"...","hashtags":["..."],"imageStyle":"..."}]}.
Produce exactly one item for every server-owned slot below, with the exact slotId. Do not add, remove, rename, or reorder slots. The assigned format is final.
SERVER-OWNED SLOTS:
${JSON.stringify(slotContract)}`;
  const user = [
    `TASK INPUT:\n${args.topic || "(not provided)"}`,
    args.brandContext ? `BRAND CONTEXT:\n${args.brandContext}` : "",
    args.brandRules ? `BRAND WORD RULES — FOLLOW EXACTLY:\n${JSON.stringify({
      banned: args.brandRules.banned,
      substitutions: args.brandRules.subs,
      preferred: args.brandRules.preferred,
    })}` : "",
    args.strategyAnalysisComplete === false
      ? "ANALYSIS COVERAGE: Some private analysis was unavailable. Use only the supplied conclusions; do not invent the missing analysis or mention this incomplete internal status in public content."
      : "",
    `REDACTED STRATEGY CONCLUSIONS — USE AS REASONING, DO NOT DESCRIBE THE PROCESS:\n${safeContext.join("\n\n---\n\n")}`,
  ].filter(Boolean).join("\n\n");
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

function parseJsonObject(text: string): any {
  const unfenced = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try { return JSON.parse(unfenced); } catch {}
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(unfenced.slice(start, end + 1));
  throw new Error("strategy public synthesis returned invalid JSON");
}

/** Parse model output against the immutable slot contract and apply the public leak boundary. */
export function parseIgStrategyPublicVariants(args: {
  idOrSlug: string;
  modelText: string;
  outputLanguage: string;
  slots: readonly IgStrategyPublicSlot[];
  steps: readonly StrategyStepDescriptor[];
  privateTerms?: readonly StrategyPrivateTerm[];
  brandRules?: IgStrategyBrandRules;
}): IgStrategyPublicVariant[] {
  const parsed = parseJsonObject(args.modelText);
  const rawVariants = Array.isArray(parsed?.variants) ? parsed.variants : null;
  if (!rawVariants || rawVariants.length !== args.slots.length) {
    throw new Error("strategy public synthesis returned the wrong variant count");
  }
  const bySlot = new Map<string, any>();
  for (const raw of rawVariants) {
    if (!raw || typeof raw.slotId !== "string" || bySlot.has(raw.slotId)) {
      throw new Error("strategy public synthesis returned invalid slot ids");
    }
    bySlot.set(raw.slotId, raw);
  }

  return args.slots.map((slot) => {
    const raw = bySlot.get(slot.slotId);
    if (!raw || typeof raw.caption !== "string") {
      throw new Error(`strategy public synthesis missing ${slot.slotId}`);
    }
    const publicContext = {
      steps: args.steps,
      outputLanguage: args.outputLanguage,
      privateTerms: args.privateTerms,
    };
    const finalizePublicField = (value: string): string => {
      const sanitized = sanitizeIgStrategyPublicCaption(
        args.idOrSlug,
        applyBrandRulesLocally(value, args.brandRules),
        publicContext,
      );
      // Sanitization can introduce a configured public replacement such as
      // "content team". Re-run brand enforcement after every redaction, then
      // fail closed if a substitution itself reintroduced a private marker.
      const finalValue = applyBrandRulesLocally(sanitized, args.brandRules);
      const validated = sanitizeIgStrategyPublicCaption(
        args.idOrSlug,
        finalValue,
        publicContext,
      );
      if (
        validated !== finalValue ||
        findIgStrategyInternalLeaks(finalValue, args.privateTerms).length > 0
      ) {
        throw new Error("strategy public output validation failed");
      }
      return finalValue;
    };
    const caption = finalizePublicField(raw.caption);
    const hashtags = Array.isArray(raw.hashtags)
      ? raw.hashtags
          .filter((tag: unknown): tag is string => typeof tag === "string" && !!tag.trim())
          .slice(0, 12)
          .map((tag: string) => finalizePublicField(tag))
      : [];
    const rawImageStyle = typeof raw.imageStyle === "string" ? raw.imageStyle.trim() : "";
    const imageStyle = rawImageStyle
      ? finalizePublicField(rawImageStyle)
      : null;
    // Enforce one audience address across the complete publishable DTO, not
    // merely within the caption. A hashtag or visual note cannot reintroduce
    // a second pronoun choice or a private execution term.
    sanitizeIgStrategyPublicCaption(
      args.idOrSlug,
      [caption, ...hashtags, imageStyle ?? ""].filter(Boolean).join("\n"),
      publicContext,
    );
    return {
      id: slot.slotId,
      label: slot.label,
      format: slot.format,
      caption,
      hashtags,
      image: {
        style: imageStyle,
        url: null,
        status: "skipped",
      },
    };
  });
}
