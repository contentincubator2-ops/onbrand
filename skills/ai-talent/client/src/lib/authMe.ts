/**
 * Shared POST /api/auth/me.
 *
 * 2026-09-29: RequireAuthV2, ShellLayout (×2) and i18n each fetched /me on
 * every page load — 4–7 requests per navigation, enough to trip the server's
 * auth rate limiter. Concurrent callers now share one in-flight request, and a
 * successful response is reused for a few seconds so a navigation makes one
 * request. Non-2xx and network failures are never cached.
 *
 * Rejects on network failure; resolves with the HTTP status otherwise.
 */
export type AuthMeResult = { status: number; data: any | null };

const OK_TTL_MS = 3000;

let inflight: Promise<AuthMeResult> | null = null;
let lastOk: { at: number; result: AuthMeResult } | null = null;

export function fetchAuthMe(): Promise<AuthMeResult> {
  if (lastOk && Date.now() - lastOk.at < OK_TTL_MS) return Promise.resolve(lastOk.result);
  if (inflight) return inflight;

  inflight = (async () => {
    const r = await fetch("/api/auth/me", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    const data = r.ok ? await r.json().catch(() => null) : null;
    const result = { status: r.status, data };
    if (r.ok) lastOk = { at: Date.now(), result };
    return result;
  })().finally(() => { inflight = null; });

  return inflight;
}

/** Call on logout so a stale "logged in" answer isn't reused. */
export function clearAuthMeCache(): void {
  lastOk = null;
}
