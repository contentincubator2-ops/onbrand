/**
 * customChannelId（client）— 自訂通路 id 的形狀。
 * 與 server/platform/core/customChannelId.ts 同一份；client 不得 value-import server，
 * 所以這裡留一份鏡像，由 server 側的 customChannels.test.ts 鎖兩邊一致。
 * 刻意不 import 任何東西，讓那支跨邊界測試載得進來。
 */
export const CUSTOM_CHANNEL_RE = /^c(\d+)-[a-z0-9][a-z0-9-]{0,40}$/;

export function isCustomChannelId(id: unknown): id is string {
  return typeof id === "string" && CUSTOM_CHANNEL_RE.test(id);
}