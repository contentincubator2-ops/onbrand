/**
 * customChannels — 用戶自己新增的 mission tray（通路）。
 *
 * 2026-10-04（CJ「也可自己增加 mission tray，例如要寫 momoshop 產品介紹、蝦皮賣場、
 * 網紅合作等」→「台灣常用的有 API 的開店平台或電商平台，也要在預設可以選擇的裡面」）。
 *
 * 一個自訂通路 = 一個名字 + 一個 id（`c<brandId>-<slug>`）+ 一份平台範本的出處。
 * 通路本身不帶任務卡：卡是用戶用既有的「貼範例 → 反推 SKILL」流程在這個通路底下建的
 * （brandTaskCards，card.channel = 通路 id）。所以這支只管「有哪些 tray」。
 *
 * 存在 `brands.positioning._customChannels[]`，零 migration（同 _taskCards 的模子）。
 *
 * ── 平台範本是資料，不是程式 ─────────────────────────────────────────
 * 加一個平台 = 加一列 CHANNEL_PRESETS。`api` 欄寫的是「我們查到的事實」，不是願景：
 *   official     官方公開文件，商品可新增／修改（2026-10-04 查證，細節仍待動工時讀文件）
 *   partner-key  有 API，但要向平台申請金鑰，沒找到公開商品文件
 *   none-found   沒找到公開 API（不等於沒有，要向平台窗口確認）
 *   n/a          不適用（網紅合作、自訂）
 * 第一版全部只做「寫文案＋匯出」，API 回寫是第二版（需人工逐筆核准）。
 */
import localPool from "../../../localDb";
import { CUSTOM_CHANNEL_RE } from "../../../platform/core/customChannelId";

export type ChannelGroup = "marketplace" | "storefront" | "partner" | "custom";
export type ApiStatus = "official" | "partner-key" | "none-found" | "n/a";
/** 這個通路產出的東西長什麼樣。listing＝商品頁（標題＋賣點＋規格＋描述），後續版本才有專屬預覽。 */
export type ChannelFormat = "post" | "listing" | "partner";

export interface ChannelPreset {
  key: string;
  zh: string;
  en: string;
  group: ChannelGroup;
  format: ChannelFormat;
  api: ApiStatus;
  note: { zh: string; en: string };
}

export const CHANNEL_PRESETS: readonly ChannelPreset[] = [
  // ── 電商平台（賣場）──────────────────────────────────────────────
  { key: "shopee", zh: "蝦皮購物", en: "Shopee", group: "marketplace", format: "listing", api: "official",
    note: { zh: "賣場商品標題、描述、關鍵字；官方 Open Platform 有商品新增與更新 API", en: "Listing title, description, keywords; official Open Platform product API" } },
  { key: "ruten", zh: "露天市集", en: "Ruten", group: "marketplace", format: "listing", api: "official",
    note: { zh: "商品標題與描述；官方 Open API 有商品新增、更新、查詢", en: "Listing copy; official Open API supports add/update/get product" } },
  { key: "momo", zh: "momo 購物網", en: "momo", group: "marketplace", format: "listing", api: "none-found",
    note: { zh: "商品介紹文案；供應商走 momo 後台，沒找到公開 API，先匯出再手動上傳", en: "Product copy; no public API found — export, then upload manually" } },
  { key: "pchome", zh: "PChome 24h／商店街", en: "PChome", group: "marketplace", format: "listing", api: "none-found",
    note: { zh: "商品介紹文案；沒找到官方 API，先匯出", en: "Product copy; no official API found — export" } },
  { key: "yahoo", zh: "Yahoo 奇摩購物中心", en: "Yahoo Shopping", group: "marketplace", format: "listing", api: "none-found",
    note: { zh: "商品介紹文案；沒找到 API 文件（超級商城已於 2023 年底停止服務）", en: "Product copy; no API docs found" } },
  { key: "coupang", zh: "酷澎 Coupang", en: "Coupang", group: "marketplace", format: "listing", api: "none-found",
    note: { zh: "商品介紹文案；韓國版有 Wing OPEN API，台灣版沒查到，待確認", en: "Product copy; Korea has Wing OPEN API, Taiwan not confirmed" } },
  // ── 開店平台（自有官網）──────────────────────────────────────────
  { key: "shopline", zh: "SHOPLINE", en: "SHOPLINE", group: "storefront", format: "listing", api: "official",
    note: { zh: "官網商品頁文案；官方 REST Admin API 有商品讀寫權限", en: "Storefront product copy; REST Admin API with product scopes" } },
  { key: "cyberbiz", zh: "Cyberbiz", en: "Cyberbiz", group: "storefront", format: "listing", api: "official",
    note: { zh: "官網商品頁文案；API 有商品讀寫權限，每秒上限 5 次", en: "Storefront product copy; product read/write scopes, 5 req/s" } },
  { key: "easystore", zh: "EasyStore", en: "EasyStore", group: "storefront", format: "listing", api: "official",
    note: { zh: "官網商品頁文案；有開發者文件與 API", en: "Storefront product copy; developer docs and API available" } },
  { key: "shopify", zh: "Shopify", en: "Shopify", group: "storefront", format: "listing", api: "official",
    note: { zh: "官網商品頁文案；有 Admin API", en: "Storefront product copy; Admin API available" } },
  { key: "91app", zh: "91APP", en: "91APP", group: "storefront", format: "listing", api: "partner-key",
    note: { zh: "官網商品頁文案；API 要向 91APP 申請金鑰，沒找到公開商品文件，先匯出", en: "Storefront product copy; API key from 91APP required, export first" } },
  // ── 合作 ────────────────────────────────────────────────────────
  { key: "influencer", zh: "網紅合作", en: "Influencer collab", group: "partner", format: "partner", api: "n/a",
    note: { zh: "讀網紅連結配切角 / 合作 brief / 邀約信 / 審稿意見", en: "Angles per creator from their links / collab brief / outreach / review feedback" } },
];

