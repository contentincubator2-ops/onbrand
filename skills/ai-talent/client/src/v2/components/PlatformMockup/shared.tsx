/**
 * Shared helpers + types for PlatformMockup family.
 *
 * Session 6: added MockupSlotMap + SlotContent for per-slot loading/filled/empty states.
 * P0: added MarkdownText for Markdown-formatted social post output.
 */
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Chip, Skeleton } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

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
          a: ({ children, href }) => <a href={href} className="text-primary underline" target="_blank" rel="noopener noreferrer">{children}</a>,
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
          <span className="text-[10px] text-primary/70">Agent 生成中…</span>
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
  liveTitle?: string;
  liveDescription?: string;
  liveImageDesc?: string;
  liveVideoDesc?: string;
  liveCta?: string;
  /**
   * Session 6: per-slot state map.
   * When provided, variants use SlotContent to show loading/filled/empty per slot.
   * Falls back gracefully to liveXxx props when absent.
   */
  slotMap?: MockupSlotMap;
  /**
   * Session 7: embedded media-gen flow rendered inside the image slot.
   * When provided, renders instead of the default image placeholder/spinner.
   * Pass <ImageSlotFlow ... /> from SquadDetailPanel when the active step is visual.
   */
  imageSlotFlow?: React.ReactNode;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export const dicebear = (name: string) =>
  `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(name || "anon")}&backgroundColor=4267B2&backgroundType=solid`;

export const handleOf = (brandName: string | null, fallback = "your_brand") =>
  (brandName ?? fallback).toLowerCase().replace(/\s+/g, "_").slice(0, 30);

export function MockupHeader({
  icon, label, variantLabel,
}: {
  icon: any;
  label: string;
  variantLabel?: string;
}) {
  return (
    <div className="text-center mb-4">
      <Chip
        size="sm" variant="flat" color="secondary"
        startContent={<FontAwesomeIcon icon={icon} className="ml-1" />}
        className="uppercase tracking-wider"
      >
        {variantLabel ?? `${label} 預覽`}
      </Chip>
      <p className="text-tiny text-default-500 mt-2">
        agent 完成各階段後，內容會逐欄淡入填到下方
      </p>
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
