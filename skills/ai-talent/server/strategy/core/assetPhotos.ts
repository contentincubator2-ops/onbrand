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
import { join, resolve } from "path";
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
/**
 * 品牌 scope 的上限另計。2026-09-30（CJ「增加一個常駐的任務卡…可以儲存各種他上傳的照片」）：
 * 品牌 scope 從「幾張品牌照」變成素材庫的收件匣（標誌、情境照、存下來的 AI 圖都進這裡），
 * 24 張一下就滿；產品仍是 24（一個產品不需要更多）。
 */
export const MAX_BRAND_LIBRARY_PHOTOS = 200;

export function maxPhotosFor(scope: PhotoScope): number {
  return scope === "brand" ? MAX_BRAND_LIBRARY_PHOTOS : MAX_PHOTOS_PER_SCOPE;
}

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

/** 檔案要寫去哪、對外長什麼網址——兩個呼叫端（上傳 route、存生成圖）都認同一組值。 */
export function photoStorageRoot(): string {
  return process.env.ASSET_PHOTO_DIR ?? join(process.cwd(), "storage", "asset-photos");
}
export function photoUrlPrefix(): string {
  return process.env.ASSET_PHOTO_URL_PREFIX ?? "/static/asset-photos";
}

/** 寫出去的路徑一定要留在 storage 根目錄底下，否則就是有人在玩檔名。 */
export function assertInsideStorage(p: string, storageRoot: string): void {
  const root = resolve(storageRoot);
  if (!resolve(p).startsWith(root)) throw new Error("path escapes storage root");
}

export function safePhotoFilename(input: string): string {
  const cleaned = String(input || "photo").replace(/[^\p{L}\p{N}._-]+/gu, "_").replace(/^\.+/, "");
  return (cleaned || "photo").slice(0, 120);
}

/**
 * 把一段位元組存成這個 scope 的一張照片（寫檔＋寫 DB）。
 *
 * 2026-09-25（CJ「剛剛用了新的AI修圖功能…可惜只能下載和修改提示詞，我想增加一個
 * 功能，可以儲存在現有產品下，或是取代原圖」）：在這之前「照片怎麼落地」只寫在
 * express 上傳路由裡，於是要多一個入口（存生成圖）就得複製一份寫檔邏輯。搬進 core，
 * 讓上傳與存生成圖共用同一段——路徑規則只有一處。
 */
