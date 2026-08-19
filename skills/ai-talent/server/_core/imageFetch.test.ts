import { afterEach, describe, expect, it, vi } from "vitest";
import { assertIsUsableImageContentType, fetchImageBuffer } from "./imageFetch";

vi.mock("./urlGuard", () => ({ assertUrlSafe: vi.fn(async (url: string) => new URL(url)) }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("image response validation", () => {
  it("accepts a real raster image and preserves its mime type", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes, {
      status: 200,
      headers: { "content-type": "image/png; charset=binary" },
    })));

    const result = await fetchImageBuffer("https://example.com/product.png");

    expect(result.mime).toBe("image/png");
    expect(result.buffer).toEqual(Buffer.from(bytes));
  });

  it("rejects a retired image URL that redirects to an HTML page", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 301,
        headers: { location: "https://example.com/home" },
      }))
      .mockResolvedValueOnce(new Response("<html>home</html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchImageBuffer("https://example.com/old-product.png"))
      .rejects.toThrow("產品圖片連結已失效");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects SVG even though it uses an image content type", () => {
    expect(() => assertIsUsableImageContentType("image/svg+xml"))
      .toThrow("產品圖片連結已失效");
  });
});
