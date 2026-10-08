import type { ZernioPlatform, ZernioPostPayload, ZernioPostResponse } from "./publish/zernioPublish";

export const DEFAULT_TIMEOUT_MS = 15_000;
// 成效回填（performance 層）要讀各平台 insights，連接時一次要齊，避免客戶日後得重新授權。
export const ZERNIO_CONNECT_SCOPES = "posting,analytics";
const PUBLISH_TIMEOUT_MS = 30_000;
export type ZernioAccount = {
  _id: string; platform: ZernioPlatform; username?: string; displayName?: string;
  profileUrl?: string; isActive?: boolean; platformUserId?: string; profileId?: string | { _id: string; name?: string };
};
export type ZernioAnalyticsMetrics = Partial<Record<
  "impressions" | "reach" | "likes" | "comments" | "shares" | "saves" | "clicks" | "views" | "engagementRate",
  number | null
>> & { lastUpdated?: string | null };
export type ZernioPlatformAnalytics = {
  platform: string; status?: string; platformPostId?: string | null;
  accountId?: string | { _id: string } | null; accountUsername?: string | null; analytics?: ZernioAnalyticsMetrics | null;
  syncStatus?: string; platformPostUrl?: string | null; errorMessage?: string | null;
};
export type ZernioAnalyticsPost = {
  postId?: string; _id?: string; latePostId?: string | null; status?: string; content?: string | null;
  publishedAt?: string | null; platform?: string; platformPostId?: string | null; platformPostUrl?: string | null;
  isExternal?: boolean; syncStatus?: string; mediaType?: string | null;
  mediaItems?: Array<{ type?: string; url?: string | null; thumbnail?: string | null }>;
  analytics?: ZernioAnalyticsMetrics | null;
  platformAnalytics?: ZernioPlatformAnalytics[];
  // The list response uses `platforms`; single-post responses use `platformAnalytics`.
  platforms?: ZernioPlatformAnalytics[];
};
export type ZernioAnalyticsPage = {
  posts: ZernioAnalyticsPost[];
  pagination?: { page: number; limit: number; total: number; pages: number };
};
export class ZernioApiError extends Error {
  constructor(public status: number, error: string, public type?: string, public code?: string, public details?: Record<string, unknown>) {
    super(`zernio ${status}: ${error}`); this.name = "ZernioApiError";
  }
}
export function createZernioClient({ apiKey, baseUrl = "https://zernio.com/api", fetchImpl = fetch }: {
  apiKey: string; baseUrl?: string; fetchImpl?: typeof fetch;
}) {
  const redact = (text: string) => apiKey ? text.split(apiKey).join("[redacted]") : text;
  async function request<T>(path: string, options: { method?: string; body?: unknown; idempotencyKey?: string; timeoutMs?: number } = {}): Promise<{ httpStatus: number; body: T }> {
    const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}${path}`, {
        method: options.method ?? "GET", headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
    } catch {
      throw new Error("zernio network request failed or timed out");
    }
    let body;
    try { body = JSON.parse(redact(await response.text())); }
    catch { throw new ZernioApiError(response.status, "Invalid service response"); }
    if (!response.ok) throw new ZernioApiError(response.status,
      typeof body?.error === "string" ? body.error : "Request failed", body?.type, body?.code, body?.details);
    return { httpStatus: response.status, body: body as T };
  }
  async function paginatedAccounts(filters: Record<string, string>): Promise<ZernioAccount[]> {
    const accounts: ZernioAccount[] = [];
    for (let page = 1; ; page++) {
      const query = new URLSearchParams({ ...filters, limit: "100", page: String(page) });
      const { body } = await request<{ accounts: ZernioAccount[]; pagination?: { pages: number } }>(`/v1/accounts?${query}`);
      accounts.push(...body.accounts);
      if (body.pagination ? page >= body.pagination.pages : body.accounts.length < 100) return accounts;
    }
  }
  async function findProfileByName(name: string): Promise<{ _id: string } | null> {
    const query = new URLSearchParams({ name, limit: "1" });
    const { body } = await request<{ profiles: { _id: string }[] }>(`/v1/profiles?${query}`);
    return body.profiles[0] ?? null;
  }
  return {
    findProfileByName,
    async createProfile(input: { name: string; idempotencyKey: string }): Promise<{ _id: string }> {
      try {
        return (await request<{ profile: { _id: string } }>("/v1/profiles", {
          method: "POST", body: { name: input.name }, idempotencyKey: input.idempotencyKey,
        })).body.profile;
      } catch (e) {
        if (e instanceof ZernioApiError && e.status === 409 && e.code === "profile_name_conflict"
            && typeof e.details?.existingProfileId === "string") return { _id: e.details.existingProfileId };
        if (e instanceof ZernioApiError && e.status === 409 && e.code !== "profile_name_conflict") {
          for (let attempt = 0; attempt < 5; attempt++) {
            await new Promise<void>(resolve => setTimeout(resolve, 400));
            const profile = await findProfileByName(input.name);
            if (profile) return { _id: profile._id };
          }
        }
        throw e;
      }
    },
    async getConnectUrl(input: { platform: ZernioPlatform; profileId: string; redirectUrl: string; reconnectAccountId?: string }): Promise<{ authUrl: string }> {
      const query = new URLSearchParams({ profileId: input.profileId, redirect_url: input.redirectUrl, scopes: ZERNIO_CONNECT_SCOPES });
      if (input.reconnectAccountId) query.set("reconnectAccountId", input.reconnectAccountId);
      return (await request<{ authUrl: string }>(`/v1/connect/${input.platform}?${query}`)).body;
    },
    async listAccounts(input: { profileId: string; platform: ZernioPlatform; status?: "connected" | "disconnected";
      sort?: "account" | "platform" | "profile" | "status" | "connected"; order?: "asc" | "desc" }): Promise<ZernioAccount[]> {
      const filters = { status: "connected", ...input };
      if (input.sort || input.order) return paginatedAccounts(filters);
      const query = new URLSearchParams(filters);
      return (await request<{ accounts: ZernioAccount[] }>(`/v1/accounts?${query}`)).body.accounts;
    },
    async listAllAccounts(): Promise<ZernioAccount[]> {
      return paginatedAccounts({ status: "connected" });
    },
    async listAnalytics(input: { accountId: string; fromDate: string; toDate: string;
      source?: "late" | "external" | "all"; page: number; limit: number }): Promise<ZernioAnalyticsPage> {
      const query = new URLSearchParams({ accountId: input.accountId, fromDate: input.fromDate,
        toDate: input.toDate, source: input.source ?? "all", page: String(input.page), limit: String(input.limit) });
      return (await request<ZernioAnalyticsPage>(`/v1/analytics?${query}`)).body;
    },
    async syncExternalPosts(input: { accountId: string }): Promise<void> {
      // Current OpenAPI path (the design document used /v1/analytics/sync-external-posts).
      await request("/v1/posts/sync-external", { method: "POST", body: { accountId: input.accountId } });
    },
    async deleteAccount(accountId: string): Promise<void> {
      await request(`/v1/accounts/${encodeURIComponent(accountId)}`, { method: "DELETE" });
    },
    createPost(payload: ZernioPostPayload, options: { idempotencyKey: string }) {
      return request<ZernioPostResponse>("/v1/posts", { method: "POST", body: payload, ...options, timeoutMs: PUBLISH_TIMEOUT_MS });
    },
  };
}
export type ZernioClient = ReturnType<typeof createZernioClient>;
