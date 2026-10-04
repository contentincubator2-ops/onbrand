/**
 * customChannelId — 用戶自訂通路（自訂 mission tray）的 id 規則。
 *
 * 2026-10-04（CJ「用戶可以自己增加 mission tray，例如蝦皮、momo、網紅合作」）。
 *
 * 內建通路是封閉清單（facebook / instagram …），散在 planGate、側欄偏好、路由對照等
 * 好幾處。自訂通路不加進那些清單，而是用**一個 id 形狀**讓每一處用同一個述詞認得：
 * `c<brandId>-<slug>`。放在 platform 層，是因為 planGate / navPrefsRouter（platform）
 * 與 content 層都要用，依賴方向只能往下。
 *
 * client 有一份鏡像（content/lib/customChannels.ts），server 側的測試鎖兩邊一致
 * （client 不得 value-import server）。
 */
/** 型別層的形狀（不含 slug 字元檢查，那是 CUSTOM_CHANNEL_RE 的事）。 */
export type CustomChannelId = `c${number}-${string}`;

export const CUSTOM_CHANNEL_RE = /^c(\d+)-[a-z0-9][a-z0-9-]{0,40}$/;

export function isCustomChannelId(id: unknown): id is string {
  return typeof id === "string" && CUSTOM_CHANNEL_RE.test(id);
}

/** id 裡的 brandId；不是自訂通路就回 null。 */
export function brandIdOfChannelId(id: string): number | null {
  const m = CUSTOM_CHANNEL_RE.exec(id);
  if (!m) return null;
  const n = parseInt(m[1]!, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}
