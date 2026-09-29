/** @type {import('tailwindcss').Config} */
import { heroui } from "@heroui/react";

// zinc 色階：primary／secondary 共用（見下方 heroui 設定）
const ZINC = {
  50: "#fafafa", 100: "#f4f4f5", 200: "#e4e4e7", 300: "#d4d4d8", 400: "#a1a1aa",
  500: "#71717a", 600: "#52525b", 700: "#3f3f46", 800: "#27272a", 900: "#18181b",
};
const NEUTRAL_LIGHT = { ...ZINC, DEFAULT: "#18181b", foreground: "#ffffff" };
const NEUTRAL_DARK = {
  50: ZINC[900], 100: ZINC[800], 200: ZINC[700], 300: ZINC[600], 400: ZINC[500],
  500: ZINC[400], 600: ZINC[300], 700: ZINC[200], 800: ZINC[100], 900: ZINC[50],
  DEFAULT: "#fafafa", foreground: "#18181b",
};

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
        // ── 2026-09-06 第二批字級（CJ「全站的字都覺得小」）─────────────
        // 這三個是用量最大的三個尺寸：text-tiny 737 處、text-xs 246 處、
        // text-sm 318 處。在這裡改一次，勝過改 1,300 個地方，也只要改回
        // 這三行就能整批回退。
        //
        // 行高一起調 —— 只放大字級不放行高，字會擠在一起，看起來比原本更糟。
        "xs":   ["0.8125rem", { lineHeight: "1.15rem" }],   // 12 → 13px
        "sm":   ["0.9375rem", { lineHeight: "1.4rem" }],    // 14 → 15px
        //
        // text-tiny 不在這裡改。在這裡寫 "tiny" 會產出一條 .text-tiny 規則，
        // 但 HeroUI 的 .text-tiny{font-size:var(--heroui-font-size-tiny)}
        // 排在它後面，同特異性後者勝 —— config 寫得再對也不會生效。
        // 實際覆寫在 index.css 改那個 CSS 變數（已驗證產出的 CSS）。

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
    // 2026-09-29 CJ「完全不要彩色風格」：primary／secondary 改成中性灰黑，
    // 全站用到這兩個色的按鈕、標籤、提示框一次去色。success／warning／danger
    // 是狀態色（功能性），保留。
    heroui({
      themes: {
        light: { colors: { primary: NEUTRAL_LIGHT, secondary: NEUTRAL_LIGHT, focus: "#71717a" } },
        dark: { colors: { primary: NEUTRAL_DARK, secondary: NEUTRAL_DARK, focus: "#a1a1aa" } },
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
