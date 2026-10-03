/**
 * campaignSchema — 活動的「設定」與「宣傳企劃」的共同語彙。
 *
 * 2026-09-25（CJ「大多數的活動，指的都是商品的促銷、優惠、或是搭售。或是有實體
 * 活動要宣傳，客戶的需求，都是希望有活動後，該活動該如何宣傳的企劃，然後，就可以
 * 針對活動，有宣傳企劃和開始撰寫內容，也包括網紅合作，異業合作等等」）。
 *
 * ── 這一版改了什麼 ───────────────────────────────────────────────────
 * 在這之前，建立活動會自動跑一份 11 段的**得獎提案 brief**（含獎項方向建議、
 * Grand Prix 參考案例、SMP、核心比喻）。那份文件是為「投獎／提案」設計的：對
 * 「母親節買一送一」來說，它的欄位有八成用不上，而真正決定宣傳怎麼寫的四件事
 * ——活動類型、優惠機制、適用商品、要達成什麼——一格都沒有。
 *
 * 更要命的是活動與內容之間沒有橋：brief 做完，使用者還是回任務庫一張一張開卡，
 * 自己記得折數與檔期。所以這一版的產出不是「一本書」，是**一排排好日期、可以
 * 直接開工的任務**。
 *
 * 得獎 brief 沒有被刪除，退成「參獎／提案」進階選項（舊活動打開照舊）。
 *
 * ── 這個檔案只放語彙，不放邏輯 ────────────────────────────────────────
 * 產生企劃的邏輯在 server/content/core/campaign/campaignPlan.ts。那支不能 import 這裡
 * （client 不得被 server value-import 的反向也一樣不健康），所以它自己宣告一份
 * 同樣的 id，並由 server 側的漂移測試（campaignPlanVocab.test.ts）比對兩邊——
 * 跨邊界測試放 server 側是這個 repo 的既有規矩。
 */

export type CampaignTypeId =
  | "promo_discount"   // 折扣、限時特價
  | "bundle"           // 買一送一、搭售、組合包
  | "new_launch"       // 新品上市
  | "seasonal"         // 節慶檔期（母親節、雙11…）
  | "offline"          // 實體活動、快閃、講座
  | "member";          // 會員回饋、回購

export interface CampaignTypeSpec {
  id: CampaignTypeId;
  zh: string;
  en: string;
  /** 這一類活動最該講清楚的那件事——直接當機制欄位的提示。 */
  mechanicHintZh: string;
  mechanicHintEn: string;
  /** 預設建議的通路（使用者可改）。 */
  defaultChannels: string[];
}

export const CAMPAIGN_TYPES: CampaignTypeSpec[] = [
  {
    id: "promo_discount", zh: "促銷折扣", en: "Discount promo",
    mechanicHintZh: "例：全站 85 折，滿 NT$1,200 再免運，只到 5/12 23:59",
    mechanicHintEn: "e.g. 15% off sitewide, free shipping over NT$1,200, ends 5/12",
    defaultChannels: ["facebook", "instagram", "email"],
  },
  {
    id: "bundle", zh: "買一送一／搭售", en: "Bundle / BOGO",
    mechanicHintZh: "例：橫膈牛排買二送一；或牛排＋醬料組合價 NT$899（原價 NT$1,060）",
    mechanicHintEn: "e.g. buy 2 get 1 free; or steak + sauce bundle at NT$899 (list NT$1,060)",
    defaultChannels: ["facebook", "instagram", "email"],
  },
  {
    id: "new_launch", zh: "新品上市", en: "New launch",
    mechanicHintZh: "例：5/1 開賣，前 100 名加贈試吃包，首週 9 折",
    mechanicHintEn: "e.g. on sale 5/1, first 100 orders get a sample pack, 10% off week one",
    defaultChannels: ["facebook", "instagram", "pr", "email"],
  },
  {
    id: "seasonal", zh: "節慶檔期", en: "Seasonal",
    mechanicHintZh: "例：母親節送禮組合，5/1–5/12，指定組合免運＋附贈卡片",
    mechanicHintEn: "e.g. Mother's Day gift sets, 5/1–5/12, free shipping + gift card",
    defaultChannels: ["facebook", "instagram", "email"],
  },
  {
    id: "offline", zh: "實體活動／快閃", en: "Offline / pop-up",
    mechanicHintZh: "例：5/18 14:00 松菸快閃試吃，現場購買 8 折，需線上報名",
    mechanicHintEn: "e.g. 5/18 2pm pop-up tasting, 20% off on site, sign-up required",
    defaultChannels: ["facebook", "instagram", "pr"],
  },
  {
    id: "member", zh: "會員回饋", en: "Member reward",
    mechanicHintZh: "例：老顧客回購 8 折，生日月加贈，限已購買過的會員",
    mechanicHintEn: "e.g. 20% back for returning customers, birthday-month bonus",
    defaultChannels: ["email", "facebook"],
  },
];

/** 檔期節奏。日期由起迄日推算（campaignPlan.ts 的 planBeats）。 */
export type CampaignPhaseId = "teaser" | "launch" | "sustain" | "lastcall" | "encore";

