import { describe, expect, it } from "vitest";
import { toPublicUrl, toPublicUrls } from "./publicUrl";
import { PublishUserError } from "./publishAdapter";

describe("toPublicUrl", () => {
  it("站內相對路徑掛上 APP_URL，多餘的斜線去掉", () => {
    expect(toPublicUrl("/static/covers/a.jpg", "https://dev.onbrand.sowork.ai/")).toBe("https://dev.onbrand.sowork.ai/static/covers/a.jpg");
  });
  it("已是絕對網址就原樣回傳", () => {
    expect(toPublicUrl("https://cdn.example.com/x.png", "https://dev.onbrand.sowork.ai")).toBe("https://cdn.example.com/x.png");
  });
  it("相對路徑但沒有 https 的 APP_URL 要直接說清楚，不能丟相對路徑給供應商", () => {
    expect(() => toPublicUrl("/static/covers/a.jpg", undefined)).toThrow(PublishUserError);
    expect(() => toPublicUrl("/static/covers/a.jpg", "http://localhost:3001")).toThrow(PublishUserError);
  });
  it("多張圖一起轉", () => {
    expect(toPublicUrls(["/a.jpg", "https://b/c.jpg"], "https://x.y")).toEqual(["https://x.y/a.jpg", "https://b/c.jpg"]);
  });
});
