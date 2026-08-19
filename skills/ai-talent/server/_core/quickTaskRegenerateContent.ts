import {
  isIgStrategyContentEnvelope,
  resolveOutputContent,
  updateOutputContent,
  type ContentKind,
  type ContentSelector,
} from "./outputContentEnvelope";
import { TRPCError } from "@trpc/server";

export interface RegenerationTarget {
  item: Record<string, any> | undefined;
  kind: ContentKind;
  index: number;
  isEnvelopeV2: boolean;
}

function legacyVariants(raw: unknown): any[] {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : (parsed as any)?.variants ?? [];
  } catch {
    return [];
  }
}

function hasNewSelector(selector: ContentSelector): boolean {
  return selector.contentKind !== undefined || selector.contentIndex !== undefined;
}

/**
 * Generic regeneration predates the IG strategy bundle and cannot preserve
 * its server-owned public slot/redaction contract. Keep that path fail-closed;
 * selector-aware direct edit and AI rewrite remain supported elsewhere.
 */
export function assertGenericRegenerationAllowed(
  target: RegenerationTarget,
  selector: ContentSelector,
): void {
  if (!target.isEnvelopeV2 && !hasNewSelector(selector)) return;
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "策略內容請使用 AI 重寫或直接編輯；目前不支援通用版本重生。",
  });
}

/**
 * Select the regeneration slot without changing the pre-envelope legacy path.
 * Explicit new selectors always use the shared range/pair validation.
 */
export function selectRegenerationTarget(
  raw: unknown,
  selector: ContentSelector,
): RegenerationTarget {
  if (isIgStrategyContentEnvelope(raw) || hasNewSelector(selector)) {
    const selected = resolveOutputContent(raw, selector);
    return {
      item: selected.item,
      kind: selected.kind,
      index: selected.index,
      isEnvelopeV2: selected.isEnvelopeV2,
    };
  }

  // Exact historical behaviour for callers that only send variantIndex:
  // non-array/non-{variants} content produces an empty variant list and an
  // out-of-range index is not rejected until it is assigned after generation.
  const variants = legacyVariants(raw);
  return {
    item: variants[selector.variantIndex],
    kind: "public",
    index: selector.variantIndex,
    isEnvelopeV2: false,
  };
}

/** Replace one generated item while preserving only the v2 envelope container. */
export function replaceRegeneratedContent(
  raw: unknown,
  selector: ContentSelector,
  nextItem: Record<string, any>,
  target = selectRegenerationTarget(raw, selector),
): string {
  if (target.isEnvelopeV2) {
    return updateOutputContent(raw, selector, () => nextItem).content;
  }

  // Preserve regenerateVariant's legacy/non-target storage contract: it has
  // always written the variants collection itself, not a { variants } wrapper.
  const variants = [...legacyVariants(raw)];
  variants[target.index] = nextItem;
  return JSON.stringify(variants, null, 2);
}

/**
 * regenerateVariant only regenerates copy (`images: 0`). Keep the visual that
 * is still shown beside that copy, including the persisted model prompt. A
 * later explicit image regeneration replaces both together.
 */
export function preserveExistingVariantImage(
  nextItem: Record<string, any>,
  currentItem: Record<string, any> | undefined,
): Record<string, any> {
  if (!currentItem) return nextItem;
  const preserved = { ...nextItem };
  if (currentItem.image && typeof currentItem.image === "object") {
    preserved.image = { ...currentItem.image };
  }
  // Some non-orchestra/legacy variants store the same visual fields flat.
  for (const key of ["imageUrl", "imageStatus", "imageStyle", "imagePrompt"] as const) {
    if (currentItem[key] !== undefined) preserved[key] = currentItem[key];
  }
  return preserved;
}
