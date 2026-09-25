import { describe, expect, it } from "vitest";
import { isDisplayableImageUrl, pickProductImageUrl } from "./productImage";

// 2026-09-25：這組測試釘住那個實際發生過的 bug——使用者上傳的主圖是根相對路徑，
// 舊的 /^https?:\/\// 篩選會把它濾掉，列表就一直說「尚無圖片」。
describe("isDisplayableImageUrl", () => {
  it("收絕對網址與上傳的根相對路徑", () => {
    expect(isDisplayableImageUrl("https://cdn.example.com/a.png")).toBe(true);
    expect(isDisplayableImageUrl("http://example.com/a.png")).toBe(true);
    expect(isDisplayableImageUrl("/static/asset-photos/product/261/abc.png")).toBe(true);
  });

  it("不收空值、非字串、協定相對網址與可執行的 scheme", () => {
    for (const v of ["", "   ", null, undefined, 3, {}, "//evil.example.com/a.png", "javascript:alert(1)", "data:image/png;base64,AAA"]) {
      expect(isDisplayableImageUrl(v as any), String(v)).toBe(false);
    }
  });
});

describe("pickProductImageUrl", () => {
  it("上傳主圖（相對路徑）挑得到——這就是原本壞掉的那條路", () => {
    const positioning = JSON.stringify({ imageUrl: "/static/asset-photos/product/261/primary.png" });
    expect(pickProductImageUrl(positioning)).toBe("/static/asset-photos/product/261/primary.png");
  });

  it("依序 fallback：imageUrl → _interim → images → _assets.photos → legacy 欄位", () => {
    expect(pickProductImageUrl({ _interim: { image: "https://a/1.png" } })).toBe("https://a/1.png");
    expect(pickProductImageUrl({ images: ["https://a/2.png"] })).toBe("https://a/2.png");
    expect(pickProductImageUrl({ _assets: { photos: [{ url: "/static/asset-photos/product/9/x.webp" }] } }))
      .toBe("/static/asset-photos/product/9/x.webp");
    expect(pickProductImageUrl({}, "https://a/legacy.png")).toBe("https://a/legacy.png");
  });

  it("前面的欄位是垃圾時會跳過，不會整支放棄", () => {
    expect(pickProductImageUrl({ imageUrl: "", image: null, images: [42], _interim: { imageUrl: "https://a/ok.png" } }))
      .toBe("https://a/ok.png");
  });

  it("positioning 是壞掉的 JSON 或 null 時回 undefined，不要爆", () => {
    expect(pickProductImageUrl("{not json")).toBeUndefined();
    expect(pickProductImageUrl(null)).toBeUndefined();
  });
});
