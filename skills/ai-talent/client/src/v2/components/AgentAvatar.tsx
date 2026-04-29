/**
 * AgentAvatar — deterministic colorful flat avatar for agents.
 *
 * Replaces DiceBear avataaars (api-call style) with react-nice-avatar
 * (same memoji-like flat style as vue-color-avatar). Render is pure
 * SVG, instant, no network round-trip.
 *
 * Config is derived from a stable seed (agent.slug / id / name) via
 * a hash → fixed seed for genConfig, so the same agent always looks
 * the same.
 */
import React, { useMemo } from "react";
import Avatar, { genConfig, AvatarFullConfig } from "react-nice-avatar";

/** djb2-style 32-bit hash — small, deterministic, no deps. */
function hashSeed(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) + input.charCodeAt(i);
    h = h & 0xffffffff;
  }
  return Math.abs(h);
}

/** Mulberry32 PRNG seeded by hash — gives genConfig a stable RNG. */
function seededRandom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick from an array deterministically using a seeded RNG. */
function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Build a deterministic AvatarFullConfig for a given seed string.
 * Mirrors react-nice-avatar's genConfig but uses our seeded RNG so
 * the same input always produces the same avatar.
 */
function configFromSeed(seed: string): AvatarFullConfig {
  const rng = seededRandom(hashSeed(seed));

  // Option lists below are taken from react-nice-avatar's exported
  // option pools (1.5.0). We keep the same allowed values so all
  // assets render correctly.
  const sex      = pick(rng, ["man", "woman"] as const);
  const faceColor= pick(rng, ["#F9C9B6", "#AC6651"] as const);
  const earSize  = pick(rng, ["small", "big"] as const);
  const eyeStyle = pick(rng, ["circle", "oval", "smile"] as const);
  const noseStyle= pick(rng, ["short", "long", "round"] as const);
  const mouthStyle = pick(rng, ["laugh", "smile", "peace"] as const);
  const shirtStyle = pick(rng, ["hoody", "short", "polo"] as const);
  const glassesStyle = pick(rng, ["none", "round", "square"] as const);
  const hairColor    = pick(rng, ["#000", "#77311D", "#FC909F", "#D2EFF3", "#506AF4", "#F48150"] as const);
  const bgColor      = pick(rng, ["#E0DDFF", "#D2EFF3", "#FFEDEF", "#FFEBA4", "#506AF4", "#F48150", "#74D14C"] as const);
  const shirtColor   = pick(rng, ["#9287FF", "#6BD9E9", "#FC909F", "#F4D150", "#77311D"] as const);

  // Hair style depends on sex (matches lib's defaults)
  const hairStyle = sex === "man"
    ? pick(rng, ["normal", "thick", "mohawk"] as const)
    : pick(rng, ["normal", "womanLong", "womanShort"] as const);

  return {
    sex,
    faceColor,
    earSize,
    eyeStyle,
    noseStyle,
    mouthStyle,
    shirtStyle,
    glassesStyle,
    hairColor,
    hairStyle,
    hatStyle: "none",
    hatColor: "#fff",
    eyeBrowStyle: "up",
    bgColor,
    shirtColor,
    isGradient: false,
  };
}

export interface AgentAvatarProps {
  /** Stable identity — agent.slug / agent.id / agent.name, anything stringy */
  seed: string | number;
  size?: number;
  /** Pass-through className for outer wrapper */
  className?: string;
  /** When true, use the lib's random genConfig (NOT seeded). Default false. */
  random?: boolean;
}

export function AgentAvatar({ seed, size = 48, className, random }: AgentAvatarProps) {
  const config = useMemo(() => {
    if (random) return genConfig();
    return configFromSeed(String(seed));
  }, [seed, random]);

  return (
    <Avatar
      style={{ width: size, height: size }}
      className={className}
      {...config}
    />
  );
}

/** Fallback URL for places that still need an `<img src>` (e.g. HeroUI Avatar with src prop).
 *  We can't easily inline an SVG into HeroUI's Avatar src; for those call-sites we keep
 *  using DiceBear via the existing helper, OR refactor them to render <AgentAvatar />. */
export function avatarSeedFor(input: any): string {
  if (!input) return "anon";
  if (typeof input === "string") return input;
  return String(input.slug ?? input.id ?? input.name ?? "anon");
}
