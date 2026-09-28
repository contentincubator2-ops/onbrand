export interface RunProductImage {
  productId: number;
  name: string;
  imageUrl: string;
}

/**
 * Resolve a picker value against the current brand's product list. Returning
 * the current list entry also prevents a stale picker object from supplying
 * an old image URL after route/query data changes.
 */
export function findValidRunProductSelection(
  pickedProduct: RunProductImage | null,
  currentBrandProducts: RunProductImage[],
): RunProductImage | null {
  if (!pickedProduct) return null;
  // 一個產品可以有好幾張照片：先找同一張；找不到（舊的選擇、清單更新）才退回同產品的第一張。
  return currentBrandProducts.find(
    (product) => product.productId === pickedProduct.productId && product.imageUrl === pickedProduct.imageUrl
      && product.imageUrl.trim().length > 0,
  ) ?? currentBrandProducts.find(
    (product) => product.productId === pickedProduct.productId && product.imageUrl.trim().length > 0,
  ) ?? null;
}
