/** @type {import('tailwindcss').Config} */
import { heroui } from "@heroui/react";

export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Color palette is owned by the HeroUI theme below — no custom mos-* tokens.
      // Use bg-primary / text-foreground / border-divider / etc. instead.
      fontFamily: {
        display: ["'Inter Tight'", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        sans:    ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono:    ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      fontSize: {
        // Editorial scale
        "eyebrow": ["0.68rem", { lineHeight: "1", letterSpacing: "0.18em" }],
        "meta":    ["0.75rem", { lineHeight: "1.3", letterSpacing: "0.04em" }],
        "head-s":  ["1.125rem", { lineHeight: "1.25", letterSpacing: "-0.01em" }],
        "head-m":  ["1.6rem",   { lineHeight: "1.15", letterSpacing: "-0.015em" }],
        "head-l":  ["2.4rem",   { lineHeight: "1.05", letterSpacing: "-0.02em" }],
        "head-xl": ["3.6rem",   { lineHeight: "1.0",  letterSpacing: "-0.025em" }],
      },
      borderWidth: {
        hair: "1px",
      },
      letterSpacing: {
        wider2: "0.12em",
        wider3: "0.18em",
      },
      boxShadow: {
        card: "0 1px 2px rgba(10,10,10,0.04), 0 1px 0 rgba(10,10,10,0.03)",
        lift: "0 10px 30px -12px rgba(10,10,10,0.18)",
      },
    },
  },
  plugins: [
    // Pure HeroUI theme — no SoWork brand overrides. Stock primary (blue),
    // success (green), danger (red), warning (yellow), secondary (purple).
    heroui(),
    function ({ addUtilities }) {
      // Geometric clip-paths matching the roll-up banner reference image.
      // Each variant gives a slightly different asymmetric cut so the teal/red/blue
      // cards don't look identical.
      addUtilities({
        ".clip-geo-a": {
          clipPath: "polygon(0 0, 100% 0, 100% 72%, 68% 100%, 0 88%)",
        },
        ".clip-geo-b": {
          clipPath: "polygon(0 0, 100% 0, 100% 88%, 32% 100%, 0 70%)",
        },
        ".clip-geo-c": {
          clipPath: "polygon(0 0, 100% 0, 100% 80%, 50% 100%, 0 80%)",
        },
        ".clip-notch-br": {
          clipPath: "polygon(0 0, 100% 0, 100% 82%, 82% 100%, 0 100%)",
        },
        ".clip-notch-bl": {
          clipPath: "polygon(0 0, 100% 0, 100% 100%, 18% 100%, 0 82%)",
        },
        // Organic teardrop / leaf hero for the methodology rack-card.
        // Matches the reference: rounded top-left, sharp pointed bottom-right.
        ".clip-blob-a": {
          clipPath:
            "path('M 20 0 C 130 0, 230 30, 240 110 C 248 180, 200 240, 110 250 C 40 256, 0 200, 0 130 C 0 60, 0 0, 20 0 Z')",
        },
        ".clip-blob-b": {
          clipPath:
            "path('M 0 30 C 0 0, 70 0, 140 0 C 220 0, 250 60, 240 140 C 232 210, 170 250, 90 248 C 30 246, 0 200, 0 130 Z')",
        },
        ".clip-blob-c": {
          clipPath:
            "path('M 30 0 C 120 0, 250 20, 245 120 C 240 220, 160 250, 90 245 C 20 240, 0 180, 0 100 C 0 40, 0 0, 30 0 Z')",
        },
      });
    },
  ],
};
