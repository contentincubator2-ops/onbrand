/**
 * assetPhotos — 品牌與產品的「用戶自己上傳的照片」。
 *
 * 2026-09-10 (CJ「我發現，我們雖然提供很多調整提示詞的範本給用戶，但太多了以後，
 * 其實用不到，而且用戶會先關心自己的產品圖，是否有因為 AI 所以變形」+「允許用戶
 * 上傳照片到品牌或個別產品。我們的 AI 不用再從網站爬產品照片了，因為這不容易，
 * 所有品牌／產品的照片都應該由用戶上傳」)。
 *
 * ── 這一支管什麼 ───────────────────────────────────────────────────────
 *
 * `asset_photos` 是唯一真相：品牌照片庫、產品照片庫共用同一張表（scope 分開），
 * 每一列是一次上傳。多筆之間有一張 `isPrimary`——對產品而言，那張同時鏡射進
 * `products.positioning.$.imageUrl`（既有欄位，8 個既有讀取點都認這格，見
 * scopeRouter.updateImageUrl 的寫法），所以這支上線不必動任何既有的「讀產品圖」
 * 程式碼；對品牌而言沒有對應的單一欄位（品牌照片是新概念，不是 logo），純粹
 * 只存在這張表。
 *
 * ── 為什麼不掃描網站了 ────────────────────────────────────────────────
 * 三個既有的圖片來源都是「爬網站」：官網掃描（配對掃到的圖到掃到的
 * 產品名）、scopeRouter.backfillProductMeta（單頁 og:image）、brandColorsRouter
 * 的 scrapeWebsiteImages 保底。CJ 的結論是這條路不可靠，改成使用者自己上傳。
 * 這三處的移除各自在自己的檔案裡做（不在這支），這支只負責「上傳進來的照片
 * 要存成什麼樣子、放哪、怎麼列、怎麼刪」。
 *
 * 檔案存放沿用 positioningDocRoute.ts 的做法（本機硬碟＋express.static，
 * repo 裡沒有 S3）：ASSET_PHOTO_DIR/<scope>/<scopeId>/<uuid>.<ext>。
 */
import localPool from "../../localDb";
import { randomUUID } from "crypto";
import { join } from "path";
import { promises as fs } from "fs";
import { detectRasterImageMime } from "../../content/core/imageFetch";

export type PhotoScope = "brand" | "product";

export interface AssetPhoto {
  id: string;
  scope: PhotoScope;
  scopeId: number;
  url: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  isPrimary: boolean;
  createdAt: string;
}

export const ASSET_PHOTO_DDL = `
  CREATE TABLE IF NOT EXISTS asset_photos (
    id          CHAR(36)     NOT NULL PRIMARY KEY,
    userId      INT          NOT NULL,
    brandId     INT          NOT NULL,
    scope       VARCHAR(16)  NOT NULL,
    scopeId     INT          NOT NULL,
    url         VARCHAR(500) NOT NULL,
    filename    VARCHAR(255) NOT NULL,
    mimeType    VARCHAR(64)  NOT NULL,
    sizeBytes   INT          NOT NULL,
    isPrimary   TINYINT(1)   NOT NULL DEFAULT 0,
    createdAt   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_asset_photos_scope (scope, scopeId, createdAt),
    KEY idx_asset_photos_brand (brandId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
/** 一個 scope（一個品牌，或一個產品）最多留幾張——防止無限堆積硬碟。 */
export const MAX_PHOTOS_PER_SCOPE = 24;

const MIME_EXT: Record<string, string> = {
  "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp",
  "image/gif": ".gif", "image/bmp": ".bmp", "image/tiff": ".tiff", "image/avif": ".avif",
};

export function extForMime(mime: string): string {
  return MIME_EXT[mime] ?? ".bin";
}

/** 上傳的位元組是不是一張點陣圖；不是就早退，不寫檔也不進 DB。 */
export function validateUploadedImage(bytes: Buffer): { mime: string } | { error: string } {
  if (bytes.length === 0) return { error: "檔案是空的" };
  if (bytes.length > MAX_UPLOAD_BYTES) {
    return { error: `檔案過大（${(bytes.length / 1024 / 1024).toFixed(1)}MB）— 上限 ${MAX_UPLOAD_BYTES / 1024 / 1024}MB` };
  }
  const mime = detectRasterImageMime(bytes);
  if (!mime) return { error: "不是可辨識的圖片格式（支援 PNG／JPEG／WebP／GIF／BMP）" };
  return { mime };
}

function rowToPhoto(r: any): AssetPhoto {
  return {
    id: r.id, scope: r.scope, scopeId: Number(r.scopeId),
    url: r.url, filename: r.filename, mimeType: r.mimeType, sizeBytes: Number(r.sizeBytes),
    isPrimary: !!Number(r.isPrimary), createdAt: new Date(r.createdAt).toISOString(),
  };
}

export async function listPhotos(scope: PhotoScope, scopeId: number): Promise<AssetPhoto[]> {
  const [rows]: any = await localPool.execute(
    `SELECT * FROM asset_photos WHERE scope = ? AND scopeId = ? ORDER BY isPrimary DESC, createdAt DESC`,
    [scope, scopeId],
  );
  return (rows as any[]).map(rowToPhoto);
}

/**
 * 產品的主圖鏡射進 positioning.imageUrl——既有的 8 個讀取點（RunPage 產品選圖、
 * mediaRouter.listProductImages、brandColorsRouter 取色、BrandsPage 縮圖…）
 * 都認這格，不改一行既有程式碼就吃得到使用者上傳的照片。品牌沒有對應欄位，
 * 純粹只存在 asset_photos。
 */
async function mirrorPrimaryToProduct(userId: number, productId: number, url: string | null): Promise<void> {
  await localPool.execute(
    `UPDATE products SET positioning = JSON_SET(COALESCE(positioning, JSON_OBJECT()), '$.imageUrl', ?)
      WHERE id = ? AND userId = ?`,
    [url, productId, userId],
  ).catch((e) => console.warn("[assetPhotos] mirror to product.imageUrl failed:", (e as Error).message));
}

/** 新增一張照片；scope 內第一張自動當主圖。超過上限先擋在 route 層，這裡不重複檢查。 */
export async function insertPhoto(args: {
  userId: number; brandId: number; scope: PhotoScope; scopeId: number;
  url: string; filename: string; mimeType: string; sizeBytes: number;
}): Promise<AssetPhoto> {
  const id = randomUUID();
  const existing = await listPhotos(args.scope, args.scopeId);
  const isPrimary = existing.length === 0;
  await localPool.execute(
    `INSERT INTO asset_photos (id, userId, brandId, scope, scopeId, url, filename, mimeType, sizeBytes, isPrimary)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, args.userId, args.brandId, args.scope, args.scopeId, args.url, args.filename, args.mimeType, args.sizeBytes, isPrimary ? 1 : 0],
  );
  if (isPrimary && args.scope === "product") await mirrorPrimaryToProduct(args.userId, args.scopeId, args.url);
  return { id, scope: args.scope, scopeId: args.scopeId, url: args.url, filename: args.filename, mimeType: args.mimeType, sizeBytes: args.sizeBytes, isPrimary, createdAt: new Date().toISOString() };
}

