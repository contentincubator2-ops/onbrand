import { afterEach, describe, expect, it, vi } from "vitest";
import { fbSyncEnabled } from "./fbPageSync";
vi.mock("../../localDb", () => ({ default: { execute: vi.fn() } }));
afterEach(() => vi.unstubAllEnvs());
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
