import { describe, it, expect } from "vitest";
import { extForMime, validateUploadedImage, MAX_UPLOAD_BYTES } from "./assetPhotos";

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0]);

describe("assetPhotos · validateUploadedImage", () => {
  it("accepts a real PNG and reports its mime", () => {
    const r = validateUploadedImage(PNG_HEADER) as { mime: string };
    expect(r.mime).toBe("image/png");
  });

  it("accepts a real JPEG", () => {
    const r = validateUploadedImage(JPEG_HEADER) as { mime: string };
    expect(r.mime).toBe("image/jpeg");
  });

  it("rejects an empty buffer", () => {
    const r = validateUploadedImage(Buffer.alloc(0)) as { error: string };
    expect(r.error).toContain("空");
  });

  it("rejects bytes that aren't a recognizable image (e.g. a renamed .txt)", () => {
    const r = validateUploadedImage(Buffer.from("not an image, just text")) as { error: string };
    expect(r.error).toContain("圖片格式");
  });

  it("rejects a file over the size cap", () => {
    const big = Buffer.concat([PNG_HEADER, Buffer.alloc(MAX_UPLOAD_BYTES + 1)]);
    const r = validateUploadedImage(big) as { error: string };
    expect(r.error).toContain("過大");
  });

  it("accepts a file exactly at the cap", () => {
    const exact = Buffer.concat([PNG_HEADER, Buffer.alloc(MAX_UPLOAD_BYTES - PNG_HEADER.length)]);
    const r = validateUploadedImage(exact) as { mime: string };
    expect(r.mime).toBe("image/png");
  });
});

describe("assetPhotos · extForMime", () => {
  it("maps known raster mimes to their extension", () => {
    expect(extForMime("image/png")).toBe(".png");
    expect(extForMime("image/jpeg")).toBe(".jpg");
    expect(extForMime("image/webp")).toBe(".webp");
  });

  it("falls back to .bin for an unmapped mime rather than throwing", () => {
    expect(extForMime("image/x-made-up")).toBe(".bin");
  });
});
