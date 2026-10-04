/**
 * Shared helpers + types for PlatformMockup family.
 *
 * Session 6: added MockupSlotMap + SlotContent for per-slot loading/filled/empty states.
 * P0: added MarkdownText for Markdown-formatted social post output.
 */
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Skeleton } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useLang } from "../../../../lib/i18n";

/* ── SHOW_IMAGE_STYLE_OVERLAY ───────────────────────────────────────────────
 *
 * 2026-08-19：IG / FB feed 在「圖已生成」時，會把中文視覺方向（image.style）
 * 壓成一條黑底字幕疊在圖片下緣。那段文字看起來像是這張圖的生成指令，其實
 * 不是 —— 它由 image_director agent 與 caption writer「平行」產出
 * (quickTaskOrchestra.ts:2050)，從未進過生圖模型；真正的 prompt 是
 * captionToVisualBrief 依完成的 caption 轉出的英文 brief
 * (visualBrief.ts:51)。兩者沒有因果關係，字條常與眼前的圖對不上。
 *
 * 先隱藏而非刪除：把這個常數改回 true 就完整還原。
 * 視覺方向本身沒有消失 —— 尚未生圖時仍由 ImageGenSlot 的「視覺方向：」
 * 顯示，另外也在 RunPage 側欄「本版本配圖指引」(RunPage.tsx:3050)。*/
export const SHOW_IMAGE_STYLE_OVERLAY: boolean = false;

/* ── ImageGenSlot — THE standard image placeholder for every mockup ─────────
 *
 * 2026-07-17 (CJ「畫面讓人混淆能不能產圖/產影片…盤查一遍，完全都補上一個
 * 程序：至少要在圖片中央產出提示詞，用戶可以點選生圖」):
 * every image slot in every mockup renders this instead of ad-hoc
 * placeholders. It always shows
 *   1. a CENTERED, obviously-clickable 「點此生成主圖」 button (wired to the
 *      host page's image-generation panel via onGenerate; retry copy on
 *      failed/timeout),
 *   2. the generated visual direction (視覺方向) as supporting text — so the
 *      baked-in prompt text stops looking like mystery content,
 *   3. for video-form mockups (Story/Reels/直播/YT), an explicit note that
 *      the frame is layout preview only and no video file is produced.
 * If the host passes no onGenerate handler the slot degrades to a passive
 * note (never a dead「點此生成」that ignores clicks — that was the bug). */
export function ImageGenSlot({
  brief,
  status,
  onGenerate,
  aspectClass = "aspect-[16/9]",
  dark = false,
  videoFrame = false,
  className = "",
}: {
  brief?: string | null;
  status?: MockupFields["liveImageStatus"];
  onGenerate?: () => void;
  /** Tailwind aspect/size classes; pass "" when the parent fixes dimensions. */
  aspectClass?: string;
  /** Dark treatment for story/reels/video frames. */
  dark?: boolean;
  /** Video-form mockup: adds the「不產出影片檔」clarification. */
  videoFrame?: boolean;
  className?: string;
}) {
  const { lang } = useLang();
  const clickable = !!onGenerate;
  const failed = status === "timeout" || status === "failed";
  const ctaText = failed
    ? (lang === "en" ? "Image failed · tap to retry" : "圖片生成失敗 · 點此重試")
    : (lang === "en" ? "Want an image? Tap to create" : "要幫這篇做圖嗎？點此做圖");
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? ctaText : undefined}
      onClick={onGenerate}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onGenerate!(); } } : undefined}
      className={`relative flex flex-col items-center justify-center text-center px-5 py-6 gap-2 ${aspectClass} ${
        dark ? "bg-black/30" : "bg-default-100"
      } ${clickable ? `cursor-pointer transition ${dark ? "hover:bg-black/40" : "hover:bg-default-200"}` : ""} ${className}`}
    >
      {clickable ? (
        // Keep the actionable control above script/caption overlays. The slot
        // root deliberately does not create its own stacking context.
        <span className={`relative z-20 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-tiny font-semibold shadow-sm ${
          dark ? "bg-white/90 text-default-900" : "bg-white text-default-800 border border-default-300"
        }`}>
          🎨 {ctaText}
        </span>
      ) : (
        <span className={`text-tiny font-medium ${dark ? "text-white/70" : "text-default-500"}`}>
          {lang === "en" ? "Text first — you can add an image when it's done" : "這一步先寫文字，完成後可以再做圖"}
        </span>
      )}
      {brief && (
        <p className={`text-[10px] leading-relaxed line-clamp-3 max-w-[92%] ${dark ? "text-white/55" : "text-default-400"}`}>
          {lang === "en" ? "Visual direction: " : "視覺方向："}{brief}
        </p>
      )}
      {videoFrame && (
        <p className={`text-[9px] ${dark ? "text-white/45" : "text-default-400"}`}>
          {lang === "en"
            ? "Video frame is a layout preview — this task does not render a video file"
            : "影片外框僅為版位示意 · 本任務不產出影片檔"}
        </p>
      )}
    </div>
  );
}

