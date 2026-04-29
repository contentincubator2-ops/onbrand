/**
 * Decision AI (MOS) design tokens — single source of truth for Studio UI.
 *
 * Visual reference: the three roll-up banner mock (teal / red / blue) with
 * geometric clipped accent blocks at the top, "Our Services" style bullet
 * lists, thin hairline dividers, no emoji, editorial typography.
 *
 * Every Studio component imports from here — do not hand-roll colours.
 */

export const MOS_PALETTE = {
  teal:     "#1A9B8E",
  tealInk:  "#0E6B62",
  red:      "#C8322E",
  redInk:   "#8B1F1C",
  blue:     "#1E7FD4",
  blueInk:  "#14558F",
  ink:      "#0A0A0A",
  body:     "#1E1E1E",
  muted:    "#6B6B6B",
  soft:     "#9B9B9B",
  hair:     "#E4E4E4",
  paper:    "#FAFAF7",
  white:    "#FFFFFF",
} as const;

export type MosAccent = "teal" | "red" | "blue";

export interface AccentTokens {
  bg: string;
  bgInk: string;
  fg: string;
  text: string;
  /** tailwind utility fragment used in className strings */
  bgClass: string;
  textClass: string;
  ringClass: string;
}

export const ACCENTS: Record<MosAccent, AccentTokens> = {
  teal: {
    bg: MOS_PALETTE.teal,
    bgInk: MOS_PALETTE.tealInk,
    fg: MOS_PALETTE.white,
    text: MOS_PALETTE.tealInk,
    bgClass: "bg-success",
    textClass: "text-success",
    ringClass: "ring-success",
  },
  red: {
    bg: MOS_PALETTE.red,
    bgInk: MOS_PALETTE.redInk,
    fg: MOS_PALETTE.white,
    text: MOS_PALETTE.redInk,
    bgClass: "bg-danger",
    textClass: "text-danger",
    ringClass: "ring-danger",
  },
  blue: {
    bg: MOS_PALETTE.blue,
    bgInk: MOS_PALETTE.blueInk,
    fg: MOS_PALETTE.white,
    text: MOS_PALETTE.blueInk,
    bgClass: "bg-secondary",
    textClass: "text-secondary",
    ringClass: "ring-secondary",
  },
};

/** Assign one accent per index (0,1,2 → teal,red,blue then repeats). */
export function accentForIndex(i: number): MosAccent {
  const cycle: MosAccent[] = ["teal", "red", "blue"];
  return cycle[i % cycle.length];
}

/** Geometric clip-path variants — match the three roll-up banners. */
export const CLIPS = ["clip-geo-a", "clip-geo-b", "clip-geo-c"] as const;
export function clipForIndex(i: number): string {
  return CLIPS[i % CLIPS.length];
}

// ─────────────────────────────────────────────────────────────────────
//  MOS Layer System (v2 — 6 strategy layers L1-L6)
//  Decision 2026-04-25 (CJ): each strategy layer gets its own color so
//  users can see at a glance how many layers there are and which one a
//  methodology lives in. Eyebrow chip "L1 · 品牌策略" carries the label;
//  the colour is a secondary signal that ties the methodology card to
//  any AI-generated glyph in the hero zone.
// ─────────────────────────────────────────────────────────────────────

export type MosLayer = "L1" | "L2" | "L3" | "L4" | "L5" | "L6";

export type HeroUIColor = "primary" | "secondary" | "success" | "warning" | "danger" | "default";

export interface LayerTokens {
  /** Solid accent color (legacy — for SVG glyphs that can't take HeroUI tokens). */
  bg: string;
  bgInk: string;
  bgTint: string;
  label: string;
  shortLabel: string;
  index: number;
  /** HeroUI semantic color for Chip/Button — the canonical value going forward. */
  heroColor: HeroUIColor;
}

// L1–L6 mapped to HeroUI semantic colors so Chip/Button can use stock props
// instead of inline styles. Legacy bg/bgInk/bgTint are kept ONLY for the SVG
// MethodologyGlyph which needs raw hex strings.
export const LAYER_TOKENS: Record<MosLayer, LayerTokens> = {
  L1: { bg: "#5B3CC8", bgInk: "#3A2487", bgTint: "#EFE9FB", label: "品牌策略", shortLabel: "BRAND",    index: 0, heroColor: "primary"   },
  L2: { bg: "#C8322E", bgInk: "#8B1F1C", bgTint: "#FBE9E8", label: "產品策略", shortLabel: "PRODUCT",  index: 1, heroColor: "danger"    },
  L3: { bg: "#E07B0F", bgInk: "#9C5208", bgTint: "#FCEFD9", label: "受眾策略", shortLabel: "AUDIENCE", index: 2, heroColor: "warning"   },
  L4: { bg: "#1E7FD4", bgInk: "#14558F", bgTint: "#E2F0FB", label: "通路策略", shortLabel: "CHANNEL",  index: 3, heroColor: "secondary" },
  L5: { bg: "#1A9B8E", bgInk: "#0E6B62", bgTint: "#DEF1EE", label: "活動策略", shortLabel: "CAMPAIGN", index: 4, heroColor: "success"   },
  L6: { bg: "#525866", bgInk: "#2D323C", bgTint: "#E8EAEE", label: "驗證校準", shortLabel: "VALIDATE", index: 5, heroColor: "default"   },
};

export const LAYER_ORDER: MosLayer[] = ["L1", "L2", "L3", "L4", "L5", "L6"];

/** Normalize many possible inputs into a MosLayer key.
 *  Accepts "L1", "l1", "1", "BRAND", "brand", "品牌", "L1 · 品牌策略", etc.
 *  Falls back to L1 if input is unparseable. */
export function resolveLayer(input?: string | null): MosLayer {
  if (!input) return "L1";
  const s = String(input).trim().toUpperCase();
  // Direct match L1-L6
  const m = s.match(/L([1-6])/);
  if (m) return (`L${m[1]}` as MosLayer);
  // Numeric only
  if (/^[1-6]$/.test(s)) return (`L${s}` as MosLayer);
  // Short label
  for (const k of LAYER_ORDER) {
    if (LAYER_TOKENS[k].shortLabel === s) return k;
  }
  // Chinese label
  for (const k of LAYER_ORDER) {
    if (input.includes(LAYER_TOKENS[k].label)) return k;
  }
  return "L1";
}
