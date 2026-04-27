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
      colors: {
        // Decision AI palette — teal / red / blue rack, mono text
        mos: {
          teal:   "#1A9B8E",
          "teal-ink": "#0E6B62",
          red:    "#C8322E",
          "red-ink": "#8B1F1C",
          blue:   "#1E7FD4",
          "blue-ink": "#14558F",
          ink:    "#0A0A0A",
          body:   "#1E1E1E",
          muted:  "#6B6B6B",
          soft:   "#9B9B9B",
          hair:   "#E4E4E4",
          paper:  "#FAFAF7",
          white:  "#FFFFFF",
          // SoWork brand accents (per sowork-ai-v2 Monocle system)
          cream:  "#FAF9F6",
          "cream-dark": "#F5F1E8",
          orange: "#FF6B35",
          "orange-hover": "#E55A2B",
          "orange-light": "#FFF7ED",
        },
      },
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
    // SoWork HeroUI theme — light only, mapped to mos-cream / mos-ink / mos-orange.
    // Decision (2026-04-27): single-mode product, no dark. Radii dialed back from
    // HeroUI default (12px) to 8px to feel closer to Canva than iOS.
    heroui({
      themes: {
        light: {
          colors: {
            background: "#FAF9F6",   // mos-cream
            foreground: "#0A0A0A",   // mos-ink
            content1: "#FFFFFF",
            content2: "#FAFAF7",     // mos-paper
            content3: "#F5F1E8",     // mos-cream-dark
            content4: "#E4E4E4",     // mos-hair
            divider: "#E4E4E4",
            focus: "#FF6B35",        // mos-orange
            default: {
              50:  "#FAFAF7",
              100: "#F5F1E8",
              200: "#E4E4E4",
              300: "#9B9B9B",
              400: "#6B6B6B",
              500: "#1E1E1E",
              600: "#0A0A0A",
              700: "#0A0A0A",
              800: "#000000",
              900: "#000000",
              foreground: "#FFFFFF",
              DEFAULT: "#0A0A0A",
            },
            primary: {
              50:  "#FFF7ED",
              100: "#FFEDD5",
              200: "#FED7AA",
              300: "#FDBA74",
              400: "#FB923C",
              500: "#FF6B35",        // mos-orange
              600: "#E55A2B",        // mos-orange-hover
              700: "#C2410C",
              800: "#9A3412",
              900: "#7C2D12",
              foreground: "#FFFFFF",
              DEFAULT: "#FF6B35",
            },
            success: { DEFAULT: "#1A9B8E", foreground: "#FFFFFF" },
            warning: { DEFAULT: "#F59E0B", foreground: "#FFFFFF" },
            danger:  { DEFAULT: "#C8322E", foreground: "#FFFFFF" },
          },
        },
      },
      layout: {
        // Canva-faithful sharp-but-not-square radii. HeroUI default is 12px.
        radius: { small: "4px", medium: "6px", large: "8px" },
        // Calmer shadows than HeroUI's default.
        boxShadow: {
          small:  "0 1px 2px rgba(10,10,10,0.06)",
          medium: "0 2px 6px rgba(10,10,10,0.08)",
          large:  "0 8px 24px -8px rgba(10,10,10,0.12)",
        },
      },
    }),
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
