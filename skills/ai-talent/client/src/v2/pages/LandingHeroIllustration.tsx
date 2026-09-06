/**
 * LandingHeroIllustration.tsx — flat-editorial SVG matching SoWork.ai style.
 *
 * Extracted from LandingPage.tsx on 2026-06-12 (SEO perf):
 *   - Lazy-imported by LandingPage so it ships in its own chunk.
 *   - Conditionally mounted on desktop only (hidden on mobile via the
 *     parent's `hidden lg:flex` already, but lazy + media-query check
 *     skips the download entirely on phones).
 *   - Hand-composed SVG (no external asset) so it stays color-tunable
 *     and inline-cacheable.
 */
import React from "react";

export default function LandingHeroIllustration({ en }: { en: boolean }) {
  const ink = "#0F0F0E";
  const orange = "#E85D2E";
  const orangeLight = "#F5B89A";
  const cream = "#FAEBD9";
  const white = "#FFFFFF";
  const strokeW = 2.2;

  return (
    <div className="relative w-full max-w-[520px]">
      {/* Drop-shadow container card */}
      <div
        className="rounded-3xl p-5 relative"
        style={{
          background: white,
          border: `2.5px solid ${ink}`,
          boxShadow: `8px 8px 0 ${ink}`,
        }}
      >
        <svg
          viewBox="0 0 460 380"
          width="100%"
          height="auto"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label={en ? "Brand Brain illustration" : "品牌大腦插畫"}
        >
          <defs>
            <pattern id="dots" x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1" fill={ink} opacity="0.15" />
            </pattern>
          </defs>
          <rect x="0" y="0" width="460" height="380" fill="url(#dots)" />

          {/* Floating card 1: BRAND POSITIONING (radar) */}
          <g transform="translate(20, 30)">
            <rect x="0" y="0" width="130" height="120" rx="8" fill={white} stroke={ink} strokeWidth={strokeW} />
            <text x="10" y="20" fontSize="9" fontWeight="800" fill={ink} letterSpacing="0.5">BRAND POSITIONING</text>
            <g transform="translate(65, 70)">
              <polygon points="0,-35 30,-15 25,25 -25,25 -30,-15" fill={orange} fillOpacity="0.65" stroke={ink} strokeWidth="1.5" />
              <polygon points="0,-42 40,-13 25,33 -25,33 -40,-13" fill="none" stroke={ink} strokeWidth="1" strokeOpacity="0.4" />
              <line x1="0" y1="0" x2="0" y2="-42" stroke={ink} strokeWidth="1" strokeOpacity="0.4" />
              <line x1="0" y1="0" x2="40" y2="-13" stroke={ink} strokeWidth="1" strokeOpacity="0.4" />
              <line x1="0" y1="0" x2="25" y2="33" stroke={ink} strokeWidth="1" strokeOpacity="0.4" />
              <line x1="0" y1="0" x2="-25" y2="33" stroke={ink} strokeWidth="1" strokeOpacity="0.4" />
              <line x1="0" y1="0" x2="-40" y2="-13" stroke={ink} strokeWidth="1" strokeOpacity="0.4" />
            </g>
          </g>

          {/* Floating card 2: AI-GENERATED CONTENT */}
          <g transform="translate(310, 20)">
            <rect x="0" y="0" width="130" height="100" rx="8" fill={white} stroke={ink} strokeWidth={strokeW} />
            <text x="10" y="18" fontSize="9" fontWeight="800" fill={ink} letterSpacing="0.5">AI-GENERATED</text>
            <text x="10" y="30" fontSize="9" fontWeight="800" fill={ink} letterSpacing="0.5">CONTENT</text>
            <rect x="10" y="42" width="32" height="44" rx="3" fill={cream} stroke={ink} strokeWidth="1.5" />
            <circle cx="26" cy="60" r="6" fill={orange} />
            <rect x="14" y="72" width="24" height="2" fill={ink} />
            <rect x="14" y="77" width="18" height="2" fill={ink} opacity="0.5" />
            <rect x="49" y="42" width="32" height="44" rx="3" fill={cream} stroke={ink} strokeWidth="1.5" />
            <path d="M 53 58 L 60 70 L 67 62 L 77 80 L 53 80 Z" fill={orange} opacity="0.7" />
            <rect x="53" y="46" width="18" height="2" fill={ink} />
            <rect x="88" y="42" width="32" height="44" rx="3" fill={cream} stroke={ink} strokeWidth="1.5" />
            <rect x="92" y="48" width="24" height="3" fill={ink} />
            <rect x="92" y="55" width="18" height="2" fill={ink} opacity="0.6" />
            <rect x="92" y="62" width="20" height="2" fill={ink} opacity="0.6" />
            <rect x="92" y="69" width="16" height="2" fill={ink} opacity="0.6" />
            <circle cx="105" cy="80" r="3" fill={orange} />
          </g>

          {/* Floating card 3: SOCIAL ANALYTICS */}
          <g transform="translate(310, 240)">
            <rect x="0" y="0" width="130" height="100" rx="8" fill={white} stroke={ink} strokeWidth={strokeW} />
            <text x="10" y="18" fontSize="9" fontWeight="800" fill={ink} letterSpacing="0.5">SOCIAL MEDIA</text>
            <text x="10" y="30" fontSize="9" fontWeight="800" fill={ink} letterSpacing="0.5">ANALYTICS</text>
            <polyline points="10,85 30,75 50,78 70,55 90,60 110,38 120,30" fill="none" stroke={orange} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            <polygon points="120,30 113,28 117,38" fill={orange} stroke={ink} strokeWidth="1" />
            <circle cx="30" cy="75" r="2.5" fill={ink} />
            <circle cx="70" cy="55" r="2.5" fill={ink} />
            <circle cx="110" cy="38" r="2.5" fill={ink} />
          </g>

          {/* Central: laptop / brand brain device */}
          <g transform="translate(110, 170)">
            <rect x="0" y="0" width="200" height="125" rx="6" fill={cream} stroke={ink} strokeWidth={strokeW} />
            <rect x="10" y="10" width="180" height="14" rx="3" fill={white} stroke={ink} strokeWidth="1.2" />
            <text x="15" y="20" fontSize="7" fontWeight="800" fill={ink}>BRAND BRAIN · 14 STEPS LOCKED ✓</text>
            <circle cx="35" cy="55" r="18" fill={white} stroke={ink} strokeWidth="1.5" />
            <path d="M 35 55 L 35 37 A 18 18 0 0 1 50 64 Z" fill={orange} />
            <path d="M 35 55 L 50 64 A 18 18 0 0 1 22 67 Z" fill={ink} />
            <path d="M 35 55 L 22 67 A 18 18 0 0 1 35 37 Z" fill={orangeLight} />
            <rect x="65" y="65" width="6" height="10" fill={ink} />
            <rect x="74" y="55" width="6" height="20" fill={orange} />
            <rect x="83" y="45" width="6" height="30" fill={ink} />
            <rect x="92" y="50" width="6" height="25" fill={orange} />
            <rect x="101" y="40" width="6" height="35" fill={ink} />
            <rect x="120" y="40" width="70" height="35" rx="3" fill={white} stroke={ink} strokeWidth="1.2" />
            <text x="125" y="52" fontSize="6" fontWeight="700" fill={ink} opacity="0.6">REACH</text>
            <text x="125" y="68" fontSize="13" fontWeight="900" fill={orange}>+247%</text>
            <rect x="10" y="90" width="180" height="6" rx="3" fill={white} stroke={ink} strokeWidth="1" />
            <rect x="10" y="90" width="140" height="6" rx="3" fill={orange} />
            <text x="10" y="110" fontSize="7" fontWeight="700" fill={ink}>Day 5 of 7 · All channels on-brand</text>
            <rect x="-15" y="125" width="230" height="8" rx="4" fill={ink} />
            <rect x="-22" y="133" width="244" height="4" rx="2" fill={ink} />
          </g>

          {/* Decorative sparks */}
          <circle cx="50" cy="200" r="3" fill={orange} />
          <circle cx="280" cy="160" r="2.5" fill={ink} />
          <circle cx="430" cy="180" r="3" fill={orange} />
          <path d="M 25 320 L 35 320 M 30 315 L 30 325" stroke={ink} strokeWidth="2" strokeLinecap="round" />
          <path d="M 410 320 L 420 320 M 415 315 L 415 325" stroke={orange} strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>

      {/* Caption tag below illustration */}
      <div
        className="absolute -bottom-3 left-6 px-3 py-1 rounded-md text-[12px] font-bold"
        style={{ background: ink, color: white }}
      >
        {en ? "Your Brand Brain, visualised" : "你的品牌大腦，視覺化"}
      </div>
    </div>
  );
}
