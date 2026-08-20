import type { MockupVariant } from "./inferMockup";

export type StrategyContentKind = "planningArtifacts" | "publicVariants";
export type RunContentKind = "legacy" | StrategyContentKind;
export type IgPublicFormat = "feed" | "carousel" | "reel" | "story" | "live";

export interface StrategyContentEnvelope<T = unknown> {
  planningArtifacts: T[];
  publicVariants: T[];
}

export interface ResolvedRunContent<T = unknown> {
  isStrategyEnvelope: boolean;
  planningArtifacts: T[];
  publicVariants: T[];
  legacyVariants: T[];
}

export type RunContentMutationLocator =
  | { variantIndex: number }
  | {
      /** Server mutation contract; UI names remain planningArtifacts/publicVariants. */
      contentKind: "planning" | "public";
      contentIndex: number;
    };

const TARGET_IDS = new Set([
  "ig-99-youtility",
  "ig-baer-youtility",
  "ig-99-visual-story",
  "ig-chrisdo-visual-story",
  "ig-99-live-first",
  "ig-fanzo-live-first",
  "ig-99-document",
  "ig-garyvee-document",
  "ig-99-radical-transparency",
  "ig-hollis-radical-transparency",
]);

const DAILY_FEED_TARGET_IDS = new Set([
  "ig-99-youtility",
  "ig-baer-youtility",
  "ig-99-visual-story",
  "ig-chrisdo-visual-story",
]);

const IG_PUBLIC_FORMATS = new Set<IgPublicFormat>([
  "feed", "carousel", "reel", "story", "live",
]);

function normalizeTaskId(taskId?: string | null): string {
  return String(taskId ?? "").replace(/^([a-z]+)-100-/, "$1-99-");
}

export function isIgStrategyDeliverableTarget(taskId?: string | null): boolean {
  return TARGET_IDS.has(normalizeTaskId(taskId));
}

export function shouldHideStrategyPlanningTabs(
  taskId: string | null | undefined,
  isStrategyEnvelope: boolean,
): boolean {
  return isStrategyEnvelope && isIgStrategyDeliverableTarget(taskId);
}

function chineseDayNumber(day: number): string {
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (day < 10) return digits[day] ?? String(day);
  if (day === 10) return "十";
  if (day < 20) return `十${digits[day - 10]}`;
  if (day % 10 === 0) return `${digits[Math.floor(day / 10)]}十`;
  if (day < 40) return `${digits[Math.floor(day / 10)]}十${digits[day % 10]}`;
  return String(day);
}

/** Daily labels apply only to the two fixed 30-feed campaign contracts. */
export function getStrategyPublicTabLabel(args: {
  taskId?: string | null;
  isStrategyEnvelope: boolean;
  format?: unknown;
  index: number;
  fallbackLabel?: string | null;
  language: "en" | "zh";
}): string {
  const isDailyFeed = args.isStrategyEnvelope
    && DAILY_FEED_TARGET_IDS.has(normalizeTaskId(args.taskId))
    && args.format === "feed";
  if (!isDailyFeed) {
    return args.fallbackLabel
      || (args.language === "en" ? `Post ${args.index + 1}` : `貼文 ${args.index + 1}`);
  }
  const day = args.index + 1;
  return args.language === "en" ? `Day ${day}` : `第${chineseDayNumber(day)}天`;
}

/**
 * Recognize the new envelope only for the five server-owned targets. For every
 * non-target, return the same legacy array selection RunPage used previously.
 */
