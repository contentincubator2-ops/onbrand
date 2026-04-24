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
    bgClass: "bg-mos-teal",
    textClass: "text-mos-teal-ink",
    ringClass: "ring-mos-teal",
  },
  red: {
    bg: MOS_PALETTE.red,
    bgInk: MOS_PALETTE.redInk,
    fg: MOS_PALETTE.white,
    text: MOS_PALETTE.redInk,
    bgClass: "bg-mos-red",
    textClass: "text-mos-red-ink",
    ringClass: "ring-mos-red",
  },
  blue: {
    bg: MOS_PALETTE.blue,
    bgInk: MOS_PALETTE.blueInk,
    fg: MOS_PALETTE.white,
    text: MOS_PALETTE.blueInk,
    bgClass: "bg-mos-blue",
    textClass: "text-mos-blue-ink",
    ringClass: "ring-mos-blue",
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
