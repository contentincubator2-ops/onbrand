import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { render, record } = vi.hoisted(() => ({ render: vi.fn(), record: vi.fn() }));
vi.mock("../../platform/core/tenantGuard", () => ({ assertInputScopes: vi.fn() }));
vi.mock("../../platform/core/brandAuth", () => ({ assertBrandOwner: vi.fn(), assertBrandAccess: vi.fn() }));
vi.mock("../../platform/core/billing/pointsService", () => ({ assertPoints: vi.fn(), deductPoints: vi.fn() }));
vi.mock("../../platform/core/billing/imageBilling", async (original) => ({
  ...await original<typeof import("../../platform/core/billing/imageBilling")>(), reconcileImageCharge: vi.fn(),
}));
vi.mock("../core/image/imageCards", async (original) => ({
  ...await original<typeof import("../core/image/imageCards")>(), renderImageCard: render,
}));
vi.mock("../core/image/imageGen", async (original) => ({
  ...await original<typeof import("../core/image/imageGen")>(), resolveBrandVisualContext: vi.fn().mockResolvedValue({}),
}));
vi.mock("../../platform/core/ops/recordTaskRun", () => ({ recordTaskRun: record }));

import { BlobServiceClient } from "@azure/storage-blob";
import { randomUUID } from "node:crypto";
import { imageCardRouter } from "./imageCardRouter";

const blobUrl = "https://media.example.com/onbrand-media/covers/result.png";
const caller = imageCardRouter.createCaller({ user: { id: 1 }, actor: { id: 1 } } as any);

beforeEach(() => {
  vi.clearAllMocks();
  render.mockResolvedValue({ status: "ready", url: blobUrl });
  record.mockResolvedValue({ outputId: 42 });
});

// The real isOwnCoverUrl closes over the actual singleton; mock only its SDK factory.
vi.spyOn(BlobServiceClient, "fromConnectionString").mockReturnValue({
  getContainerClient: () => ({ url: "https://media.example.com/onbrand-media" }),
} as any);
vi.stubEnv("MEDIA_STORAGE", "azure-blob");
vi.stubEnv("AZURE_STORAGE_CONNECTION_STRING", randomUUID());
vi.stubEnv("MEDIA_PUBLIC_BASE_URL", "");

afterAll(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("imageCardRouter Blob covers", () => {
  it("accepts Blob reference images for edits and size extensions", async () => {
    await expect(caller.render({ brandId: 1, cardId: "line-img-richmsg", scenePromptEn: "a new scene", referenceImageUrl: blobUrl }))
      .resolves.toMatchObject({ status: "ready", url: blobUrl });
    expect(render).toHaveBeenCalledWith(expect.objectContaining({ referenceImageUrl: blobUrl }));
  });

  it("accepts Blob image URLs when saving a post", async () => {
    await expect(caller.saveAsPost({ brandId: 1, cardId: "line-img-richmsg", copy: "貼文內容", imageUrls: [blobUrl] }))
      .resolves.toMatchObject({ outputId: 42, imageUrl: blobUrl });
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ thumbnailUrl: blobUrl }));
  });

  it("still rejects external images in both actions before generation or persistence", async () => {
    const external = "https://external.example.com/covers/result.png";
    await expect(caller.render({ brandId: 1, cardId: "line-img-richmsg", scenePromptEn: "a scene", referenceImageUrl: external }))
      .rejects.toThrow("參考圖只能是這裡產出的圖片");
    await expect(caller.saveAsPost({ brandId: 1, cardId: "line-img-richmsg", copy: "貼文內容", imageUrls: [external] }))
      .rejects.toThrow("只能存這裡產出的圖片");
    expect(render).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });
});
