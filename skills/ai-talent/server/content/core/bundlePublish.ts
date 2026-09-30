export type BundlePlatform = "FACEBOOK" | "INSTAGRAM" | "LINKEDIN";

export type BundlePostStatus = "DRAFT" | "SCHEDULED";

export type BundlePostData = {
  type: "POST";
  text: string;
  uploadIds?: string[];
};

export type BundlePostPayload = {
  teamId: string;
  title: string;
  postDate: string;
  status: BundlePostStatus;
  socialAccountTypes: BundlePlatform[];
  data: Partial<Record<BundlePlatform, BundlePostData>>;
  referenceKey: string;
};

/**
 * Status used when the user pressed "publish now".
 *
 * bundle.social's docs contradict themselves here: one page claims DRAFT with a
 * past postDate publishes immediately, while the OpenAPI schema lists both DRAFT
 * and SCHEDULED as not-yet-published states. SCHEDULED with the current time is
 * the reading that matches every other scheduler, so start there and correct
 * this single constant once the PoC shows the real behaviour.
 */
export const IMMEDIATE_POST_STATUS: BundlePostStatus = "SCHEDULED";

/** bundle.social caps `title` at 80 characters. */
const TITLE_MAX_LENGTH = 80;

const PLATFORM_MAP: Record<string, BundlePlatform> = {
  facebook: "FACEBOOK",
  fb: "FACEBOOK",
  instagram: "INSTAGRAM",
  ig: "INSTAGRAM",
  linkedin: "LINKEDIN",
  li: "LINKEDIN",
};

/** Platforms that reject text-only posts. */
const MEDIA_REQUIRED: BundlePlatform[] = ["INSTAGRAM"];

export function toBundlePlatform(platform: string): BundlePlatform | undefined {
  return PLATFORM_MAP[platform?.toLowerCase?.() ?? ""];
}

/**
 * `title` is required and must be non-empty, but it is internal bookkeeping —
 * the text the audience sees is `data.<PLATFORM>.text`. Use the first non-blank
 * line so the bundle.social dashboard stays readable.
 */
function deriveTitle(caption: string): string {
  const firstLine = caption
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return (firstLine ?? "onBrand Studio post").slice(0, TITLE_MAX_LENGTH);
}

export function buildBundlePostPayload(input: {
  teamId: string;
  platform: string;
  caption: string;
  uploadIds?: string[];
  postDate: string;
  referenceKey: string;
}): BundlePostPayload {
  const platform = toBundlePlatform(input.platform);
  if (!platform) {
    throw new Error(`${input.platform} 尚未支援透過 bundle.social 發布`);
  }

  const uploadIds = input.uploadIds ?? [];
  if (MEDIA_REQUIRED.includes(platform) && uploadIds.length === 0) {
    throw new Error("Instagram 不支援純文字貼文，需要圖片才能發布。");
  }

  const data: BundlePostData = { type: "POST", text: input.caption };
  if (uploadIds.length > 0) data.uploadIds = uploadIds;

  return {
    teamId: input.teamId,
    title: deriveTitle(input.caption),
    postDate: input.postDate,
    status: IMMEDIATE_POST_STATUS,
    socialAccountTypes: [platform],
    data: { [platform]: data },
    referenceKey: input.referenceKey,
  };
}
