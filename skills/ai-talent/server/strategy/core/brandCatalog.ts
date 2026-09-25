/**
 * brandCatalog — 一個品牌底下「有哪些產品、哪些活動」的清單區塊。
 *
 * 2026-09-23（CJ「我希望每一個頁面駐守的總監，都能先讀取該品牌完整的資料，
 * 包括品牌、產品列表等內容，不會出現：不行，我這裡沒有讀取你產品列表的
 * 功能。」）：
 *
 * 既有的 buildBrandPrefix()（brandContext.ts）是「把品牌大腦塞進 LLM
 * prompt」的唯一入口，但它吃的是**一個**產品（productId 參數）——那是給
 * 「正在為這個產品寫文案」的任務用的。策略總監的處境不同：他是常駐顧問，
 * 使用者隨時可能問「我有哪些產品」「哪一個產品定位最弱」，所以需要的是
 * 整份清單，而不是某一個產品的深度定位。
 *
 * 這個檔案只補「清單」這一塊，刻意不重做 buildBrandPrefix 已經做好的事
 * （品牌定位、語氣、禁用詞、市場脈絡）——呼叫端把兩者接起來用。理由跟
 * memory 裡 taskRegistry 那次一樣：同一件事有兩份各自維護的組裝邏輯，
 * 遲早會漂移成兩個答案。
 *
 * 2026-09-25：清單每一行帶的欄位，判準是「使用者在產品卡片上看得到的，總監就要
 * 看得到」——售價漏掉那次，定價策略師在畫面上寫著 NT$560 的情況下還反問售價。
 *
 * 欄位路徑用 canonical dot-path（positioningSchema.ts 的 PRODUCT_SEGMENTS），
 * 跟 brandContext.ts 讀產品定位時同一組路徑——memory 記的「writer 與 reader
 * 必須同步」那條坑，這裡是第五個 reader，所以只讀最不可能改的兩個欄位
 * （core.zhTagline / core.coreStatement），而且讀不到就顯示「尚未填寫」，
 * 不會靜默變成空字串讓人以為產品不存在。
 */
import localPool from "../../localDb.js";

/** 一個品牌最多列幾個產品的完整一行；超過的只列名字。控 prompt 長度用。 */
const DETAILED_PRODUCTS = 12;
const MAX_PRODUCTS = 60;
const DETAILED_EVENTS = 8;
const MAX_EVENTS = 40;

function parsePositioning(raw: any): any {
  if (!raw) return null;
  try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return null; }
}

/** canonical dot-path 取值；只接受字串（物件/陣列 String() 出來是 [object Object]）。 */
function pick(obj: any, path: string, max: number): string | null {
  let cur = obj;
  for (const key of path.split(".")) {
    if (!cur || typeof cur !== "object") return null;
    cur = cur[key];
  }
  if (typeof cur !== "string") return null;
  const v = cur.trim();
  if (!v || v === "null") return null;
  return v.length > max ? `${v.slice(0, max)}…` : v;
}

/** 第一個取得到的路徑就用它——舊資料散在不同路徑，跟 BrandsPage 卡片的 extractField 同一招。 */
function pickAny(pos: any, paths: string[], max: number): string | null {
  for (const path of paths) {
    const v = pick(pos, path, max);
    if (v) return v;
  }
  return null;
}

function productLine(idx: number, row: any): string {
  const pos = parsePositioning(row.positioning);
  const slogan = pos ? pick(pos, "core.zhTagline", 60) : null;
  const core = pos ? pick(pos, "core.coreStatement", 160) : null;
  // 2026-09-25（CJ「明明我在此產品中，有寫價格，但是產品顧問，還是重複問我價格，
  // 這不應該發生」）：售價是 positioning 的頂層 `price`（intake／掃描寫進去的格式化
  // 字串，例如「NT$560」），不在 PRODUCT_SEGMENTS 的任何一段裡，所以原本這行讀不到。
  //
  // 判準訂在這裡，之後加欄位照這條走：**使用者在產品卡片上看得到的，總監就要看得到**。
  // 卡片顯示的是 名稱／售價／標語／USP／受眾（BrandsPage getPreview），所以這行就這五樣。
  // 問一個畫面上已經寫著的數字，對使用者來說等於「你根本沒看我的資料」。
  // 路徑順序跟 client/src/v2/strategy/lib/productFacts.ts 同一份（canonical
  // facts.* 優先、舊位置其次）。那支改了，這裡要一起改。
  const price = pos ? pickAny(pos, ["facts.price", "price", "core.price"], 40) : null;
  const spec = pos ? pickAny(pos, ["facts.spec", "spec"], 60) : null;
  const weight = pos ? pickAny(pos, ["facts.weight", "weight"], 40) : null;
  const servings = pos ? pickAny(pos, ["facts.servings", "servings"], 40) : null;
  const url = pos ? pickAny(pos, ["facts.url", "productUrl", "url"], 120) : null;
  const usp = pos ? pickAny(pos, ["usp", "competition.uniqueUsp", "core.oneLineValueProp"], 120) : null;
  const audience = pos ? pickAny(pos, ["audience.primary", "targetAudience"], 120) : null;
  const bits = [`${idx}. ${row.name ?? "(未命名)"}（產品 id ${row.id}）`];
  if (price) bits.push(`售價：${price}`);
  // 2026-09-25（CJ「增加價格/規格／重量／份數 還有網址」）：顧客第一個問的是
  // 「幾克、幾份」，定價與 CP 值的討論沒有這兩個數字就只能反問。
  if (spec) bits.push(`規格：${spec}`);
  if (weight) bits.push(`重量／容量：${weight}`);
  if (servings) bits.push(`份數：${servings}`);
  if (slogan) bits.push(`Slogan：${slogan}`);
  if (core) bits.push(`核心定位：${core}`);
  if (usp) bits.push(`USP：${usp}`);
  if (audience) bits.push(`主客群：${audience}`);
  if (url) bits.push(`商品網址：${url}`);
  if (!slogan && !core && !usp && !audience) bits.push(pos ? "定位資料：有，但核心欄位尚未填寫" : "定位資料：尚未建立");
  // 事實欄位是空的就明講，總監才知道「要問」跟「已經有」的差別在哪。
  if (!price && !weight && !servings) bits.push("商品事實（售價／重量／份數）：尚未填寫");
  return bits.join("｜");
}

