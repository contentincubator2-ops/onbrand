/**
 * Media task templates for photo, video, and doc rewrite tasks.
 * These show up in the task picker grid under their respective platform tiles.
 *
 * Unlike regular 30s tasks (which open the orchestra modal), media tasks
 * set isMediaTask:true + ctaPath so the frontend routes directly to a
 * dedicated upload/input page instead.
 */

export type MediaTaskTemplate = {
  id: string;
  tier: "30s";
  /** 2026-07-17 多市場: bilingual like FBTaskTemplate. */
  label: string | { en: string; zh: string };
  description: string | { en: string; zh: string };
  platform: "facebook" | "instagram" | "tiktok" | "youtube";
  mediaType: "photo" | "video" | "doc";
  primary_question: string;
  ctaPath: string; // client-side route to navigate to
};

export const MEDIA_PHOTO_TASKS: MediaTaskTemplate[] = [
  {
    id: "media-photo-fb",
    tier: "30s",
    label: { en: "Photo → FB Post", zh: "照片 → FB 貼文" },
    description: { en: "Upload a photo — AI reads it and writes an on-brand FB post", zh: "上傳照片，AI 看圖產出符合品牌調性的 FB 貼文" },
    platform: "facebook",
    mediaType: "photo",
    primary_question: "上傳一張產品或活動照片",
    ctaPath: "/media/photo/fb",
  },
  {
    id: "media-photo-ig",
    tier: "30s",
    label: { en: "Photo → IG Post + Hashtags", zh: "照片 → IG 貼文 + 標籤" },
    description: { en: "Upload a photo — AI writes the IG caption + hashtags", zh: "上傳照片，AI 看圖產出 IG 貼文文案 + 標籤" },
    platform: "instagram",
    mediaType: "photo",
    primary_question: "上傳一張照片",
    ctaPath: "/media/photo/ig",
  },
  {
    id: "media-photo-tiktok",
    tier: "30s",
    label: { en: "Photo → TikTok Caption", zh: "照片 → TikTok 文案" },
    description: { en: "Upload a photo — AI writes the TikTok caption", zh: "上傳照片，AI 看圖產出 TikTok 貼文文案" },
    platform: "tiktok",
    mediaType: "photo",
    primary_question: "上傳一張照片",
    ctaPath: "/media/photo/tiktok",
  },
  {
    id: "media-photo-yt",
    tier: "30s",
    label: { en: "Photo → YouTube Thumbnail Text", zh: "照片 → YouTube 縮圖文字" },
    description: { en: "Upload a thumbnail — AI writes the YouTube title, description and tags", zh: "上傳縮圖，AI 產出 YouTube 標題、描述與 tags" },
    platform: "youtube",
    mediaType: "photo",
    primary_question: "上傳 YouTube 縮圖",
    ctaPath: "/media/photo/youtube",
  },
];

export const MEDIA_VIDEO_TASKS: MediaTaskTemplate[] = [
  {
    id: "media-video-fb",
    tier: "30s",
    label: { en: "Video → FB Post", zh: "影片 → FB 貼文" },
    description: { en: "Paste a YouTube link — AI analyzes the video and writes an FB post", zh: "貼上 YouTube 連結，AI 分析影片產出 FB 貼文" },
    platform: "facebook",
    mediaType: "video",
    primary_question: "貼上影片的 YouTube 連結",
    ctaPath: "/media/video/fb",
  },
  {
    id: "media-video-ig",
    tier: "30s",
    label: { en: "Video → IG Reels Caption", zh: "影片 → IG Reels 文案" },
    description: { en: "Paste a YouTube link — AI writes the IG Reels caption", zh: "貼上 YouTube 連結，AI 產出 IG Reels 文案" },
    platform: "instagram",
    mediaType: "video",
    primary_question: "貼上影片的 YouTube 連結",
    ctaPath: "/media/video/ig",
  },
  {
    id: "media-video-tiktok",
    tier: "30s",
    label: { en: "Video → TikTok Script", zh: "影片 → TikTok 腳本" },
    description: { en: "Paste a YouTube link — AI writes the TikTok caption", zh: "貼上 YouTube 連結，AI 產出 TikTok 文案" },
    platform: "tiktok",
    mediaType: "video",
    primary_question: "貼上影片的 YouTube 連結",
    ctaPath: "/media/video/tiktok",
  },
  {
    id: "media-video-yt",
    tier: "30s",
    label: { en: "Video → YouTube Title + Description", zh: "影片 → YouTube 標題＋說明" },
    description: { en: "Paste a YouTube link — AI rewrites the title, description and tags", zh: "貼上 YouTube 連結，AI 幫你改寫標題、描述、tags" },
    platform: "youtube",
    mediaType: "video",
    primary_question: "貼上你要改寫的 YouTube 影片連結",
    ctaPath: "/media/video/youtube",
  },
];

export const MEDIA_DOC_TASKS: MediaTaskTemplate[] = [
  {
    id: "media-doc-rewrite",
    tier: "30s",
    label: { en: "Document Rewrite (Brand Tone)", zh: "文件改寫（品牌調性）" },
    description: { en: "Upload a document — AI rewrites it in your brand voice", zh: "上傳文件，AI 按照你的品牌語氣改寫全文" },
    platform: "facebook", // placeholder — doc rewrite is channel-agnostic
    mediaType: "doc",
    primary_question: "上傳要改寫的文件",
    ctaPath: "/media/doc",
  },
];
