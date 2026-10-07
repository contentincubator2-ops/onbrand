import { describe, expect, it } from "vitest";
import { getPublishProvider } from "./publishProvider";

describe("getPublishProvider", () => {
  it("defaults to pipedream when nothing is configured", () => {
    expect(getPublishProvider("facebook", {})).toBe("pipedream");
  });

  it("honours the global switch", () => {
    expect(getPublishProvider("facebook", { PUBLISH_PROVIDER: "bundle" })).toBe("bundle");
  });

  it("lets a per-platform switch override the global one", () => {
    expect(getPublishProvider("facebook", {
      PUBLISH_PROVIDER: "pipedream",
      PUBLISH_PROVIDER_FACEBOOK: "bundle",
    })).toBe("bundle");
    expect(getPublishProvider("linkedin", {
      PUBLISH_PROVIDER: "bundle",
      PUBLISH_PROVIDER_LINKEDIN: "pipedream",
    })).toBe("pipedream");
  });

  it("falls back to pipedream for blank or unrecognised values", () => {
    expect(getPublishProvider("facebook", { PUBLISH_PROVIDER: "   " })).toBe("pipedream");
    expect(getPublishProvider("facebook", { PUBLISH_PROVIDER: "ayrshare" })).toBe("pipedream");
  });

  it("ignores casing and surrounding whitespace", () => {
    expect(getPublishProvider("facebook", { PUBLISH_PROVIDER_FACEBOOK: " BUNDLE " })).toBe("bundle");
    expect(getPublishProvider("FaceBook", { PUBLISH_PROVIDER_FACEBOOK: "bundle" })).toBe("bundle");
  });
});

it("accepts zernio globally and isolates a YouTube override", () => {
  expect(getPublishProvider("facebook", { PUBLISH_PROVIDER: "zernio" })).toBe("zernio");
  expect(getPublishProvider("youtube", { PUBLISH_PROVIDER_YOUTUBE: " ZERNIO " })).toBe("zernio");
  expect(getPublishProvider("facebook", { PUBLISH_PROVIDER_YOUTUBE: "zernio" })).toBe("pipedream");
});
