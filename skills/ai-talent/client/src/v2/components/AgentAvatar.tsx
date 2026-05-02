/**
 * AgentAvatar — DiceBear "notionists" illustrated avatar for agents.
 *
 * Style: DiceBear notionists (sketch/illustration style) with a solid
 * background colour that reflects the agent's platform or specialty.
 *
 * Background colour map:
 *   Facebook / FB      → #4267B2 (Facebook blue)
 *   Instagram / IG     → #C13584 (Instagram pink-purple)
 *   LinkedIn / LI      → #0077B5 (LinkedIn blue)
 *   YouTube / YT       → #FF0000 (YouTube red)
 *   策略 / Strategy    → #6548C6 (indigo)
 *   研究 / Research    → #0891B2 (teal)
 *   文案 / Copy/Writer → #059669 (green)
 *   視覺 / Visual      → #E11D48 (rose)
 *   分析 / Analytics   → #D97706 (amber)
 *   PR / 公關           → #7C3AED (violet)
 *   (default)          → rotated from the full palette by seed hash
 *
 * Pass `src` to override with a pre-generated avatar URL (e.g. from
 * agents.avatarUrl). Pass `role` to pick the right background colour.
 *
 * 2026-05-02 CJ direction: replace react-nice-avatar (memoji look) with
 * DiceBear notionists + specialty-keyed background colours, consistent
 * across the whole product.
 */

/** djb2-style 32-bit hash — small, deterministic, no deps. */
function hashSeed(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) + input.charCodeAt(i);
    h = h & 0xffffffff;
  }
  return Math.abs(h);
}

const PLATFORM_BG: Record<string, string> = {
  facebook:  "4267B2",
  instagram: "C13584",
  linkedin:  "0077B5",
  youtube:   "CC0000",
  strategy:  "6548C6",
  research:  "0891B2",
  writer:    "059669",
  visual:    "E11D48",
  analytics: "D97706",
  pr:        "7C3AED",
  calendar:  "0369A1",
  ads:       "B45309",
};

const PALETTE = Object.values(PLATFORM_BG);

function bgFromHint(hint: string): string {
  const h = hint.toLowerCase();
  if (h.includes("facebook") || h.includes(" fb ") || h.startsWith("fb") || h.includes("粉絲"))
    return PLATFORM_BG.facebook;
  if (h.includes("instagram") || h.includes(" ig ") || h.startsWith("ig") || h.includes("ig "))
    return PLATFORM_BG.instagram;
  if (h.includes("linkedin") || h.includes(" li "))
    return PLATFORM_BG.linkedin;
  if (h.includes("youtube") || h.includes(" yt "))
    return PLATFORM_BG.youtube;
  if (h.includes("策略") || h.includes("strateg") || h.includes("brand"))
    return PLATFORM_BG.strategy;
  if (h.includes("研究") || h.includes("research") || h.includes("insight"))
    return PLATFORM_BG.research;
  if (h.includes("文案") || h.includes("writ") || h.includes("copy") || h.includes("content"))
    return PLATFORM_BG.writer;
  if (h.includes("視覺") || h.includes("visual") || h.includes("design") || h.includes("art"))
    return PLATFORM_BG.visual;
  if (h.includes("分析") || h.includes("analyt") || h.includes("data") || h.includes("kpi"))
    return PLATFORM_BG.analytics;
  if (h.includes("pr") || h.includes("公關") || h.includes("media"))
    return PLATFORM_BG.pr;
  if (h.includes("行事曆") || h.includes("calendar") || h.includes("pillar"))
    return PLATFORM_BG.calendar;
  if (h.includes("廣告") || h.includes("ads") || h.includes("ad "))
    return PLATFORM_BG.ads;
  // Deterministic fallback — rotate across palette by seed
  return PALETTE[hashSeed(hint) % PALETTE.length]!;
}

/** Build a DiceBear notionists URL with the appropriate background colour. */
export function agentAvatarUrl(seed: string | number, roleOrHint?: string): string {
  const s = String(seed);
  const bg = bgFromHint(roleOrHint ?? s);
  return (
    `https://api.dicebear.com/7.x/notionists/svg` +
    `?seed=${encodeURIComponent(s)}` +
    `&backgroundColor=${bg}` +
    `&backgroundType=solid`
  );
}

export interface AgentAvatarProps {
  /** Stable identity — agent.slug / agent.id / agent.name */
  seed: string | number;
  /** Agent role / specialty / platform — drives background colour */
  role?: string;
  /** Pre-generated avatar image URL — overrides DiceBear when provided */
  src?: string | null;
  size?: number;
  className?: string;
  /** @deprecated no longer used; accepted for back-compat */
  random?: boolean;
}

export function AgentAvatar({ seed, role, src, size = 48, className }: AgentAvatarProps) {
  const url = (src && src.trim()) ? src : agentAvatarUrl(seed, role ?? String(seed));
  return (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: "cover" }}
      className={className}
      loading="lazy"
      onError={(e) => {
        // Fallback to DiceBear if custom src fails to load
        const img = e.currentTarget;
        if (img.src !== agentAvatarUrl(seed, role ?? String(seed))) {
          img.src = agentAvatarUrl(seed, role ?? String(seed));
        }
      }}
    />
  );
}

/** Convenience: same URL for places that need a raw string (HeroUI Avatar src). */
export function avatarSeedFor(input: any): string {
  if (!input) return "anon";
  if (typeof input === "string") return input;
  return String(input.slug ?? input.id ?? input.name ?? "anon");
}
