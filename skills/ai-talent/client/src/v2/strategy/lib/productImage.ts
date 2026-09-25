/**
 * productImage — 從一支產品的 positioning JSON 裡挑出「該顯示哪張圖」。
 *
 * 2026-09-25（CJ「我在產品的彈跳視窗中，有選擇一張主題，但沒有出現在產品列表的縮圖當中」）
 * 的真正原因，就寫在這支函式的最後一行：**產品圖有兩種網址形狀**。
 *
 *   1. 生成／外部圖：`https://…`（絕對網址）
 *   2. 使用者自己上傳的照片：`/static/asset-photos/product/<id>/<檔名>`（**根相對路徑**）
 *      —— 見 server/content/core/imageFetch.ts 的 ASSET_PHOTO_URL_PREFIX，
 *      以及 server/strategy/core/assetPhotos.ts 的 mirrorPrimaryToProduct()，
 *      它把主圖寫進 products.positioning.$.imageUrl，寫進去的就是這個相對路徑。
 *
 * 原本列表端的篩選條件是 `/^https?:\/\//`，於是「設為主圖」明明寫進 DB 了，
 * 列表卻一直顯示「尚無圖片」——資料是對的，是讀的人把它濾掉了。
 *
 * 抽成一支有測試的函式（而不是留在 JSX 裡）就是為了把這條規則釘住：
 * 以後再加一種圖片來源，只會有一個地方要改。
 */

/** 這個網址能不能直接放進 <img src>？只收上面那兩種形狀，其他一律不要（包含 javascript: 之類）。 */
export function isDisplayableImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (!v) return false;
  if (/^https?:\/\//i.test(v)) return true;
  // 根相對路徑：同站資源（上傳的照片、以後可能有的其他 /static 圖）。
  // 只收單一斜線開頭，`//host/…` 是協定相對的外站網址，不在這裡放行。
  return v.startsWith("/") && !v.startsWith("//");
}

/**
 * 依序找第一個可顯示的網址。positioning 可能是字串（DB 直出）或已經 parse 過的物件。
 * fallback 是 item 上的 legacy 欄位（products 表沒有 imageUrl 欄，但舊寫入端可能帶著）。
 */
export function pickProductImageUrl(positioning: unknown, fallback?: unknown): string | undefined {
  const parsed: any = typeof positioning === "string"
    ? (() => { try { return JSON.parse(positioning); } catch { return {}; } })()
    : (positioning ?? {});

  const photoUrlOf = (p: any): unknown => (typeof p === "string" ? p : p?.url);

  const candidates: unknown[] = [
    parsed?.imageUrl, parsed?.image,
    parsed?._interim?.imageUrl, parsed?._interim?.image,
    Array.isArray(parsed?.images) ? parsed.images[0] : null,
    Array.isArray(parsed?._interim?.images) ? parsed._interim.images[0] : null,
    Array.isArray(parsed?._assets?.photos) ? photoUrlOf(parsed._assets.photos[0]) : null,
    fallback,
  ];

  return candidates.find(isDisplayableImageUrl);
}
