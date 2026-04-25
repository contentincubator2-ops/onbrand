/**
 * MethodologyCard — rack-card primitive for the new Marketing-OS shell.
 *
 * Strict adherence to the reference rack-card (Sprint 1 D1, CJ direction
 * 2026-04-25). Each card is one of three colour systems (teal / red / blue)
 * and renders a fixed five-zone composition:
 *
 *   1. Brand monogram + category eyebrow (top-left)
 *   2. Organic teardrop hero shape with optional cover image (top-right)
 *   3. Coloured pill that holds the methodology title (mid)
 *   4. "OUR STEPS / 我的服務" 4-row list with circular icons + descriptions
 *   5. Dark CONTACT footer with lead avatar + run-count + CTA pill
 *
 * No emoji. Editorial typography. The card is a vertical 5×7 ratio so
 * 3 fit side-by-side on desktop, 1 wide on mobile. Used by both the
 * MissionsHome wall and the MethodologyGrid swap drawer.
 */

import React from "react";
import type { MosAccent } from "../../../studio/primitives/tokens";
import { ACCENTS } from "../../../studio/primitives/tokens";

export interface MethodologyStep {
  name: string;
  desc?: string;
  /** Optional emoji or single character glyph rendered inside the circle. */
  glyph?: string;
}

export interface MethodologyCardProps {
  accent: MosAccent;
  /** small uppercase eyebrow above the title pill — "L1 · 品牌策略" */
  category: string;
  /** Brand or methodology monogram, top-left of card. e.g. "SOWORK" */
  monogram?: string;
  /** Methodology title shown inside the colour pill. */
  title: string;
  /** Author / year — small caps under the title pill. */
  author?: string;
  /** Cover image rendered inside the organic teardrop hero. */
  imageUrl?: string;
  /** Up to 5 steps — extra are truncated to keep the rack-card rhythm. */
  steps?: MethodologyStep[];
  /** Lead agent name shown in the dark footer. */
  leadName?: string;
  /** Lead agent avatar URL or single-letter initial fallback. */
  leadAvatar?: string;
  /** Right-hand small line — "5 steps · ~20 min" or "已執行 12 次". */
  footerMeta?: string;
  /** CTA pill label. Default 套用. */
  ctaLabel?: string;
  onCtaClick?: () => void;
  /** Whole-card click — separate from CTA so the CTA can stop propagation. */
  onClick?: () => void;
  /** Compact = removes some vertical padding for grid density. */
  compact?: boolean;
  /** Variant index 0-2 picks one of three asymmetric blob shapes. */
  variantIndex?: number;
  className?: string;
}

const BLOBS = ["clip-blob-a", "clip-blob-b", "clip-blob-c"] as const;

export default function MethodologyCard({
  accent,
  category,
  monogram = "SOWORK",
  title,
  author,
  imageUrl,
  steps = [],
  leadName,
  leadAvatar,
  footerMeta,
  ctaLabel = "套用",
  onCtaClick,
  onClick,
  compact = false,
  variantIndex = 0,
  className = "",
}: MethodologyCardProps) {
  const tone = ACCENTS[accent];
  const blob = BLOBS[variantIndex % BLOBS.length];
  const visibleSteps = steps.slice(0, 4);
  const initial = leadAvatar && leadAvatar.length === 1 ? leadAvatar : null;

  return (
    <div
      onClick={onClick}
      className={[
        "group relative flex flex-col overflow-hidden",
        "bg-white border border-mos-hair shadow-card",
        "transition-shadow duration-200",
        onClick ? "cursor-pointer hover:shadow-lift" : "",
        // 5:7 rack-card ratio. Width capped so 3 fit per row at 1280+.
        compact ? "w-[300px]" : "w-[320px]",
        className,
      ].join(" ")}
      style={{ aspectRatio: compact ? "5 / 7" : "5 / 7.4" }}
    >
      {/* ────────────────────── ZONE 1+2: Header band ────────────────────── */}
      <div className="relative px-5 pt-5 pb-2">
        <div className="font-display text-[0.6rem] tracking-[0.28em] uppercase text-mos-soft">
          {monogram}
        </div>
        <div className="mt-1 text-[0.66rem] tracking-[0.2em] uppercase text-mos-muted">
          {category}
        </div>

        {/* Organic teardrop hero — absolute, top-right of header */}
        <div
          className={`absolute right-3 top-3 w-[120px] h-[120px] ${blob} overflow-hidden`}
          style={{ background: tone.bg }}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              className="w-full h-full object-cover mix-blend-multiply opacity-95"
            />
          ) : (
            <div
              className="w-full h-full"
              style={{
                background: `linear-gradient(135deg, ${tone.bg} 0%, ${tone.bgInk} 100%)`,
              }}
            />
          )}
        </div>
      </div>

      {/* ────────────────────────── ZONE 3: Title pill ───────────────────── */}
      <div className="px-5 pt-16">
        <div
          className="inline-block px-4 py-2 max-w-[88%]"
          style={{ background: tone.bg }}
        >
          <div className="font-display text-white text-[1.05rem] leading-tight tracking-[-0.005em]">
            {title}
          </div>
        </div>
        {author && (
          <div className="mt-2 text-[0.66rem] tracking-[0.18em] uppercase text-mos-muted">
            {author}
          </div>
        )}
      </div>

      {/* ─────────────────────────── ZONE 4: Steps ───────────────────────── */}
      <div className="px-5 pt-4 pb-3 flex-1">
        <div className="text-[0.6rem] tracking-[0.28em] uppercase text-mos-soft mb-3">
          我的服務 · OUR STEPS
        </div>
        <ul className="space-y-2.5">
          {visibleSteps.length === 0 && (
            <li className="text-[0.78rem] text-mos-soft italic">
              尚未設定執行流程
            </li>
          )}
          {visibleSteps.map((s, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span
                className="mt-[1px] inline-flex w-6 h-6 items-center justify-center rounded-full text-white text-[0.65rem] font-display tracking-[0.04em] shrink-0"
                style={{ background: tone.bg }}
              >
                {s.glyph ?? `0${i + 1}`}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[0.82rem] leading-tight text-mos-ink font-medium">
                  {s.name}
                </span>
                {s.desc && (
                  <span className="block mt-0.5 text-[0.7rem] leading-snug text-mos-muted truncate">
                    {s.desc}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* ───────────────────────── ZONE 5: CONTACT footer ────────────────── */}
      <div className="mt-auto bg-mos-ink text-white px-5 py-3 flex items-center gap-3">
        {/* Avatar circle */}
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center font-display text-[0.78rem] shrink-0"
          style={{ background: tone.bg }}
        >
          {leadAvatar && !initial ? (
            <img src={leadAvatar} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            <span>{initial ?? (leadName?.[0] ?? "·")}</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-[0.6rem] tracking-[0.28em] uppercase text-white/60">
            CONTACT
          </div>
          <div className="text-[0.82rem] truncate text-white">
            {leadName ?? "Squad Lead"}
          </div>
          {footerMeta && (
            <div className="text-[0.62rem] tracking-[0.1em] text-white/50 truncate">
              {footerMeta}
            </div>
          )}
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); onCtaClick?.(); }}
          className="shrink-0 rounded-full px-3.5 py-1.5 text-[0.7rem] tracking-[0.14em] uppercase text-mos-ink bg-white hover:bg-white/90 transition"
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}