export function presetByKey(key: string): ChannelPreset | undefined {
  return CHANNEL_PRESETS.find((p) => p.key === key);
}

export interface CustomChannel {
  id: string;                    // c<brandId>-<slug>
  brandId: number;
  name: string;
  /** 從哪個平台範本建的；用戶自己命名的就是 null。 */
  preset: string | null;
  format: ChannelFormat;
  createdAt: string;
  createdBy: number;
}

export const MAX_CUSTOM_CHANNELS_PER_BRAND = 12;

/** 用戶取的名字 → id 用的 slug。中文取不出 ascii 時退回時間戳。 */
export function slugifyChannelName(name: string): string {
  const ascii = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (ascii.length >= 2) return ascii.slice(0, 30);
  return `ch-${Date.now().toString(36)}`;
}

/**
 * 蓋一個新通路。純函式，router 用。
 * 範本建的通路 slug 取範本 key（`c12-shopee`），讓 id 穩定可讀；撞名加序號。
 */
export function buildChannel(
  brandId: number,
  existing: Pick<CustomChannel, "id">[],
  opts: { preset?: string; name?: string; format?: ChannelFormat; userId: number; now?: string },
): CustomChannel {
  const preset = opts.preset ? presetByKey(opts.preset) : undefined;
  if (opts.preset && !preset) throw new Error(`unknown preset: ${opts.preset}`);
  const name = (opts.name?.trim() || preset?.zh || "").slice(0, 30);
  if (!name) throw new Error("name required");
  const base = `c${brandId}-${preset ? preset.key : slugifyChannelName(name)}`.slice(0, 44);
  let id = base;
  for (let i = 2; existing.some((c) => c.id === id); i++) id = `${base}-${i}`;
  if (!CUSTOM_CHANNEL_RE.test(id)) throw new Error(`invalid channel id: ${id}`);
  return {
    id, brandId, name,
    preset: preset?.key ?? null,
    // 範本自帶型態；用戶自己命名的，由他選（貼文／商品頁），沒選就是貼文。
    format: preset?.format ?? (opts.format === "listing" ? "listing" : "post"),
    createdAt: opts.now ?? new Date().toISOString(),
    createdBy: opts.userId,
  };
}

// ─────────────────────────────────────────────────────────────────────
// 讀寫（brands.positioning._customChannels[]）
// ─────────────────────────────────────────────────────────────────────
/** 不帶 userId 條件：權限在 router 那層擋（assertBrandAccess），這支只負責讀得到。 */
export async function listCustomChannels(brandId: number): Promise<CustomChannel[]> {
  const [rows]: any = await localPool.execute(
    `SELECT positioning AS p FROM brands WHERE id = ? LIMIT 1`, [brandId],
  );
  let pos: any = (rows as any[])[0]?.p;
  if (!pos) return [];
  if (typeof pos === "string") { try { pos = JSON.parse(pos); } catch { return []; } }
  const list = pos?._customChannels;
  return Array.isArray(list) ? (list as CustomChannel[]) : [];
}

/** 讀-改-寫，每次重新 SELECT，不把呼叫端手上那份 positioning 整包蓋回去（同 mutateBrandTaskCards）。 */
export async function mutateCustomChannels(
  brandId: number,
  userId: number,
  patch: (list: CustomChannel[]) => CustomChannel[],
): Promise<CustomChannel[]> {
  const [rows]: any = await localPool.execute(
    `SELECT positioning AS p FROM brands WHERE id = ? AND userId = ? LIMIT 1`, [brandId, userId],
  );
  const row = (rows as any[])[0];
  if (!row) throw new Error(`brand ${brandId} not found`);
  let pos: any = row.p;
  if (typeof pos === "string") { try { pos = JSON.parse(pos); } catch { pos = {}; } }
  pos = pos ?? {};
  const next = patch(Array.isArray(pos._customChannels) ? pos._customChannels : []);
  await localPool.execute(
    `UPDATE brands SET positioning = ? WHERE id = ? AND userId = ?`,
    [JSON.stringify({ ...pos, _customChannels: next }), brandId, userId],
  );
  return next;
}
