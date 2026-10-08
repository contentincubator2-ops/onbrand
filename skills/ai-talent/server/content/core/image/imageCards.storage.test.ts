import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { PlatformImageSpec } from "../../../platform/core/media/platformImageSpecs";

const { put, generate, fetchImage } = vi.hoisted(() => ({ put: vi.fn(), generate: vi.fn(), fetchImage: vi.fn() }));
vi.mock("../../../platform/core/media/mediaStore", async (original) => ({
  ...await original<typeof import("../../../platform/core/media/mediaStore")>(),
  getMediaStore: () => ({ put }),
}));
vi.mock("../../../platform/core/media/stillImageModels", async (original) => ({
  ...await original<typeof import("../../../platform/core/media/stillImageModels")>(),
  generateStillImage: generate,
}));
vi.mock("../../../platform/core/media/imageFetch", () => ({ fetchImageBuffer: fetchImage }));
import { fitPhotoToCard, renderImageCard, saveTitledImage, solidBackgroundForCard } from "./imageCards";

const publicUrl = "https://media.example.com/onbrand-media/covers/final.png";
const spec = { id: "storage-test", width: 32, height: 32, format: "png", compositionEn: "centered" } as PlatformImageSpec;
let png: Buffer;
beforeEach(async () => {
  vi.resetAllMocks();
  put.mockResolvedValue(publicUrl);
  png = await sharp({ create: { width: 32, height: 32, channels: 3, background: "white" } }).png().toBuffer();
});

describe("image cards media store", () => {
  it.each(["titled", "photo", "solid", "render"])("persists %s outputs through the store", async (operation) => {
    generate.mockResolvedValue({ status: "ready", url: "https://media.example.com/covers/raw.png" });
    fetchImage.mockResolvedValue({ buffer: png, mime: "image/png" });
    const result = operation === "titled"
      ? await saveTitledImage(`data:image/png;base64,${png.toString("base64")}`, spec)
      : operation === "photo"
        ? await fitPhotoToCard({ buffer: png, spec, fit: "contain" })
        : operation === "solid"
          ? await solidBackgroundForCard({ spec, color: "#FFFFFF" })
          : await renderImageCard({ spec, scenePromptEn: "scene", brand: {} as any, brandId: 1 });
    expect(result).toMatchObject({ url: publicUrl });
    expect(put).toHaveBeenCalledOnce();
    const [name, bytes, mime] = put.mock.calls[0]!;
    expect(name).toMatch(/^imgcard-storage-test-.*\.png$/);
    expect(mime).toBe("image/png");
    expect(await sharp(bytes).metadata()).toMatchObject({ width: 32, height: 32, format: "png" });
  });

  it("sets JPEG content type for JPEG final outputs", async () => {
    await solidBackgroundForCard({ spec: { ...spec, format: "jpeg" }, color: "#FFFFFF" });
    expect(put).toHaveBeenCalledWith(expect.stringMatching(/\.jpg$/), expect.any(Buffer), "image/jpeg");
  });

  it("does not return a ready URL when persistence fails", async () => {
    put.mockRejectedValue(new Error("upload failed"));
    await expect(solidBackgroundForCard({ spec, color: "#FFFFFF" })).rejects.toThrow("upload failed");
  });
});
