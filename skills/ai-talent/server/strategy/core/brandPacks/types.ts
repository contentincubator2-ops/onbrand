/**
 * brandPacks/types — 一個品牌的專屬任務結構。
 *
 * 2026-08-29 (CJ「整個結構要可以讓每個品牌，只出現他的定位、任務，不會
 * 出現他用不到的」+「客製化的過程，就會是我使用 Claude Code 幫每個客戶
 * 開發」):
 *
 * ── 這一層在解什麼 ────────────────────────────────────────────────────
 * 在這之前，任務卡目錄是全域的，而且三條看起來能做 per-brand 的路都是死的：
 *   · quickTask.listFB 沒有 input schema，client 傳 undefined
 *   · squadTemplateRouter.listByBrand 收了 brandId 但回呼沒用到它
 *   · missions / user_workspaces 真的有 brandId，但那層 UI 2026-05-10 退役了
 *
 * 所以每個客戶登入後看到的是同一份 200+ 張卡的目錄，其中絕大多數跟他的
 * 業務無關。建設公司要滑過 TikTok 開場鉤子和 KOL 邀約信才找得到自己要的。
 *
 * ── 為什麼是程式碼不是資料庫 ──────────────────────────────────────────
 * CJ：「只能透過 SoWork 的工程師，透過我們寫程式或是 Vibe coding 的方式
 * 修改」。所以 pack 就是一個 .ts 檔，一個客戶一個。好處是版本控管、可
 * code review、跟著 CI 部署、可以被測試鎖住；而且用 Claude Code 開發時，
 * 「打開這個檔改」比「開一個後台點來點去」快得多。
 *
 * DB 完全不用改 —— pack 靠 brandIds / brandNames 對到品牌，沒有新欄位、
 * 沒有 migration。
 *
 * ── exclusive 的語意 ──────────────────────────────────────────────────
 * 有 pack 的品牌：頻道列與卡片清單「完全」由 pack 決定，全域目錄一張都不
 * 出現。沒有 pack 的品牌：行為跟今天一模一樣，一個位元都沒變。
 *
 * 這個「有就全取代、沒有就全不變」的二分法是刻意的。如果做成「全域 ＋ 品牌
 * 加卡」的疊加模式，客戶還是會看到一堆用不到的卡，等於沒解決原本的問題。
 */
import type { FBTaskTemplate, OrchestraConfig } from "../../../content/core/quickTaskFB";
import type { CatalogPlatform } from "../../../content/core/taskCatalogIndex";

/** pack 底下一個頻道的形式分類（UI 上的 pill）。 */
export interface BrandPackFormat {
  id: string;
  labelZh: string;
  labelEn: string;
}

/** pack 底下的一個頻道。順序就是側邊欄的順序。 */
export interface BrandPackChannel {
  /** 對到 CatalogPlatform；同時決定 /tasks/<route> 走哪個版型與 mockup 家族。 */
  key: CatalogPlatform;
  labelZh: string;
  labelEn: string;
  /** 這個頻道底下的 pill。至少一個。 */
  formats: BrandPackFormat[];
}

/**
 * pack 裡的一張卡。
 *
 * 兩種寫法：
 *   1. 自訂卡 —— 給 template + config，完整定義一張品牌專屬任務。
 *   2. 沿用卡 —— 給 ref 指向全域目錄裡既有的 task id，可選擇覆寫標題與說明。
 *
 * 沿用卡的存在是為了誠實標示「這張是套 SoWork 的通用結構，不是客戶自己的
 * 做法」—— 對到 CJ 要求任務卡要標記哪些沿用客戶自己的做法、哪些套 SoWork
 * 市場結構任務卡。
 */
export type BrandPackCard =
  | {
      kind: "custom";
      channel: CatalogPlatform;
      format: string;
      /** 來源標記：這張卡是客戶自己的做法，還是套 SoWork 的通用結構。 */
      origin: "brand" | "sowork";
      template: FBTaskTemplate;
      config: OrchestraConfig;
    }
  | {
      kind: "ref";
      channel: CatalogPlatform;
      format: string;
      origin: "brand" | "sowork";
      /** 全域目錄裡既有的 task id。 */
      ref: string;
      /** 只覆寫顯示用的文案，引擎設定照全域那張。 */
      label?: { zh: string; en: string };
      description?: { zh: string; en: string };
    };

export interface BrandPack {
  /** 檔名等級的識別碼，用於 log 與測試。 */
  key: string;
  /** 給人看的品牌名，出現在 log 裡。 */
  brandName: string;
  /**
   * 對到哪些品牌。兩種都支援是因為 dev 與 prod 的 brandId 不同 ——
   * 用 id 精準，用 name 可攜。任一命中就套用。
   */
  match: { brandIds?: number[]; brandNames?: string[] };
  channels: BrandPackChannel[];
  cards: BrandPackCard[];
}