// ── MarkdownText — renders social post content with Markdown formatting ───────
/**
 * Renders user-generated or AI-generated social post text.
 * Supports: **bold**, *italic*, line breaks, bullet lists, numbered lists, #hashtags.
 * Uses prose-style class overrides tuned for small social preview cards.
 */
export function MarkdownText({
  content,
  className = "",
  lineClamp,
}: {
  content: string;
  className?: string;
  lineClamp?: number;
}) {
  const clampClass = lineClamp ? `line-clamp-${lineClamp}` : "";
  return (
    <div className={`markdown-text text-small leading-relaxed ${clampClass} ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="list-disc pl-4 mb-1 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-4 mb-1 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li className="text-small">{children}</li>,
          a: ({ children, href }) => {
            // 2026-05-13 (security review): sanitize URL scheme. AI-
            // generated captions could contain `javascript:` / `data:` /
            // `vbscript:` URLs — block everything except http(s) / mailto
            // / tel / fragment / relative.
            const safe = (() => {
              if (!href) return false;
              const s = String(href).trim().toLowerCase();
              if (s.startsWith("http://") || s.startsWith("https://")) return true;
              if (s.startsWith("mailto:") || s.startsWith("tel:")) return true;
              if (s.startsWith("/") || s.startsWith("#") || s.startsWith("?")) return true;
              return false;
            })();
            if (!safe) return <span className="text-primary underline">{children}</span>;
            return <a href={href} className="text-primary underline" target="_blank" rel="noopener noreferrer">{children}</a>;
          },
          h1: ({ children }) => <p className="font-bold text-medium mb-1">{children}</p>,
          h2: ({ children }) => <p className="font-semibold mb-1">{children}</p>,
          h3: ({ children }) => <p className="font-medium mb-0.5">{children}</p>,
          code: ({ children }) => <code className="bg-default-100 px-1 rounded text-tiny font-mono">{children}</code>,
          blockquote: ({ children }) => <blockquote className="border-l-2 border-primary/40 pl-3 text-default-500 italic">{children}</blockquote>,
          hr: () => <hr className="border-divider my-2" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// ── Slot state system (Session 6) ─────────────────────────────────────────────

export type MockupSlotStatus = "empty" | "loading" | "filled";

export interface MockupSlotState {
  /** Rendered value — string for text slots, string[] for hashtags */
  value?: string | string[];
  status: MockupSlotStatus;
}

/** Map of slotKey → SlotState. Keys match the `mockupSlot` field on squad steps.
 *  Known slot keys: caption, image, hashtags, title, description, cta, imageDesc, videoDesc, body */
export type MockupSlotMap = Record<string, MockupSlotState>;

/**
 * SlotContent — renders one mockup slot in the correct state:
 *   "empty"   → renders `placeholder` (grayed-out skeleton or nothing)
 *   "loading" → animated shimmer skeleton
 *   "filled"  → calls `children(value)` with the slot value
 *
 * Usage:
 *   <SlotContent slotKey="caption" slotMap={slotMap} skeletonLines={3}
 *     placeholder={<Skeleton className="h-3 w-3/4 rounded" />}
 *   >
 *     {(val) => <p>{val as string}</p>}
 *   </SlotContent>
 */
export function SlotContent({
  slotKey,
  slotMap,
  children,
  placeholder,
  skeletonLines = 2,
  skeletonClassName,
}: {
  slotKey: string;
  slotMap?: MockupSlotMap;
  children: (value: string | string[] | undefined) => React.ReactNode;
  placeholder?: React.ReactNode;
  skeletonLines?: number;
  skeletonClassName?: string;
}) {
  const { lang } = useLang();
  const slot = slotMap?.[slotKey];

  // No slot map wired yet — fall back to old liveXxx prop behaviour (children handles it)
  if (!slotMap) return <>{children(undefined)}</>;

  if (slot?.status === "loading") {
    return (
      <div className="space-y-1.5 w-full animate-in fade-in duration-300">
        {Array.from({ length: skeletonLines }).map((_, i) => (
          <Skeleton
            key={i}
            className={skeletonClassName ?? `h-2.5 rounded ${i === 0 ? "w-full" : i === skeletonLines - 1 ? "w-[60%]" : "w-[85%]"}`}
          />
        ))}
        {/* Pulse label */}
        <div className="flex items-center gap-1 mt-1">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse inline-block" />
          <span className="text-[10px] text-primary/70">{lang === "en" ? "Agent is generating…" : "Agent 生成中…"}</span>
        </div>
      </div>
    );
  }

  if (slot?.status === "filled") {
    return <>{children(slot.value)}</>;
  }

  // "empty" or undefined slot
  return <>{placeholder ?? null}</>;
}

// ── Original MockupFields interface (extended with slotMap) ────────────────────

export interface MockupFields {
  /** Mission title — used as caption hook / video title */
  title: string;
  /** Brief / description body */
  brief: string;
  /** Brand display name */
  brandName: string | null;
  /** Variant label for header chip — comes from inferMockupVariant */
  variantLabel?: string;
  /** Squad steps — only consumed by UnsupportedVariantPlaceholder */
  steps?: Array<{ name?: string; outputType?: string; assignedAgentName?: string }>;
  /** Live content fields — legacy path (still works when slotMap is absent) */
  liveCaption?: string;
  liveHashtags?: string[];
  /** 2026-05-18 (CJ「釘選主文應該有個 PIN」): render FB pinned-post chrome */
  pinned?: boolean;
  /** 2026-05-18 (CJ): carousel / album — N cards, each with its own image */
  liveCards?: Array<{
    headline: string;
    body: string;
    image: { style: string | null; url: string | null; status: string; errorMsg?: string };
  }>;
  liveTitle?: string;
  /** 2026-07-07 (CJ): user-editable title text overlaid ON the thumbnail
   *  image (AI image is text-free; the real title is a controllable layer).
   *  Rendered by the YT thumbnail mockups; included in the html2canvas
   *  "帶版型" download. */
  overlayTitle?: string;
  liveDescription?: string;
  /**
   * 2026-08-20 (CJ「IG 留言回覆出現『製作中』而且沒有內容」): the ORIGINAL
   * material a reply-type task is answering — the user's own comment /
   * review text, taken from the run's persisted metadata.inputs
   * (RunPage.tsx). Only comment/reply mockups read it, so no other mockup
   * changes behaviour. Kept separate from liveDescription because that
   * field already carries model-produced sub-copy on threads / podcast /
   * web / 小紅書 (and JSON poll options on FBPoll).
   */
  liveSourceComment?: string;
  liveImageDesc?: string;
  liveVideoDesc?: string;
  liveCta?: string;
  /**
   * Quick-task pivot (2026-05-05): structured style direction shown inside
   * image / video placeholder slots until the user opts into MediaGenFlow
   * to render the actual asset. Mirrors `imageStyleDirectionSchema` from
   * server/_core/quickTaskOutput.ts. Plain string here for cross-mockup
   * compatibility — full structured form lives in the slotMap payload.
   */
  liveImageStyle?: string;
  liveVideoStyle?: string;
  /**
   * Plan B (2026-05-05): when the orchestra has a real generated image URL,
   * we pass it here. Mockups render the actual <img> instead of the style-
   * direction text. Falls back to liveImageStyle when missing or status≠ready.
   */
  liveImageUrl?: string;
  liveImageStatus?: "ready" | "failed" | "skipped" | "timeout";
  /**
   * 2026-07-07 (CJ「廣告主圖點此生成沒反應」bug): the image placeholders
   * literally say「點此生成」but were dead text with no handler. Host
   * page (RunPage) passes this callback to open its image-generation
   * panel when the user clicks the placeholder.
   */
  onGenerateImage?: () => void;
  /**
   * 2026-07-17 (CJ「headline 類產出的示意會讓人覺得應該有全文」): for ad
   * COMPONENT tasks the deliverable is one slot of the ad, not the whole
   * post. When set, the mockup renders the caption INTO that slot
   * (highlighted) and turns the not-produced areas into ghost skeletons,
   * so nobody expects a full post from a headline/description/CTA task.
   */
  componentSlot?: "headline" | "description" | "cta";
  /**
   * Brand profile picture URL — when present, mockups use it for the
   * "posting as" avatar instead of dicebear placeholder. Source is
   * `brands.logoUrl` (which can be auto-filled from FB Graph picture
   * endpoint via brand.fetchFacebookAvatar mutation).
   */
  brandLogoUrl?: string | null;
  /**
   * Quick-task link-post pivot (2026-05-05): when caption contains a URL the
   * server already fetched, this carries the OG card metadata so the mockup
   * renders an actual link preview (image + title + description + domain)
   * instead of an empty "等待 AI 生成" image slot. Real FB behaviour is
   * to auto-render OG cards for link posts; we mirror that.
   */
  ogCard?: {
    url: string;
    image: string | null;
    title: string | null;
    description: string | null;
    siteName: string | null;
    domain: string;
  };
  /**
   * Session 6: per-slot state map.
   * When provided, variants use SlotContent to show loading/filled/empty per slot.
   * Falls back gracefully to liveXxx props when absent.
   */
  slotMap?: MockupSlotMap;
  /**
   * Session 7: embedded media-gen flow rendered inside the image slot.
   * When provided, renders instead of the default image placeholder/spinner.
   * Pass a media-gen flow node (MediaGenFlow) when the active step is visual.
   */
  imageSlotFlow?: React.ReactNode;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export const dicebear = (name: string) =>
  `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(name || "anon")}&backgroundColor=4267B2&backgroundType=solid`;

export const handleOf = (brandName: string | null, fallback = "your_brand") =>
  (brandName ?? fallback).toLowerCase().replace(/\s+/g, "_").slice(0, 30);

/**
 * 2026-05-14 (CJ「標題重複問題已經解決很多次，怎都無法根除」):
 * Decide whether to render the standalone title line ABOVE the caption.
 * Returns true if the title is a duplicate prefix of the caption — in
 * which case the caller should NOT render the title to avoid the
 * sandwich-effect screenshot bug.
 *
 * Handles the 3 ways title can shadow caption:
 *   1. exact prefix:        title="因為 Pokemon GO"  caption="因為 Pokemon GO，..."
 *   2. ellipsis-suffix:     title="因為 Pokemon GO…"   caption starts with same text
 *      ← this is what slipped past the previous fix; titleFromCaption
 *        appends "…" when truncating at 32 cps, breaking startsWith.
 *   3. punctuation drift:   title="「因為 Pokemon GO」" caption="「因為 Pokemon GO，..."
 *      (trailing 」/。/, before ellipsis)
 *
 * Strip trailing ellipsis + punctuation from BOTH sides before comparing.
 */
export function titleEchoesCaption(title: string | null | undefined, caption: string | null | undefined): boolean {
  const t = (title ?? "").trim();
  const c = (caption ?? "").trim();
  if (!t || !c) return false;
  // Normalize trailing ellipsis / dots / punctuation on title.
  const tNorm = t.replace(/[….…]+$/u, "")  // trailing ellipses
                 .replace(/[」』）\)。，、]+$/u, "") // trailing closing punctuation
                 .trim();
  if (!tNorm) return false;
  // Compare leading slice of caption (also normalized: strip leading 「『 etc.)
  // to title without its own punctuation noise.
  if (c.startsWith(tNorm)) return true;
  // If caption starts with quote marks, peek past them too.
  const cInner = c.replace(/^[「『（\(\s]+/u, "").trim();
  if (cInner.startsWith(tNorm.replace(/^[「『（\(\s]+/u, ""))) return true;
  return false;
}

export function MockupHeader({
  icon, label, variantLabel,
}: {
  icon: any;
  label: string;
  variantLabel?: string;
}) {
  const { lang } = useLang();
  return (
    <div className="text-center mb-3">
      <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-default-500">
        <FontAwesomeIcon icon={icon} className="text-default-400" />
        {variantLabel ?? (lang === "en" ? `${label} preview` : `${label} 預覽`)}
      </span>
    </div>
  );
}

export function StoryRingAvatar({ src, size = 36 }: { src: string; size?: number }) {
  return (
    <span
      className="shrink-0 inline-flex items-center justify-center rounded-full p-[2px]"
      style={{
        width: size, height: size,
        background: "conic-gradient(from 90deg, #fa7e1e, #d62976, #962fbf, #4f5bd5, #fa7e1e)",
      }}
    >
      <span className="block w-full h-full rounded-full bg-content1 p-[2px]">
        <img src={src} alt="" className="w-full h-full rounded-full block object-cover" />
      </span>
    </span>
  );
}

export function VerticalActionRail({ items }: {
  items: Array<{ icon: any; label: string; count?: string }>;
}) {
  return (
    <div className="absolute right-2 bottom-16 flex flex-col items-center gap-4 z-10">
      {items.map((it, i) => (
        <div key={i} className="flex flex-col items-center gap-0.5 text-white drop-shadow-lg">
          <span className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
            <FontAwesomeIcon icon={it.icon} className="text-medium" />
          </span>
          {it.count && <span className="text-tiny font-semibold">{it.count}</span>}
        </div>
      ))}
    </div>
  );
}
