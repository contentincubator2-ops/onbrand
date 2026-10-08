import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { BlobServiceClient } from "@azure/storage-blob";
import { AzureBlobMediaStore, LocalMediaStore } from "./mediaStore";

const containerUrl = "https://media.example.com/onbrand-media";
const bytes = Buffer.from("image bytes");
function fakeContainer() {
  const blob = { uploadData: vi.fn().mockResolvedValue({}), downloadToBuffer: vi.fn().mockResolvedValue(bytes) };
  return { url: containerUrl, getBlockBlobClient: vi.fn().mockReturnValue(blob), blob };
}

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("LocalMediaStore", () => {
  let directory: string;
  beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), "media-store-")); });
  afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

  it("writes to COVERS_DIR and returns/reads the configured relative URL", async () => {
    vi.stubEnv("COVERS_DIR", join(directory, "nested"));
    vi.stubEnv("COVERS_URL_PREFIX", "/custom/covers");
    const store = new LocalMediaStore();
    const url = await store.put("sample.png", bytes, "image/png");
    expect(url).toBe("/custom/covers/sample.png");
    expect(await readFile(join(directory, "nested/sample.png"))).toEqual(bytes);
    expect(store.owns(url)).toBe(true);
    expect(await store.get(url)).toEqual(bytes);
    expect(await store.get("/custom/covers/missing.png")).toBeNull();
    expect(await store.get(`${containerUrl}/covers/sample.png`)).toBeNull();
  });

  it.each(["../escape.png", ".", "..", "nested/file.png"])("rejects unsafe filename %s", async (name) => {
    const store = new LocalMediaStore(directory, "/static/covers");
    expect(store.owns(`/static/covers/${name}`)).toBe(false);
    await expect(store.put(name, bytes, "image/png")).rejects.toThrow("Invalid cover filename");
  });
});

describe("AzureBlobMediaStore", () => {
  it("uploads covers/name with content type and immutable cache headers; reads it back", async () => {
    const container = fakeContainer();
    const store = new AzureBlobMediaStore(container);
    const url = await store.put("sample.webp", bytes, "image/webp");
    expect(container.getBlockBlobClient).toHaveBeenCalledWith("covers/sample.webp");
    expect(container.blob.uploadData).toHaveBeenCalledWith(bytes, { blobHTTPHeaders: {
      blobContentType: "image/webp", blobCacheControl: "public, max-age=31536000, immutable",
    } });
    expect(url).toBe(`${containerUrl}/covers/sample.webp`);
    expect(store.owns(url)).toBe(true);
    expect(await store.get(url)).toEqual(bytes);
    expect(container.blob.downloadToBuffer).toHaveBeenCalledOnce();
  });

  it("uses the public override while accepting both container and override URLs", async () => {
    const container = fakeContainer();
    const store = new AzureBlobMediaStore(container, "https://images.example.com/media/");
    const url = await store.put("sample.jpg", bytes, "image/jpeg");
    expect(url).toBe("https://images.example.com/media/covers/sample.jpg");
    expect(await store.get(url)).toEqual(bytes);
    expect(await store.get(`${containerUrl}/covers/sample.jpg`)).toEqual(bytes);
    expect(container.getBlockBlobClient).toHaveBeenLastCalledWith("covers/sample.jpg");
  });

  it("treats an empty override as unset and never publishes SDK URL query parameters", () => {
    const container = { ...fakeContainer(), url: `${containerUrl}?${randomUUID()}` };
    expect(new AzureBlobMediaStore(container, "").publicBase).toBe(containerUrl);
    expect(() => new AzureBlobMediaStore(container, "https://images.example.com/?query=1")).toThrow();
  });

  it.each([
    "/static/covers/old.png", `${containerUrl}-other/covers/a.png`,
    "https://media.example.com.evil/onbrand-media/covers/a.png",
    `${containerUrl}/covers/../a.png`, `${containerUrl}/covers/%2e%2e`,
    `${containerUrl}/asset-photos/a.png`,
  ])("does not own or download foreign/unsafe URLs: %s", async (url) => {
    const container = fakeContainer();
    const store = new AzureBlobMediaStore(container);
    expect(store.owns(url)).toBe(false);
    expect(await store.get(url)).toBeNull();
    expect(container.getBlockBlobClient).not.toHaveBeenCalled();
  });

  it("returns null for 404, propagates other storage errors", async () => {
    const container = fakeContainer();
    const store = new AzureBlobMediaStore(container);
    container.blob.downloadToBuffer.mockRejectedValueOnce({ statusCode: 404 });
    expect(await store.get(`${containerUrl}/covers/missing.png`)).toBeNull();
    container.blob.downloadToBuffer.mockRejectedValueOnce({ statusCode: 403 });
    await expect(store.get(`${containerUrl}/covers/denied.png`)).rejects.toMatchObject({ statusCode: 403 });
    container.blob.uploadData.mockRejectedValueOnce(new Error("upload failed"));
    await expect(store.put("a.png", bytes, "image/png")).rejects.toThrow("upload failed");
  });
});

