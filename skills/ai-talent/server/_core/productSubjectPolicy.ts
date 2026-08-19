export interface ProductSubjectReference {
  required: boolean;
  imageUrl: string | null;
  errorMsg?: string;
}

export const PRODUCT_SUBJECT_UNAVAILABLE_ERROR =
  "真實產品圖不存在或連結已失效；已停止生圖，避免產生虛構產品。";

/**
 * A product-scoped run promises to use the real product photo. Keep the
 * caller's intent separate from URL availability so a broken/missing URL
 * cannot silently turn subject-reference generation into text-to-image.
 */
export function resolveProductSubjectReference(
  productId: number | null | undefined,
  imageUrl: string | null,
): ProductSubjectReference {
  if (!productId) return { required: false, imageUrl: null };
  if (imageUrl) return { required: true, imageUrl };
  return {
    required: true,
    imageUrl: null,
    errorMsg: PRODUCT_SUBJECT_UNAVAILABLE_ERROR,
  };
}