export interface CampaignPhaseSpec {
  id: CampaignPhaseId;
  zh: string;
  en: string;
  /** 這一段的任務在講什麼——寫給使用者看，也寫進產生企劃的 prompt。 */
  purposeZh: string;
}

export const CAMPAIGN_PHASES: CampaignPhaseSpec[] = [
  { id: "teaser",   zh: "預熱",      en: "Teaser",    purposeZh: "還不講折數，先把「為什麼現在該注意」說出來，累積想買的人" },
  { id: "launch",   zh: "開賣",      en: "Launch",    purposeZh: "機制一次講清楚：買什麼、優惠是什麼、到什麼時候、去哪買" },
  { id: "sustain",  zh: "中段加溫",  en: "Sustain",   purposeZh: "換角度再說一次——使用情境、顧客回饋、比較與選購建議" },
  { id: "lastcall", zh: "倒數",      en: "Last call", purposeZh: "把期限變成理由，給還在猶豫的人最後一次推力" },
  { id: "encore",   zh: "結束／返場", en: "Encore",   purposeZh: "結束公告或加碼延長；沒買到的人要知道下一次是什麼時候" },
];

export function phaseOf(id: unknown): CampaignPhaseSpec | null {
  return CAMPAIGN_PHASES.find((p) => p.id === id) ?? null;
}

/**
 * 這檔活動搭配什麼：products＝搭配產品（一個＝單一產品，多個＝聯合），brand＝純品牌活動。
 * 沒有值＝還沒選。綁的產品本身存在 event_products，這裡只分辨「沒綁」是哪一種。
 * 語意在 server/strategy/core/entities/eventProductScope.ts。
 */
export type ProductScope = "brand" | "products";

/** 使用者在「設定」填的東西。存在 events.positioning.campaign。 */
export interface CampaignSettings {
  type: CampaignTypeId | "";
  /** 優惠機制一句話——企劃與每一篇文案都從這句長出來。 */
  mechanic: string;
  /** 想達成什麼（賣出 X／帶人到店／收名單／曝光）。 */
  goal: string;
  /** 通路（任務卡會從這些平台裡挑）。 */
  channels: string[];
  /** 實體活動才會用到。 */
  venue?: string;
  sessions?: string;
  signupUrl?: string;
  /** 合作模組：勾了企劃才會生出對應的段落。 */
  partners?: { kol?: boolean; cobrand?: boolean };
  productScope?: ProductScope;
}

export const EMPTY_CAMPAIGN_SETTINGS: CampaignSettings = {
  type: "", mechanic: "", goal: "", channels: [],
  venue: "", sessions: "", signupUrl: "",
  partners: { kol: false, cobrand: false },
};

/** 企劃上的一格＝一篇要寫的東西。 */
export interface CampaignPlanItem {
  id: string;
  phase: CampaignPhaseId;
  /** YYYY-MM-DD */
  date: string;
  platform: string;
  /** 真實存在的任務卡 id（產生時已對過目錄，對不到的不會留下來）。 */
  taskId: string;
  taskLabel: string;
  /** 這一篇要講什麼——開卡時帶成題目。 */
  angle: string;
  /** 使用者可以關掉不做，但不刪除（之後可能又要）。 */
  enabled: boolean;
  /** 已經寫過的話，指回產出。 */
  outputId?: number | null;
  scheduledAt?: string | null;
  /**
   * 這一格的卡是模型選的，還是驗證失敗後系統補的（server 的 reconcileItems）。
   * 畫面上要看得見：補上的那格值得使用者多看一眼，而不是假裝一切正常。
   */
  repaired?: boolean;
  /** 內容層可以把某一篇拿出本週企劃（false）；沒有＝定稿後照日期進本週企劃。 */
  inPlanner?: boolean;
  /** 這一篇要下廣告。 */
  paid?: boolean;
  /** 合作類的線：這一件是給誰（網紅任務說明單裡的那一位／那一類）。 */
  partner?: string;
  /** 發出去之後的貼文連結（campaign.markPublished；2026-10-02）。 */
  publishedUrl?: string | null;
}

export interface CampaignPartnerBlock {
  /** 這段合作的一句話目的。 */
  summary: string;
  /** 具體待辦（找誰、給什麼、怎麼談）——每一條可以開成一張卡。 */
  steps: Array<{ id: string; text: string; taskId?: string; taskLabel?: string; done?: boolean }>;
}

export interface CampaignPlan {
  /** 這檔活動的一句話訴求。 */
  smp: string;
  items: CampaignPlanItem[];
  /** 每一段要讓人記住的一句話；舊企劃沒有。 */
  phaseMessages?: Partial<Record<CampaignPhaseId, string>>;
  /** 定稿時間；有值＝整份鎖住。 */
  lockedAt?: string | null;
  /** KPI、預算與每一段的分配（見 lib/campaignKpi.ts）。 */
  kpi?: import("./campaignKpi").CampaignKpi | null;
  kol?: CampaignPartnerBlock | null;
  cobrand?: CampaignPartnerBlock | null;
  generatedAt?: string;
  /** 產生時用的設定快照——設定改了要提示使用者重新產生。 */
  settingsHash?: string;
}