export async function setPrimaryPhoto(args: { userId: number; scope: PhotoScope; scopeId: number; photoId: string }): Promise<void> {
  const [rows]: any = await localPool.execute(
    `SELECT id, brandId, url FROM asset_photos WHERE id = ? AND userId = ? AND scope = ? AND scopeId = ? LIMIT 1`,
    [args.photoId, args.userId, args.scope, args.scopeId],
  );
  const target = (rows as any[])[0];
  if (!target) throw new Error("找不到這張照片");
  await localPool.execute(`UPDATE asset_photos SET isPrimary = (id = ?) WHERE scope = ? AND scopeId = ?`, [args.photoId, args.scope, args.scopeId]);
  if (args.scope === "product") await mirrorPrimaryToProduct(args.userId, args.scopeId, target.url);
}

/** 刪掉一張照片（連同磁碟檔案）。刪的若是主圖，自動把最新一張遞補；沒有照片了就把 imageUrl 清空。 */
export async function removePhoto(args: { userId: number; scope: PhotoScope; scopeId: number; photoId: string; storageRoot: string }): Promise<void> {
  const [rows]: any = await localPool.execute(
    `SELECT * FROM asset_photos WHERE id = ? AND userId = ? AND scope = ? AND scopeId = ? LIMIT 1`,
    [args.photoId, args.userId, args.scope, args.scopeId],
  );
  const target = (rows as any[])[0];
  if (!target) return;
  const wasPrimary = !!Number(target.isPrimary);
  await localPool.execute(`DELETE FROM asset_photos WHERE id = ? AND userId = ?`, [args.photoId, args.userId]);

  // 磁碟檔案：url 是 `${PREFIX}/<scope>/<scopeId>/<file>`，換算回實際路徑。刪不掉不當致命錯誤——
  // 孤兒檔案只是浪費硬碟，DB 記錄才是真相，留著孤兒檔案好過在使用者操作路徑上丟一個檔案系統錯誤。
  try {
    const rel = target.url.split("/").slice(-3).join("/"); // <scope>/<scopeId>/<file>
    await fs.unlink(join(args.storageRoot, rel));
  } catch { /* best-effort */ }

  if (wasPrimary && args.scope === "product") {
    const remaining = await listPhotos(args.scope, args.scopeId);
    const next = remaining[0] ?? null;
    if (next) await setPrimaryPhoto({ userId: args.userId, scope: args.scope, scopeId: args.scopeId, photoId: next.id });
    else await mirrorPrimaryToProduct(args.userId, args.scopeId, null);
  }
}
