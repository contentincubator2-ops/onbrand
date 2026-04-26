/**
 * MethodologyGlyph — abstract SVG glyph that brands a methodology card.
 *
 * Decision (2026-04-25 CJ):
 *   - Hero zone shows an algorithmic abstract glyph, NOT a photo.
 *     This avoids missing-asset / copyright / inconsistent-style problems.
 *   - Each glyph is parametrised by (variant, layer) so the same
 *     methodology always renders identical visuals across the app.
 *   - Colour comes from MosLayer (L1-L6) — see tokens.ts.
 *
 * Six base shapes, each one carries a strategic metaphor:
 *   00 concentric    — radiating outward (brand archetype, brand purpose)
 *   01 wedge stack   — laddered priorities (positioning, JTBD)
 *   02 wave-band     — cycle / flow (journey, lifecycle)
 *   03 dot-grid      — segmentation (audience, persona)
 *   04 prism         — refracted channels (distribution, SEO/social fan-out)
 *   05 chevron-arc   — momentum / launch (campaign, activation)
 *   06 cross-axis    — measurement grid (validation, audit)
 *   07 spiral        — iterative / depth (tribes, narrative)
 *   08 nested-arcs   — layers of audience / market
 *   09 column-bars   — comparative analytics (perceptual map)
 *
 * Pick deterministically: hash slug → variant 0..9. Layer override
 * (`layer`) sets the colour; defaults to L1.
 */
import React from "react";
import { LAYER_TOKENS, type MosLayer, resolveLayer } from "../../../studio/primitives/tokens";

export interface MethodologyGlyphProps {
  /** Stable string used to deterministically pick a variant — pass the squad slug. */
  seed?: string | number;
  /** Force a specific variant 0..9. Overrides seed. */
  variant?: number;
  /** Layer drives the colour. Accepts "L1"-"L6" or label / short label. */
  layer?: string | MosLayer | null;
  /** Pixel size (square). Default 160. */
  size?: number;
  /** Add a soft tinted square behind the glyph for the rack-card hero look. */
  withBackground?: boolean;
  className?: string;
}

const NUM_VARIANTS = 10;

function hashSeed(seed: string | number): number {
  if (typeof seed === "number") return Math.abs(Math.floor(seed)) % NUM_VARIANTS;
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % NUM_VARIANTS;
}

export default function MethodologyGlyph({
  seed,
  variant,
  layer,
  size = 160,
  withBackground = true,
  className = "",
}: MethodologyGlyphProps) {
  const v =
    variant !== undefined
      ? variant % NUM_VARIANTS
      : seed !== undefined
      ? hashSeed(seed)
      : 0;
  const tone = LAYER_TOKENS[resolveLayer(layer ?? null)];

  return (
    <div
      className={`relative inline-flex items-center justify-center overflow-hidden ${className}`}
      style={{
        width: size,
        height: size,
        background: withBackground ? tone.bgTint : "transparent",
        borderRadius: "9999px 9999px 9999px 0", // rack-card teardrop nod
      }}
    >
      <svg
        viewBox="0 0 100 100"
        width={size * 0.74}
        height={size * 0.74}
        fill="none"
        stroke={tone.bg}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {renderVariant(v, tone.bg, tone.bgInk)}
      </svg>
    </div>
  );
}

// ─── Variants ────────────────────────────────────────────────────────

