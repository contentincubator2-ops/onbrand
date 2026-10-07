import { describe, expect, it } from "vitest";
import { PublishUserError } from "./publishAdapter";
import { assertZernioMediaPlan, buildZernioPostPayload, readZernioPublishResult, toZernioPlatform, youtubeTitleFromCaption } from "./zernioPublish";

describe("Zernio publish functions", () => {
  it.each([["fb", "facebook"], ["ig", "instagram"], ["li", "linkedin"], ["yt", "youtube"], ["tt", "tiktok"], ["x", "twitter"], ["THREADS", "threads"], ["twitter", "twitter"], ["unknown", undefined]])("maps %s", (input, expected) => {
    expect(toZernioPlatform(input!)).toBe(expected);
  });
  it.each(["instagram", "youtube", "tiktok"])("rejects missing media for %s", platform => {
    expect(() => assertZernioMediaPlan(platform, "hello", 0, 0)).toThrow(PublishUserError);
  });
  it("checks required video and Unicode caption boundaries", () => {
    for (const platform of ["youtube", "tiktok"]) {
      expect(() => assertZernioMediaPlan(platform, "hello", 1, 0)).toThrow(PublishUserError);
      expect(() => assertZernioMediaPlan(platform, "hello", 0, 1)).not.toThrow();
    }
    expect(() => assertZernioMediaPlan("instagram", "", 1, 0)).not.toThrow();
    expect(() => assertZernioMediaPlan("threads", "😀".repeat(500), 0, 0)).not.toThrow();
    expect(() => assertZernioMediaPlan("threads", "文".repeat(501), 0, 0)).toThrow(PublishUserError);
    expect(() => assertZernioMediaPlan("x", "x".repeat(281), 0, 0)).toThrow(PublishUserError);
  });
  it("builds minimal image/video payloads and platform options", () => {
    const input = { platform: "facebook", accountId: "a", caption: "hello", imageUrls: ["https://example.com/a.jpg"], videoUrl: null };
    expect(buildZernioPostPayload(input)).toEqual({ content: "hello", mediaItems: [{ type: "image", url: input.imageUrls[0] }], platforms: [{ platform: "facebook", accountId: "a" }], publishNow: true });
    expect(buildZernioPostPayload({ ...input, platform: "x" }).platforms[0]?.platform).toBe("twitter");
    for (const platform of ["youtube", "tiktok"]) {
      const result = buildZernioPostPayload({ ...input, platform, imageUrls: [], videoUrl: "https://example.com/a.mp4" });
      expect(result.mediaItems).toEqual([{ type: "video", url: "https://example.com/a.mp4" }]);
      expect(result.platforms[0]?.platformSpecificData).toEqual(platform === "youtube"
        ? { title: "hello", visibility: "public" } : { privacyLevel: "PUBLIC_TO_EVERYONE", allowComment: true });
    }
  });
  it("uses the first nonblank non-hashtag line, capped at 100 code points", () => {
    expect(youtubeTitleFromCaption("\n #hashtag\n The title\nrest")).toBe("The title");
    expect(youtubeTitleFromCaption("#only")).toBe("onBrand Studio post");
    expect(Array.from(youtubeTitleFromCaption("😀".repeat(101)))).toHaveLength(100);
  });
  const success = { post: { status: "published", platforms: [{ platform: "twitter", status: "published", platformPostId: "p", platformPostUrl: "https://example.com/p" }] } };
  it.each([200, 201])("accepts published target for HTTP %i", httpStatus => {
    expect(readZernioPublishResult({ httpStatus, body: success, platform: "x" })).toEqual({ postId: "p", permalink: "https://example.com/p" });
  });
  it("never accepts partial, failed, publishing or a missing target", () => {
    for (const status of ["partial", "failed", "publishing"]) {
      expect(() => readZernioPublishResult({ httpStatus: 201, body: { post: { status, platforms: [{ platform: "twitter", status, error: "target failure" }] } }, platform: "x" })).toThrow("target failure");
    }
    expect(() => readZernioPublishResult({ httpStatus: 201, body: success, platform: "facebook" })).toThrow();
    expect(() => readZernioPublishResult({ httpStatus: 207, body: success, platform: "x" })).toThrow();
  });
  it("uses platformResults error before target error before body error/message", () => {
    const input = { httpStatus: 207, platform: "x", body: { ...success, error: "body error", message: "body message", platformResults: [{ platform: "facebook", error: "wrong target" }, { platform: "twitter", error: "result failure" }] } };
    expect(() => readZernioPublishResult(input)).toThrow("result failure");
    expect(() => readZernioPublishResult({ ...input, body: { error: "body error", message: "body message" } })).toThrow("body error");
    expect(() => readZernioPublishResult({ ...input, body: { message: "body message" } })).toThrow("body message");
  });
});
