import { describe, expect, it } from "vitest";
import { getPublishProvider } from "./publishProvider";

describe("getPublishProvider", () => {
  // Historical provider values must never reactivate a removed publishing path.
  it.each([undefined, "", "   ", "pipedream", "bundle", "zernio", "unknown", " BUNDLE "])("ignores legacy environment value %s", value => {
    for (const platform of ["facebook", "instagram", "linkedin", "threads", "youtube", "tiktok", "x", "unknown"]) {
      expect(getPublishProvider(platform, {})).toBe("zernio");
      expect(getPublishProvider(platform, { PUBLISH_PROVIDER: value })).toBe("zernio");
      expect(getPublishProvider(platform, { PUBLISH_PROVIDER: "bundle", [`PUBLISH_PROVIDER_${platform.toUpperCase()}`]: value })).toBe("zernio");
    }
  });
});