function renderVariant(v: number, fg: string, ink: string): React.ReactNode {
  switch (v) {
    case 0: // concentric — radiating outward (archetype, purpose)
      return (
        <>
          {[8, 18, 28, 38, 48].map((r, i) => (
            <circle key={i} cx="50" cy="50" r={r} stroke={i % 2 === 0 ? fg : ink} strokeWidth="1.4" fill="none" />
          ))}
          <circle cx="50" cy="50" r="4" fill={fg} />
        </>
      );

    case 1: // wedge stack — laddered priorities
      return (
        <>
          {[0, 1, 2, 3, 4].map((i) => (
            <rect
              key={i}
              x={20 - i * 2}
              y={75 - i * 13}
              width={60 + i * 4}
              height={9}
              fill={i % 2 === 0 ? fg : ink}
              opacity={1 - i * 0.12}
            />
          ))}
        </>
      );

    case 2: // wave-band — cycle / flow
      return (
        <>
          {[28, 44, 60, 76].map((y, i) => (
            <path
              key={i}
              d={`M 5 ${y} Q 27 ${y - 14} 50 ${y} T 95 ${y}`}
              stroke={i % 2 === 0 ? fg : ink}
              strokeWidth="1.6"
              fill="none"
            />
          ))}
        </>
      );

    case 3: // dot-grid — segmentation
      return (
        <>
          {Array.from({ length: 5 }).flatMap((_, row) =>
            Array.from({ length: 5 }).map((_, col) => {
              const r = (row + col) % 2 === 0 ? 3.6 : 2.2;
              const cl = (row + col) % 2 === 0 ? fg : ink;
              return (
                <circle
                  key={`${row}-${col}`}
                  cx={20 + col * 15}
                  cy={20 + row * 15}
                  r={r}
                  fill={cl}
                />
              );
            })
          )}
        </>
      );

    case 4: // prism — refracted channels
      return (
        <>
          <polygon points="50,10 90,80 10,80" stroke={fg} strokeWidth="1.6" fill="none" />
          {[0, 1, 2, 3].map((i) => (
            <line
              key={i}
              x1={50}
              y1={50}
              x2={20 + i * 20}
              y2={92}
              stroke={i % 2 === 0 ? fg : ink}
              strokeWidth="1.4"
            />
          ))}
          <circle cx="50" cy="50" r="3" fill={fg} />
        </>
      );

    case 5: // chevron-arc — momentum / launch
      return (
        <>
          {[14, 26, 38, 50].map((r, i) => (
            <path
              key={i}
              d={`M ${50 - r} 70 A ${r} ${r} 0 0 1 ${50 + r} 70`}
              stroke={i % 2 === 0 ? fg : ink}
              strokeWidth="1.6"
              fill="none"
            />
          ))}
          <polygon points="50,18 56,30 50,26 44,30" fill={fg} />
        </>
      );

    case 6: // cross-axis — measurement grid (validation, audit)
      return (
        <>
          <line x1="50" y1="10" x2="50" y2="90" stroke={fg} strokeWidth="1.4" />
          <line x1="10" y1="50" x2="90" y2="50" stroke={fg} strokeWidth="1.4" />
          {[20, 35, 65, 80].map((p, i) => (
            <line key={i} x1={p} y1="48" x2={p} y2="52" stroke={ink} />
          ))}
          {[20, 35, 65, 80].map((p, i) => (
            <line key={`v-${i}`} x1="48" y1={p} x2="52" y2={p} stroke={ink} />
          ))}
          <circle cx="68" cy="32" r="6" fill={fg} />
          <circle cx="34" cy="68" r="4" fill={ink} />
        </>
      );

    case 7: // spiral — iterative / depth
      return (
        <path
          d="M 50 50 m 0 -3 a 3 3 0 1 1 -0.1 0 m 7 0 a 10 10 0 1 1 -0.1 0 m 14 0 a 17 17 0 1 1 -0.1 0 m 21 0 a 24 24 0 1 1 -0.1 0 m 28 0 a 31 31 0 1 1 -0.1 0"
          stroke={fg}
          strokeWidth="1.6"
          fill="none"
        />
      );

    case 8: // nested-arcs — layers of audience / market
      return (
        <>
          {[14, 24, 34, 44].map((r, i) => (
            <path
              key={i}
              d={`M ${50 - r} 70 A ${r} ${r * 0.7} 0 0 1 ${50 + r} 70`}
              stroke={i % 2 === 0 ? fg : ink}
              strokeWidth="1.6"
              fill="none"
            />
          ))}
          <line x1="10" y1="70" x2="90" y2="70" stroke={fg} strokeWidth="1.2" />
        </>
      );

    case 9: // column-bars — comparative analytics
    default:
      return (
        <>
          <line x1="10" y1="86" x2="90" y2="86" stroke={fg} strokeWidth="1.4" />
          {[0, 1, 2, 3, 4].map((i) => {
            const h = [38, 22, 56, 14, 44][i];
            return (
              <rect
                key={i}
                x={18 + i * 14}
                y={86 - h}
                width={9}
                height={h}
                fill={i % 2 === 0 ? fg : ink}
                opacity={0.92}
              />
            );
          })}
        </>
      );
  }
}
