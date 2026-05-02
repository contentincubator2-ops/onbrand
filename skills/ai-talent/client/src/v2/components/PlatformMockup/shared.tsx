/**
 * Shared helpers + types for PlatformMockup family.
 *
 * Field shape is intentionally loose — each variant pulls what it
 * needs, missing fields render as Skeleton placeholders (PR2.1).
 * PR2.3 will wire real squad-step outputs into these fields.
 */
import React from "react";
import { Chip } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

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
  /** Live content fields aggregated from content-step outputs (PR4.3).
   *  When present, variants render real content instead of skeletons. */
  liveCaption?: string;
  liveHashtags?: string[];
  liveTitle?: string;
  liveDescription?: string;
  liveImageDesc?: string;
  liveVideoDesc?: string;
  liveCta?: string;
}

// Used only inside PlatformMockup/* (simulated FB/IG/LinkedIn posts where
// the avatar represents a fake post author, not a real SoWork agent). Real
// agent avatars use AgentAvatar component (DiceBear notionists) per design system.
// 2026-05-02: switched from avataaars → notionists to match the product-wide
// "illustrated portrait, specialty-keyed background" avatar standard.
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

/** IG-style story-ring avatar (conic gradient pink→purple→blue→orange) */
export function StoryRingAvatar({
  src, size = 36,
}: { src: string; size?: number }) {
  return (
    <span
      className="shrink-0 inline-flex items-center justify-center rounded-full p-[2px]"
      style={{
        width: size, height: size,
        background: "conic-gradient(from 90deg, #fa7e1e, #d62976, #962fbf, #4f5bd5, #fa7e1e)",
      }}
    >
      <span className="block w-full h-full rounded-full bg-content1 p-[2px]">
        <img
          src={src} alt=""
          className="w-full h-full rounded-full block object-cover"
        />
      </span>
    </span>
  );
}

/** Vertical action rail used by IG Reels / YT Shorts / TikTok FYP */
export function VerticalActionRail({
  items,
}: {
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
