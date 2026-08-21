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
  return currentBrandProducts.find(
    (product) => product.productId === pickedProduct.productId && product.imageUrl.trim().length > 0,
  ) ?? null;
}
