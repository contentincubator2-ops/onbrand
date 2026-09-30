/**
 * Which /api/auth/* requests the strict brute-force limiter (20/min) covers.
 *
 * 2026-09-29: the limiter was mounted on all of /api/auth, so the read-only
 * session check POST /api/auth/me — called 4–7 times per page load by
 * RequireAuthV2 / ShellLayout / i18n — hit 429 after 3–4 quick navigations,
 * and RequireAuthV2 treated the 429 as "logged out" and bounced to /auth/login.
 *
 * Session reads and logout carry no credential guess, so they fall under the
 * general /api limiter instead. `path` is relative to the /api/auth mount.
 */
const SESSION_PATHS = new Set(["/me", "/me/lang", "/logout"]);

export function isExemptFromAuthLimiter(path: string): boolean {
  const p = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  return SESSION_PATHS.has(p);
}
