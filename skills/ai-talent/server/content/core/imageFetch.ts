import { promises as fs } from "fs";
import { join } from "path";
import { assertUrlSafe } from "./urlGuard";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const IMAGE_SIGNATURE_BYTES = 16;

export class InvalidImageResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidImageResponseError";
  }
}

export function assertIsUsableImageContentType(contentType: string | null): string {
  const mime = (contentType ?? "").split(";", 1)[0]!.trim().toLowerCase();
  if (!mime.startsWith("image/") || mime === "image/svg+xml") {
    const received = mime || "未提供 content-type";
    throw new InvalidImageResponseError(
      `產品圖片連結已失效：連結沒有回傳可用的圖片（收到 ${received}）`,
    );
  }
  return mime;
}

/** Detect common raster formats from bytes instead of trusting HTTP headers. */
export function detectRasterImageMime(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 6) {
    const gif = Buffer.from(bytes.subarray(0, 6)).toString("ascii");
    if (gif === "GIF87a" || gif === "GIF89a") return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
    Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
  ) return "image/webp";
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return "image/bmp";
  if (
    bytes.length >= 4 &&
    ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) ||
      (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a))
  ) return "image/tiff";
  if (bytes.length >= 12 && Buffer.from(bytes.subarray(4, 8)).toString("ascii") === "ftyp") {
    const brand = Buffer.from(bytes.subarray(8, 12)).toString("ascii");
    if (brand === "avif" || brand === "avis") return "image/avif";
  }
  return null;
}

/**
 * 用戶自己上傳的產品／品牌照片（asset_photos）存的是相對路徑 `/static/asset-photos/<scope>/<id>/<檔名>`，
 * 不是 http(s) 網址。2026-09-22（CJ「右方缺乏了用產品圖生圖的選項」）：三個「找產品圖」的地方都要求
 * `https?://`，於是上傳的照片全被丟掉，選項整個不出現。這裡把它認成合法來源，而且直接從本機硬碟讀，
 * 不繞公開網址回打自己（那條路要靠伺服器能連到自己的公開網域，不可靠）。
 *
 * 只認相對路徑＋固定三段結構＋不含 `..`，所以碰不到硬碟上的其他檔案；別的主機上長得一樣的
 * 路徑是絕對網址，不會走這條。
 */
export function localUploadFile(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const prefix = (process.env.ASSET_PHOTO_URL_PREFIX ?? "/static/asset-photos").replace(/\/+$/, "");
  if (!url.startsWith(prefix + "/")) return null;
  const m = url.slice(prefix.length + 1).match(/^(brand|product)\/(\d+)\/([A-Za-z0-9][A-Za-z0-9._-]*)$/);
  if (!m || m[3]!.includes("..")) return null;
  const root = process.env.ASSET_PHOTO_DIR ?? join(process.cwd(), "storage", "asset-photos");
  return join(root, m[1]!, m[2]!, m[3]!);
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

/**
 * 我們自己硬碟上的檔案（使用者上傳的照片，或生成圖）。
 * 只給「讀位元組」用；要判斷「這是不是使用者上傳的照片」請繼續用 isLocalUploadPath，
 * 那是輸入驗證的語意，不能被這支放寬。
 */
export function localStaticFile(url: unknown): string | null {
  return localUploadFile(url) ?? localCoverFile(url);
}

/** Is this a photo the user uploaded to us (readable from local disk)? */
export function isLocalUploadPath(url: unknown): boolean {
  return localUploadFile(url) !== null;
}

function invalidImageBytes(): InvalidImageResponseError {
  return new InvalidImageResponseError(
    "產品圖片連結已失效：內容不是可辨識的點陣圖片",
  );
}

async function readResponseBuffer(response: Response, maxBytes: number): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new InvalidImageResponseError("產品圖片連結已失效：圖片檔案過大");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}

async function readImagePrefix(response: Response): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < IMAGE_SIGNATURE_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      total += value.byteLength;
    }
    await reader.cancel();
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total).subarray(0, IMAGE_SIGNATURE_BYTES);
}

async function fetchImageResponse(
  rawUrl: string,
  timeoutMs: number,
): Promise<{ response: Response; mime: string }> {
  let current = rawUrl;
  const deadline = Date.now() + timeoutMs;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    await assertUrlSafe(current);
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new InvalidImageResponseError("產品圖片連結已失效：下載逾時");
    }
    const response = await fetch(current, {
      redirect: "manual",
      headers: { "user-agent": "OnBrandImageFetcher/1.0 (+sowork.ai)" },
      // One deadline covers the complete redirect chain. Re-starting the full
      // timeout on every hop let a 5-second probe block for over 30 seconds.
      signal: AbortSignal.timeout(remainingMs),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) {
        throw new InvalidImageResponseError("產品圖片連結已失效：重新導向缺少目的網址");
      }
      if (redirects === MAX_REDIRECTS) {
        throw new InvalidImageResponseError("產品圖片連結已失效：重新導向次數過多");
      }
      current = new URL(location, current).toString();
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new InvalidImageResponseError(`產品圖片連結已失效：下載失敗（HTTP ${response.status}）`);
    }
    try {
      return { response, mime: assertIsUsableImageContentType(response.headers.get("content-type")) };
    } catch (error) {
      await response.body?.cancel();
      throw error;
    }
  }
  throw new InvalidImageResponseError("產品圖片連結已失效：無法取得圖片");
}

export async function fetchImageBuffer(
  url: string,
  options: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<{ buffer: Buffer; mime: string }> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const local = localStaticFile(url);
  if (local) {
    let buffer: Buffer;
    try { buffer = await fs.readFile(local); }
    catch { throw new InvalidImageResponseError("產品圖片連結已失效：找不到上傳的照片檔"); }
    if (buffer.length > maxBytes) throw new InvalidImageResponseError("產品圖片連結已失效：圖片檔案過大");
    const localMime = detectRasterImageMime(buffer);
    if (!localMime) throw invalidImageBytes();
    return { buffer, mime: localMime };
  }
  const { response } = await fetchImageResponse(url, timeoutMs);
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > maxBytes) {
    await response.body?.cancel();
    throw new InvalidImageResponseError("產品圖片連結已失效：圖片檔案過大");
  }
  const buffer = await readResponseBuffer(response, maxBytes);
  const detectedMime = detectRasterImageMime(buffer);
  if (!detectedMime) throw invalidImageBytes();
  return { buffer, mime: detectedMime };
}

/** Validate status + final content type without downloading the whole body. */
export async function probeImageUrl(url: string, timeoutMs = 5_000): Promise<boolean> {
  const local = localStaticFile(url);
  if (local) {
    try {
      const handle = await fs.open(local, "r");
      try {
        const head = Buffer.alloc(IMAGE_SIGNATURE_BYTES);
        const { bytesRead } = await handle.read(head, 0, IMAGE_SIGNATURE_BYTES, 0);
        return detectRasterImageMime(head.subarray(0, bytesRead)) !== null;
      } finally { await handle.close(); }
    } catch { return false; }
  }
  try {
    const { response } = await fetchImageResponse(url, timeoutMs);
    const prefix = await readImagePrefix(response);
    return detectRasterImageMime(prefix) !== null;
  } catch {
    return false;
  }
}
