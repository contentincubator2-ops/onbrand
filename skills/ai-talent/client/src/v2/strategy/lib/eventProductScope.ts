/**
 * 「這檔活動搭配什麼」的選取規則（單一產品／多個產品聯合／純品牌）。純函式，
 * 畫面在 components/positioning/EventProductScopePicker.tsx。
 *
 * 語意（為什麼「還沒選」跟「純品牌」要分開）在
 * server/strategy/core/eventProductScope.ts。
 */
import type { ProductScope } from "./campaignSchema";

export interface ProductScopeValue { scope: ProductScope | null; productIds: number[] }

export const UNDECIDED_SCOPE: ProductScopeValue = { scope: null, productIds: [] };

/** 點了某個產品之後的下一個狀態。全部取消＝回到還沒選，不是變成純品牌。 */
export function toggleProduct(v: ProductScopeValue, productId: number): ProductScopeValue {
  const current = v.scope === "products" ? v.productIds : [];
  const ids = current.includes(productId) ? current.filter((x) => x !== productId) : [...current, productId];
  return { scope: ids.length ? "products" : null, productIds: ids };
}

/** 點了「純品牌活動」之後的下一個狀態：跟產品互斥，再點一次回到還沒選。 */
export function toggleBrandOnly(v: ProductScopeValue): ProductScopeValue {
  return v.scope === "brand" ? { scope: null, productIds: [] } : { scope: "brand", productIds: [] };
}

/** 目前選的是哪一種，用一句話講出來。還沒選回空字串。 */
export function scopeSummary(v: ProductScopeValue, en: boolean): string {
  if (v.scope === "brand") return en ? "Brand campaign" : "純品牌活動";
  if (v.scope === "products" && v.productIds.length === 1) return en ? "Single product" : "單一產品活動";
  if (v.scope === "products" && v.productIds.length > 1) {
    return en ? `${v.productIds.length} products together` : `${v.productIds.length} 個產品聯合`;
  }
  return "";
}

/** server 回來的（scope, 綁定產品）→ 畫面狀態。有綁產品一律是 products。 */
export function scopeValueFrom(scope: unknown, productIds: number[]): ProductScopeValue {
  if (productIds.length > 0) return { scope: "products", productIds };
  return { scope: scope === "brand" ? "brand" : null, productIds: [] };
}
