/**
 * Social post mockups do not have a separate headline when a real caption is
 * present. Keep the stored output title only as a legacy fallback for runs
 * whose caption is still empty.
 */
export function getPostTitleFallback(
  title: string | null | undefined,
  caption: string | null | undefined,
): string | null {
  if (caption) return null;
  const trimmedTitle = (title ?? "").trim();
  return trimmedTitle || null;
}
