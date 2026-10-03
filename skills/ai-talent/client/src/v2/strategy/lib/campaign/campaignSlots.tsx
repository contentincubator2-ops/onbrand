/**
 * campaignSlots — 策略頁要放「活動企劃工作區」的插槽。
 *
 * 活動頁是「定位＋企劃合一頁」：設定、地圖、團隊對話、寫這一篇都在同一張畫面。
 * 工作區本身要用內容層的貼文預覽與任務視窗，所以它放在 content；策略層的
 * BrandsPage 只負責在活動分頁留一個位置，不直接 import 內容層。
 * 由 app 層（AppV2）在路由上提供實際元件。
 */
import { createContext, useContext, type ComponentType } from "react";

export interface CampaignSlots {
  /** 活動企劃工作區（地圖、設定、團隊對話、寫這一篇）。 */
  Stage: ComponentType<{ eventId: number; brandId: number | null }>;
  /** 活動標題旁的鎖定開關。 */
  LockToggle: ComponentType<{ eventId: number; en: boolean }>;
}

const CampaignSlotsContext = createContext<CampaignSlots | null>(null);
export const CampaignSlotsProvider = CampaignSlotsContext.Provider;
export function useCampaignSlots(): CampaignSlots | null {
  return useContext(CampaignSlotsContext);
}
