/**
 * catalogFigures — client 端的鏡像，見 server/platform/core/catalogFigures.ts。
 *
 * client 不 import server（跨邊界規則），所以這裡自己宣告一份；
 * server/platform/core/catalogFigures.test.ts 會拿真實任務卡目錄對過這些數字，
 * 並鎖住兩邊一致。文案裡不要再手寫這些數字，一律引用這裡。
 */
export const CATALOG = {
  total: 259,
  basic: 213,
  award: 99,
  benchmark: 63,
  viral: 46,
  evergreen: 51,
  sourced: 208,
  channels: 12,
} as const;
