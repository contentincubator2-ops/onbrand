import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyticsFact, analyticsFormatOf, ensureFreshZernioAnalytics, AUTO_SYNC_STALE_HOURS, syncBrandZernioAnalytics, tickZernioAnalyticsSync,
  zernioAnalyticsEnabled, ZERNIO_ANALYTICS_PLATFORMS, SOURCE_BY_PLATFORM, type AnalyticsPlatform } from "./zernioAnalyticsSync";
import { ZernioApiError, type ZernioAnalyticsPost, type ZernioAnalyticsPage } from "../../platform/core/connectors/zernio";

vi.mock("../../localDb", () => ({ default: { execute: vi.fn() } }));

const metrics = { likes: 10, comments: 3, shares: 2, reach: 90, impressions: 100, views: 80, saves: 4, clicks: 1 };
function post(platform: AnalyticsPlatform, overrides: Partial<ZernioAnalyticsPost> = {}): ZernioAnalyticsPost {
  return { postId: "provider-post-id", content: "  Hello\n world  ", publishedAt: "2026-10-07T17:00:00Z",
    mediaType: "image", analytics: { likes: 9999 },
    platformAnalytics: [{ platform, accountId: `${platform}-account`, status: "published",
      platformPostId: platform === "facebook" ? "123_456" : `${platform}-native`,
      platformPostUrl: "https://example.com/post", analytics: metrics }], ...overrides };
}
const pageOf = (posts: ZernioAnalyticsPost[], page = 1, pages = 1): ZernioAnalyticsPage => ({ posts, pagination: { page, pages, total: posts.length, limit: 100 } });
const externalPost = (platform: AnalyticsPlatform): ZernioAnalyticsPost => ({
  platform, platformPostId: "456", platformPostUrl: "https://www.facebook.com/my-page/posts/pfbidExample",
  content: "External post", publishedAt: "2026-10-07T17:00:00Z", mediaType: "image", analytics: metrics,
});
function setup(platforms: string[] = [...ZERNIO_ANALYTICS_PLATFORMS], existing = false, lastSync: Date | string | null = null) {
  const pool = { execute: vi.fn().mockImplementation(async (sql: string) => {
    if (sql.includes("FROM brand_publish_connections")) return [platforms.map(platform => ({ platform, accountId: `${platform}-account` }))];
    if (sql.includes("FROM scheduled_posts")) return [[{ externalPostId: "456", metadata: JSON.stringify({ perfTags: { ta: "owners" } }) }]];
    if (sql.includes("MAX(updatedAt)")) return [[{ lastSync }]];
    if (sql.includes("FROM perf_facts")) return [existing ? [{ exists: 1 }] : []];
    throw new Error("Unexpected query");
  }) };
  const client = {
    listAnalytics: vi.fn().mockImplementation(async ({ accountId }: { accountId: string }) => pageOf([post(accountId.replace("-account", "") as AnalyticsPlatform)])),
    syncExternalPosts: vi.fn().mockResolvedValue(undefined),
  };
  return { pool, client, upsert: vi.fn().mockResolvedValue(1), log: vi.fn().mockResolvedValue(undefined), now: () => new Date("2026-10-07T17:00:00Z") };
}
beforeEach(() => { vi.stubEnv("SOCIAL_PUBLISH_ENABLED", "true"); vi.stubEnv("ZERNIO_API_KEY", randomUUID()); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("Zernio analytics facts", () => {
  it.each(ZERNIO_ANALYTICS_PLATFORMS)("recognizes %s own ids without perfTags even when marked external", platform => {
    const id = platform === "facebook" ? "123_456" : `${platform}-native`;
    const result = analyticsFact(post(platform, { isExternal: true }), platform, `${platform}-account`, {}, new Set([id]));
    expect(result).toMatchObject({ tagged: false, fact: { tags: { origin: "onbrand" } } });
  });
  it.each(["123_456", "456"])("recognizes Facebook id %s without perfTags", id => {
    expect(analyticsFact(post("facebook"), "facebook", "facebook-account", {}, new Set([id])))
      .toMatchObject({ tagged: false, fact: { tags: { origin: "onbrand" } } });
  });
  it.each([
    { isExternal: false }, { latePostId: "late-id" }, { isExternal: true, latePostId: "late-id" },
  ])("recognizes provider origin evidence without a local match: %j", evidence => {
    expect(analyticsFact(post("instagram", evidence), "instagram", "instagram-account"))
      .toMatchObject({ tagged: false, fact: { tags: { origin: "onbrand" } } });
  });
  it.each([{}, { isExternal: true }, { latePostId: "" }, { latePostId: null }])("defaults to external without origin evidence: %j", evidence => {
    expect(analyticsFact(post("instagram", evidence), "instagram", "instagram-account")?.fact.tags?.origin).toBe("external");
  });
  it("does not match a non-Facebook id by suffix and overrides user origin", () => {
    const p = externalPost("instagram");
    p.platformPostId = "123_456";
    expect(analyticsFact(p, "instagram", "instagram-account", { "123_456": { origin: "onbrand" } }, new Set(["456"]))?.fact.tags)
      .toEqual({ format: "image", origin: "external" });
  });
  it.each(ZERNIO_ANALYTICS_PLATFORMS)("converts %s with native id, Taipei day and own tags", platform => {
    const id = platform === "facebook" ? "123_456" : `${platform}-native`;
    const result = analyticsFact(post(platform), platform, `${platform}-account`, { [id]: { ta: "owners", format: "old", origin: "external" } }, new Set([id]));
    expect(result).toEqual({ tagged: true, fact: {
      source: SOURCE_BY_PLATFORM[platform], entityType: "post", entityId: id, entityLabel: "Hello world",
      text: "  Hello\n world  ", date: "2026-10-08", permalink: "https://example.com/post",
      tags: { ta: "owners", format: "image", origin: "onbrand" },
      metrics: { reactions: 10, comments: 3, shares: 2, engagement: 15, reach: 90,
        impressions: platform === "threads" ? 80 : 100, views: 80, saves: 4, clicks: 1 },
    } });
  });
  it.each([["image", "image"], ["video", "video"], ["reel", "video"], ["carousel", "carousel"], ["document", "text"], [null, "text"]])("maps media %s to %s", (media, expected) => {
    expect(analyticsFormatOf(media)).toBe(expected);
  });
  it("handles real list platforms, ignores other account totals, and matches Facebook suffix tags", () => {
    const p = post("facebook");
    p.platforms = [{ ...p.platformAnalytics![0]!, accountId: "other", analytics: { likes: 800 } }, ...p.platformAnalytics!];
    delete p.platformAnalytics;
    const result = analyticsFact(p, "facebook", "facebook-account", { "456": { ta: "owners" } }, new Set(["456"]));
    expect(result?.fact.metrics.reactions).toBe(10);
    expect(result?.fact.tags).toEqual({ ta: "owners", format: "image", origin: "onbrand" });
    expect(result?.tagged).toBe(true);
  });
  it("normalizes object account ids in platforms and still rejects unrelated or null accounts", () => {
    const p = post("instagram");
    p.platforms = [
      { ...p.platformAnalytics![0]!, accountId: null, analytics: { likes: 800 } },
      { ...p.platformAnalytics![0]!, accountId: { _id: "other" }, analytics: { likes: 900 } },
      { ...p.platformAnalytics![0]!, accountId: { _id: "instagram-account" } },
    ];
    p.platformAnalytics = [];
    expect(analyticsFact(p, "instagram", "instagram-account")?.fact.metrics.reactions).toBe(10);
    expect(analyticsFact(p, "instagram", "missing-account")).toBeNull();
  });
  it.each(ZERNIO_ANALYTICS_PLATFORMS)("converts flat external %s posts using top-level analytics", platform => {
    const result = analyticsFact(externalPost(platform), platform, `${platform}-account`, { "456": { ta: "owners" } }, new Set(["456"]));
    expect(result).toMatchObject({ tagged: true, fact: { source: SOURCE_BY_PLATFORM[platform], entityId: "456",
      entityLabel: "External post", date: "2026-10-08", tags: { ta: "owners", format: "image", origin: "onbrand" },
      metrics: { reactions: 10, engagement: 15, impressions: platform === "threads" ? 80 : 100 } } });
  });
  it("rejects flat posts for another platform or without a native id and never falls back around unmatched targets", () => {
    const p = externalPost("facebook");
    expect(analyticsFact(p, "threads", "threads-account")).toBeNull();
    expect(analyticsFact({ ...p, platformPostId: null }, "facebook", "facebook-account")).toBeNull();
    expect(analyticsFact({ ...p, platforms: [{ platform: "facebook", accountId: "other", platformPostId: "456" }] }, "facebook", "facebook-account")).toBeNull();
  });
  it("writes only finite numeric metrics and treats missing interactions as zero in the sum", () => {
    const p = post("threads", { content: " \n " });
    p.platformAnalytics![0]!.analytics = { likes: 0, comments: null, shares: Number.NaN, impressions: 100, views: 12, reach: Infinity };
    const fact = analyticsFact(p, "threads", "threads-account")!.fact;
    expect(fact.metrics).toEqual({ reactions: 0, engagement: 0, views: 12, impressions: 12 });
    expect(fact.entityLabel).toBe("(無文字貼文)");
  });
  it("does not overwrite existing metrics with unavailable or cross-account data", () => {
    const p = post("instagram");
    expect(analyticsFact(p, "instagram", "another-account")).toBeNull();
    p.platformAnalytics![0]!.analytics = null;
    p.analytics = null;
    expect(analyticsFact(p, "instagram", "instagram-account")).toBeNull();
    p.analytics = metrics;
    p.platformAnalytics!.push({ platform: "linkedin", accountId: "linkedin-account", analytics: metrics });
    expect(analyticsFact(p, "instagram", "instagram-account")).toBeNull();
  });
  it("skips unpublished, invalid-date and missing-native-id posts without using Zernio ids", () => {
    const p = post("instagram");
    for (const publishedAt of [null, "bad-date"]) expect(analyticsFact({ ...p, publishedAt }, "instagram", "instagram-account")).toBeNull();
    p.platformAnalytics![0]!.status = "failed";
    expect(analyticsFact(p, "instagram", "instagram-account")).toBeNull();
    p.platformAnalytics![0]!.status = "published";
    p.platformAnalytics![0]!.platformPostId = null;
    expect(analyticsFact(p, "instagram", "instagram-account")).toBeNull();
  });
  it.each(["456", "pfbidExample"])("combines the supplied Facebook page id with %s and preserves own tags", id => {
    const p = post("facebook");
    Object.assign(p.platformAnalytics![0]!, { platformPostId: id, platformPostUrl: "https://www.facebook.com/my-page/posts/pfbidExample" });
    for (const key of [id, `123_${id}`]) {
      expect(analyticsFact(p, "facebook", "facebook-account", { [key]: { ta: "owners" } }, new Set([key]), "123"))
        .toMatchObject({ tagged: true, fact: { entityId: `123_${id}`, tags: { ta: "owners", origin: "onbrand" } } });
    }
  });
  it.each(["456", "pfbidExample"])("keeps the original Facebook id %s without page metadata", id => {
    const p = { ...externalPost("facebook"), platformPostId: id };
    expect(analyticsFact(p, "facebook", "facebook-account")?.fact.entityId).toBe(id);
  });
  it.each(["123_456", "123_pfbidExample"])("does not prepend the page id to the composite native id %s", id => {
    const p = { ...externalPost("facebook"), platformPostId: id };
    expect(analyticsFact(p, "facebook", "facebook-account", {}, new Set(), "789")?.fact.entityId).toBe(id);
  });
});

describe("Zernio brand sync", () => {
  it.each(ZERNIO_ANALYTICS_PLATFORMS)("counts %s onbrand separately from user tags and skipped posts", async platform => {
    const deps = setup([platform]);
    deps.pool.execute.mockResolvedValueOnce([[{ platform, accountId: `${platform}-account` }]])
      .mockResolvedValueOnce([[{ externalPostId: "456", metadata: null }]]);
    const p = externalPost(platform);
    deps.client.listAnalytics.mockResolvedValueOnce(pageOf([
      p,
      { ...p, platformPostId: "provider-owned", isExternal: false },
      { ...p, platformPostId: "late-owned", latePostId: "late-id" },
      { ...p, platformPostId: "elsewhere", isExternal: true },
      { ...p, platformPostId: "invalid", isExternal: false, publishedAt: "invalid" },
    ]));
    expect(await syncBrandZernioAnalytics(7, 120, deps)).toEqual({
      platforms: [{ platform, posts: 4, tagged: 0, onbrand: 3, skipped: 1 }],
    });
    expect(deps.upsert.mock.calls[0]![1].map((fact: { tags: { origin: string } }) => fact.tags.origin))
      .toEqual(["onbrand", "onbrand", "onbrand", "external"]);
  });
  it("syncs only the four supported connections with dates, source=all and own tags", async () => {
    const deps = setup([...ZERNIO_ANALYTICS_PLATFORMS, "youtube", "tiktok", "x"]);
    expect(await syncBrandZernioAnalytics(7, 120, deps)).toEqual({ platforms: ZERNIO_ANALYTICS_PLATFORMS.map(platform => ({ platform, posts: 1, tagged: platform === "facebook" ? 1 : 0, onbrand: platform === "facebook" ? 1 : 0, skipped: 0 })) });
    expect(deps.pool.execute).toHaveBeenCalledWith(expect.stringContaining("status = 'connected'"), [7, "zernio"]);
    expect(deps.client.listAnalytics).toHaveBeenCalledTimes(4);
    expect(deps.client.listAnalytics).toHaveBeenCalledWith({ accountId: "facebook-account", fromDate: "2026-06-10", toDate: "2026-10-08", source: "all", page: 1, limit: 100 });
    expect(deps.upsert).toHaveBeenCalledTimes(4);
    expect(deps.client.syncExternalPosts).not.toHaveBeenCalled();
  });
  it("reads all pages before upserting a platform", async () => {
    const deps = setup(["instagram"]);
    deps.client.listAnalytics.mockResolvedValueOnce(pageOf([post("instagram")], 1, 2)).mockResolvedValueOnce(pageOf([post("instagram")], 2, 2));
    expect((await syncBrandZernioAnalytics(7, 120, deps)).platforms[0]?.posts).toBe(2);
    expect(deps.client.listAnalytics.mock.calls.map(([input]) => input.page)).toEqual([1, 2]);
    expect(deps.upsert.mock.calls[0]![1]).toHaveLength(2);
  });
  it.each([false, true])("passes the connection's platformUserId to conversion (JSON metadata: %s)", async json => {
    const deps = setup(["facebook"]);
    const meta = { profileUrl: "https://www.facebook.com/my-page", platformUserId: "123" };
    deps.pool.execute.mockResolvedValueOnce([[{ platform: "facebook", accountId: "facebook-account", meta: json ? JSON.stringify(meta) : meta }]]);
    deps.client.listAnalytics.mockResolvedValueOnce(pageOf([externalPost("facebook")]));
    expect(await syncBrandZernioAnalytics(7, 120, deps)).toEqual({ platforms: [{ platform: "facebook", posts: 1, tagged: 1, onbrand: 1, skipped: 0 }] });
    expect(deps.upsert.mock.calls[0]![1][0]).toMatchObject({ entityId: "123_456", tags: { ta: "owners" } });
  });
  it.each([undefined, null, "{", { platformUserId: null }])("uses the raw native id with missing or malformed metadata %j", async meta => {
    const deps = setup(["facebook"]);
    deps.pool.execute.mockResolvedValueOnce([[{ platform: "facebook", accountId: "facebook-account", meta }]]);
    deps.client.listAnalytics.mockResolvedValueOnce(pageOf([externalPost("facebook")]));
    expect((await syncBrandZernioAnalytics(7, 120, deps)).platforms[0]).toMatchObject({ posts: 1, skipped: 0 });
    expect(deps.upsert.mock.calls[0]![1][0].entityId).toBe("456");
  });
  it("accepts a response without pagination as one page", async () => {
    const deps = setup(["instagram"]);
    deps.client.listAnalytics.mockResolvedValueOnce({ posts: [externalPost("instagram")] });
    expect((await syncBrandZernioAnalytics(7, 120, deps)).platforms[0]).toMatchObject({ posts: 1, skipped: 0 });
    expect(deps.client.listAnalytics).toHaveBeenCalledOnce();
  });
  it("counts rejected and throwing conversions as skipped while writing other posts in the same platform", async () => {
    const deps = setup(["facebook", "threads"]);
    const malformed = { ...externalPost("facebook"), content: { unexpected: true } } as unknown as ZernioAnalyticsPost;
    deps.client.listAnalytics.mockResolvedValueOnce(pageOf([
      externalPost("facebook"), malformed, { ...externalPost("facebook"), publishedAt: "invalid" },
      { ...externalPost("facebook"), platformPostId: "789" },
    ]));
    expect(await syncBrandZernioAnalytics(7, 120, deps)).toEqual({ platforms: [
      { platform: "facebook", posts: 2, tagged: 1, onbrand: 1, skipped: 2 },
      { platform: "threads", posts: 1, tagged: 0, onbrand: 0, skipped: 0 },
    ] });
    expect(deps.upsert.mock.calls[0]![1].map((fact: { entityId: string }) => fact.entityId)).toEqual(["456", "789"]);
    expect(deps.log).not.toHaveBeenCalled();
  });
  it("isolates API failure and logs a warning without raw errors or credentials", async () => {
    const deps = setup();
    const sensitive = randomUUID();
    deps.client.listAnalytics.mockRejectedValueOnce(new ZernioApiError(403, sensitive));
    const result = await syncBrandZernioAnalytics(7, 120, deps);
    expect(result.platforms[0]).toMatchObject({ platform: "facebook", posts: 0, tagged: 0, onbrand: 0, error: expect.stringContaining("403") });
    expect(result.platforms.slice(1).every(p => p.posts === 1 && !p.error)).toBe(true);
    expect(deps.log).toHaveBeenCalledWith(expect.objectContaining({ source: "zernio.analytics", level: "warn", meta: { brandId: 7, platform: "facebook" } }));
    expect(JSON.stringify([result, deps.log.mock.calls])).not.toContain(sensitive);
  });
  it("does not write an incomplete snapshot when a later page fails", async () => {
    const deps = setup(["instagram", "threads"]);
    deps.client.listAnalytics.mockResolvedValueOnce(pageOf([post("instagram")], 1, 2)).mockRejectedValueOnce(new Error("second page"));
    const result = await syncBrandZernioAnalytics(7, 120, deps);
    expect(result.platforms[0]?.error).toBeDefined();
    expect(deps.upsert).toHaveBeenCalledOnce();
    expect(deps.upsert.mock.calls[0]![1][0].source).toBe("threads_account");
  });
  it.each([false, true])("bootstraps an empty first sync once (still empty: %s)", async stillEmpty => {
    const deps = setup(["instagram"]);
    deps.client.listAnalytics.mockResolvedValueOnce(pageOf([])).mockResolvedValueOnce(pageOf(stillEmpty ? [] : [post("instagram")]));
    expect(await syncBrandZernioAnalytics(7, 120, deps)).toEqual({ platforms: [{ platform: "instagram", posts: stillEmpty ? 0 : 1, tagged: 0, onbrand: 0, skipped: 0 }] });
    expect(deps.client.syncExternalPosts).toHaveBeenCalledOnce();
    expect(deps.client.syncExternalPosts).toHaveBeenCalledWith({ accountId: "instagram-account" });
    expect(deps.client.listAnalytics).toHaveBeenCalledTimes(2);
    expect(deps.log).not.toHaveBeenCalled();
  });
  it("does not bootstrap a source that already has facts outside the requested period", async () => {
    const deps = setup(["instagram"], true);
    deps.client.listAnalytics.mockResolvedValue(pageOf([]));
    await syncBrandZernioAnalytics(7, 120, deps);
    expect(deps.pool.execute).toHaveBeenCalledWith("SELECT 1 FROM perf_facts WHERE brandId = ? AND source = ? LIMIT 1", [7, "ig_account"]);
    expect(deps.client.syncExternalPosts).not.toHaveBeenCalled();
  });
  it.each(["SOCIAL_PUBLISH_ENABLED", "ZERNIO_API_KEY"])("performs no IO when %s disables syncing", async variable => {
    vi.stubEnv(variable, variable === "SOCIAL_PUBLISH_ENABLED" ? "false" : "");
    const deps = setup();
    expect(zernioAnalyticsEnabled()).toBe(false);
    await expect(syncBrandZernioAnalytics(7, 120, deps)).rejects.toThrow("尚未啟用");
    await tickZernioAnalyticsSync(deps);
    expect(deps.pool.execute).not.toHaveBeenCalled();
    expect(deps.client.listAnalytics).not.toHaveBeenCalled();
  });
});

describe("Zernio analytics tick", () => {
  it("selects one overdue brand with a lens and supported connected account, using all four sources", async () => {
    const deps = { pool: { execute: vi.fn().mockResolvedValue([[{ brandId: 7 }]]) }, sync: vi.fn().mockResolvedValue({ platforms: [] }), log: vi.fn() };
    await tickZernioAnalyticsSync(deps);
    const [sql, params] = deps.pool.execute.mock.calls[0]!;
    for (const fragment of ["FROM perf_lenses", "provider = 'zernio'", "status = 'connected'", "platform IN (?, ?, ?, ?)", "MAX(f.updatedAt)", "f.source IN (?, ?, ?, ?)", "lastSync IS NULL OR lastSync < NOW() - INTERVAL 20 HOUR", "ORDER BY lastSync IS NOT NULL, lastSync", "LIMIT 1"]) expect(sql).toContain(fragment);
    expect(params).toEqual([...ZERNIO_ANALYTICS_PLATFORMS, ...Object.values(SOURCE_BY_PLATFORM)]);
    expect(deps.sync).toHaveBeenCalledOnce();
    expect(deps.sync).toHaveBeenCalledWith(7, 120, deps);
  });
  it("does nothing without an eligible brand, and releases its guard after a failure", async () => {
    const deps = { pool: { execute: vi.fn().mockResolvedValue([[]]) }, sync: vi.fn(), log: vi.fn() };
    await tickZernioAnalyticsSync(deps);
    expect(deps.sync).not.toHaveBeenCalled();
    deps.pool.execute.mockRejectedValueOnce(new Error("query failed"));
    await tickZernioAnalyticsSync(deps);
    expect(deps.log).toHaveBeenCalledWith(expect.objectContaining({ level: "warn" }));
    deps.pool.execute.mockResolvedValueOnce([[{ brandId: 8 }]]);
    await tickZernioAnalyticsSync(deps);
    expect(deps.sync).toHaveBeenCalledOnce();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flushBackground = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe("ensureFreshZernioAnalytics", () => {
  let brandId = 100;
  beforeEach(() => { brandId++; });
  it.each(["SOCIAL_PUBLISH_ENABLED", "ZERNIO_API_KEY"])("returns disabled without IO when %s is disabled", async variable => {
    vi.stubEnv(variable, variable === "SOCIAL_PUBLISH_ENABLED" ? "false" : "");
    const deps = setup();
    expect(await ensureFreshZernioAnalytics(brandId, deps)).toEqual({ started: false, reason: "disabled" });
    expect(deps.pool.execute).not.toHaveBeenCalled();
  });
  it.each([{ platforms: [] }, { platforms: ["youtube", "tiktok", "x"] }])("requires a supported Zernio connection: %j", async ({ platforms }) => {
    const deps = setup(platforms);
    expect(await ensureFreshZernioAnalytics(brandId, deps)).toEqual({ started: false, reason: "no_connection" });
    expect(deps.client.listAnalytics).not.toHaveBeenCalled();
    expect(deps.pool.execute).toHaveBeenCalledWith(expect.stringContaining("status = 'connected'"), [brandId, "zernio"]);
  });
  it("uses the latest update across the four sources, with a six-hour freshness window", async () => {
    const now = setup().now().getTime();
    expect(AUTO_SYNC_STALE_HOURS).toBe(6);
    const deps = setup(["threads"], false, new Date(now - 6 * 3_600_000 + 1));
    expect(await ensureFreshZernioAnalytics(brandId, deps)).toEqual({ started: false, reason: "fresh" });
    expect(deps.pool.execute).toHaveBeenCalledWith(
      "SELECT MAX(updatedAt) AS lastSync FROM perf_facts WHERE brandId = ? AND source IN (?, ?, ?, ?)",
      [brandId, ...Object.values(SOURCE_BY_PLATFORM)],
    );
    expect(deps.client.listAnalytics).not.toHaveBeenCalled();
  });
  it.each([null, "2026-10-07T11:00:00Z"])("starts without awaiting sync when last update is %s", async lastSync => {
    const deps = setup(["threads"], false, lastSync);
    const pending = deferred<ZernioAnalyticsPage>();
    deps.client.listAnalytics.mockReturnValueOnce(pending.promise);
    expect(await ensureFreshZernioAnalytics(brandId, deps)).toEqual({ started: true, reason: "started" });
    await vi.waitFor(() => expect(deps.client.listAnalytics).toHaveBeenCalledOnce());
    expect(deps.upsert).not.toHaveBeenCalled();
    expect(await ensureFreshZernioAnalytics(brandId, deps)).toEqual({ started: false, reason: "in_flight" });
    pending.resolve(pageOf([post("threads")]));
    await flushBackground();
    expect(deps.upsert).toHaveBeenCalledOnce();
  });
  it("starts only one sync for concurrent openings of the same brand", async () => {
    const deps = setup(["threads"]);
    const pending = deferred<ZernioAnalyticsPage>();
    deps.client.listAnalytics.mockReturnValue(pending.promise);
    const results = await Promise.all(Array.from({ length: 5 }, () => ensureFreshZernioAnalytics(brandId, deps)));
    expect(results.filter(r => r.reason === "started")).toHaveLength(1);
    expect(results.filter(r => r.reason === "in_flight")).toHaveLength(4);
    await vi.waitFor(() => expect(deps.client.listAnalytics).toHaveBeenCalledOnce());
    pending.resolve(pageOf([post("threads")]));
    await flushBackground();
  });
  it("throttles empty accounts for ten minutes, then permits another attempt", async () => {
    const deps = setup(["threads"]);
    let now = deps.now().getTime();
    deps.now = () => new Date(now);
    deps.client.listAnalytics.mockResolvedValue(pageOf([]));
    expect((await ensureFreshZernioAnalytics(brandId, deps)).reason).toBe("started");
    await flushBackground();
    now += 10 * 60_000 - 1;
    expect(await ensureFreshZernioAnalytics(brandId, deps)).toEqual({ started: false, reason: "fresh" });
    expect(deps.client.syncExternalPosts).toHaveBeenCalledOnce();
    now++;
    expect((await ensureFreshZernioAnalytics(brandId, deps)).reason).toBe("started");
    await flushBackground();
    expect(deps.client.syncExternalPosts).toHaveBeenCalledTimes(2);
  });
  it("clears in-flight state and safely logs a rejected background sync", async () => {
    const deps = setup(["threads"]);
    const execute = deps.pool.execute.getMockImplementation()!;
    let connectionReads = 0;
    deps.pool.execute.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM brand_publish_connections") && ++connectionReads % 2 === 0) throw new Error("private provider details");
      return execute(sql);
    });
    expect((await ensureFreshZernioAnalytics(brandId, deps)).reason).toBe("started");
    await flushBackground();
    expect(deps.log).toHaveBeenCalledWith(expect.objectContaining({ level: "warn", meta: { brandId } }));
    expect(JSON.stringify(deps.log.mock.calls)).not.toContain("private provider details");
    expect((await ensureFreshZernioAnalytics(brandId, deps)).reason).toBe("fresh");
    connectionReads = 0;
    deps.now = () => new Date("2026-10-07T17:10:00Z");
    expect((await ensureFreshZernioAnalytics(brandId, deps)).reason).toBe("started");
    await flushBackground();
  });
  it("tracks overlapping manual syncs without throttling them or clearing state early", async () => {
    const deps = setup(["threads"], false, "2026-10-07T17:00:00Z");
    const first = deferred<ZernioAnalyticsPage>(), second = deferred<ZernioAnalyticsPage>();
    deps.client.listAnalytics.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const one = syncBrandZernioAnalytics(brandId, 120, deps);
    const two = syncBrandZernioAnalytics(brandId, 120, deps);
    expect((await ensureFreshZernioAnalytics(brandId, deps)).reason).toBe("in_flight");
    await vi.waitFor(() => expect(deps.client.listAnalytics).toHaveBeenCalledTimes(2));
    first.resolve(pageOf([post("threads")]));
    await one;
    expect((await ensureFreshZernioAnalytics(brandId, deps)).reason).toBe("in_flight");
    second.resolve(pageOf([post("threads")]));
    await two;
    expect((await ensureFreshZernioAnalytics(brandId, deps)).reason).toBe("fresh");
  });
  it("does not block another brand or manual sync during the automatic cooldown", async () => {
    const deps = setup(["threads"]);
    expect((await ensureFreshZernioAnalytics(brandId, deps)).reason).toBe("started");
    await flushBackground();
    await syncBrandZernioAnalytics(brandId, 120, deps);
    expect((await ensureFreshZernioAnalytics(brandId + 1000, deps)).reason).toBe("started");
    await flushBackground();
    expect(deps.client.listAnalytics).toHaveBeenCalledTimes(3);
  });
});
