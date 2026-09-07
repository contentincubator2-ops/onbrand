/**
 * OnBrandLogo — inline SVG wordmark for the top-left corner.
 *
 * Concept: a concentric-circles glyph (大圈 + 小圈) representing the
 * "on-target" / "on-brand" idea — every piece of content lands inside
 * the inner ring (your brand). The inner dot uses SoWork.ai's signature
 * purple→teal gradient (#7C3AED → #00B4BC).
 *
 * Wordmark: "OnBrand" in bold Inter + faint "AI" superscript +
 * "by SoWork" small caps subtitle. Editorial / Notion-style.
 *
 * Sizes: default 28px glyph + auto-sized text.
 *   <OnBrandLogo />              — full lockup
 *   <OnBrandLogo glyphOnly />    — just the glyph (for collapsed shell)
 */
import React from "react";

interface Props {
  glyphOnly?: boolean;
  size?: number; // glyph height in px; everything scales from this
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

const GRADIENT_ID = "onbrand-glyph-gradient";

export default function OnBrandLogo({ glyphOnly = false, size = 28, onClick, className, style }: Props) {
  const Element = onClick ? "button" : "div";
  return (
    <Element
      onClick={onClick}
      className={className}
      aria-label="OnBrand AI by SoWork"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: glyphOnly ? 0 : 8,
        border: "none",
        background: "transparent",
        padding: 0,
        cursor: onClick ? "pointer" : "default",
        color: "#171717",
        userSelect: "none",
        fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif",
        ...style,
      }}
    >
      <Glyph size={size} />
      {!glyphOnly && (
        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1, gap: 1 }}>
          <span style={{
            fontSize: Math.round(size * 0.6),
            fontWeight: 800,
            letterSpacing: "-0.02em",
            color: "#171717",
            display: "flex", alignItems: "baseline", gap: 2,
          }}>
            OnBrand
            <span style={{
              fontSize: Math.round(size * 0.34),
              fontWeight: 600,
              letterSpacing: "0.04em",
              color: "transparent",
              background: "linear-gradient(135deg, #7C3AED 0%, #00B4BC 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
            }}>AI</span>
          </span>
          <span style={{
            fontSize: Math.round(size * 0.30),
            fontWeight: 500,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "#A8A29E",
          }}>
            by SoWork
          </span>
        </span>
      )}
    </Element>
  );
}

function Glyph({ size }: { size: number }) {
  // 32x32 viewBox. Outer ring 14r, inner dot 5r, center the same.
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#00B4BC" />
        </linearGradient>
      </defs>
      {/* Outer ring — charcoal, semi-thick */}
      <circle cx="16" cy="16" r="13" stroke="#171717" strokeWidth="2.2" fill="none" />
      {/* Inner gradient dot — "on target" center */}
      <circle cx="16" cy="16" r="5.5" fill={`url(#${GRADIENT_ID})`} />
      {/* Subtle inner ring for depth */}
      <circle cx="16" cy="16" r="8.5" stroke="#171717" strokeWidth="0.8" strokeOpacity="0.15" fill="none" />
    </svg>
  );
}
