import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createZernioClient, ZernioApiError, ZERNIO_CONNECT_SCOPES } from "./zernio";

function setup(body: unknown, status = 200) {
  const credential = randomUUID();
  const fetchImpl = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>().mockImplementation(async () => new Response(JSON.stringify(body), { status }));
  return { credential, fetchImpl, client: createZernioClient({ apiKey: credential, fetchImpl }) };
}
describe("Zernio client", () => {
  afterEach(() => { vi.useRealTimers(); });
  it("sends analytics filters and preserves each page and its pagination", async () => {
    const { client, fetchImpl } = setup({});
    for (const page of [1, 2]) {
      const body = { posts: [{ _id: `external-${page}`, platforms: [{ platformPostId: `native-${page}` }] }],
        pagination: { page, limit: 100, total: 101, pages: 2 } };
      fetchImpl.mockResolvedValueOnce(new Response(JSON.stringify(body)));
      expect(await client.listAnalytics({ accountId: "account & one", fromDate: "2026-06-10", toDate: "2026-10-08",
        source: "all", page, limit: 100 })).toEqual(body);
      const [rawUrl, options] = fetchImpl.mock.calls[page - 1]!;
      const url = new URL(rawUrl as string);
      expect(url.pathname).toBe("/api/v1/analytics");
      expect(Object.fromEntries(url.searchParams)).toEqual({ accountId: "account & one", fromDate: "2026-06-10",
        toDate: "2026-10-08", source: "all", page: String(page), limit: "100" });
      expect(options?.method).toBe("GET");
    }
  });
  it.each([undefined, "late", "external"] as const)("passes analytics source %s (default all)", async source => {
    const { client, fetchImpl } = setup({ posts: [], pagination: { pages: 0 } });
    await client.listAnalytics({ accountId: "a", fromDate: "2026-10-01", toDate: "2026-10-08", source, page: 1, limit: 50 });
    expect(new URL(fetchImpl.mock.calls[0]![0] as string).searchParams.get("source")).toBe(source ?? "all");
  });
  it("syncs external posts using the current documented path and account body", async () => {
    const { client, fetchImpl } = setup({ synced: { postsFound: 1, postsSynced: 1 } });
    await client.syncExternalPosts({ accountId: "account & one" });
    const [url, options] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://zernio.com/api/v1/posts/sync-external");
    expect(options?.method).toBe("POST");
    expect(JSON.parse(options!.body as string)).toEqual({ accountId: "account & one" });
  });
  it("sends Bearer auth, profile payload and idempotency header", async () => {
    const { client, credential, fetchImpl } = setup({ profile: { _id: "profile" } }, 201);
    expect(await client.createProfile({ name: "Brand", idempotencyKey: "onbrand-brand-3" })).toEqual({ _id: "profile" });
    const [url, options] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://zernio.com/api/v1/profiles");
    expect(options?.headers).toMatchObject({ Authorization: `Bearer ${credential}`, "Idempotency-Key": "onbrand-brand-3" });
    expect(JSON.parse(options!.body as string)).toEqual({ name: "Brand" });
  });
  it("reuses the existing profile only for the specified conflict", async () => {
    const { client, fetchImpl } = setup({ error: "conflict", code: "profile_name_conflict", details: { existingProfileId: "existing" } }, 409);
    expect(await client.createProfile({ name: "Brand", idempotencyKey: "onbrand-brand-3" })).toEqual({ _id: "existing" });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const other = setup({ error: "conflict", code: "profile_name_conflict" }, 409);
    await expect(other.client.createProfile({ name: "Brand", idempotencyKey: "id" })).rejects.toBeInstanceOf(ZernioApiError);
    expect(other.fetchImpl).toHaveBeenCalledOnce();
  });
  it("polls by exact profile name every 400ms after an in-progress conflict", async () => {
    vi.useFakeTimers();
    const { client, fetchImpl } = setup({ profiles: [{ _id: "existing" }] });
    fetchImpl.mockResolvedValueOnce(new Response(JSON.stringify({ error: "A request with this Idempotency-Key is already in progress" }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ profiles: [] })));
    const pending = client.createProfile({ name: "Brand & 名稱", idempotencyKey: "onbrand-brand-3" });
    await vi.advanceTimersByTimeAsync(399);
    expect(fetchImpl).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(400);
    expect(await pending).toEqual({ _id: "existing" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    for (const [url, options] of fetchImpl.mock.calls.slice(1)) {
      expect(new URL(url as string).pathname).toBe("/api/v1/profiles");
      expect(Object.fromEntries(new URL(url as string).searchParams)).toEqual({ name: "Brand & 名稱", limit: "1" });
      expect(options?.method).toBe("GET");
    }
  });
  it("throws the original conflict after five empty profile lookups", async () => {
    vi.useFakeTimers();
    const { client, fetchImpl } = setup({ profiles: [] });
    const error = "A request with this Idempotency-Key is already in progress";
    fetchImpl.mockResolvedValueOnce(new Response(JSON.stringify({ error, code: "request_in_progress", details: { requestId: "original" } }), { status: 409 }));
    const pending = client.createProfile({ name: "Brand", idempotencyKey: "onbrand-brand-3" });
    const rejected = expect(pending).rejects.toMatchObject({
      name: "ZernioApiError", message: `zernio 409: ${error}`, status: 409,
      code: "request_in_progress", details: { requestId: "original" },
    });
    await vi.advanceTimersByTimeAsync(2000);
    await rejected;
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });
  it("returns null when no profile matches the name", async () => {
    const { client } = setup({ profiles: [] });
    expect(await client.findProfileByName("Missing Brand")).toBeNull();
  });
  it("encodes connect and account queries, and account deletion", async () => {
    const { client, fetchImpl } = setup({ authUrl: "https://example.com/connect", accounts: [] });
    await client.getConnectUrl({ platform: "twitter", profileId: "profile & one", redirectUrl: "https://example.com/brands?b=3&cat=publish" });
    const url = new URL(fetchImpl.mock.calls[0]![0] as string);
    expect(url.pathname).toBe("/api/v1/connect/twitter");
    expect(ZERNIO_CONNECT_SCOPES).toBe("posting,analytics");
    expect(Object.fromEntries(url.searchParams)).toEqual({ profileId: "profile & one", redirect_url: "https://example.com/brands?b=3&cat=publish", scopes: "posting,analytics" });
    expect(await client.listAccounts({ platform: "twitter", profileId: "profile" })).toEqual([]);
    expect(Object.fromEntries(new URL(fetchImpl.mock.calls[1]![0] as string).searchParams)).toEqual({ platform: "twitter", profileId: "profile", status: "connected" });
    await client.deleteAccount("account/one");
    expect(fetchImpl.mock.calls[2]![0]).toBe("https://zernio.com/api/v1/accounts/account%2Fone");
    expect(fetchImpl.mock.calls[2]![1]?.method).toBe("DELETE");
  });
  it("adds reconnectAccountId and sorted pagination parameters", async () => {
    const { client, fetchImpl } = setup({ authUrl: "https://example.com/connect", accounts: [], pagination: { pages: 1 } });
    await client.getConnectUrl({ platform: "facebook", profileId: "p", redirectUrl: "https://example.com", reconnectAccountId: "a & b" });
    expect(new URL(fetchImpl.mock.calls[0]![0] as string).searchParams.get("reconnectAccountId")).toBe("a & b");
    await client.listAccounts({ profileId: "p", platform: "facebook", status: "connected", sort: "connected", order: "desc" });
    expect(Object.fromEntries(new URL(fetchImpl.mock.calls[1]![0] as string).searchParams)).toEqual({
      profileId: "p", platform: "facebook", status: "connected", sort: "connected", order: "desc", limit: "100", page: "1",
    });
  });
  it.each([false, true])("reads every account page in order (filtered: %s)", async filtered => {
    const { client, fetchImpl } = setup({});
    fetchImpl.mockResolvedValueOnce(new Response(JSON.stringify({ accounts: [{ _id: "first" }], pagination: { pages: 2 } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accounts: [{ _id: "last" }], pagination: { pages: 2 } })));
    const accounts = filtered ? await client.listAccounts({ profileId: "p", platform: "facebook", sort: "connected", order: "desc" }) : await client.listAllAccounts();
    expect(accounts.map(a => a._id)).toEqual(["first", "last"]);
    expect(fetchImpl.mock.calls.map(([url]) => new URL(url as string).searchParams.get("page"))).toEqual(["1", "2"]);
    for (const [url] of fetchImpl.mock.calls) {
      const query = new URL(url as string).searchParams;
      expect(query.get("limit")).toBe("100");
      expect(query.get("status")).toBe("connected");
      expect(query.has("profileId")).toBe(filtered);
    }
  });
  it("does not return a partial snapshot when a later page fails", async () => {
    const { client, fetchImpl } = setup({});
    fetchImpl.mockResolvedValueOnce(new Response(JSON.stringify({ accounts: [{ _id: "first" }], pagination: { pages: 2 } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Unavailable" }), { status: 503 }));
    await expect(client.listAllAccounts()).rejects.toBeInstanceOf(ZernioApiError);
  });
  it.each([200, 201, 207])("preserves publish HTTP %i and body", async httpStatus => {
    const body = { post: { _id: "post", status: "published" } };
    const { client, fetchImpl } = setup(body, httpStatus);
    const payload = { content: "hello", mediaItems: [], platforms: [{ platform: "facebook" as const, accountId: "account" }], publishNow: true as const };
    expect(await client.createPost(payload, { idempotencyKey: "onbrand-sp-42" })).toEqual({ httpStatus, body });
    expect(fetchImpl.mock.calls[0]![1]?.headers).toMatchObject({ "Idempotency-Key": "onbrand-sp-42" });
    expect(JSON.parse(fetchImpl.mock.calls[0]![1]?.body as string)).toEqual(payload);
  });
  it("uses 15-second requests and 30-second publish timeouts", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const { client } = setup({ accounts: [], post: {} });
    await client.listAccounts({ platform: "facebook", profileId: "p" });
    expect(timeout).toHaveBeenLastCalledWith(15_000);
    await client.createPost({ content: "hello", mediaItems: [], platforms: [], publishNow: true }, { idempotencyKey: "onbrand-sp-42" });
    expect(timeout).toHaveBeenLastCalledWith(30_000);
    timeout.mockRestore();
  });
  it("redacts credentials from service errors and hides fetch exceptions", async () => {
    const { credential, client, fetchImpl } = setup({});
    fetchImpl.mockResolvedValueOnce(new Response(JSON.stringify({ error: `rejected ${credential}`, type: "authentication_error", details: { echo: credential } }), { status: 401 }));
    try { await client.deleteAccount("account"); throw new Error("expected failure"); }
    catch (e) {
      expect(e).toBeInstanceOf(ZernioApiError);
      expect((e as Error).message).toBe("zernio 401: rejected [redacted]");
      expect(JSON.stringify(e)).not.toContain(credential);
    }
    fetchImpl.mockRejectedValueOnce(new Error(credential));
    await expect(client.deleteAccount("account")).rejects.toThrow("zernio network request failed or timed out");
  });
});
