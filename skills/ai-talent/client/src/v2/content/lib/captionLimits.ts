/**
 * Caption length limits per platform, mirrored from the server's CAPTION_LIMIT
 * (platform/core/connectors/publish/bundlePublish.ts, counted in code points).
 * Only used to hint in the schedule dialog; the server stays the authority.
 */
const LIMITS: Record<string, number> = {
  instagram: 2000, ig: 2000,
  linkedin: 3000, li: 3000,
  threads: 500,
  x: 280, twitter: 280,
};

export function captionLimitFor(platform: string | null | undefined): number | null {
  return LIMITS[String(platform ?? "").toLowerCase()] ?? null;
}

export function captionLength(text: string | null | undefined): number {
  return Array.from(text ?? "").length;
}

export interface CaptionLimitHint { limit: number; length: number; over: boolean; text: string }

export function captionLimitHint(
  platform: string | null | undefined,
  caption: string | null | undefined,
  en: boolean,
): CaptionLimitHint | null {
  const limit = captionLimitFor(platform);
  if (!limit) return null;
  const length = captionLength(caption);
  const over = length > limit;
  const text = over
    ? (en ? `${length}/${limit} characters. This is over the limit, so shorten it before publishing.` : `${length}/${limit} 字，超過上限，發布前請先縮短。`)
    : (en ? `${length}/${limit} characters (platform limit).` : `${length}/${limit} 字（平台上限）。`);
  return { limit, length, over, text };
}
