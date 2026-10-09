/**
 * canvaImport — 把用戶在 Canva 做好的設計匯出成圖，存進品牌素材庫。
 *
 * 2026-10-09（CJ「直接導入用戶在 CANVA 做好的圖…用戶就可以圖文一起送給客戶審查」）。
 *
 * 落點是 asset_photos（brand scope）——跟用戶自己上傳的照片同級，所以素材庫、圖片卡的
 * 「從素材庫挑」、貼文換圖全部不用另外認識 Canva。Canva 給的下載網址 24 小時就失效，
 * 位元組一定要抓回來存，不能只記網址。
 *
 * 多頁設計每一頁存一張（頁序＝輪播順序）。不是即時同步：用戶在 Canva 改了圖要再匯入一次。
 */
import { exportCanvaDesignPng } from "../../../platform/core/connectors/canvaClient";
import { fetchImageBuffer } from "../../../platform/core/media/imageFetch";
import { MAX_UPLOAD_BYTES, storePhotoBytes, type AssetPhoto } from "./assetPhotos";

/** 一次最多匯入幾頁——Instagram／Facebook 輪播上限也是 10 張，再多就不是一篇貼文了。 */
export const MAX_CANVA_PAGES = 10;

export interface CanvaImportResult {
  photos: AssetPhoto[];
  /** 這份設計還有沒匯入的頁（超過 MAX_CANVA_PAGES）。 */
  truncated: boolean;
  /** 有幾頁抓到了卻存不進去（素材庫滿了、單張過大），附最後一個原因。 */
  skipped: number;
  skippedReason: string | null;
}

export async function importCanvaDesign(
  args: {
    accessToken: string; designId: string; title: string; pages?: number[];
    userId: number; brandId: number; uploadedBy: number; storageRoot?: string;
  },
  deps: {
    exportPng?: typeof exportCanvaDesignPng;
    fetchBytes?: (url: string) => Promise<Buffer>;
    store?: typeof storePhotoBytes;
  } = {},
): Promise<CanvaImportResult> {
  const exportPng = deps.exportPng ?? exportCanvaDesignPng;
  const fetchBytes = deps.fetchBytes
    ?? (async (url: string) => (await fetchImageBuffer(url, { maxBytes: MAX_UPLOAD_BYTES, timeoutMs: 30_000 })).buffer);
  const store = deps.store ?? storePhotoBytes;

  const pages = args.pages?.length ? [...new Set(args.pages)].sort((a, b) => a - b).slice(0, MAX_CANVA_PAGES) : undefined;
  const urls = await exportPng(args.accessToken, { designId: args.designId, pages });
  const take = urls.slice(0, MAX_CANVA_PAGES);
  const base = (args.title || "Canva").trim().slice(0, 80) || "Canva";

  const photos: AssetPhoto[] = [];
  let skipped = 0;
  let skippedReason: string | null = null;
  for (const [i, url] of take.entries()) {
    const pageNo = pages?.[i] ?? i + 1;
    let bytes: Buffer;
    try { bytes = await fetchBytes(url); }
    catch (e: any) { skipped += 1; skippedReason = String(e?.message ?? e).slice(0, 160); continue; }
    const stored = await store({
      userId: args.userId, brandId: args.brandId, scope: "brand", scopeId: args.brandId,
      bytes, filename: take.length > 1 ? `${base}-${pageNo}.png` : `${base}.png`,
      storageRoot: args.storageRoot, uploadedBy: args.uploadedBy,
    });
    if ("error" in stored) { skipped += 1; skippedReason = stored.error; continue; }
    photos.push(stored);
  }
  return { photos, truncated: urls.length > take.length, skipped, skippedReason };
}
