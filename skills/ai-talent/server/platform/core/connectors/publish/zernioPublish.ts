import { PublishUserError, type PublishResult } from "./publishAdapter";

export type ZernioPlatform = "facebook" | "instagram" | "linkedin" | "threads" | "twitter" | "youtube" | "tiktok";
const PLATFORM_MAP: Record<string, ZernioPlatform> = {
  facebook: "facebook", fb: "facebook", instagram: "instagram", ig: "instagram",
  linkedin: "linkedin", li: "linkedin", threads: "threads", x: "twitter", twitter: "twitter",
  youtube: "youtube", yt: "youtube", tiktok: "tiktok", tt: "tiktok",
};
export const CAPTION_LIMIT: Partial<Record<ZernioPlatform, number>> = { threads: 500, twitter: 280 };
/** Set true for a TikTok PoC whose app has not passed review. */
export const TIKTOK_DRAFT = false;
export function toZernioPlatform(platform: string): ZernioPlatform | undefined {
  return PLATFORM_MAP[platform.toLowerCase()];
}
export function assertZernioMediaPlan(platform: string, caption: string, imageCount: number, videoCount: number): void {
  const mapped = toZernioPlatform(platform);
  if (!mapped) throw new PublishUserError(`${platform} 尚未支援透過 Zernio 發布。`);
  const limit = CAPTION_LIMIT[mapped];
  if (limit && Array.from(caption).length > limit) throw new PublishUserError(`${platform} 文案最多 ${limit} 字，請縮短後再發布。`);
  if (mapped === "instagram" && imageCount + videoCount === 0) throw new PublishUserError("Instagram 需要至少一張圖片或一支影片才能發布。");
  if ((mapped === "youtube" || mapped === "tiktok") && videoCount === 0) throw new PublishUserError(`${platform} 需要影片才能發布。`);
}
export function youtubeTitleFromCaption(caption: string): string {
  const line = caption.split(/\r?\n/).map(s => s.trim()).find(s => s && !s.startsWith("#"));
  return Array.from(line ?? "onBrand Studio post").slice(0, 100).join("");
}
export type ZernioPostPayload = {
  content: string;
  mediaItems: Array<{ type: "image" | "video"; url: string }>;
  platforms: Array<{ platform: ZernioPlatform; accountId: string; platformSpecificData?: Record<string, unknown> }>;
  publishNow: true;
};
export function buildZernioPostPayload(input: {
  platform: string; accountId: string; caption: string; imageUrls: string[]; videoUrl?: string | null;
}): ZernioPostPayload {
  assertZernioMediaPlan(input.platform, input.caption, input.imageUrls.length, input.videoUrl ? 1 : 0);
  const platform = toZernioPlatform(input.platform)!;
  const platformSpecificData = platform === "youtube" ? { title: youtubeTitleFromCaption(input.caption), visibility: "public" }
    : platform === "tiktok" ? { privacyLevel: "PUBLIC_TO_EVERYONE", allowComment: true, ...(TIKTOK_DRAFT ? { draft: true } : {}) } : undefined;
  return {
    content: input.caption,
    mediaItems: [...input.imageUrls.map(url => ({ type: "image" as const, url })),
      ...(input.videoUrl ? [{ type: "video" as const, url: input.videoUrl }] : [])],
    platforms: [{ platform, accountId: input.accountId, ...(platformSpecificData ? { platformSpecificData } : {}) }],
    publishNow: true,
  };
}
export type ZernioPostResponse = {
  post?: { _id?: string; status?: string; platforms?: Array<{
    platform: string; status?: string; platformPostId?: string; platformPostUrl?: string | null; error?: string;
  }> };
  platformResults?: Array<{ platform: string; status?: string; error?: string }>;
  error?: string; message?: string; warnings?: string[];
};
export function readZernioPublishResult(input: { httpStatus: number; body: ZernioPostResponse; platform: string }): PublishResult {
  const { httpStatus, body } = input;
  const platform = toZernioPlatform(input.platform);
  const target = body.post?.platforms?.find(p => p.platform === platform);
  if ((httpStatus === 201 || httpStatus === 200) && target?.status === "published"
      && !["failed", "partial"].includes(body.post?.status ?? "")) {
    return { postId: target.platformPostId ?? null, permalink: target.platformPostUrl ?? null };
  }
  throw new Error(body.platformResults?.find(p => p.platform === platform && p.error)?.error
    || target?.error || body.error || body.message || "Zernio 尚未確認發布成功，請稍後重試。");
}
