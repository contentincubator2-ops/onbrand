/**
 * MethodologyCard v2 — rack-card primitive for METHODOLOGIES only.
 *
 * Reference: Dreamstime rack-card mock provided by CJ 2026-04-25.
 * Decisions locked in same convo:
 *   1. Colour = MosLayer L1-L6 (not the legacy 3-accent system).
 *      Each strategy layer has its own palette, see tokens.LAYER_TOKENS.
 *   2. Hero zone = abstract MethodologyGlyph (algorithmic SVG, no photos).
 *   3. Methodology card and Mission card are SEPARATE components — this
 *      one is methodology-only.  Use <MissionCard> for missions.
 *   4. Eyebrow `L1 · 品牌策略` lives top-left so users can see all 6 layers
 *      exist as they scroll the catalog.
 *   5. Source flag (seeded / ingested / forked) sits in the dark footer's
 *      eyebrow line: `L1 · BRAND · SEEDED`.
 *
 * Composition (top → bottom):
 *   ▸ Hairline header band — monogram + L_-eyebrow + accent ribbon
 *   ▸ Glyph hero zone — soft tinted square with the abstract glyph
 *   ▸ Title bar — coloured pill carrying the methodology name
 *   ▸ Author / year sub-line
 *   ▸ Steps list — circular numbered glyphs with name + skill
 *   ▸ Dark contact bar — layer chip + author + step count + CTA
 *
 * Width: 320px (rack-card 5:7.4). Three fit per row at 1280+.
 */

import React from "react";
import {
  LAYER_TOKENS,
  resolveLayer,
  type MosLayer,
} from "../../../studio/primitives/tokens";
import MethodologyGlyph from "./MethodologyGlyph";

export interface MethodologyStep {
  name: string;
  desc?: string;
  glyph?: string;
}

export interface MethodologyCardProps {
  /** Layer key — drives colour. Accepts "L1"..."L6" or label strings. */
  layer?: string | MosLayer | null;
  /** Stable seed for the hero glyph variant — pass squad slug. */
  seed?: string | number;
  /** Title shown inside the colour pill. */
  title: string;
  /** Author / year — e.g. "Carol Pearson · 2001". */
  author?: string | null;
  /** Source — "seeded" | "ingested" | "forked" | "mine". Shown in footer. */
  source?: string | null;
  /** Up to 4 steps. Beyond that we show "+N more". */
  steps?: MethodologyStep[];
  /** Lead agent name in footer (no avatar — just text). */
  leadName?: string | null;
  /** Right-side CTA pill. */
  ctaLabel?: string;
  onCtaClick?: () => void;
  /** Whole-card click. */
  onClick?: () => void;
  className?: string;
}

