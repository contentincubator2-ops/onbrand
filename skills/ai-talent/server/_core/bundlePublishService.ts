import { buildBundlePostPayload, toBundlePlatform } from "./bundlePublish";
import type { BundlePost, BundleSocialClient } from "./bundleSocial";

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
    referenceKey: string;
    now?: Date;
  },
  deps: BundlePublishDeps,
): Promise<BundlePublishResult> {
  const platform = toBundlePlatform(input.platform);
  if (!platform) {
    throw new Error(`${input.platform} 尚未支援透過 bundle.social 發布`);
  }

  const teamId = await deps.getBundleTeamId(input.brandId);
  if (!teamId) {
    throw new Error("此品牌尚未連接此平台。請先在右側面板完成連接。");
  }

  const uploadIds: string[] = [];
  if (input.imageUrl) {
    const upload = await deps.client.uploadFromUrl({ teamId, url: input.imageUrl });
    uploadIds.push(upload.id);
  }

  const payload = buildBundlePostPayload({
    teamId,
    platform: input.platform,
    caption: input.caption,
    uploadIds,
    postDate: (input.now ?? new Date()).toISOString(),
    referenceKey: input.referenceKey,
  });

  const post = await deps.client.createPost(payload);

  const failure = platformError(post, platform);
  if (failure) throw new Error(failure);

  const external = post.externalData?.[platform];
  return {
    postId: external?.id ?? null,
    permalink: external?.permalink ?? null,
  };
}
