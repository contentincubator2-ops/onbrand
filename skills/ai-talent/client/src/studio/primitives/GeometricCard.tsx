/**
 * GeometricCard — the roll-up-banner building block reused across the Studio.
 *
 * Reference: three vertical banners with a large solid colour block at the
 * top (teal/red/blue) cut by an asymmetric diagonal, a word-mark, a display
 * headline, and a list of bullets.
 *
 * This primitive encodes all of that and exposes slots so each screen only
 * passes its own content. No emoji; pure typographic + geometric language.
 */

import React from "react";
import type { MosAccent } from "./tokens";
import { ACCENTS, clipForIndex } from "./tokens";

export interface GeometricCardProps {
  accent: MosAccent;
  accentIndex?: number; // picks which clip-path variant
  eyebrow?: string;     // small uppercase above the block, e.g. "SOWORK"
  title: string;        // display headline
  subtitle?: string;    // second display line
  meta?: string;        // author / year row above the bullet list
  bullets?: string[];   // "OUR STEPS" style bullets
  footerMeta?: string;  // bottom meta — e.g. "5 steps · 18 min"
  tag?: string;         // corner uppercase tag, e.g. "RECOMMENDED 1"
  why?: string;         // short rationale
  action?: React.ReactNode; // CTA button
  onClick?: () => void;
  compact?: boolean;
  className?: string;
}

export default function GeometricCard({
  accent,
  accentIndex = 0,
  eyebrow,
  title,
  subtitle,
  meta,
  bullets = [],
  footerMeta,
  tag,
  why,
  action,
  onClick,
  compact = false,
  className = "",
}: GeometricCardProps) {
  const tone = ACCENTS[accent];
  const clip = clipForIndex(accentIndex);

  return (
    <div
      onClick={onClick}
      className={[
        "group relative flex flex-col bg-white border border-mos-hair",
        "transition-shadow duration-200",
        onClick ? "cursor-pointer hover:shadow-lift" : "shadow-card",
        compact ? "w-full" : "w-[300px]",
        className,
      ].join(" ")}
    >
      {/* Geometric colour block */}
      <div
        className={`${tone.bgClass} ${clip} relative`}
        style={{ aspectRatio: compact ? "5 / 2" : "3 / 2.1" }}
      >
        {eyebrow && (
          <div className="absolute left-5 top-5 font-display text-[0.68rem] tracking-[0.22em] text-white/90 uppercase">
            {eyebrow}
          </div>
        )}
      </div>

      {/* Headline */}
      <div className="px-5 pt-5">
        <h3 className="mos-display text-[1.55rem] leading-[1.08] text-mos-ink">
          {title}
        </h3>
        {subtitle && (
          <div className="mos-display text-[1.25rem] leading-[1.15] text-mos-body mt-1">
            {subtitle}
          </div>
        )}
        {meta && (
          <div className="mt-3 text-[0.7rem] tracking-[0.16em] uppercase text-mos-muted">
            {meta}
          </div>
        )}
      </div>

      {/* Rule */}
      <div className="mx-5 mt-4 border-t border-mos-hair" />

      {/* Bullets — "Our Services" style */}
      {bullets.length > 0 && (
        <div className="px-5 py-4">
          <div className="text-[0.68rem] tracking-[0.22em] uppercase text-mos-muted mb-3">
            Our Steps
          </div>
          <ul className="space-y-2">
            {bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-3 text-[0.88rem] leading-snug text-mos-body">
                <span
                  className={`mt-[0.55rem] inline-block w-1.5 h-1.5 rounded-full shrink-0`}
                  style={{ background: tone.bg }}
                />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {footerMeta && (
        <div className="px-5 text-[0.75rem] tracking-wide text-mos-muted">
          {footerMeta}
        </div>
      )}

      {(tag || why) && <div className="mx-5 mt-4 border-t border-mos-hair" />}

      {tag && (
        <div className="px-5 pt-4 text-[0.68rem] tracking-[0.22em] uppercase text-mos-ink font-semibold">
          {tag}
        </div>
      )}

      {why && (
        <div className="px-5 pt-2">
          <div className="text-[0.68rem] tracking-[0.22em] uppercase text-mos-muted mb-1">
            Why
          </div>
          <p className="text-[0.88rem] leading-snug text-mos-body">{why}</p>
        </div>
      )}

      {action && <div className="px-5 py-5 mt-auto">{action}</div>}
    </div>
  );
}