export async function storePhotoBytes(args: {
  userId: number; brandId: number; scope: PhotoScope; scopeId: number;
  bytes: Buffer; filename: string; storageRoot?: string;
}): Promise<AssetPhoto | { error: string }> {
  const check = validateUploadedImage(args.bytes);
  if ("error" in check) return check;

  const existing = await listPhotos(args.scope, args.scopeId);
  const cap = maxPhotosFor(args.scope);
  if (existing.length >= cap) {
    return { error: `這個${args.scope === "brand" ? "品牌" : "產品"}已經有 ${cap} 張照片，先刪掉幾張再存` };
  }

  const storageRoot = args.storageRoot ?? photoStorageRoot();
  const fileId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extForMime(check.mime)}`;
  const dir = join(storageRoot, args.scope, String(args.scopeId));
  assertInsideStorage(dir, storageRoot);
  await fs.mkdir(dir, { recursive: true });
  const target = join(dir, fileId);
  assertInsideStorage(target, storageRoot);
  await fs.writeFile(target, args.bytes);

  return insertPhoto({
    userId: args.userId, brandId: args.brandId, scope: args.scope, scopeId: args.scopeId,
    url: `${photoUrlPrefix()}/${args.scope}/${args.scopeId}/${fileId}`,
    filename: safePhotoFilename(args.filename),
    mimeType: check.mime, sizeBytes: args.bytes.length,
  });
}

/**
 * 把一張已經生成好的圖，抓回來存成這個 scope 的照片。
 *
 * 為什麼要「抓回來存」而不是把網址記起來就好：生成圖的網址有兩種，兩種都不能當成
 * 產品的長期素材——模型商直接給的網址會過期；我們自己下載下來的那份落在 covers 目錄
 * （內容產出的暫存區，跟使用者的素材庫是兩回事）。使用者說「存進我的產品」的意思是
 * 它以後還在，所以位元組要複製一份到 asset_photos 的目錄底下，跟他自己上傳的照片同級。
 *
 * makePrimary 是「取代原圖」的實作：把新的那張設成主圖，列表縮圖與所有讀
 * positioning.imageUrl 的地方都會換成它——**原本上傳的照片不刪**，要刪由使用者
 * 在照片區自己決定。生成圖不是像素級保真，把使用者的原始素材自動刪掉不可逆。
 */
export async function savePhotoFromUrl(args: {
  userId: number; brandId: number; scope: PhotoScope; scopeId: number;
  sourceUrl: string; filename: string; makePrimary?: boolean; storageRoot?: string;
}): Promise<AssetPhoto | { error: string }> {
  const { fetchImageBuffer } = await import("../../content/core/imageFetch");
  let bytes: Buffer;
  try {
    ({ buffer: bytes } = await fetchImageBuffer(args.sourceUrl, { maxBytes: MAX_UPLOAD_BYTES }));
  } catch (e: any) {
    return { error: `抓不到這張圖：${String(e?.message ?? e).slice(0, 160)}` };
  }
  const stored = await storePhotoBytes({ ...args, bytes });
  if ("error" in stored) return stored;
  if (args.makePrimary) {
    await setPrimaryPhoto({ userId: args.userId, scope: args.scope, scopeId: args.scopeId, photoId: stored.id });
    return { ...stored, isPrimary: true };
  }
  return stored;
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

/**
 * 素材庫：這個品牌「在網站任何地方上傳過的圖」一次列出來。
 *
 * 2026-09-30（CJ「也要包括客戶在網站任何地方上傳的視覺，都要集結起來處理」）。
 * 全站的圖片上傳入口（視覺頁標誌、素材庫、品牌照片、產品照片庫、任務頁的換照片、
 * 存下來的 AI 修圖）最後都寫進 asset_photos——所以彙整不必另開一張表，只要**不分
 * scope** 用 brandId 撈，再補兩種不在這張表裡、但也是使用者給的圖：
 *   · brands.logoUrl（FB 粉專抓回來的頭像落在 covers，不在 asset_photos）
 *   · 產品資料裡的主圖（早期貼網址填的，positioning.imageUrl）
 * 這兩種唯讀（source 標成 logo／product、photoId 為 null），刪除要回到原本的地方。
 */
export type LibrarySource = "brand" | "product" | "logo";

export interface LibraryItem {
  key: string;
  /** asset_photos.id；不是這張表來的（舊 logo、產品資料裡的網址）為 null，不能在素材庫刪。 */
  photoId: string | null;
  url: string;
  filename: string;
  source: LibrarySource;
  /** 產品名稱，或「品牌」／「標誌」。 */
  sourceLabel: string;
  scope: PhotoScope;
  scopeId: number;
  isLogo: boolean;
  createdAt: string | null;
}

export async function listBrandLibrary(brandId: number): Promise<LibraryItem[]> {
  const [rows]: any = await localPool.execute(
    `SELECT ap.*, p.name AS productName
       FROM asset_photos ap
       LEFT JOIN products p ON ap.scope = 'product' AND p.id = ap.scopeId
      WHERE ap.brandId = ?
      ORDER BY ap.createdAt DESC
      LIMIT 500`,
    [brandId],
  );
  const [bRows]: any = await localPool.execute(
    `SELECT logoUrl, positioning FROM brands WHERE id = ? LIMIT 1`, [brandId],
  );
  const brand = (bRows as any[])[0] ?? {};
  let pos: any = brand.positioning;
  if (typeof pos === "string") { try { pos = JSON.parse(pos); } catch { pos = {}; } }
  const logoAsset = pos?._assets?.logo ?? {};
  const logoUrls = new Set<string>(
    [brand.logoUrl, logoAsset.primaryUrl, logoAsset.darkUrl, logoAsset.iconUrl]
      .filter((u): u is string => typeof u === "string" && u.trim().length > 0),
  );

  const items: LibraryItem[] = [];
  const seen = new Set<string>();
  for (const r of rows as any[]) {
    const url = String(r.url);
    if (seen.has(url)) continue;
    seen.add(url);
    const isLogo = logoUrls.has(url);
    const source: LibrarySource = r.scope === "product" ? "product" : isLogo ? "logo" : "brand";
    items.push({
      key: String(r.id), photoId: String(r.id), url,
      filename: String(r.filename ?? ""),
      source,
      sourceLabel: r.scope === "product" ? String(r.productName ?? "產品") : isLogo ? "標誌" : "品牌",
      scope: r.scope === "product" ? "product" : "brand",
      scopeId: Number(r.scopeId),
      isLogo,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
    });
  }

  // 標誌：沒走 asset_photos 的（FB 頭像、早期貼的網址）也要看得到。
  for (const url of logoUrls) {
    if (seen.has(url) || !isUsableImageRef(url)) continue;
    seen.add(url);
    items.unshift({
      key: `logo:${url}`, photoId: null, url, filename: "logo", source: "logo", sourceLabel: "標誌",
      scope: "brand", scopeId: brandId, isLogo: true, createdAt: null,
    });
  }

  // 產品資料裡的主圖（早期貼網址）。上傳過的照片已在上面，這裡只補沒上傳過的。
  try {
    const [pRows]: any = await localPool.execute(
      `SELECT id, name, JSON_UNQUOTE(JSON_EXTRACT(positioning, '$.imageUrl')) AS imageUrl
         FROM products WHERE brandId = ? LIMIT 200`,
      [brandId],
    );
    for (const p of pRows as any[]) {
      const url = typeof p.imageUrl === "string" ? p.imageUrl : "";
      if (!url || url === "null" || seen.has(url) || !isUsableImageRef(url)) continue;
      seen.add(url);
      items.push({
        key: `product:${p.id}`, photoId: null, url, filename: String(p.name ?? ""),
        source: "product", sourceLabel: String(p.name ?? "產品"),
        scope: "product", scopeId: Number(p.id), isLogo: false, createdAt: null,
      });
    }
  } catch { /* products 讀不到就只列上傳的 */ }

  return items;
}

/** 素材庫只收看得到的圖：本站上傳／產出的相對路徑，或 http(s)。 */
function isUsableImageRef(url: string): boolean {
  return /^https?:\/\//.test(url) || url.startsWith("/static/");
}

/** 這個網址是不是這個品牌素材庫裡的圖（任何 scope 的上傳，或它的標誌）。生圖前的歸屬檢查用。 */
export async function brandOwnsLibraryPhoto(brandId: number, url: string): Promise<boolean> {
  try {
    const [a]: any = await localPool.execute(
      `SELECT 1 FROM asset_photos WHERE brandId = ? AND url = ? LIMIT 1`, [brandId, url],
    );
    if ((a as any[]).length) return true;
    const [b]: any = await localPool.execute(
      `SELECT 1 FROM brands WHERE id = ? AND logoUrl = ? LIMIT 1`, [brandId, url],
    );
    return (b as any[]).length > 0;
  } catch { return false; }
}
