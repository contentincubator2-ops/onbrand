/**
 * friendlyError — turn a caught error into something safe to show in a toast.
 *
 * Server messages that are already written for people (plan limits, "pick a
 * brand first") pass through. Transport and validation noise (zod issue
 * arrays, "Failed to fetch", stack-like strings) is replaced by the caller's
 * localized fallback, and the raw text goes to the console for debugging.
 */
const TECHNICAL = /^\s*[\[{]|TRPC|TRPCClientError|zod|Failed to fetch|NetworkError|Unexpected token|ECONN|ETIMEDOUT|SyntaxError|\bat \S+ \(|<!DOCTYPE/i;

export function friendlyError(e: unknown, fallback: string): string {
  const raw = String((e as { message?: unknown } | null)?.message ?? "").trim();
  if (!raw || raw.length > 160 || TECHNICAL.test(raw)) {
    if (raw) console.error("[friendlyError]", raw);
    return fallback;
  }
  return raw;
}
