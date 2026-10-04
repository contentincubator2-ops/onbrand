import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getIgStrategyPublicPolicy } from "./igStrategyPublicOutput";

export const ContentKindSchema = z.enum(["planning", "public"]);
export type ContentKind = z.infer<typeof ContentKindSchema>;

export const contentSelectorFields = {
  variantIndex: z.number().int().min(0).default(0),
  contentKind: ContentKindSchema.optional(),
  contentIndex: z.number().int().min(0).optional(),
};

export interface ContentSelector {
  variantIndex: number;
  contentKind?: ContentKind;
  contentIndex?: number;
}

interface StoredContentSelectorInput {
  variantIndex?: unknown;
  contentKind?: unknown;
  contentIndex?: unknown;
  outputMetadata?: unknown;
  missionSquadSlug?: unknown;
}

function parsedMetadata(value: unknown): Record<string, any> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, any>;
  }
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Reconstruct the selector stored on scheduled_posts. PR #56 target outputs
 * were planning-only arrays scheduled before contentKind/contentIndex existed;
 * infer those exact five rows as planning so calendar warnings and the server
 * publish guard remain fail-closed. All unrelated legacy rows stay public.
 */
export function resolveStoredContentSelector(input: StoredContentSelectorInput): ContentSelector {
  const variantIndex = Number.isInteger(Number(input.variantIndex))
    ? Math.max(0, Number(input.variantIndex))
    : 0;
  if (
    (input.contentKind === "planning" || input.contentKind === "public") &&
    input.contentIndex !== null &&
    input.contentIndex !== undefined &&
    Number.isInteger(Number(input.contentIndex))
  ) {
    return {
      variantIndex,
      contentKind: input.contentKind,
      contentIndex: Math.max(0, Number(input.contentIndex)),
    };
  }

  const metadata = parsedMetadata(input.outputMetadata);
  const candidates = [metadata.taskId, metadata.squadSlug, input.missionSquadSlug];
  const wasPlanningOnlyReport = metadata.presentation === "strategy-report"
    && candidates.some((candidate) =>
      typeof candidate === "string" && getIgStrategyPublicPolicy(candidate) !== null,
    );
  if (wasPlanningOnlyReport) {
    return { variantIndex, contentKind: "planning", contentIndex: variantIndex };
  }
  return { variantIndex };
}

export interface ResolvedOutputContent {
  item: Record<string, any>;
  kind: ContentKind;
  index: number;
  isEnvelopeV2: boolean;
  /** Values persisted on scheduled_posts. Null preserves legacy semantics. */
  storageKind: ContentKind | null;
  storageIndex: number | null;
}

type ParsedContent =
  | { shape: "v2"; root: Record<string, any>; planning: any[]; public: any[] }
  | { shape: "array"; root: any[]; variants: any[] }
  | { shape: "variants"; root: Record<string, any>; variants: any[] }
  | { shape: "object"; root: Record<string, any>; variants: any[] }
  | { shape: "text"; root: string; variants: any[] };

function badRequest(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}

function parseContent(raw: unknown): ParsedContent {
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { shape: "text", root: raw, variants: [{ label: "主版本", caption: raw }] };
    }
  }

  if (Array.isArray(parsed)) return { shape: "array", root: parsed, variants: parsed };
  if (!parsed || typeof parsed !== "object") {
    const text = String(parsed ?? "");
    return { shape: "text", root: text, variants: [{ label: "主版本", caption: text }] };
  }

  const root = parsed as Record<string, any>;
  if (root.schemaVersion === 2 && root.contentModel === "ig-strategy-bundle") {
    if (!Array.isArray(root.planningArtifacts) || !Array.isArray(root.publicVariants)) {
      return badRequest("Invalid IG strategy output content envelope");
    }
    return {
      shape: "v2",
      root,
      planning: root.planningArtifacts,
      public: root.publicVariants,
    };
  }
  if (Array.isArray(root.variants)) return { shape: "variants", root, variants: root.variants };
  return { shape: "object", root, variants: [root] };
}

/** True only for the IG strategy bundle contract written by quickTaskRouter. */
export function isIgStrategyContentEnvelope(raw: unknown): boolean {
  return parseContent(raw).shape === "v2";
}

function explicitSelector(selector: ContentSelector): { kind: ContentKind; index: number } | null {
  const hasKind = selector.contentKind !== undefined;
  const hasIndex = selector.contentIndex !== undefined;
  if (hasKind !== hasIndex) {
    return badRequest("contentKind and contentIndex must be provided together");
  }
  return hasKind ? { kind: selector.contentKind!, index: selector.contentIndex! } : null;
}

