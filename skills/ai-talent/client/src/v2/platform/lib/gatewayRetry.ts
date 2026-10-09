/**
 * gatewayRetry — 伺服器重啟的那幾十秒，替使用者把話再送一次。
 *
 * 2026-10-09（CJ「我剛剛按重新草擬，居然出現 502 訊息，這不可以發生」）：查到的原因——部署是
 * 把舊的程序砍掉再開新的（deploy-dev.yml：pm2 delete → pm2 start），那大約 20 秒裡 nginx 找不到
 * 後面的伺服器，正在跑的請求（草擬提案要幾十秒）直接斷掉、新送的請求一律 502。那一次重新草擬
 * 剛好跟 14:20 的部署撞在一起。
 *
 * 伺服器本身沒有壞，等它起來再送一次就好——所以「閘道錯誤／連不上」這一類的失敗，這裡安靜地
 * 等幾秒重送，使用者只看到進度條多跑一會。伺服器自己回的錯（額度不夠、資料不對…）不重送：
 * 那是真的答案，重送也一樣。
 *
 * 只給「重送一次結果也一樣」的操作用（草擬、改一段、梳理：都只回結果或整份覆寫）。會新增
 * 資料的操作不要用——第一次可能其實成功了。
 */

/** 這個失敗是不是「伺服器暫時不在」（502／503／504、連不上、回來的是 nginx 的 HTML）。 */
export function isGatewayError(e: unknown): boolean {
  const err = e as { message?: unknown; data?: { code?: unknown; httpStatus?: unknown } | null } | null;
  // 伺服器自己回的 tRPC 錯誤帶著 code——那是應用層的答案，不是閘道。
  if (err?.data?.code) return false;
  const status = Number(err?.data?.httpStatus ?? 0);
  if (status === 502 || status === 503 || status === 504) return true;
  const msg = String(err?.message ?? "");
  return /\b50[234]\b|Bad Gateway|Service Unavailable|Gateway Time-?out|Failed to fetch|NetworkError|Load failed|ECONNREFUSED|ECONNRESET|Unexpected token\s*'?<|is not valid JSON|<!DOCTYPE|<html/i.test(msg);
}

/** 每次重送前等多久（毫秒）。加起來約一分鐘，比一次部署重啟長。 */
export const GATEWAY_RETRY_DELAYS = [5_000, 12_000, 20_000, 25_000];

/**
 * 跑 fn；遇到閘道錯誤就等一下重跑，最多重跑 delays.length 次。其他錯誤、或重跑完還是不行，
 * 把最後一個錯誤丟出去。onWait 在每次等待前叫（畫面可以說「伺服器正在更新」）。
 */
export async function retryOnGateway<T>(
  fn: () => Promise<T>,
  opts: { delays?: number[]; onWait?: (attempt: number) => void; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const delays = opts.delays ?? GATEWAY_RETRY_DELAYS;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!isGatewayError(e) || attempt >= delays.length) throw e;
      opts.onWait?.(attempt + 1);
      await sleep(delays[attempt]!);
    }
  }
}

/**
 * 給使用者看的話：閘道錯誤不顯示「502」這種字，講發生什麼事、他的東西還在不在。
 * 其他錯誤：伺服器寫給人看的訊息照顯示，太長或沒有就用 fallback。
 */
export function gatewayMessage(e: unknown, fallback: string, en: boolean): string {
  if (isGatewayError(e)) {
    return en
      ? "The server was updating and didn't come back in time. Nothing was lost — please try again in a minute."
      : "系統正在更新，等了一分鐘還沒回來。你的內容都還在，請稍後再按一次。";
  }
  const raw = String((e as { message?: unknown } | null)?.message ?? "").trim();
  return raw && raw.length <= 200 ? raw : fallback;
}
