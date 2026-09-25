/**
 * productFacts — 產品的「事實欄位」（售價／規格／重量／份數／網址）讀取規則。
 *
 * 2026-09-25（CJ「將產品定位中，增加價格/規格／重量／份數 還有網址」）。
 *
 * ── 為什麼需要這一支 ──────────────────────────────────────────────────
 * 售價與商品網址在這一天之前就已經存在了，但存在 positioning 的**頂層**
 * （`price` / `productUrl`）——那是 intake 與官網掃描寫進去的位置，不屬於
 * PRODUCT_SEGMENTS 的任何一段，所以定位書裡看不到、策略總監也讀不到
 * （就是他在畫面寫著 NT$560 時還反問售價的原因）。
 *
 * 現在 canonical 位置是 `facts.*`（使用者在定位書「1.0 商品事實」填的就寫在這裡）。
 * 舊資料不動、也不做一次性搬遷 script：**讀的時候兩邊都認**，使用者第一次編輯
 * 這一段時自然落到 facts.*。搬遷 script 要對所有品牌的資料負責，這件事不值得那個風險。
 *
 * 注意：頂層那兩格**不是只有歷史資料**——產品 intake 與官網掃描（scopeRouter 的
 * backfillProductMeta）今天仍然寫 `price` / `productUrl`。所以「兩邊都認」是長期
 * 狀態，不是過渡期。改這裡的路徑順序時，那兩個寫入端與伺服器端的兩個讀取端
 * （brandCatalog / brandContext，各自註解指回這裡）要一起看。
 *
 * memory 記著「writer 與 reader 必須同步」那條坑——所以路徑只寫在這裡一份，
 * 伺服器端（brandCatalog / brandContext）用的是同一組路徑順序，改這裡時
 * 那兩處要一起改（各自檔案裡都有指回這支的註解）。
 */

export interface ProductFacts {
  price: string;
  spec: string;
  weight: string;
  servings: string;
  url: string;
}

const EMPTY: ProductFacts = { price: "", spec: "", weight: "", servings: "", url: "" };

/** canonical 優先、舊位置其次；都沒有就是空字串（不是 undefined，表單要吃得下）。 */
const PATHS: Record<keyof ProductFacts, string[]> = {
  price:    ["facts.price", "price", "core.price"],
  spec:     ["facts.spec", "spec"],
  weight:   ["facts.weight", "weight"],
  servings: ["facts.servings", "servings"],
  url:      ["facts.url", "productUrl", "url"],
};

function pick(positioning: any, path: string): string {
  let cur: any = positioning;
  for (const key of path.split(".")) {
    if (!cur || typeof cur !== "object") return "";
    cur = cur[key];
  }
  return typeof cur === "string" ? cur.trim() : "";
}

/** 把一支產品的事實欄位讀出來（含舊位置的回退）。 */
export function readProductFacts(positioning: unknown): ProductFacts {
  const pos: any = typeof positioning === "string"
    ? (() => { try { return JSON.parse(positioning); } catch { return null; } })()
    : positioning;
  if (!pos || typeof pos !== "object") return { ...EMPTY };

  const out = { ...EMPTY };
  for (const key of Object.keys(PATHS) as Array<keyof ProductFacts>) {
    for (const path of PATHS[key]) {
      const v = pick(pos, path);
      if (v) { out[key] = v; break; }
    }
  }
  return out;
}

/** 有沒有任何一格填了東西——空的一段不需要在總覽上佔版面。 */
export function hasAnyProductFact(positioning: unknown): boolean {
  const f = readProductFacts(positioning);
  return Object.values(f).some((v) => !!v);
}
