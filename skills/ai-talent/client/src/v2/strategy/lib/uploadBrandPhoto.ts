/**
 * uploadBrandPhoto — 把一個檔案上傳進品牌素材庫（asset_photos，scope=brand）。
 *
 * 2026-09-30（CJ「視覺的標誌應該要讓用戶可以直接上傳 LOGO」＋「素材庫…集結起來」）：
 * 標誌、素材庫兩個入口都呼叫這一支，所以標誌上傳完自然也出現在素材庫裡，
 * 不會各存一份。位元組走 /api/asset-photo/upload（express.raw；tRPC 只吃 JSON）。
 */
export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/bmp";

export interface UploadedPhoto {
  id: string;
  url: string;
  filename: string;
}

export async function uploadBrandPhoto(brandId: number, file: File): Promise<UploadedPhoto> {
  const res = await fetch("/api/asset-photo/upload", {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": file.type || "application/octet-stream",
      "x-brand-id": String(brandId),
      "x-scope": "brand",
      "x-scope-id": String(brandId),
      "x-filename": encodeURIComponent(file.name),
    },
    body: file,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json.photo as UploadedPhoto;
}
