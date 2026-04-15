/**
 * soworkSync.ts — DEPRECATED
 * 此模組已廢棄，enterprise_brands 已合併至 brands 表。
 * 保留空殼以避免 import 錯誤。
 */

export async function syncBrandFromSowork(_brandId: number): Promise<void> {
  // no-op: deprecated
}

export async function getBrandFromSowork(_brandId: number): Promise<null> {
  return null;
}
