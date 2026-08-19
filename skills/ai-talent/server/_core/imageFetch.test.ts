import { afterEach, describe, expect, it, vi } from "vitest";
import { assertIsUsableImageContentType, fetchImageBuffer, probeImageUrl } from "./imageFetch";

vi.mock("./urlGuard", () => ({ assertUrlSafe: vi.fn(async (url: string) => new URL(url)) }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("image response validation", () => {
  it("accepts a real raster image and preserves its mime type", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
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

  it("rejects HTML bytes even when the server lies with image/jpeg", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>store home</html>", {
      status: 200,
      headers: { "content-type": "image/jpeg" },
    })));

    await expect(fetchImageBuffer("https://example.com/fake.jpg"))
      .rejects.toThrow("內容不是可辨識的點陣圖片");
    await expect(probeImageUrl("https://example.com/fake.jpg"))
      .resolves.toBe(false);
  });

  it("uses one shrinking timeout budget across redirects", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: "https://example.com/final.png" },
      }))
      .mockResolvedValueOnce(new Response(png, {
        status: 200,
        headers: { "content-type": "image/png" },
      }));
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout")
      .mockImplementation(() => new AbortController().signal);
    const nowSpy = vi.spyOn(Date, "now")
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_100)
      .mockReturnValueOnce(1_400);
    vi.stubGlobal("fetch", fetchMock);

    await expect(probeImageUrl("https://example.com/start", 1_000)).resolves.toBe(true);

    expect(timeoutSpy.mock.calls.map(([ms]) => ms)).toEqual([900, 600]);
    nowSpy.mockRestore();
    timeoutSpy.mockRestore();
  });
});
