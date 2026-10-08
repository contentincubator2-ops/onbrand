import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyticsFact, analyticsFormatOf, syncBrandZernioAnalytics, tickZernioAnalyticsSync,
  zernioAnalyticsEnabled, ZERNIO_ANALYTICS_PLATFORMS, SOURCE_BY_PLATFORM, type AnalyticsPlatform } from "./zernioAnalyticsSync";
import { ZernioApiError, type ZernioAnalyticsPost } from "../../platform/core/connectors/zernio";
import { ownTagsFor } from "./ownTags";

vi.mock("../../localDb", () => ({ default: { execute: vi.fn() } }));

const metrics = { likes: 10, comments: 3, shares: 2, reach: 90, impressions: 100, views: 80, saves: 4, clicks: 1 };
function post(platform: AnalyticsPlatform, overrides: Partial<ZernioAnalyticsPost> = {}): ZernioAnalyticsPost {
  return { postId: "provider-post-id", content: "  Hello\n world  ", publishedAt: "2026-10-07T17:00:00Z",
    mediaType: "image", analytics: { likes: 9999 },
    platformAnalytics: [{ platform, accountId: `${platform}-account`, status: "published",
      platformPostId: platform === "facebook" ? "123_456" : `${platform}-native`,
      platformPostUrl: "https://example.com/post", analytics: metrics }], ...overrides };
}
const pageOf = (posts: ZernioAnalyticsPost[], page = 1, pages = 1) => ({ posts, pagination: { page, pages, total: posts.length, limit: 100 } });
function setup(platforms: string[] = [...ZERNIO_ANALYTICS_PLATFORMS], existing = false) {
  const pool = { execute: vi.fn().mockImplementation(async (sql: string) => {
    if (sql.includes("FROM brand_publish_connections")) return [platforms.map(platform => ({ platform, accountId: `${platform}-account` }))];
    if (sql.includes("FROM scheduled_posts")) return [[{ externalPostId: "456", metadata: JSON.stringify({ perfTags: { ta: "owners" } }) }]];
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
  it.each(ZERNIO_ANALYTICS_PLATFORMS)("converts %s with native id, Taipei day and own tags", platform => {
    const id = platform === "facebook" ? "123_456" : `${platform}-native`;
    const result = analyticsFact(post(platform), platform, `${platform}-account`, { [id]: { ta: "owners", format: "old" } });
    expect(result).toEqual({ tagged: true, fact: {
      source: SOURCE_BY_PLATFORM[platform], entityType: "post", entityId: id, entityLabel: "Hello world",
      text: "  Hello\n world  ", date: "2026-10-08", permalink: "https://example.com/post",
      tags: { ta: "owners", format: "image" },
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
    const result = analyticsFact(p, "facebook", "facebook-account", { "456": { ta: "owners" } });
    expect(result?.fact.metrics.reactions).toBe(10);
    expect(result?.fact.tags).toEqual({ ta: "owners", format: "image" });
    expect(result?.tagged).toBe(true);
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
  it.each(["https://www.facebook.com/123/posts/456", "https://www.facebook.com/permalink.php?story_fbid=456&id=123"])("restores the Facebook composite id from %s", permalink => {
    const p = post("facebook");
    Object.assign(p.platformAnalytics![0]!, { platformPostId: "456", platformPostUrl: permalink });
    expect(analyticsFact(p, "facebook", "facebook-account")?.fact.entityId).toBe("123_456");
  });
  it("refuses to fabricate a Facebook page id from a Zernio account id", () => {
    const p = post("facebook");
    p.platformAnalytics![0]!.platformPostId = "456";
    expect(() => analyticsFact(p, "facebook", "facebook-account")).toThrow("完整原生 id");
  });
  it("loads tags despite one malformed metadata row", async () => {
    const pool = { execute: vi.fn().mockResolvedValue([[{ externalPostId: "bad", metadata: "{" },
      { externalPostId: "native", metadata: { perfTags: { ta: "owners", bad: 2 } } }]]) };
    expect(await ownTagsFor(7, pool)).toEqual({ native: { ta: "owners" } });
    expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining("sp.brandId = ?"), [7]);
  });
});

describe("Zernio brand sync", () => {
  it("syncs only the four supported connections with dates, source=all and own tags", async () => {
    const deps = setup([...ZERNIO_ANALYTICS_PLATFORMS, "youtube", "tiktok", "x"]);
    expect(await syncBrandZernioAnalytics(7, 120, deps)).toEqual({ platforms: ZERNIO_ANALYTICS_PLATFORMS.map(platform => ({ platform, posts: 1, tagged: platform === "facebook" ? 1 : 0 })) });
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
  it("isolates API failure and logs a warning without raw errors or credentials", async () => {
    const deps = setup();
    const sensitive = randomUUID();
    deps.client.listAnalytics.mockRejectedValueOnce(new ZernioApiError(403, sensitive));
    const result = await syncBrandZernioAnalytics(7, 120, deps);
    expect(result.platforms[0]).toMatchObject({ platform: "facebook", posts: 0, tagged: 0, error: expect.stringContaining("403") });
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
    expect(await syncBrandZernioAnalytics(7, 120, deps)).toEqual({ platforms: [{ platform: "instagram", posts: stillEmpty ? 0 : 1, tagged: 0 }] });
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
