/**
 * nonProductNames — 判斷一個「產品名稱」其實是不是垃圾（促銷標語／最新消息／
 * 網站頁籤／公司登記名…）。
 *
 * 2026-09-24（CJ「刪除AI掃描官網的功能」）：這條規則原本住在
 * server/strategy/core/productDiscovery.ts —— 爬官網時用來把「夏日穿搭推薦」
 * 「新品快訊」「XX股份有限公司」這類東西擋在 products 表外面。掃描功能整個
 * 移除之後，規則本身還有用：資料庫裡還留著當年掃進來的垃圾列，
 * clean-nonproduct-records.ts 要靠它找出來清掉。
 *
 * 放在 scripts/lib 而不是 server/：server 已經沒有任何地方需要它了，搬回
 * server 只會讓人以為線上還有東西在用這條規則。規則內容一字未改（從刪掉的
 * 檔案原樣搬過來），因為它要比對的正是歷史資料。
 */

const NON_PRODUCT_RE = new RegExp(
  [
    // promos / campaigns
    "優惠", "促銷", "特價", "折扣", "免運", "滿額", "限時", "抽獎", "回饋", "專區", "倒數", "活動",
    // news / notices / trust-safety banners
    "最新消息", "新聞", "快訊", "公告", "通知", "詐騙", "防詐",
    // site chrome / account / support
    "客服", "登入", "註冊", "購物車", "會員", "關於我們", "聯絡我們", "常見問題", "隱私", "條款",
    // editorial / navigation labels
    "穿搭推薦", "推薦清單", "排行榜", "LOOKBOOK",
    // hype-only phrases that aren't product names by themselves
    "新品上市", "新裝上市", "新品快訊",
    // 2026-07-23 (IRIS): company legal names + standalone seasonal labels
    // scraped off storefront homepages are not products
    "股份有限公司", "有限公司",
    "^春夏新品$", "^秋冬新品$", "^[春夏秋冬]季?新品$", "^新品$",
    // english equivalents
    "\\bsale\\b", "\\bnews\\b", "\\bpromo", "coupon", "\\blogin\\b", "sign ?up", "about us", "contact us", "\\bfaq\\b",
  ].join("|"),
  "i",
);

export function looksLikeNonProduct(name: string): boolean {
  const n = (name ?? "").trim();
  if (n.length < 2) return true;
  return NON_PRODUCT_RE.test(n);
}
