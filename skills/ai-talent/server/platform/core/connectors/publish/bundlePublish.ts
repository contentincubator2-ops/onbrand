export type BundlePlatform = "FACEBOOK" | "INSTAGRAM" | "LINKEDIN" | "THREADS" | "TWITTER";

export type BundlePostStatus = "DRAFT" | "SCHEDULED";

/**
 * Per-platform `data.<PLATFORM>` shape (https://info.bundle.social/api-reference/platform-parameters):
 *  - INSTAGRAM / FACEBOOK take `type` (POST | REEL | STORY); INSTAGRAM carousels
 *    (type POST, 2-10 uploadIds) additionally need `carouselItems`.
 *  - LINKEDIN keeps the `type: "POST"` shape it shipped with.
 *  - THREADS / TWITTER have no `type` field — only text + uploadIds.
 */
export type BundlePostData = {
  type?: "POST" | "REEL";
  text: string;
  uploadIds?: string[];
  carouselItems?: Array<{ uploadId: string }>;
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
  threads: "THREADS",
  x: "TWITTER",
  twitter: "TWITTER",
};

/** Caption limits from bundle.social's platform pages (code points). */
export const CAPTION_LIMIT: Record<BundlePlatform, number> = {
  FACEBOOK: 50_000,
  INSTAGRAM: 2_000,
  LINKEDIN: 3_000,
  THREADS: 500,
  TWITTER: 280, // Free/Basic accounts; Premium allows more but we cannot tell which one this is
};

const PLATFORM_LABEL: Record<BundlePlatform, string> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  LINKEDIN: "LinkedIn",
  THREADS: "Threads",
  TWITTER: "X",
};

/** A user-fixable publish problem (bad media/caption for the platform), as opposed to a server fault. */
export class BundlePublishUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BundlePublishUserError";
  }
}

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

/**
 * Check caption length and the image/video combination against what the
 * platform accepts. Throws BundlePublishUserError with a Chinese + English
 * message instead of silently dropping media or truncating text.
 */
export function assertBundleMediaPlan(
  platform: BundlePlatform,
  caption: string,
  images: number,
  videos: number,
): void {
  const label = PLATFORM_LABEL[platform];
  const fail = (zh: string, en: string): never => {
    throw new BundlePublishUserError(`${zh} / ${en}`);
  };

  const len = Array.from(caption).length;
  const limit = CAPTION_LIMIT[platform];
  if (len > limit) {
    fail(
      `${label} 文案最多 ${limit} 字，目前 ${len} 字，請縮短後再發布。`,
      `${label} captions are limited to ${limit} characters (currently ${len}). Shorten it and try again.`,
    );
  }

  const total = images + videos;
  if (MEDIA_REQUIRED.includes(platform) && total === 0) {
    fail(
      `${label} 不支援純文字貼文，需要圖片或影片才能發布。`,
      `${label} does not support text-only posts; add an image or video.`,
    );
  }

  switch (platform) {
    case "INSTAGRAM":
      if (videos > 0 && images === 0 && videos > 1) {
        fail("Instagram 單獨發影片（Reels）一次只能 1 支；多個影片請搭配圖片做成輪播。", "Instagram Reels take a single video; use a carousel for several items.");
      }
      if (total > 10) {
        fail(`Instagram 輪播最多 10 項，目前 ${total} 項。`, `Instagram carousels allow at most 10 items (currently ${total}).`);
      }
      break;
    case "FACEBOOK":
      if (videos > 1) {
        fail("Facebook 一則貼文只能附 1 支影片。", "Facebook posts can carry only one video.");
      }
      if (videos === 1 && images > 0) {
        fail("Facebook 無法在同一則貼文混合圖片與影片，請擇一。", "Facebook cannot mix images and a video in one post; pick one.");
      }
      if (images > 10) {
        fail(`Facebook 一則貼文最多 10 張圖，目前 ${images} 張。`, `Facebook allows at most 10 images per post (currently ${images}).`);
      }
      break;
    case "THREADS":
      if (videos > 1 || (videos === 1 && images > 0)) {
        fail("Threads 目前僅支援單一影片，或最多 10 張圖片，無法混合。", "Threads supports a single video or up to 10 images, not a mix.");
      }
      if (images > 10) {
        fail(`Threads 最多 10 張圖，目前 ${images} 張。`, `Threads allows at most 10 images (currently ${images}).`);
      }
      break;
    case "TWITTER":
      if (videos > 1 || (videos === 1 && images > 0)) {
        fail("X 一則貼文只能附 1 支影片，或最多 4 張圖片，無法混合。", "X allows one video or up to 4 images per post, not a mix.");
      }
      if (images > 4) {
        fail(`X 一則貼文最多 4 張圖，目前 ${images} 張。`, `X allows at most 4 images per post (currently ${images}).`);
      }
      break;
    case "LINKEDIN":
      if (total > 1) {
        fail("LinkedIn 目前只支援單一圖片，尚未支援多圖或影片。", "LinkedIn publishing currently supports a single image only; multi-image and video are not supported yet.");
      }
      if (videos > 0) {
        fail("LinkedIn 尚未支援影片發布。", "Video publishing to LinkedIn is not supported yet.");
      }
      break;
  }
}

export function buildBundlePostPayload(input: {
  teamId: string;
  platform: string;
  caption: string;
  /** bundle.social upload ids of images, in display order. */
  uploadIds?: string[];
  /** bundle.social upload ids of videos. */
  videoUploadIds?: string[];
  postDate: string;
  referenceKey: string;
}): BundlePostPayload {
  const platform = toBundlePlatform(input.platform);
  if (!platform) {
    throw new BundlePublishUserError(
      `${input.platform} 尚未支援透過 bundle.social 發布 / ${input.platform} is not supported for publishing yet`,
    );
  }

  const images = input.uploadIds ?? [];
  const videos = input.videoUploadIds ?? [];
  assertBundleMediaPlan(platform, input.caption, images.length, videos.length);

  const data: BundlePostData = { text: input.caption };
  const all = [...images, ...videos];

  if (platform === "THREADS" || platform === "TWITTER") {
    // These two have no `type` field.
    if (all.length > 0) data.uploadIds = all;
  } else if (platform === "INSTAGRAM") {
    if (videos.length === 1 && images.length === 0) {
      data.type = "REEL";
      data.uploadIds = videos;
    } else {
      data.type = "POST";
      data.uploadIds = all;
      if (all.length >= 2) data.carouselItems = all.map((uploadId) => ({ uploadId }));
    }
  } else {
    data.type = "POST";
    if (all.length > 0) data.uploadIds = all;
  }
  // Keep key order stable: type first.
  const ordered: BundlePostData = data.type ? { type: data.type, ...data } : data;

  return {
    teamId: input.teamId,
    title: deriveTitle(input.caption),
    postDate: input.postDate,
    status: IMMEDIATE_POST_STATUS,
    socialAccountTypes: [platform],
    data: { [platform]: ordered },
    referenceKey: input.referenceKey,
  };
}
