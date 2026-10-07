import type { ZernioPlatform, ZernioPostPayload, ZernioPostResponse } from "./publish/zernioPublish";

export const DEFAULT_TIMEOUT_MS = 15_000;
const PUBLISH_TIMEOUT_MS = 30_000;
export type ZernioAccount = {
  _id: string; platform: ZernioPlatform; username?: string; displayName?: string;
  profileUrl?: string; isActive?: boolean; profileId?: { _id: string; name?: string };
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
    async getConnectUrl(input: { platform: ZernioPlatform; profileId: string; redirectUrl: string }): Promise<{ authUrl: string }> {
      const query = new URLSearchParams({ profileId: input.profileId, redirect_url: input.redirectUrl, scopes: "posting" });
      return (await request<{ authUrl: string }>(`/v1/connect/${input.platform}?${query}`)).body;
    },
    async listAccounts(input: { profileId: string; platform: ZernioPlatform }): Promise<ZernioAccount[]> {
      const query = new URLSearchParams({ ...input, status: "connected" });
      return (await request<{ accounts: ZernioAccount[] }>(`/v1/accounts?${query}`)).body.accounts;
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