describe("getMediaStore configuration", () => {
  beforeEach(() => { vi.resetModules(); });
  it.each([undefined, "local"])("defaults to a local singleton for %s", async (backend) => {
    vi.stubEnv("MEDIA_STORAGE", backend ?? "");
    if (backend === undefined) delete process.env.MEDIA_STORAGE;
    const { getMediaStore } = await import("./mediaStore");
    expect(getMediaStore().backend).toBe("local");
    expect(getMediaStore()).toBe(getMediaStore());
  });
  it.each([undefined, "", "   "])("fails immediately without the Azure connection string (%s)", async (connection) => {
    vi.stubEnv("MEDIA_STORAGE", "azure-blob");
    vi.stubEnv("AZURE_STORAGE_CONNECTION_STRING", connection ?? "");
    if (connection === undefined) delete process.env.AZURE_STORAGE_CONNECTION_STRING;
    const { getMediaStore } = await import("./mediaStore");
    expect(() => getMediaStore()).toThrow("AZURE_STORAGE_CONNECTION_STRING is required");
  });
  it.each([undefined, "custom-media"])("selects Azure with container %s and the public override", async (name) => {
    const container = fakeContainer();
    const getContainerClient = vi.fn().mockReturnValue(container);
    vi.spyOn(BlobServiceClient, "fromConnectionString").mockReturnValue({ getContainerClient } as any);
    vi.stubEnv("MEDIA_STORAGE", "azure-blob");
    // Opaque runtime-only value: the SDK factory is mocked; no credentials in tests.
    vi.stubEnv("AZURE_STORAGE_CONNECTION_STRING", randomUUID());
    vi.stubEnv("AZURE_BLOB_CONTAINER", name ?? "");
    if (name === undefined) delete process.env.AZURE_BLOB_CONTAINER;
    vi.stubEnv("MEDIA_PUBLIC_BASE_URL", "https://images.example.com");
    const { getMediaStore } = await import("./mediaStore");
    const store = getMediaStore();
    expect(store.backend).toBe("azure-blob");
    expect(store.publicBase).toBe("https://images.example.com");
    expect(getContainerClient).toHaveBeenCalledWith(name ?? "onbrand-media");
    expect(getMediaStore()).toBe(store);
  });
  it("recognises legacy covers and current Blob/public-base URLs, but rejects external URLs", async () => {
    const container = fakeContainer();
    vi.spyOn(BlobServiceClient, "fromConnectionString").mockReturnValue({
      getContainerClient: vi.fn().mockReturnValue(container),
    } as any);
    vi.stubEnv("MEDIA_STORAGE", "azure-blob");
    vi.stubEnv("AZURE_STORAGE_CONNECTION_STRING", randomUUID());
    vi.stubEnv("MEDIA_PUBLIC_BASE_URL", "https://images.example.com");
    vi.stubEnv("COVERS_URL_PREFIX", "/static/covers");
    const { isOwnCoverUrl } = await import("./mediaStore");
    expect(isOwnCoverUrl("/static/covers/old.png")).toBe(true);
    expect(isOwnCoverUrl(`${containerUrl}/covers/new.png`)).toBe(true);
    expect(isOwnCoverUrl("https://images.example.com/covers/new.png")).toBe(true);
    expect(isOwnCoverUrl("https://external.example.com/covers/new.png")).toBe(false);
    expect(isOwnCoverUrl("/static/covers/../secret.png")).toBe(false);
  });
  it("rejects unknown backends instead of silently writing locally", async () => {
    vi.stubEnv("MEDIA_STORAGE", "typo");
    const { getMediaStore } = await import("./mediaStore");
    expect(() => getMediaStore()).toThrow("Invalid MEDIA_STORAGE backend");
  });
});