export default function MethodologyCard({
  layer,
  seed,
  title,
  author,
  source,
  steps = [],
  leadName,
  ctaLabel = "套用",
  onCtaClick,
  onClick,
  className = "",
}: MethodologyCardProps) {
  const lk: MosLayer = resolveLayer(layer ?? null);
  const tone = LAYER_TOKENS[lk];
  const visible = steps.slice(0, 4);
  const overflowCount = Math.max(0, steps.length - visible.length);
  const sourceLabel = (source ?? "seeded").toUpperCase();

  return (
    <article
      onClick={onClick}
      className={[
        "group relative flex flex-col w-[320px] bg-white",
        "border border-mos-hair shadow-card overflow-hidden",
        "transition-shadow duration-200",
        onClick ? "cursor-pointer hover:shadow-lift" : "",
        className,
      ].join(" ")}
      style={{ aspectRatio: "5 / 7.4" }}
    >
      {/* ── HEADER: monogram + eyebrow + accent ribbon ─────────────── */}
      <header className="relative px-5 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5">
              <span
                className="inline-block w-3.5 h-3.5"
                style={{ background: tone.bg }}
                aria-hidden
              />
              <span className="font-display text-[0.62rem] tracking-[0.28em] uppercase text-mos-ink">
                {lk}
              </span>
            </div>
            <div className="mt-1 text-[0.66rem] tracking-[0.18em] uppercase text-mos-muted">
              {tone.shortLabel} · {tone.label}
            </div>
          </div>
          <div
            className="font-display text-[0.6rem] tracking-[0.32em] uppercase text-mos-soft"
            aria-hidden
          >
            METHOD
          </div>
        </div>
        {/* hairline ribbon under header */}
        <div
          className="absolute left-0 right-0 bottom-0 h-[2px]"
          style={{
            background: `linear-gradient(90deg, ${tone.bg} 0%, ${tone.bg} 38%, transparent 38%, transparent 100%)`,
          }}
        />
      </header>

      {/* ── HERO: glyph in tinted square ──────────────────────────── */}
      <div className="relative px-5 pt-4">
        <div className="relative w-full" style={{ aspectRatio: "5 / 3" }}>
          <div className="absolute inset-0 flex items-center justify-center">
            <MethodologyGlyph
              seed={seed ?? title}
              layer={lk}
              size={148}
              withBackground
            />
          </div>
          {/* faint corner mark */}
          <div className="absolute top-1 right-1 text-[0.56rem] tracking-[0.28em] uppercase text-mos-soft">
            {String((typeof seed === "string" ? hashStr(seed) : (seed ?? 0)) % 100).padStart(2, "0")}
          </div>
        </div>
      </div>

      {/* ── TITLE pill ────────────────────────────────────────────── */}
      <div className="px-5 pt-4">
        <div
          className="inline-block px-3.5 py-2 max-w-[92%]"
          style={{ background: tone.bg }}
        >
          <h3 className="font-display text-white text-[1.04rem] leading-[1.2] tracking-[-0.01em]">
            {title}
          </h3>
        </div>
        {author && (
          <div className="mt-1.5 text-[0.7rem] tracking-[0.06em] text-mos-muted">
            {author}
          </div>
        )}
      </div>

      {/* ── STEPS list ────────────────────────────────────────────── */}
      <div className="px-5 pt-4 pb-3 flex-1">
        <div className="text-[0.6rem] tracking-[0.28em] uppercase text-mos-soft mb-2.5">
          工作流 · OUR STEPS
        </div>
        <ul className="space-y-2">
          {visible.length === 0 && (
            <li className="text-[0.76rem] text-mos-soft italic">
              尚未設定執行流程
            </li>
          )}
          {visible.map((s, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span
                className="mt-[1px] inline-flex w-5 h-5 items-center justify-center rounded-full text-white text-[0.62rem] font-display shrink-0"
                style={{ background: tone.bg }}
              >
                {s.glyph ?? `0${i + 1}`}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[0.8rem] leading-tight text-mos-ink font-medium">
                  {s.name}
                </span>
                {s.desc && (
                  <span className="block mt-0.5 text-[0.68rem] leading-snug text-mos-muted truncate">
                    {s.desc}
                  </span>
                )}
              </span>
            </li>
          ))}
          {overflowCount > 0 && (
            <li className="text-[0.66rem] tracking-[0.14em] uppercase text-mos-soft pl-7">
              + {overflowCount} more
            </li>
          )}
        </ul>
      </div>

      {/* ── FOOTER: dark contact bar ──────────────────────────────── */}
      <footer className="mt-auto bg-mos-ink text-white px-4 py-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[0.58rem] tracking-[0.28em] uppercase text-white/55">
            {lk} · {tone.shortLabel} · {sourceLabel}
          </div>
          <div className="mt-0.5 text-[0.78rem] truncate text-white">
            {leadName ?? "Squad Lead"}
          </div>
          {steps.length > 0 && (
            <div className="text-[0.6rem] tracking-[0.1em] text-white/45">
              {steps.length} steps
            </div>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCtaClick?.();
          }}
          className="shrink-0 rounded-full px-3.5 py-1.5 text-[0.7rem] tracking-[0.16em] uppercase font-medium hover:opacity-90 transition"
          style={{ background: tone.bg, color: "#fff" }}
        >
          {ctaLabel}
        </button>
      </footer>
    </article>
  );
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
