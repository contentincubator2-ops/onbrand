export interface VariantImageUpdateInput {
  imageUrl: string;
  style?: string;
  prompt?: string;
  promptZh?: string;
  modelId?: string;
  requestedModelId?: string;
}

/**
 * One image that used to be (or could again be) the variant's current image.
 * 2026-09-21 (CJ「生成過的圖，要讓用戶可以選選用，避免換一個 MODEL 生了圖，不滿意以後，又想要
 * 用回去上一張圖的時候，生不出來」): every image that leaves the slot is kept here, with the
 * prompt and model that made it, so switching back is a pointer move — never a regeneration.
 */
export interface ImageVersion {
  url: string;
  prompt: string | null;
  promptZh: string | null;
  modelId: string | null;
  requestedModelId: string | null;
  savedAt: string;
}

/** Newest first. Old enough versions fall off the end; the current image is never in this list. */
export const MAX_IMAGE_VERSIONS = 12;

/** Inline data: images can be megabytes each — keeping a dozen copies inside the row would balloon it. */
const MAX_INLINE_VERSION_CHARS = 1_500_000;

function isArchivable(url: unknown): url is string {
  if (typeof url !== "string" || !url) return false;
  return !url.startsWith("data:") || url.length <= MAX_INLINE_VERSION_CHARS;
}

function currentImageOf(item: Record<string, any>) {
  return item.image && typeof item.image === "object" && !Array.isArray(item.image) ? item.image : {};
}

function versionsOf(item: Record<string, any>): ImageVersion[] {
  const nested = currentImageOf(item).versions;
  const raw = Array.isArray(nested) ? nested : Array.isArray(item.imageVersions) ? item.imageVersions : [];
  return raw.filter((v: any): v is ImageVersion => !!v && typeof v.url === "string" && v.url.length > 0);
}

/** The current image as a history entry — or null if there's nothing worth keeping (no image / a failed slot). */
function snapshotCurrent(item: Record<string, any>, now: string): ImageVersion | null {
  const cur = currentImageOf(item);
  const url = item.imageUrl ?? cur.url ?? null;
  const status = item.imageStatus ?? cur.status;
  if (!isArchivable(url) || (status && status !== "ready")) return null;
  return {
    url,
    prompt: cur.prompt ?? item.imagePrompt ?? null,
    promptZh: cur.promptZh ?? item.imagePromptZh ?? null,
    modelId: cur.modelId ?? item.imageModelId ?? null,
    requestedModelId: cur.requestedModelId ?? item.imageRequestedModelId ?? null,
    savedAt: now,
  };
}

/** New history after `incomingUrl` becomes current: the outgoing image is added, the incoming one removed. */
function nextVersions(item: Record<string, any>, incomingUrl: string, now: string): ImageVersion[] {
  const outgoing = snapshotCurrent(item, now);
  const rest = versionsOf(item).filter((v) => v.url !== incomingUrl && v.url !== outgoing?.url);
  const list = outgoing && outgoing.url !== incomingUrl ? [outgoing, ...rest] : rest;
  return list.slice(0, MAX_IMAGE_VERSIONS);
}

function withImage(
  item: Record<string, any>,
  image: {
    url: string; style: unknown; prompt: unknown; promptZh: unknown;
    modelId: unknown; requestedModelId: unknown;
  },
  versions: ImageVersion[],
): Record<string, any> {
  const currentImage = currentImageOf(item);
  return {
    ...item,
    image: {
      ...currentImage,
      url: image.url,
      status: "ready",
      style: image.style,
      prompt: image.prompt,
      promptZh: image.promptZh,
      modelId: image.modelId,
      requestedModelId: image.requestedModelId,
      versions,
      // A previous failed attempt's error state must not outlive the new image.
      errorMsg: undefined,
      canSwitchTo: undefined,
    },
    imageUrl: image.url,
    imageStatus: "ready",
    imageStyle: image.style,
    imagePrompt: image.prompt,
    imagePromptZh: image.promptZh,
    imageModelId: image.modelId,
    imageRequestedModelId: image.requestedModelId,
    imageVersions: versions,
  };
}

/**
 * Keep the nested orchestra image contract and the historical flat fields in
 * lockstep. RunPage deliberately reads flat fields first for old outputs, so
 * leaving an old flat prompt behind makes a newly generated image appear to
 * have been driven by the previous prompt.
 *
 * The image being replaced is archived into `versions` (see ImageVersion).
 */
export function applyVariantImageUpdate(
  item: Record<string, any>,
  input: VariantImageUpdateInput,
  now: string = new Date().toISOString(),
): Record<string, any> {
  const currentImage = currentImageOf(item);
  const style = input.style ?? currentImage.style ?? item.imageStyle ?? null;
  const prompt = input.prompt
    ?? currentImage.prompt
    ?? item.imagePrompt
    ?? input.style
    ?? currentImage.style
    ?? item.imageStyle
    ?? null;
  const promptZh = input.promptZh
    ?? currentImage.promptZh
    ?? item.imagePromptZh
    ?? null;
  const modelId = input.modelId ?? currentImage.modelId ?? item.imageModelId ?? null;
  const requestedModelId = input.requestedModelId
    ?? currentImage.requestedModelId
    ?? item.imageRequestedModelId
    ?? null;

  return withImage(
    item,
    { url: input.imageUrl, style, prompt, promptZh, modelId, requestedModelId },
    nextVersions(item, input.imageUrl, now),
  );
}

/**
 * Make a previously generated image current again — no generation, no cost.
 * The version's own prompt and model come back with it, and the image being
 * left becomes a version in its place, so the two can be flipped back and forth.
 * Returns null when `url` isn't one of this variant's versions.
 */
export function selectVariantImageVersion(
  item: Record<string, any>,
  url: string,
  now: string = new Date().toISOString(),
): Record<string, any> | null {
  const version = versionsOf(item).find((v) => v.url === url);
  if (!version) return null;
  const style = currentImageOf(item).style ?? item.imageStyle ?? null;
  return withImage(
    item,
    {
      url: version.url, style,
      prompt: version.prompt, promptZh: version.promptZh,
      modelId: version.modelId, requestedModelId: version.requestedModelId,
    },
    nextVersions(item, version.url, now),
  );
}
