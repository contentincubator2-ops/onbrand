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

const IG_PUBLIC_FORMATS = new Set<IgPublicFormat>([
  "feed", "carousel", "reel", "story", "live",
]);

function normalizeTaskId(taskId?: string | null): string {
  return String(taskId ?? "").replace(/^([a-z]+)-100-/, "$1-99-");
}

export function isIgStrategyDeliverableTarget(taskId?: string | null): boolean {
  return TARGET_IDS.has(normalizeTaskId(taskId));
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