export function resolveRunContent<T = unknown>(
  parsed: unknown,
  taskId?: string | null,
  metadata?: unknown,
): ResolvedRunContent<T> {
  const legacyVariants = Array.isArray(parsed)
    ? parsed as T[]
    : (parsed && typeof parsed === "object" && Array.isArray((parsed as any).variants)
      ? (parsed as any).variants as T[]
      : []);

  const isTarget = isIgStrategyDeliverableTarget(taskId);
  const isLegacyStrategyReport = !!metadata
    && typeof metadata === "object"
    && (metadata as any).presentation === "strategy-report";

  // PR #56 persisted the five targets as a legacy array with a report flag.
  // Treat those entries as planning-only envelopes so they are never silently
  // publishable; every other legacy array keeps the old behavior.
  if (isTarget && isLegacyStrategyReport && legacyVariants.length > 0) {
    return {
      isStrategyEnvelope: true,
      planningArtifacts: legacyVariants,
      publicVariants: [],
      legacyVariants: [],
    };
  }

  if (!isTarget || !parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      isStrategyEnvelope: false,
      planningArtifacts: legacyVariants,
      publicVariants: [],
      legacyVariants,
    };
  }

  const root = parsed as any;
  const planningArtifacts = root.planningArtifacts;
  const publicVariants = root.publicVariants;
  if (
    root.schemaVersion !== 2
    || root.contentModel !== "ig-strategy-bundle"
    || !Array.isArray(planningArtifacts)
    || !Array.isArray(publicVariants)
  ) {
    return {
      isStrategyEnvelope: false,
      planningArtifacts: legacyVariants,
      publicVariants: [],
      legacyVariants,
    };
  }

  return {
    isStrategyEnvelope: true,
    planningArtifacts: planningArtifacts as T[],
    publicVariants: publicVariants as T[],
    legacyVariants: [],
  };
}

export function getRunContentMutationLocator(
  contentKind: RunContentKind,
  variantIndex: number,
): RunContentMutationLocator {
  return contentKind === "legacy"
    ? { variantIndex }
    : {
        contentKind: contentKind === "planningArtifacts" ? "planning" : "public",
        contentIndex: variantIndex,
      };
}

export function getRunContentSelectionKey(contentKind: RunContentKind, variantIndex: number): string {
  return `${contentKind}:${variantIndex}`;
}

export function getMutationLocatorSelectionKey(locator: RunContentMutationLocator): string {
  if ("variantIndex" in locator) return getRunContentSelectionKey("legacy", locator.variantIndex);
  return getRunContentSelectionKey(
    locator.contentKind === "planning" ? "planningArtifacts" : "publicVariants",
    locator.contentIndex,
  );
}

export function shouldApplyMutationPreview(
  activeSelectionKey: string,
  locator: RunContentMutationLocator,
): boolean {
  return activeSelectionKey === getMutationLocatorSelectionKey(locator);
}

export function isEmptyStrategyPublicSelection(
  isStrategyEnvelope: boolean,
  contentKind: RunContentKind,
  publicVariantCount: number,
): boolean {
  return isStrategyEnvelope && contentKind === "publicVariants" && publicVariantCount === 0;
}

export type StrategyPublicGenerationState = "generating" | "missing" | null;
export type StrategyRemainingGenerationState = "generating" | "ready" | null;

/**
 * Distinguish an empty public tab that is still being synthesized from one
 * whose run has settled without public posts. Both the target task id and the
 * v2 strategy envelope are required so caption_ready semantics for every 60s
 * and non-strategy run remain untouched.
 */
export function getStrategyPublicGenerationState({
  taskId,
  isStrategyEnvelope,
  progress,
  publicVariantCount,
}: {
  taskId?: string | null;
  isStrategyEnvelope: boolean;
  progress?: string | null;
  publicVariantCount: number;
}): StrategyPublicGenerationState {
  if (!isIgStrategyDeliverableTarget(taskId) || !isStrategyEnvelope || publicVariantCount > 0) {
    return null;
  }
  return progress === "caption_ready" ? "generating" : "missing";
}

