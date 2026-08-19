import { assertUrlSafe } from "./urlGuard";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
const MAX_REDIRECTS = 5;

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

async function fetchImageResponse(
  rawUrl: string,
  timeoutMs: number,
): Promise<{ response: Response; mime: string }> {
  let current = rawUrl;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    await assertUrlSafe(current);
    const response = await fetch(current, {
      redirect: "manual",
      headers: { "user-agent": "OnBrandImageFetcher/1.0 (+sowork.ai)" },
      signal: AbortSignal.timeout(timeoutMs),
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
  const { response, mime } = await fetchImageResponse(url, timeoutMs);
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > maxBytes) {
    await response.body?.cancel();
    throw new InvalidImageResponseError("產品圖片連結已失效：圖片檔案過大");
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > maxBytes) {
    throw new InvalidImageResponseError("產品圖片連結已失效：圖片檔案過大");
  }
  return { buffer, mime };
}

/** Validate status + final content type without downloading the whole body. */
export async function probeImageUrl(url: string, timeoutMs = 5_000): Promise<boolean> {
  try {
    const { response } = await fetchImageResponse(url, timeoutMs);
    await response.body?.cancel();
    return true;
  } catch {
    return false;
  }
}
