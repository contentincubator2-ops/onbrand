import type { BundlePlatform, BundlePostPayload } from "../../content/core/bundlePublish";

const DEFAULT_BASE_URL = "https://api.bundle.social";
const DEFAULT_TIMEOUT_MS = 15_000;
const PUBLISH_TIMEOUT_MS = 30_000;

export type BundleTeam = { id: string; name?: string };

export type BundleSocialAccount = {
  id: string;
  type: BundlePlatform;
  teamId?: string;
  username?: string;
  displayName?: string;
  channels?: Array<{ id: string; name?: string; username?: string; avatarUrl?: string }>;
};

export type BundlePost = {
  id: string;
  status?: string;
  error?: string | null;
  errors?: Record<string, string> | null;
  errorsVerbose?: Record<string, unknown> | null;
  externalData?: Record<string, { id?: string; permalink?: string }> | null;
};

export type BundleSocialClientConfig = {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

/**
 * True when bundle.social says the team is gone.
 *
 * Teams can be deleted from the bundle.social dashboard, which leaves
 * brands.bundleTeamId pointing at nothing. Callers use this to drop the stale
 * binding and recreate the team instead of dead-ending the user.
 */
export function isBundleMissingTeamError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /\b404\b/.test(error.message) && /no team found/i.test(error.message);
}

/**
 * True when bundle.social says the platform is not linked for this team.
 *
 * Two different 400s mean the same thing to the user — "you have not connected
 * this platform yet": reading an account the team never linked, and posting to
 * a team whose platform has no account. Neither is a server fault.
 */
export function isBundleNotConnectedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (!/\b400\b/.test(error.message)) return false;
  return /does not have a .* account/i.test(error.message)
    || /no social accounts selected/i.test(error.message);
}

/** Pull the human-readable part out of an error body without leaking the whole payload. */
function extractMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: unknown; error?: unknown };
    const message = parsed.message ?? parsed.error;
    if (typeof message === "string" && message) return message;
  } catch { /* fall through to raw body */ }
  return body.slice(0, 300);
}

/**
 * Thin client over the bundle.social REST API.
 *
 * `fetchImpl` is injectable so the request shape can be asserted in tests
 * without touching the network — same convention as pipedreamFacebook.ts.
 */
export function createBundleSocialClient({
  apiKey,
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = fetch,
}: BundleSocialClientConfig) {
  async function request<T>(
    path: string,
    options: {
      method?: "GET" | "POST";
      body?: unknown;
      timeoutMs?: number;
      nullOn404?: boolean;
    } = {},
  ): Promise<T | null> {
    const { method = "GET", body, timeoutMs = DEFAULT_TIMEOUT_MS, nullOn404 = false } = options;

    const headers: Record<string, string> = { "x-api-key": apiKey };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const text = await response.text();
    if (!response.ok) {
      if (nullOn404 && response.status === 404) return null;
      throw new Error(`bundle.social ${response.status}: ${extractMessage(text)}`);
    }
    return text ? (JSON.parse(text) as T) : ({} as T);
  }

  return {
    async createTeam(name: string): Promise<BundleTeam> {
      return (await request<BundleTeam>("/api/v1/team/", {
        method: "POST",
        body: { name },
      }))!;
    },

    async createPortalLink(input: {
      teamId: string;
      socialAccountTypes: BundlePlatform[];
      redirectUrl?: string;
      expiresIn?: number;
    }): Promise<{ url: string }> {
      return (await request<{ url: string }>("/api/v1/social-account/create-portal-link", {
        method: "POST",
        body: input,
      }))!;
    },

    /** Returns null when the team has not connected this platform yet. */
    async getSocialAccount(input: {
      teamId: string;
      type: BundlePlatform;
    }): Promise<BundleSocialAccount | null> {
      const query = new URLSearchParams({ teamId: input.teamId, type: input.type });
      try {
        return await request<BundleSocialAccount>(`/api/v1/social-account/by-type?${query}`, {
          nullOn404: true,
        });
      } catch (e) {
        // A team that exists but has never linked this platform answers 400,
        // not 404. That is "not connected", not a failure worth surfacing.
        if (isBundleNotConnectedError(e)) return null;
        throw e;
      }
    },

    async uploadFromUrl(input: { teamId: string; url: string }): Promise<{ id: string }> {
      return (await request<{ id: string }>("/api/v1/upload/from-url", {
        method: "POST",
        body: input,
      }))!;
    },

    async createPost(payload: BundlePostPayload): Promise<BundlePost> {
      return (await request<BundlePost>("/api/v1/post/", {
        method: "POST",
        body: payload,
        timeoutMs: PUBLISH_TIMEOUT_MS,
      }))!;
    },
  };
}

export type BundleSocialClient = ReturnType<typeof createBundleSocialClient>;