export function getStrategyRemainingGenerationState({
  taskId,
  isStrategyEnvelope,
  progress,
  publicVariantCount,
  publicSlotCount,
  artifactsReady,
}: {
  taskId?: string | null;
  isStrategyEnvelope: boolean;
  progress?: string | null;
  publicVariantCount: number;
  publicSlotCount: number;
  /** Missing on older outputs; only an explicit false removes the CTA. */
  artifactsReady?: boolean;
}): StrategyRemainingGenerationState {
  if (
    !isIgStrategyDeliverableTarget(taskId)
    || !isStrategyEnvelope
    || publicSlotCount <= publicVariantCount
    || artifactsReady === false
  ) return null;
  return progress === "caption_ready" ? "generating" : "ready";
}

export function getCalendarPublishPayload(
  id: number,
  storedContentKind: unknown,
): { id: number; confirmPlanningContent?: true } {
  return storedContentKind === "planning"
    ? { id, confirmPlanningContent: true }
    : { id };
}

export function getIgPublicVariantMockup(
  contentKind: RunContentKind,
  format: unknown,
): MockupVariant | null {
  if (contentKind !== "publicVariants" || typeof format !== "string" || !IG_PUBLIC_FORMATS.has(format as IgPublicFormat)) {
    return null;
  }
  return {
    platform: "instagram",
    format: format as any,
    label: `instagram:${format}`,
  };
}

/**
 * Select the presentation override owned by an IG strategy envelope.
 * Planning artifacts are internal, multi-section analysis documents rather
 * than social posts. `research-doc` is the existing mockup built for 99s
 * strategy tabs and renders Markdown sections without any image affordance.
 * Non-envelope runs deliberately receive no override, preserving RunPage's
 * legacy mockup inference byte-for-byte.
 */
export function getStrategySelectionMockup(
  isStrategyEnvelope: boolean,
  contentKind: RunContentKind,
  format: unknown,
): MockupVariant | null {
  if (!isStrategyEnvelope) return null;
  if (contentKind === "planningArtifacts") {
    return {
      platform: "generic",
      format: "research-doc" as any,
      label: "generic:research-doc",
    };
  }
  return getIgPublicVariantMockup(contentKind, format);
}

export function isStrategyPlanningSelection(
  isStrategyEnvelope: boolean,
  contentKind: RunContentKind,
): boolean {
  return isStrategyEnvelope && contentKind === "planningArtifacts";
}

/** A failed strategy step has no image job to retry; its whole output is absent. */
export function isPlanningArtifactMissingOutput(
  isStrategyEnvelope: boolean,
  contentKind: RunContentKind,
  caption: unknown,
  imageStatus: unknown,
): boolean {
  if (!isStrategyPlanningSelection(isStrategyEnvelope, contentKind)) return false;
  return typeof caption !== "string" || caption.trim().length === 0 || imageStatus === "failed";
}

export function getIgPublicVariantImageSize(
  contentKind: RunContentKind,
  format: unknown,
): "1024x1024" | "1024x1536" | undefined {
  if (contentKind !== "publicVariants") return undefined;
  if (format === "feed" || format === "carousel") return "1024x1024";
  if (format === "reel" || format === "story" || format === "live") return "1024x1536";
  return undefined;
}

export function getPlanningPublishWarning(
  contentKind: RunContentKind,
  action: "schedule" | "publish",
  language: "en" | "zh",
): string | null {
  if (contentKind !== "planningArtifacts") return null;
  if (language === "en") {
    return action === "publish"
      ? "This is internal strategy content and may contain methodology or planning notes. Publish it externally anyway?"
      : "This is internal strategy content and may contain methodology or planning notes. Schedule it externally anyway?";
  }
  return action === "publish"
    ? "這是內部策略內容，可能包含方法論或企劃說明。確定要直接對外發布嗎？"
    : "這是內部策略內容，可能包含方法論或企劃說明。確定要直接對外排程嗎？";
}

export function getPlanningConfirmationPayload(contentKind: RunContentKind): { confirmPlanningContent: true } | Record<string, never> {
  return contentKind === "planningArtifacts" ? { confirmPlanningContent: true } : {};
}
