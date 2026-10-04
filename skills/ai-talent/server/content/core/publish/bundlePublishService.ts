import { assertBundleMediaPlan, buildBundlePostPayload, BundlePublishUserError, toBundlePlatform } from "../../../platform/core/connectors/publish/bundlePublish";
import { isBundleMissingTeamError, isBundleNotConnectedError } from "../../../platform/core/connectors/bundleSocial";
import type { BundlePost, BundleSocialClient } from "../../../platform/core/connectors/bundleSocial";

export type BundlePublishResult = {
  postId: string | null;
  permalink: string | null;
};

export type BundlePublishDeps = {
  client: Pick<BundleSocialClient, "uploadFromUrl" | "createPost">;
  /** Reads brands.bundleTeamId; null means the brand never completed the connect flow. */
  getBundleTeamId: (brandId: number) => Promise<string | null>;
};

/**
 * Collect whatever the platform reported so the user sees Meta's/LinkedIn's own
 * wording rather than a generic failure.
 */
function platformError(post: BundlePost, platform: string): string | null {
  const fromErrors = post.errors?.[platform];
  if (typeof fromErrors === "string" && fromErrors) return fromErrors;

  const verbose = post.errorsVerbose?.[platform];
  if (typeof verbose === "string" && verbose) return verbose;
  if (verbose && typeof verbose === "object") {
    const message = (verbose as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }

  if (post.error) return post.error;
  return post.status === "ERROR" ? "發布失敗，平台未提供錯誤訊息" : null;
}

/**
 * Publish one scheduled post through bundle.social.
 *
 * Dependencies are injected rather than imported so the flow can be tested
 * without a database or network.
 */
export async function publishViaBundleSocial(
  input: {
    brandId: number;
    platform: string;
    caption: string;
    imageUrl?: string | null;
    /** Multi-image / carousel. Takes precedence over imageUrl when non-empty. */
    imageUrls?: string[];
    videoUrl?: string | null;
    referenceKey: string;
    now?: Date;
  },
  deps: BundlePublishDeps,
): Promise<BundlePublishResult> {
  const platform = toBundlePlatform(input.platform);
  if (!platform) {
    throw new BundlePublishUserError(`${input.platform} 尚未支援透過 bundle.social 發布 / ${input.platform} is not supported for publishing yet`);
  }

  const imageUrls = (input.imageUrls?.length ? input.imageUrls : input.imageUrl ? [input.imageUrl] : [])
    .filter((u) => typeof u === "string" && u.trim());
  const videoUrls = input.videoUrl ? [input.videoUrl] : [];
  // Validate before uploading anything so a doomed post does not leave orphan uploads.
  assertBundleMediaPlan(platform, input.caption, imageUrls.length, videoUrls.length);

  const teamId = await deps.getBundleTeamId(input.brandId);
  if (!teamId) {
    throw new Error("此品牌尚未連接此平台。請先在右側面板完成連接。");
  }

  const uploadIds: string[] = [];
  for (const url of imageUrls) {
    const upload = await deps.client.uploadFromUrl({ teamId, url });
    uploadIds.push(upload.id);
  }
  const videoUploadIds: string[] = [];
  for (const url of videoUrls) {
    const upload = await deps.client.uploadFromUrl({ teamId, url });
    videoUploadIds.push(upload.id);
  }

  const payload = buildBundlePostPayload({
    teamId,
    platform: input.platform,
    caption: input.caption,
    uploadIds,
    videoUploadIds,
    postDate: (input.now ?? new Date()).toISOString(),
    referenceKey: input.referenceKey,
  });

  let post: BundlePost;
  try {
    post = await deps.client.createPost(payload);
  } catch (e) {
    // The team was deleted in the bundle.social dashboard. Reconnecting rebuilds
    // it, so point the user there instead of showing a raw 404.
    if (isBundleMissingTeamError(e)) {
      throw new Error("此品牌的 bundle.social 工作區已不存在，請重新連接此平台。");
    }
    // Team exists but the platform was never linked (or the connect flow was
    // abandoned half-way). Send the user back to the connect button.
    if (isBundleNotConnectedError(e)) {
      throw new Error("此品牌尚未完成此平台的連接授權，請重新連接。");
    }
    throw e;
  }

  const failure = platformError(post, platform);
  if (failure) throw new Error(failure);

  const external = post.externalData?.[platform];
  return {
    postId: external?.id ?? null,
    permalink: external?.permalink ?? null,
  };
}