function itemAt(items: any[], index: number, kind: ContentKind): Record<string, any> {
  if (index < 0 || index >= items.length) return badRequest(`${kind} content index out of range`);
  const item = items[index];
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return badRequest(`${kind} content item is invalid`);
  }
  return item;
}

/**
 * Resolve legacy variants and schemaVersion 2 envelopes through one contract.
 * Existing callers that send only variantIndex keep their exact legacy array
 * semantics; on v2 envelopes the same index addresses publicVariants.
 */
export function resolveOutputContent(raw: unknown, selector: ContentSelector): ResolvedOutputContent {
  const parsed = parseContent(raw);
  const explicit = explicitSelector(selector);

  if (parsed.shape === "v2") {
    const kind = explicit?.kind ?? "public";
    const index = explicit?.index ?? selector.variantIndex;
    const items = kind === "planning" ? parsed.planning : parsed.public;
    return {
      item: itemAt(items, index, kind),
      kind,
      index,
      isEnvelopeV2: true,
      storageKind: kind,
      storageIndex: index,
    };
  }

  // The five target squads also have pre-envelope report arrays. A caller may
  // explicitly classify one of those legacy items as planning so the same
  // confirmation guard applies. Omitting the new selector remains the exact
  // historical public/variantIndex path.
  const kind = explicit?.kind ?? "public";
  const index = explicit?.index ?? selector.variantIndex;
  return {
    item: itemAt(parsed.variants, index, kind),
    kind,
    index,
    isEnvelopeV2: false,
    storageKind: explicit?.kind ?? null,
    storageIndex: explicit?.index ?? null,
  };
}

export function outputItemCaption(item: Record<string, any>): string {
  const value = item.caption ?? item.text ?? item.content ?? "";
  return typeof value === "string" ? value : "";
}

export function outputItemImageUrl(item: Record<string, any>): string | null {
  const value = item.imageUrl ?? item.image?.url ?? null;
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * Everything a post can carry, in publish order: carousel cards (ready images
 * only) win over the single cover image; a video is reported separately.
 */
export function outputItemMedia(item: Record<string, any>): { imageUrls: string[]; videoUrl: string | null } {
  const cardUrls = Array.isArray(item.cards)
    ? item.cards
        .filter((c: any) => c?.image?.status === "ready" || (c?.image?.status === undefined && c?.image?.url))
        .map((c: any) => c?.image?.url)
        .filter((u: unknown): u is string => typeof u === "string" && !!u.trim())
    : [];
  const single = outputItemImageUrl(item);
  const imageUrls = cardUrls.length > 0 ? cardUrls : single ? [single] : [];
  const rawVideo = item.videoUrl ?? item.video?.url ?? null;
  const videoUrl = typeof rawVideo === "string" && rawVideo.trim() ? rawVideo : null;
  return { imageUrls, videoUrl };
}

export function requirePlanningConfirmation(
  resolved: ResolvedOutputContent,
  confirmed: boolean | undefined,
  action: "schedule" | "publish",
): void {
  if (resolved.kind !== "planning" || confirmed === true) return;
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: action === "schedule"
      ? "這是規劃內容，不是公開貼文。若仍要排程，請先確認警告。"
      : "這是規劃內容，不是公開貼文。若仍要發布，請先確認警告。",
  });
}

/** Mutate exactly one selected item while preserving the original container. */
export function updateOutputContent(
  raw: unknown,
  selector: ContentSelector,
  mutate: (item: Record<string, any>) => Record<string, any>,
): { content: string; resolved: ResolvedOutputContent } {
  const parsed = parseContent(raw);
  const resolved = resolveOutputContent(raw, selector);
  const nextItem = mutate(resolved.item);

  if (parsed.shape === "v2") {
    const key = resolved.kind === "planning" ? "planningArtifacts" : "publicVariants";
    const items = [...(parsed.root[key] as any[])];
    items[resolved.index] = nextItem;
    return { content: JSON.stringify({ ...parsed.root, [key]: items }, null, 2), resolved };
  }

  const items = [...parsed.variants];
  items[resolved.index] = nextItem;
  if (parsed.shape === "array" || parsed.shape === "text") {
    return { content: JSON.stringify(items, null, 2), resolved };
  }
  return {
    content: JSON.stringify({ ...parsed.root, variants: items }, null, 2),
    resolved,
  };
}
