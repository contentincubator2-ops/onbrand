/**
 * 單篇只出一篇 —— 2026-09-29（CJ「任務產出直接就只有一個版本的文字產出」）。
 *
 * 以前單篇任務一次寫 3 個「版本」（同一位寫手、三種切角），用戶要在三篇之間比對。
 * 改成：只寫一篇，要換風格就在產出頁換一位 agent 重寫（見 writerDrafts.ts）。
 *
 * 只收斂「同一篇貼文的替代版本」。以下照舊：
 *   - 套組（postLabels / extras.postsCount 定義了篇數）—— 每一篇都是交付物。
 *   - 多卡（cardsPerVariant）—— 本來就是 1 篇 + N 張卡。
 *   - 5 個以上的候選池（標題池、鉤子池）—— 產出頁是「先給 3 個、再給我幾個」。
 *   - 多選一本身就是交付物的卡（A/B 測試、主旨多選、標題多選）—— 明列在下面，
 *     不用關鍵字猜（inferMockup 的教訓）。
 */
import { isPackShape } from "./tierVariantShape";

export const MULTI_VERSION_DELIVERABLE = new Set<string>([
  "fb-30-ad-audience-split-test", // 分眾 A/B：三種開場就是測試組
  "em-30-subject-ai-variants",    // 主旨多選
  "yt-30-title-strategies",       // 標題多選
  "fb-30-live-title",             // 直播標題多選
  "yt-30-opening-hook",           // 開場鉤子多選
  "ig-30-reel-hook",              // 開場鉤子多選
  "tt-30-opening-hook",
  "li-30-hook-3",
  "li-30-headline",
  "pr-30-headline",
  "fb-30-ad-headline",
]);

export interface SingleVersionInput {
  taskId?: string | null;
  variants: number;
  images: number;
  variantLabels: string[];
  postLabels?: string[];
  postsCount?: number;
  cardsPerVariant?: number;
}

/** 回傳收斂後的形狀；不需收斂時回 null（呼叫端照原設定跑）。 */
export function resolveSingleVersion(c: SingleVersionInput): { variants: number; images: number; variantLabels: string[] } | null {
  if (c.variants < 2 || c.variants > 4) return null;
  if ((c.cardsPerVariant ?? 0) > 0) return null;
  if (isPackShape(c)) return null;
  if (c.taskId && MULTI_VERSION_DELIVERABLE.has(c.taskId)) return null;
  return { variants: 1, images: Math.min(c.images, 1), variantLabels: c.variantLabels.slice(0, 1) };
}
