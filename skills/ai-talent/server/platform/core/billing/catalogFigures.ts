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
 * 2026-09-29 CJ 兩個決定改了「對外宣稱」的定義：
 *   ① 內容通路只留 Facebook／Instagram／Threads／LINE／TikTok／電子報／官網（ChannelPicker 也只列這七個）；
 *   ② 前台任務卡只列兩類——爆款結構、品牌自建。得獎／標竿／平台通則的卡後端還在
 *      （本週企劃會用），但用戶在任務頁看不到，報價頁就不能再拿它們算張數。
 * 2026-10-10：YouTube、新聞稿開回來，通路數 7 → 9。
 * 爆款卡又只列當月、每月換（CJ 同日），張數每月不同，所以這裡只剩通路數。品牌自建卡的張數是方案
 * 額度（plans.ts ownTaskCards），不在這裡。
 */
export const CATALOG_FIGURES = {
  /** 可選通路數。 */
  channels: 9,
} as const;
