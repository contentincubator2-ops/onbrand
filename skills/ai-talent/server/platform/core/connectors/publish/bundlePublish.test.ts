import { describe, expect, it } from "vitest";
import { buildBundlePostPayload, toBundlePlatform } from "./bundlePublish";

const POST_DATE = "2026-07-25T10:00:00.000Z";

describe("toBundlePlatform", () => {
  it("maps the platforms OnBrand publishes to", () => {
    expect(toBundlePlatform("facebook")).toBe("FACEBOOK");
    expect(toBundlePlatform("instagram")).toBe("INSTAGRAM");
    expect(toBundlePlatform("linkedin")).toBe("LINKEDIN");
  });

  it("returns undefined for platforms bundle.social publishing is not wired up for", () => {
    expect(toBundlePlatform("press")).toBeUndefined();
    expect(toBundlePlatform("email")).toBeUndefined();
  });
});

describe("buildBundlePostPayload", () => {
  it("builds a text-only Facebook post", () => {
    const payload = buildBundlePostPayload({
      teamId: "team_123",
      platform: "facebook",
      caption: "今天開賣",
      postDate: POST_DATE,
      referenceKey: "onbrand-42",
    });

    expect(payload).toEqual({
      teamId: "team_123",
      title: "今天開賣",
      postDate: POST_DATE,
      status: "SCHEDULED",
      socialAccountTypes: ["FACEBOOK"],
      data: { FACEBOOK: { type: "POST", text: "今天開賣" } },
      referenceKey: "onbrand-42",
    });
  });

  it("attaches uploads when media is present", () => {
    const payload = buildBundlePostPayload({
      teamId: "team_123",
      platform: "instagram",
      caption: "新品上市",
      uploadIds: ["upload_abc"],
      postDate: POST_DATE,
      referenceKey: "onbrand-43",
    });

    expect(payload.socialAccountTypes).toEqual(["INSTAGRAM"]);
    expect(payload.data).toEqual({
      INSTAGRAM: { type: "POST", text: "新品上市", uploadIds: ["upload_abc"] },
    });
  });

  it("rejects Instagram posts without media", () => {
    expect(() => buildBundlePostPayload({
      teamId: "team_123",
      platform: "instagram",
      caption: "純文字",
      postDate: POST_DATE,
      referenceKey: "onbrand-44",
    })).toThrow(/Instagram/);
  });

  it("rejects platforms that are not wired up", () => {
    expect(() => buildBundlePostPayload({
      teamId: "team_123",
      platform: "press",
      caption: "稿件",
      postDate: POST_DATE,
      referenceKey: "onbrand-45",
    })).toThrow(/press/);
  });

  it("derives a non-empty title from long captions without breaking the API limit", () => {
    const caption = "長".repeat(300);
    const payload = buildBundlePostPayload({
      teamId: "team_123",
      platform: "facebook",
      caption,
      postDate: POST_DATE,
      referenceKey: "onbrand-46",
    });

    expect(payload.title.length).toBeLessThanOrEqual(80);
    expect(payload.title.length).toBeGreaterThan(0);
    expect(payload.data.FACEBOOK?.text).toBe(caption);
  });

  it("keeps a usable title when the caption starts with blank lines", () => {
    const payload = buildBundlePostPayload({
      teamId: "team_123",
      platform: "facebook",
      caption: "\n\n  第一行\n第二行",
      postDate: POST_DATE,
      referenceKey: "onbrand-47",
    });

    expect(payload.title).toBe("第一行");
  });
});
