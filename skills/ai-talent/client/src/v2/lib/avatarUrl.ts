/**
 * avatarUrl — pick the right pre-rendered avatar size variant.
 *
 * Convention (set up by scripts/seed-fb-calendar-agents.ts):
 *   base:     /static/covers/agent-<slug>.png        (1024 — back-compat)
 *   variants: /static/covers/agent-<slug>.<size>.png (64 / 128 / 256 / 512)
 *
 * Avatars NOT seeded by us (legacy avatars without variants) → just
 * return the base URL; browser scales fine for portrait drawings.
 */

const VARIANT_SIZES = [64, 128, 256, 512] as const;
type VariantSize = typeof VARIANT_SIZES[number];

/** Pick the smallest variant >= the requested display size. */
function pickVariant(displaySize: number): VariantSize {
  for (const v of VARIANT_SIZES) if (v >= displaySize) return v;
  return 512;
}

/**
 * Resolve avatar URL for a given display size in CSS pixels.
 * Pass devicePixelRatio multiplier if you want sharp rendering on retina.
 *
 * Examples:
 *   resolveAvatarUrl("/static/covers/agent-stacy.png", 32)   → ".../agent-stacy.64.png"
 *   resolveAvatarUrl("/static/covers/agent-stacy.png", 64)   → ".../agent-stacy.64.png"
 *   resolveAvatarUrl("/static/covers/agent-stacy.png", 100)  → ".../agent-stacy.128.png"
 *   resolveAvatarUrl("/static/covers/agent-stacy.png", 200)  → ".../agent-stacy.256.png"
 *   resolveAvatarUrl("/static/covers/agent-stacy.png", 999)  → ".../agent-stacy.512.png"
 *   resolveAvatarUrl("https://other-domain.com/img.jpg", 64) → unchanged
 */
export function resolveAvatarUrl(
  baseUrl: string | null | undefined,
  displayCssSize: number,
  dpr = 2,            // assume retina by default; pass 1 to disable
): string | null {
  if (!baseUrl) return null;
  // Only apply variant logic to our covers convention. External URLs
  // (DiceBear / S3 / etc.) pass through unchanged.
  if (!baseUrl.includes("/static/covers/agent-")) return baseUrl;
  if (!baseUrl.endsWith(".png")) return baseUrl;
  const targetSize = displayCssSize * dpr;
  const variant = pickVariant(targetSize);
  return baseUrl.replace(/\.png$/, `.${variant}.png`);
}
