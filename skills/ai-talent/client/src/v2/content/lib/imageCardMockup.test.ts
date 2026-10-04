import { describe, expect, it } from "vitest";
import { imageCardMockup } from "./imageCardMockup";

describe("imageCardMockup", () => {
  it("maps each channel to a mockup that renders the image", () => {
    expect(imageCardMockup("fb-img-feed-portrait", "facebook").label).toBe("facebook:feed");
    expect(imageCardMockup("fb-ad-story", "facebook").label).toBe("facebook:story");
    expect(imageCardMockup("fb-img-reels-cover", "facebook").label).toBe("facebook:reel");
    expect(imageCardMockup("ig-img-story", "instagram").label).toBe("instagram:story");
    expect(imageCardMockup("ig-ad-story-carousel", "instagram", 3).label).toBe("instagram:story");
    expect(imageCardMockup("ig-img-carousel", "instagram", 3).label).toBe("instagram:carousel");
    // 輪播卡只做了一張時，照單張貼文預覽。
    expect(imageCardMockup("ig-img-carousel", "instagram", 1).label).toBe("instagram:feed");
    expect(imageCardMockup("threads-img-portrait", "threads").label).toBe("threads:post");
    expect(imageCardMockup("line-img-richmenu-large", "line").label).toBe("line:broadcast");
    expect(imageCardMockup("tt-img-photo", "tiktok", 4).label).toBe("tiktok:carousel");
    expect(imageCardMockup("email-img-hero", "email").label).toBe("email:edm");
    expect(imageCardMockup("web-img-og", "website").label).toBe("web:blog");
  });
});
