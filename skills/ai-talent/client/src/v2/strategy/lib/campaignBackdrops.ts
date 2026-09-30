/**
 * 策略層活動頁的底圖模板（左邊主視覺＋右邊故事圖）。
 *
 * 2026-09-30（CJ「底圖不應該是汽車…根據該產業和活動設計底圖」→「汽車業是從起點到
 * 終點的地圖，餐飲是從原料做成菜，文具是將不同的零件組合成一隻馬克筆」→「就讓
 * 用戶選擇吧，左邊和右邊的底圖，我們有固定模板，但用戶也可以自己選擇不同的」）。
 *
 *   · 模板是固定的一組，圖在 client/public/campaign-backdrops/<id>-left.webp、
 *     <id>-right.webp，由 scripts/gen-campaign-backdrops.ts 產（畫面描述也在那支）。
 *   · 「傳播圈」沒有圖：左邊畫這份企劃本身（ReachFan），右邊是中性的底。圖還沒產
 *     出來或載不到的時候，也退回這一組。
 *   · 用戶沒選＝依品牌產業挑；選了就存在活動上（campaign.setBackdrop）。
 *
 * 模板 id 跟產圖腳本各宣告一份，server 側的 campaignBackdropVocab.test.ts 比對兩邊。
 */
import generated from "./campaignBackdropIds.json";

export interface BackdropTheme {
  id: string;
  zh: string;
  en: string;
  /** 右邊那張圖在講的故事（選模板時的說明）。 */
  storyZh: string;
  storyEn: string;
  /** 依產業預設時，比對品牌產業欄位。 */
  industries?: RegExp;
}

export const DEFAULT_BACKDROP = "reach";

export const BACKDROP_THEMES: BackdropTheme[] = [
  { id: "reach", zh: "傳播圈", en: "Reach rings",
    storyZh: "左邊畫這份企劃本身：一圈一個階段、一個扇區一個通路", storyEn: "The plan itself: one ring per phase, one sector per channel" },
  { id: "roadtrip", zh: "起點到終點", en: "Road trip",
    storyZh: "從起點出發，一路開到終點的路線地圖", storyEn: "A route map from the start pin to the finish flag",
    industries: /汽車|車|機車|旅遊|旅行|交通|物流|car|auto|travel|mobility|logistics/i },
  { id: "kitchen", zh: "從原料到一道菜", en: "Farm to plate",
    storyZh: "食材→備料→下鍋→擺盤→上桌", storyEn: "Ingredients → prep → cooking → plating → served",
    industries: /餐|食|飲|咖啡|烘焙|甜點|牛排|肉|茶|酒|food|restaurant|cafe|coffee|bakery|beverage/i },
  { id: "marker", zh: "零件組成一支筆", en: "Parts to a marker",
    storyZh: "筆蓋、筆桿、墨水、筆頭，組成一支馬克筆，再畫出第一筆", storyEn: "Cap, barrel, ink and nib assembled into a marker",
    industries: /文具|筆|紙|手帳|美術|畫材|stationery|art supplies/i },
  { id: "garden", zh: "從種子到開花", en: "Seed to bloom",
    storyZh: "種子→發芽→長葉→結苞→開花", storyEn: "Seed → sprout → leaves → bud → bloom",
    industries: /美妝|保養|香氛|香水|彩妝|美容|保健|營養|健康|花|園藝|beauty|cosmetic|skincare|fragrance|wellness|health/i },
  { id: "blueprint", zh: "從藍圖到完工", en: "Blueprint to building",
    storyZh: "藍圖→地基→骨架→牆面→完工", storyEn: "Blueprint → foundation → frame → walls → finished",
    industries: /軟體|科技|資訊|SaaS|AI|app|平台|顧問|行銷|建築|房|software|tech|platform|agency|consult|real estate/i },
];

/** 已經產出圖的模板 id（產圖腳本寫的清單）。 */
const WITH_IMAGES = new Set<string>(generated as string[]);

export function hasImages(id: string): boolean {
  return WITH_IMAGES.has(id);
}

/** 可以選的模板：傳播圈永遠可選，其他要圖已經產出來。 */
export function availableBackdrops(withImages: Set<string> = WITH_IMAGES): BackdropTheme[] {
  return BACKDROP_THEMES.filter((t) => t.id === DEFAULT_BACKDROP || withImages.has(t.id));
}

/** 依品牌產業挑的預設模板。 */
export function backdropForIndustry(industry: string | null | undefined, withImages: Set<string> = WITH_IMAGES): string {
  const s = (industry ?? "").trim();
  if (!s) return DEFAULT_BACKDROP;
  const hit = BACKDROP_THEMES.find((t) => t.industries?.test(s) && withImages.has(t.id));
  return hit?.id ?? DEFAULT_BACKDROP;
}

/** 這檔活動實際要用哪一組：用戶選的（還能用的話）＞依產業＞傳播圈。 */
export function resolveBackdrop(
  chosen: string | null | undefined, industry: string | null | undefined, withImages: Set<string> = WITH_IMAGES,
): string {
  if (chosen === DEFAULT_BACKDROP) return DEFAULT_BACKDROP;
  if (chosen && withImages.has(chosen) && BACKDROP_THEMES.some((t) => t.id === chosen)) return chosen;
  return backdropForIndustry(industry, withImages);
}

export const backdropUrl = (id: string, side: "left" | "right") => `/campaign-backdrops/${id}-${side}.webp`;
