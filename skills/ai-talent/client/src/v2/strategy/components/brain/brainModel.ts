/**
 * brainModel — 品牌大腦一行記憶的形狀（對應 server/strategy/core/brandContext.ts BrainItem）。
 *
 * client 不得 value-import server，所以型別在這裡另寫一份——改 server 那邊的欄位要一起改這裡。
 * 「記憶」tray 怎麼把這些行對回策略層的欄位，見 memoryModel.ts。
 */
export type BrainItemStatus = "remembered" | "trimmed" | "overflow" | "checkOnly";

export interface BrainItem {
  /** 策略層 rail 上的分類：info／brand／copy／product／event（＋legacy）。 */
  category: string;
  /** 該頁的段落標題；文字頁沒有段落，是空字串。 */
  group: string;
  /** 該頁上的欄位／卡片名稱。 */
  label: string;
  storedChars: number;
  keptChars: number;
  status: BrainItemStatus;
  preview: string;
  /** 舊版 brand_brain 列 id：沒有編輯頁，只能在「記憶」直接忘掉。 */
  legacyRowId?: number;
  /** 出處（pos:… / asset:… / custom:… 等，見 server BrainItem.source）。 */
  source?: string;
}
