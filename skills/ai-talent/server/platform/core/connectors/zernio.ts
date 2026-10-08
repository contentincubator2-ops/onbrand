import type { ZernioPlatform, ZernioPostPayload, ZernioPostResponse } from "./publish/zernioPublish";

export const DEFAULT_TIMEOUT_MS = 15_000;
const PUBLISH_TIMEOUT_MS = 30_000;
export type ZernioAccount = {
  _id: string; platform: ZernioPlatform; username?: string; displayName?: string;
  profileUrl?: string; isActive?: boolean; platformUserId?: string; profileId?: string | { _id: string; name?: string };
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
  return {
    async createProfile(input: { name: string; idempotencyKey: string }): Promise<{ _id: string }> {
      try {
        return (await request<{ profile: { _id: string } }>("/v1/profiles", {
          method: "POST", body: { name: input.name }, idempotencyKey: input.idempotencyKey,
        })).body.profile;
      } catch (e) {
        if (e instanceof ZernioApiError && e.status === 409 && e.code === "profile_name_conflict"
            && typeof e.details?.existingProfileId === "string") return { _id: e.details.existingProfileId };
        throw e;
      }
    },
    async getConnectUrl(input: { platform: ZernioPlatform; profileId: string; redirectUrl: string; reconnectAccountId?: string }): Promise<{ authUrl: string }> {
      const query = new URLSearchParams({ profileId: input.profileId, redirect_url: input.redirectUrl, scopes: "posting" });
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
    async deleteAccount(accountId: string): Promise<void> {
      await request(`/v1/accounts/${encodeURIComponent(accountId)}`, { method: "DELETE" });
    },
    createPost(payload: ZernioPostPayload, options: { idempotencyKey: string }) {
      return request<ZernioPostResponse>("/v1/posts", { method: "POST", body: payload, ...options, timeoutMs: PUBLISH_TIMEOUT_MS });
    },
  };
}
export type ZernioClient = ReturnType<typeof createZernioClient>;
