import { describe, expect, it } from "vitest";
import { buildBundlePostPayload, BundlePublishUserError, toBundlePlatform } from "./bundlePublish";

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

describe("new platforms and media shapes", () => {
  const base = { teamId: "t", postDate: POST_DATE, referenceKey: "k" };

  it("maps Threads and X aliases", () => {
    expect(toBundlePlatform("threads")).toBe("THREADS");
    expect(toBundlePlatform("x")).toBe("TWITTER");
    expect(toBundlePlatform("Twitter")).toBe("TWITTER");
  });

  it("Threads and X carry no `type` field and allow text-only", () => {
    const th = buildBundlePostPayload({ ...base, platform: "threads", caption: "hi" });
    expect(th.socialAccountTypes).toEqual(["THREADS"]);
    expect(th.data).toEqual({ THREADS: { text: "hi" } });
    const x = buildBundlePostPayload({ ...base, platform: "x", caption: "hi", uploadIds: ["u1", "u2"] });
    expect(x.data).toEqual({ TWITTER: { text: "hi", uploadIds: ["u1", "u2"] } });
  });

  it("enforces per-platform caption limits instead of truncating", () => {
    expect(() => buildBundlePostPayload({ ...base, platform: "threads", caption: "a".repeat(501) })).toThrow(/500/);
    expect(() => buildBundlePostPayload({ ...base, platform: "x", caption: "a".repeat(281) })).toThrow(/280/);
    expect(() => buildBundlePostPayload({ ...base, platform: "instagram", caption: "a".repeat(2001), uploadIds: ["u"] })).toThrow(/2000/);
    expect(() => buildBundlePostPayload({ ...base, platform: "x", caption: "a".repeat(280) })).not.toThrow();
  });

  it("X: max 4 images, or one video, never mixed", () => {
    expect(() => buildBundlePostPayload({ ...base, platform: "x", caption: "c", uploadIds: ["1", "2", "3", "4", "5"] })).toThrow(/4/);
    expect(() => buildBundlePostPayload({ ...base, platform: "x", caption: "c", uploadIds: ["1"], videoUploadIds: ["v"] })).toThrow(/無法混合/);
    const p = buildBundlePostPayload({ ...base, platform: "x", caption: "c", videoUploadIds: ["v"] });
    expect(p.data.TWITTER?.uploadIds).toEqual(["v"]);
  });

  it("Instagram: 2+ images become a carousel with carouselItems", () => {
    const p = buildBundlePostPayload({ ...base, platform: "instagram", caption: "c", uploadIds: ["a", "b", "c"] });
    expect(p.data.INSTAGRAM).toEqual({
      type: "POST", text: "c", uploadIds: ["a", "b", "c"],
      carouselItems: [{ uploadId: "a" }, { uploadId: "b" }, { uploadId: "c" }],
    });
  });

  it("Instagram: a single video is a REEL; more than 10 items is rejected", () => {
    const p = buildBundlePostPayload({ ...base, platform: "instagram", caption: "c", videoUploadIds: ["v"] });
    expect(p.data.INSTAGRAM).toEqual({ type: "REEL", text: "c", uploadIds: ["v"] });
    expect(() => buildBundlePostPayload({
      ...base, platform: "instagram", caption: "c", uploadIds: Array.from({ length: 11 }, (_, i) => `u${i}`),
    })).toThrow(/10/);
  });

  it("Facebook: multi-image ok, video alone ok, mixing and >1 video rejected", () => {
    const multi = buildBundlePostPayload({ ...base, platform: "facebook", caption: "c", uploadIds: ["a", "b"] });
    expect(multi.data.FACEBOOK).toEqual({ type: "POST", text: "c", uploadIds: ["a", "b"] });
    const vid = buildBundlePostPayload({ ...base, platform: "facebook", caption: "c", videoUploadIds: ["v"] });
    expect(vid.data.FACEBOOK?.uploadIds).toEqual(["v"]);
    expect(() => buildBundlePostPayload({ ...base, platform: "facebook", caption: "c", uploadIds: ["a"], videoUploadIds: ["v"] })).toThrow(/混合/);
    expect(() => buildBundlePostPayload({ ...base, platform: "facebook", caption: "c", videoUploadIds: ["v", "w"] })).toThrow(/1 支影片/);
  });

  it("LinkedIn: multi-image and video are clearly unsupported, not silently dropped", () => {
    expect(() => buildBundlePostPayload({ ...base, platform: "linkedin", caption: "c", uploadIds: ["a", "b"] })).toThrow(/LinkedIn/);
    expect(() => buildBundlePostPayload({ ...base, platform: "linkedin", caption: "c", videoUploadIds: ["v"] })).toThrow(/LinkedIn/);
  });

  it("errors are bilingual and flagged as user-fixable", () => {
    let caught: any;
    try { buildBundlePostPayload({ ...base, platform: "x", caption: "a".repeat(300) }); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(BundlePublishUserError);
    expect(caught.message).toMatch(/[一-鿿].* \/ [A-Za-z]/);
  });
});
