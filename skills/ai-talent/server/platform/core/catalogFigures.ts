/**
 * catalogFigures — 對外宣稱的任務卡張數與通路數，唯一一份。
 *
 * 2026-09-21：報價頁寫「249／203／41、11 個通路」，實際目錄早已是 259／213／51、
 * 12 個 —— 9/10 補上 X 通路，一次多了 10 張平台通則卡，而這些數字散落在 7 個
 * 檔案的文案裡，沒有任何東西會報錯。
 *
 * 現在文案一律引用這份（client 那邊是 v2/platform/lib/catalogFigures.ts 的同名鏡像，
 * client 不 import server），catalogFigures.test.ts 拿真實目錄對過這些數字、並鎖住
 * 兩邊一致。之後加一張卡、加一個通路，這裡沒跟著改就會紅燈。
 *
 * 只有 total／basic／sourced／各來源數是「算得出來」的；channels 是產品定義
 * （ChannelPicker 可選的通路），測試對的是它的顯示表。
 *
 * 2026-09-29：LinkedIn／YouTube／新聞稿／X 下架（planGate.HIDDEN_CONTENT_PLATFORMS），
 * 這裡只算用戶看得到的卡：259→185 張、12→8 個通路。
 */
export const CATALOG_FIGURES = {
  /** 專業方案可用：全部任務卡。 */
  total: 185,
  /** 基礎方案可用：扣掉爆款結構卡。 */
  basic: 154,
  award: 75,
  benchmark: 45,
  viral: 31,
  /** 平台通則 —— 沒有出處。 */
  evergreen: 34,
  /** 說得出結構出處 = 得獎 ＋ 標竿 ＋ 爆款。 */
  sourced: 151,
  /** 可選通路數。 */
  channels: 8,
} as const;