function fmtDate(d: any): string | null {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(String(d));
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
}

function eventLine(idx: number, row: any): string {
  const pos = parsePositioning(row.positioning);
  const core = pos ? pick(pos, "core.coreStatement", 140) : null;
  const from = fmtDate(row.startAt);
  const to = fmtDate(row.endAt);
  const period = from || to ? `${from ?? "?"} ~ ${to ?? "?"}` : "未設定期間";
  const bits = [`${idx}. ${row.name ?? "(未命名)"}（活動 id ${row.id}，${period}）`];
  if (core) bits.push(`核心：${core}`);
  return bits.join("｜");
}

/**
 * 這個品牌的產品／活動清單，組成可以直接塞進 prompt 的文字。
 * 查不到任何東西時回「目前沒有」而不是空字串——「你還沒有建立任何產品」
 * 跟「我讀不到你的產品」是兩件完全不同的事，總監必須答得出前者。
 */
export async function buildBrandCatalogBlock(brandId: number, userId: number): Promise<string> {
  const out: string[] = [];

  try {
    const [prodRows]: any = await localPool.execute(
      `SELECT id, name, positioning FROM products
        WHERE brandId = ? AND userId = ?
        ORDER BY updatedAt DESC
        LIMIT ${MAX_PRODUCTS}`,
      [brandId, userId],
    );
    const products = (prodRows as any[]) ?? [];
    if (products.length === 0) {
      out.push("【產品列表】這個品牌目前還沒有建立任何產品。");
    } else {
      const lines = products.slice(0, DETAILED_PRODUCTS).map((r, i) => productLine(i + 1, r));
      const rest = products.slice(DETAILED_PRODUCTS).map((r) => r.name ?? "(未命名)");
      out.push(`【產品列表】共 ${products.length} 個${products.length >= MAX_PRODUCTS ? "（僅列最近更新的前 60 個）" : ""}\n${lines.join("\n")}`
        + (rest.length ? `\n其餘 ${rest.length} 個：${rest.join("、")}` : ""));
    }
  } catch {
    // 查詢失敗時**不要**留白——留白會讓模型以為「這個品牌沒有產品」而講錯話。
    out.push("【產品列表】讀取產品清單時發生錯誤，這一輪請直接說明你暫時拿不到清單，不要猜。");
  }

  try {
    const [eventRows]: any = await localPool.execute(
      `SELECT id, name, startAt, endAt, positioning FROM events
        WHERE brandId = ? AND userId = ?
        ORDER BY COALESCE(startAt, createdAt) DESC
        LIMIT ${MAX_EVENTS}`,
      [brandId, userId],
    );
    const events = (eventRows as any[]) ?? [];
    if (events.length === 0) {
      out.push("【活動列表】這個品牌目前還沒有建立任何活動。");
    } else {
      const lines = events.slice(0, DETAILED_EVENTS).map((r, i) => eventLine(i + 1, r));
      const rest = events.slice(DETAILED_EVENTS).map((r) => r.name ?? "(未命名)");
      out.push(`【活動列表】共 ${events.length} 個\n${lines.join("\n")}`
        + (rest.length ? `\n其餘 ${rest.length} 個：${rest.join("、")}` : ""));
    }
  } catch {
    out.push("【活動列表】讀取活動清單時發生錯誤，這一輪請直接說明你暫時拿不到清單，不要猜。");
  }

  return out.join("\n\n");
}
