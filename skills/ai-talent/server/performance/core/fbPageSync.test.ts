import { afterEach, describe, expect, it, vi } from "vitest";
import { fbSyncEnabled, syncFbPage } from "./fbPageSync";
import localPool from "../../localDb";
import { upsertFacts } from "./perfStore";
vi.mock("../../localDb", () => ({ default: { execute: vi.fn() } }));
vi.mock("./perfStore", () => ({ upsertFacts: vi.fn().mockResolvedValue(1) }));
vi.mock("../../platform/core/connectors/pipedreamFacebook", () => ({
  probePipedreamFacebookAccounts: vi.fn().mockResolvedValue([]),
  findPipedreamFacebookPage: vi.fn().mockReturnValue({ page: { access_token: "test-page-token" } }),
}));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe("Facebook analytics provider gate", () => {
  it.each(["zernio", "bundle", "pipedream"])("uses the Facebook provider: %s", provider => {
    vi.stubEnv("SOCIAL_PUBLISH_ENABLED", "true");
    vi.stubEnv("PUBLISH_PROVIDER_FACEBOOK", provider);
    expect(fbSyncEnabled()).toBe(provider !== "zernio");
    vi.stubEnv("SOCIAL_PUBLISH_ENABLED", "false");
    expect(fbSyncEnabled()).toBe(false);
  });
  it("honors the global provider and per-platform override", () => {
    vi.stubEnv("SOCIAL_PUBLISH_ENABLED", "true");
    vi.stubEnv("PUBLISH_PROVIDER", "zernio");
    vi.stubEnv("PUBLISH_PROVIDER_FACEBOOK", "");
    expect(fbSyncEnabled()).toBe(false);
    vi.stubEnv("PUBLISH_PROVIDER_FACEBOOK", "pipedream");
    expect(fbSyncEnabled()).toBe(true);
  });
});

describe("Facebook fact origin", () => {
  it.each([false, true])("tags full ids, suffix ids and external posts independently of perfTags (broken metadata: %s)", async broken => {
    vi.stubEnv("SOCIAL_PUBLISH_ENABLED", "true");
    vi.stubEnv("PUBLISH_PROVIDER_FACEBOOK", "pipedream");
    for (const key of ["PIPEDREAM_CLIENT_ID", "PIPEDREAM_CLIENT_SECRET", "PIPEDREAM_PROJECT_ID"]) vi.stubEnv(key, "test-value");
    vi.mocked(localPool.execute).mockResolvedValueOnce([[{ fbPageId: "123", fbPageName: "Test page" }], []] as never)
      .mockResolvedValueOnce([[
        { externalPostId: "123_full", metadata: { perfTags: { ta: "owners", origin: "external" } } },
        { externalPostId: "suffix", metadata: null },
        { externalPostId: "123_empty", metadata: broken ? "{" : { perfTags: {} } },
        { externalPostId: "after", metadata: null },
      ], []] as never);
    const ids = ["123_full", "123_suffix", "123_empty", "123_after", "123_external"];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "test-token" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "test-account", app: { name_slug: "facebook_pages" } }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: ids.map(id => ({ id, created_time: "2026-10-07T17:00:00Z" })) })))
      .mockResolvedValueOnce(new Response(JSON.stringify({})));
    vi.stubGlobal("fetch", fetchMock);

    expect(await syncFbPage(7)).toMatchObject({ posts: 5, tagged: 1 });
    expect(upsertFacts).toHaveBeenCalledOnce();
    expect(vi.mocked(upsertFacts).mock.calls[0]![1].map(fact => ({ id: fact.entityId, tags: fact.tags }))).toEqual([
      { id: "123_full", tags: { ta: "owners", format: "status", origin: "onbrand" } },
      { id: "123_suffix", tags: { format: "status", origin: "onbrand" } },
      { id: "123_empty", tags: { format: "status", origin: "onbrand" } },
      { id: "123_after", tags: { format: "status", origin: "onbrand" } },
      { id: "123_external", tags: { format: "status", origin: "external" } },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
