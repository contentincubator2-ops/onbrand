import { describe, expect, it, vi } from "vitest";
import { publishViaBundleSocial } from "./bundlePublishService";

const NOW = new Date("2026-07-25T10:00:00.000Z");

function deps(overrides: {
  teamId?: string | null;
  post?: any;
  upload?: { id: string };
} = {}) {
  const createPost = vi.fn().mockResolvedValue(overrides.post ?? {
    id: "post_1",
    status: "SCHEDULED",
    externalData: { FACEBOOK: { id: "123_456", permalink: "https://facebook.com/123_456" } },
  });
  const uploadFromUrl = vi.fn().mockResolvedValue(overrides.upload ?? { id: "upload_abc" });
  const getBundleTeamId = vi.fn().mockResolvedValue(
    overrides.teamId === undefined ? "team_abc" : overrides.teamId,
  );
  return {
    client: { createPost, uploadFromUrl } as any,
    getBundleTeamId,
    createPost,
    uploadFromUrl,
  };
}

describe("publishViaBundleSocial", () => {
  it("refuses to publish when the brand has not connected the platform", async () => {
    const d = deps({ teamId: null });

    await expect(publishViaBundleSocial(
      { brandId: 2958, platform: "facebook", caption: "hi", referenceKey: "onbrand-1", now: NOW },
      d,
    )).rejects.toThrow(/尚未連接/);

    expect(d.createPost).not.toHaveBeenCalled();
  });

  it("publishes a text-only Facebook post without touching the upload API", async () => {
    const d = deps();

    const result = await publishViaBundleSocial(
      { brandId: 2958, platform: "facebook", caption: "今天開賣", referenceKey: "onbrand-1", now: NOW },
      d,
    );

    expect(d.uploadFromUrl).not.toHaveBeenCalled();
    expect(d.createPost).toHaveBeenCalledWith(expect.objectContaining({
      teamId: "team_abc",
      postDate: NOW.toISOString(),
      socialAccountTypes: ["FACEBOOK"],
      referenceKey: "onbrand-1",
    }));
    expect(result).toEqual({ postId: "123_456", permalink: "https://facebook.com/123_456" });
  });

  it("registers the image before creating an Instagram post", async () => {
    const d = deps({
      post: {
        id: "post_2",
        status: "SCHEDULED",
        externalData: { INSTAGRAM: { id: "ig_1", permalink: "https://instagram.com/p/ig_1" } },
      },
    });

    const result = await publishViaBundleSocial(
      {
        brandId: 2958,
        platform: "instagram",
        caption: "新品",
        imageUrl: "https://cdn.example.com/a.jpg",
        referenceKey: "onbrand-2",
        now: NOW,
      },
      d,
    );

    expect(d.uploadFromUrl).toHaveBeenCalledWith({
      teamId: "team_abc",
      url: "https://cdn.example.com/a.jpg",
    });
    expect(d.createPost.mock.calls[0]![0].data.INSTAGRAM.uploadIds).toEqual(["upload_abc"]);
    expect(result.permalink).toBe("https://instagram.com/p/ig_1");
  });

  it("treats a platform error in the response as a failure", async () => {
    const d = deps({
      post: {
        id: "post_3",
        status: "ERROR",
        errors: { FACEBOOK: "Page token expired" },
      },
    });

    await expect(publishViaBundleSocial(
      { brandId: 2958, platform: "facebook", caption: "hi", referenceKey: "onbrand-3", now: NOW },
      d,
    )).rejects.toThrow(/Page token expired/);
  });

  it("still succeeds when the platform returns no permalink", async () => {
    const d = deps({ post: { id: "post_4", status: "SCHEDULED" } });

    const result = await publishViaBundleSocial(
      { brandId: 2958, platform: "facebook", caption: "hi", referenceKey: "onbrand-4", now: NOW },
      d,
    );

    expect(result).toEqual({ postId: null, permalink: null });
  });
});
