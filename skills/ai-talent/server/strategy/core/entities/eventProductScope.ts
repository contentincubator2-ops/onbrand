/**
 * eventProductScope — 一檔活動「搭配什麼」：單一產品／多產品聯合／純品牌。
 *
 * 2026-09-30（CJ「在新增活動的過程中，要讓用戶可以選擇，該活動是搭配哪個產品
 * 或是好幾個產品聯合或是 純品牌活動」）。
 *
 * ── 為什麼需要一個明確的欄位 ─────────────────────────────────────────
 * 在這之前，活動綁的產品只有 event_products 一張表，而「一個都沒綁」同時代表
 * 兩件完全不同的事：使用者還沒選，或使用者決定這是品牌活動。排企劃與寫文案的
 * prompt 分不出來，只能寫一句「沒有綁定特定產品」——模型就自己挑一個產品當主角。
 *
 * 所以多存一個 events.positioning.campaign.productScope：
 *   · "products" — 搭配產品（event_products 裡有一個＝單一產品，多個＝聯合）
 *   · "brand"    — 純品牌活動（event_products 必為空）
 *   · 沒有這個 key — 還沒選（舊活動都是這個狀態）
 *
 * 綁的產品本身仍然只存在 event_products（不複製第二份）。event_products 有資料時
 * 一律當成 "products"，不管 productScope 寫什麼——表是真相，欄位只負責分辨
 * 「空的」是哪一種空。
 *
 * 排企劃（campaignPlan.ts）與寫文案（brandContext.ts 的活動區塊）讀的是這裡的
 * 同一段說明，兩邊不會各說各話。
 */
import localPool from "../../../localDb.js";

export type ProductScope = "brand" | "products";

export interface ScopedProduct { id: number; name: string; facts: string }

function parseJson(raw: any): any {
  if (!raw) return {};
  if (typeof raw !== "string") return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

/** 產品定位 JSON → 一行事實。路徑順序跟 client/.../lib/productFacts.ts 同一份。 */
export function productFactLine(positioning: any): string {
  const pp = parseJson(positioning);
  const first = (paths: string[]): string => {
    for (const path of paths) {
      const v = path.split(".").reduce<any>((acc, k) => (acc == null ? acc : acc[k]), pp);
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };
  const price = first(["facts.price", "price", "core.price"]);
  const weight = first(["facts.weight", "weight"]);
  const servings = first(["facts.servings", "servings"]);
  const tagline = first(["core.zhTagline"]);
  const usp = first(["competition.uniqueUsp"]);
  return [
    price && `售價 ${price}`,
    weight && `重量 ${weight}`,
    servings,
    tagline && `標語「${tagline}」`,
    usp && `賣點：${usp.slice(0, 80)}`,
  ].filter(Boolean).join("｜");
}

/** 這檔活動綁的產品（event_products）。 */
export async function loadEventProducts(eventId: number): Promise<ScopedProduct[]> {
  const [rows]: any = await localPool.execute(
    `SELECT p.id, p.name, p.positioning
       FROM event_products ep JOIN products p ON p.id = ep.productId
      WHERE ep.eventId = ? ORDER BY p.id LIMIT 20`,
    [eventId],
  );
  return ((rows as any[]) ?? []).map((p) => ({
    id: Number(p.id), name: String(p.name), facts: productFactLine(p.positioning),
  }));
}

/** 表是真相：有綁產品就是 products；沒綁才看使用者有沒有明說是品牌活動。 */
export function resolveProductScope(stored: unknown, productCount: number): ProductScope | null {
  if (productCount > 0) return "products";
  return stored === "brand" ? "brand" : null;
}

/**
 * 給模型看的「這檔活動搭配什麼」。排企劃與寫文案共用。
 *
 * 三種寫法要求的東西不一樣，所以不是只列名字：純品牌要擋住模型自己挑產品；
 * 聯合要逼它交代「為什麼放在一起」，否則每一篇都只寫第一個。
 */
export function productScopeBrief(scope: ProductScope | null, products: ScopedProduct[]): string {
  const list = products.map((p) => `- ${p.name}${p.facts ? `：${p.facts}` : ""}`).join("\n");
  if (scope === "brand") {
    return "純品牌活動——不主打任何單一產品。主角是品牌本身（理念、服務、整體體驗）；不要自行挑一個產品當主打，也不要編產品規格或售價。";
  }
  if (scope === "products" && products.length === 1) {
    return `單一產品活動——主角是「${products[0]!.name}」，每一篇都圍繞這個產品。\n${list}`;
  }
  if (scope === "products" && products.length > 1) {
    return `多產品聯合活動（${products.length} 個產品）——這些產品一起出現在同一檔活動。要交代它們為什麼放在一起（組合／搭配／同系列）；單篇可以聚焦其中一個，但整檔活動每一個都要輪到，不要只寫第一個。\n${list}`;
  }
  return "（這檔活動還沒指定搭配的產品）";
}

/** 產品 id 只留下「這個帳號、這個品牌」底下真的有的——別人的產品 id 不進 event_products。 */
export async function ownedProductIds(ids: number[], userId: number, brandId: number | null): Promise<number[]> {
  const wanted = [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!wanted.length) return [];
  const [rows]: any = await localPool.execute(
    `SELECT id FROM products WHERE userId = ?${brandId ? " AND brandId = ?" : ""}`,
    brandId ? [userId, brandId] : [userId],
  );
  const owned = new Set(((rows as any[]) ?? []).map((r) => Number(r.id)));
  return wanted.filter((id) => owned.has(id));
}
