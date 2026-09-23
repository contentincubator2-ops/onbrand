/**
 * industries — 產業標籤，全系統唯一的一份。
 *
 * 2026-09-23 (CJ「每個市場消息，應該要匹配到公司的客戶行業標籤，這樣才能推播
 * 給對應的業務，讓業務轉給客戶」)。
 *
 * ── 為什麼是「唯一的一份」 ───────────────────────────────────────────
 * 這些 id 本來就存在，在 hub_solutions.industries 裡（manufacturing、
 * retail_ecommerce、food_beverage…），只是從來沒有在任何畫面上出現過——只存不用。
 * 現在市場消息與業務都要用同一組標籤，如果各自再定義一份，就會變成三份靠字串
 * 對上的清單，改了一邊另外兩邊不會跟著動。這個 repo 已經因為「兩個沒同步的
 * 關鍵字比對器」吃過一次苦頭。
 *
 * 所以值一個都不新增、一個都不改名，只是把它們集中起來並補上中英標籤。要加新
 * 產業就加在這裡，三個地方一起生效。
 *
 * ── all_industries 是特例，不是第五個產業 ────────────────────────────
 * 它代表「跟誰都有關」。補助與法規大多是這種，而「跟誰都有關」如果用「把四個
 * 產業都勾起來」來表達，之後新增第五個產業時，那些舊資料就會**悄悄漏掉**新產業。
 */

export const ALL_INDUSTRIES = "all_industries";

export interface Industry {
  id: string;
  en: string;
  zh: string;
}

/** 目前 hub_solutions 實際使用中的四個，值與那裡完全一致。 */
export const INDUSTRIES: Industry[] = [
  { id: "manufacturing", en: "Manufacturing", zh: "製造業" },
  { id: "retail_ecommerce", en: "Retail & e-commerce", zh: "零售與電商" },
  { id: "food_beverage", en: "Food & beverage", zh: "餐飲" },
  { id: "retail_lifestyle_services", en: "Lifestyle & services", zh: "生活服務業" },
];

const BY_ID = new Map(INDUSTRIES.map((i) => [i.id, i]));

export function industryLabel(id: string, zh: boolean): string {
  if (id === ALL_INDUSTRIES) return zh ? "不分產業" : "All industries";
  const row = BY_ID.get(id);
  // 認不得的 id 原樣回傳，不要悄悄吞掉 —— 看得到才會有人去修。
  return row ? (zh ? row.zh : row.en) : id;
}

/** 不在字彙表裡的 id。資料錯字的唯一出口。 */
export function unknownIndustries(ids: string[]): string[] {
  return ids.filter((id) => id !== ALL_INDUSTRIES && !BY_ID.has(id));
}

/**
 * 這則消息會不會送到這位業務手上。
 *
 * 兩邊都用「空的 = 不限」：市場消息沒標產業代表跟誰都有關，業務沒標產業代表
 * 他什麼都收。**刻意讓空的等於最大集合而不是最小集合**——漏掉一則補助的代價，
 * 是業務的客戶錯過申請期限；多收一則的代價，是他滑過去。這兩件事不對等。
 */
export function reaches(factIndustries: string[], repIndustries: string[]): boolean {
  const f = (factIndustries ?? []).filter(Boolean);
  const r = (repIndustries ?? []).filter(Boolean);
  if (!f.length || f.includes(ALL_INDUSTRIES)) return true;
  if (!r.length || r.includes(ALL_INDUSTRIES)) return true;
  return f.some((i) => r.includes(i));
}

/**
 * 這則消息今天還能不能推。
 *
 * 補助有截止日。**過期的補助推出去比不推更糟**——業務轉給客戶，客戶去申請才
 * 發現已經結束，那是業務要自己吞的難堪。所以到期日當天還算有效，隔天起就停。
 * 日期一律用 YYYY-MM-DD 比字串，不碰時區（跟緘默期、價格區間同一條紀律）。
 */
export function isLive(expiresOn: string | null | undefined, today: string): boolean {
  if (!expiresOn) return true;
  return expiresOn >= today;
}

/** 還剩幾天。null＝沒有期限。負數不會出現，過期的請先用 isLive 濾掉。 */
export function daysLeft(expiresOn: string | null | undefined, today: string): number | null {
  if (!expiresOn) return null;
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${expiresOn}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}
