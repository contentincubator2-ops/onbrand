import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { BlobServiceClient, type BlockBlobClient, type ContainerClient } from "@azure/storage-blob";

export type MediaKind = "cover";

export interface MediaStore {
  readonly backend: "local" | "azure-blob";
  readonly publicBase: string;
  put(name: string, bytes: Buffer, contentType: string): Promise<string>;
  get(url: string): Promise<Buffer | null>;
  owns(url: string): boolean;
}

function validName(name: string): boolean {
  return /^[\w.-]+$/.test(name) && name !== "." && name !== "..";
}

/**
 * 生成好的圖會被下載到 COVERS_DIR，對外是 `/static/covers/<檔名>`（單層、沒有子目錄，
 * 見 mediaGen.ts）。
 *
 * 2026-09-25（CJ「我想增加一個功能，可以儲存在現有產品下」）：實跑 probe 才發現這條
 * 路是斷的——`/static/covers/…` 既不是 http(s) 也不在上傳目錄底下，於是走進 SSRF guard
 * 被判 "invalid URL"，畫面上只會看到「存不進去」。伺服器要讀的是**自己剛剛寫下的檔案**，
 * 本來就不該繞公開網址回打自己。
 *
 * 一樣只認固定前綴＋單段檔名＋不含 `..`，碰不到 covers 目錄以外的東西。
 */
export function localCoverFile(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const prefix = (process.env.COVERS_URL_PREFIX ?? "/static/covers").replace(/\/+$/, "");
  if (!url.startsWith(prefix + "/")) return null;
  const name = url.slice(prefix.length + 1);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name.includes("..")) return null;
  return join(process.env.COVERS_DIR ?? "/opt/onbrand/covers", name);
}

/** Local legacy covers and images owned by the current backend are our generated covers. */
export function isOwnCoverUrl(url: string): boolean {
  return localCoverFile(url) !== null || getMediaStore().owns(url);
}

export function coverContentType(name: string): string {
  switch (extname(name).toLowerCase()) {
    case ".png": return "image/png";
    case ".jpg": case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    case ".mp4": return "video/mp4";
    default: throw new Error("Unsupported cover extension");
  }
}

export class LocalMediaStore implements MediaStore {
  readonly backend = "local";
  constructor(
    private readonly directory = process.env.COVERS_DIR ?? "/opt/onbrand/covers",
    readonly publicBase = process.env.COVERS_URL_PREFIX ?? "/static/covers",
  ) {}

  owns(url: string): boolean {
    return url.startsWith(`${this.publicBase}/`) && validName(url.slice(this.publicBase.length + 1));
  }

  async put(name: string, bytes: Buffer, _contentType: string): Promise<string> {
    if (!validName(name)) throw new Error("Invalid cover filename");
    await mkdir(this.directory, { recursive: true });
    await writeFile(join(this.directory, name), bytes);
    return `${this.publicBase}/${name}`;
  }

  async get(url: string): Promise<Buffer | null> {
    if (!this.owns(url)) return null;
    try {
      return await readFile(join(this.directory, url.slice(this.publicBase.length + 1)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
}

// Narrow SDK surface permits credential-free test clients.
type MediaContainerClient = Pick<ContainerClient, "url"> & {
  getBlockBlobClient(name: string): Pick<BlockBlobClient, "uploadData" | "downloadToBuffer">;
};

function publicBase(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("Media public base must be an HTTPS URL without credentials, query or fragment");
  }
  return parsed.href.replace(/\/+$/, "");
}

export class AzureBlobMediaStore implements MediaStore {
  readonly backend = "azure-blob";
  readonly publicBase: string;
  private readonly containerBase: string;

  constructor(private readonly container: MediaContainerClient, overrideBase?: string) {
    // SDK URLs can contain SAS credentials; public URLs and health must never expose them.
    const containerUrl = new URL(container.url);
    containerUrl.search = "";
    this.containerBase = publicBase(containerUrl.href);
    this.publicBase = overrideBase?.trim() ? publicBase(overrideBase.trim()) : this.containerBase;
  }

  private blobName(url: string): string | null {
    for (const base of [this.publicBase, this.containerBase]) {
      const prefix = `${base}/covers/`;
      if (url.startsWith(prefix) && validName(url.slice(prefix.length))) {
        return `covers/${url.slice(prefix.length)}`;
      }
    }
    return null;
  }

  owns(url: string): boolean { return this.blobName(url) !== null; }

  async put(name: string, bytes: Buffer, contentType: string): Promise<string> {
    if (!validName(name)) throw new Error("Invalid cover filename");
    await this.container.getBlockBlobClient(`covers/${name}`).uploadData(bytes, {
      blobHTTPHeaders: {
        blobContentType: contentType,
        blobCacheControl: "public, max-age=31536000, immutable",
      },
    });
    return `${this.publicBase}/covers/${name}`;
  }

  async get(url: string): Promise<Buffer | null> {
    const name = this.blobName(url);
    if (!name) return null;
    try {
      return await this.container.getBlockBlobClient(name).downloadToBuffer();
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === 404) return null;
      throw error;
    }
  }
}

let store: MediaStore | undefined;
export function getMediaStore(): MediaStore {
  if (store) return store;
  const backend = process.env.MEDIA_STORAGE || "local";
  if (backend === "local") return store = new LocalMediaStore();
  if (backend !== "azure-blob") throw new Error("Invalid MEDIA_STORAGE backend");
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString?.trim()) throw new Error("AZURE_STORAGE_CONNECTION_STRING is required for azure-blob");
  let container: ContainerClient;
  try {
    container = BlobServiceClient.fromConnectionString(connectionString)
      .getContainerClient(process.env.AZURE_BLOB_CONTAINER?.trim() || "onbrand-media");
  } catch {
    throw new Error("Invalid Azure media storage configuration");
  }
  return store = new AzureBlobMediaStore(container, process.env.MEDIA_PUBLIC_BASE_URL);
}
