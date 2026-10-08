/**
 * 把站內相對路徑（例如 /static/covers/xxx.jpg）轉成供應商抓得到的絕對網址。
 *
 * 2026-10-08：dev 第一篇走 Zernio 的排程發布失敗——
 * 「zernio 400: Invalid media URL: "/static/covers/…" is not a valid URL」。
 * 產出裡的圖片網址一直是相對路徑，瀏覽器看得懂，第三方抓不到。
 * 基底網址用 APP_URL（dev 與 prod 各自的 .env），沒設就不要猜，直接說清楚。
 */
import { PublishUserError } from "./publishAdapter";

export function toPublicUrl(url: string, baseUrl: string | undefined | null): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (!trimmed.startsWith("/")) return trimmed;
  const base = (baseUrl ?? "").trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(base)) {
    throw new PublishUserError("媒體網址是站內相對路徑，但 APP_URL 未設定為 https 網址，無法提供給發布服務。");
  }
  return `${base}${trimmed}`;
}

export function toPublicUrls(urls: string[], baseUrl: string | undefined | null): string[] {
  return urls.map((u) => toPublicUrl(u, baseUrl));
}
