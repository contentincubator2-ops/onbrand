import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertIsUsableImageContentType, fetchImageBuffer, isLocalUploadPath, probeImageUrl } from "./imageFetch";

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

// 2026-09-22（CJ「右方缺乏了用產品圖生圖的選項」）：用戶上傳的照片是相對路徑，要直接從本機硬碟讀。
describe("uploaded product photos (relative /static/asset-photos paths)", () => {
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "assetphotos-"));
    mkdirSync(join(dir, "product", "261"), { recursive: true });
    writeFileSync(join(dir, "product", "261", "abc-123.png"), PNG);
    writeFileSync(join(dir, "product", "261", "notimage.png"), "<html>nope</html>");
    vi.stubEnv("ASSET_PHOTO_DIR", dir);
    vi.stubEnv("ASSET_PHOTO_URL_PREFIX", "/static/asset-photos");
  });
  afterEach(() => { vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });

  it("recognises only our own upload path shape", () => {
    expect(isLocalUploadPath("/static/asset-photos/product/261/abc-123.png")).toBe(true);
    expect(isLocalUploadPath("/static/asset-photos/brand/7/x.webp")).toBe(true);
    for (const bad of [
      "https://example.com/static/asset-photos/product/261/abc-123.png", // 別的主機
      "/static/asset-photos/product/261/../../secret.png",
      "/static/asset-photos/product/261/..",
      "/static/asset-photos/other/261/a.png",
      "/static/asset-photos/product/abc/a.png",
      "/static/asset-photos/product/261/sub/a.png",
      "/etc/passwd", "", null, undefined,
    ]) expect(isLocalUploadPath(bad as any)).toBe(false);
  });

  it("reads the file from disk without any network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchImageBuffer("/static/asset-photos/product/261/abc-123.png");
    expect(r.mime).toBe("image/png");
    expect(r.buffer).toEqual(PNG);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("probe: true for a real image, false for a non-image or a missing file — still no network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await probeImageUrl("/static/asset-photos/product/261/abc-123.png")).toBe(true);
    expect(await probeImageUrl("/static/asset-photos/product/261/notimage.png")).toBe(false);
    expect(await probeImageUrl("/static/asset-photos/product/261/gone.png")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a missing or non-image upload is reported as an invalid photo, not a crash", async () => {
    await expect(fetchImageBuffer("/static/asset-photos/product/261/gone.png")).rejects.toThrow("產品圖片連結已失效");
    await expect(fetchImageBuffer("/static/asset-photos/product/261/notimage.png")).rejects.toThrow("產品圖片連結已失效");
  });
});
