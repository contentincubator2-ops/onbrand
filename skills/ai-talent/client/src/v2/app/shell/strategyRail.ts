/**
 * 策略層左側 rail 的兩條規則：點了去哪裡、哪一顆亮著。
 *
 * 2026-09-30（CJ「我按了品牌以後，反而出現活動定位…目前的路徑很亂」）：
 * rail 的每一顆只帶 `?cat=`，品牌／產品／活動的 id 是點的當下補上去的。以前一律
 * 把網址上的 p／e 原封帶著走，所以人在某個活動裡按「品牌」，得到的是
 * `cat=positioning&e=31`——畫面是活動定位，亮的卻是「品牌」。
 *
 * 現在：
 *   · rail 是「我要看哪一層」的開關。按品牌／產品／活動／視覺／會議／記憶＝回到
 *     品牌層，p／e 清掉。
 *   · 只有「文字」保留 p／e：產品的行銷指引、活動的創意規範就住在那一格裡，
 *     沒有別的入口。
 *   · 人在某個產品／活動裡面時，亮的是「產品」／「活動」，不是「品牌」。
 */

/** 帶著產品／活動進去仍然有自己內容的分類。 */
const KEEPS_ENTITY = new Set(["copy"]);

/** 這些分類在產品／活動底下顯示的是「那個產品／活動自己的頁面」。 */
const ENTITY_PAGES = new Set(["positioning", "campaign", "settings", "info"]);

export function strategyRailTarget(cat: string, currentSearch: string, brandId: number | null | undefined): string {
  const cur = new URLSearchParams(currentSearch);
  const qs: string[] = [];
  if (brandId) {
    qs.push(`b=${brandId}`);
    if (KEEPS_ENTITY.has(cat)) {
      const pid = cur.get("p");
      const eid = cur.get("e");
      if (pid) qs.push(`p=${pid}`);
      if (eid) qs.push(`e=${eid}`);
    }
  }
  qs.push(`cat=${cat}`);
  return `/brands/edit?${qs.join("&")}`;
}

/** rail 上該亮哪一顆（對應 NavItem.catKey）。沒有 cat 時 /brands/edit 顯示的是定位。 */
export function strategyRailActiveCat(currentSearch: string): string {
  const cur = new URLSearchParams(currentSearch);
  const cat = cur.get("cat") ?? "positioning";
  if (ENTITY_PAGES.has(cat)) {
    if (cur.get("e")) return "events";
    if (cur.get("p")) return "products";
  }
  return cat;
}
