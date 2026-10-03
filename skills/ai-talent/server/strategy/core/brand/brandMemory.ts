/**
 * brandMemory — 「記憶」tray 的資料：這個品牌在策略層**真的存了什麼**，以及每一次寫作
 * AI 讀到了哪些。
 *
 * 2026-09-30（CJ「策略層當中，有包括品牌、產品、活動、文字還有視覺，還有其他你真實有
 * 存入的資料。你這樣整理，不是很精細」）：原本的大腦畫面只列 buildBrandBrain 讀進 prompt
 * 的那幾行——沒被讀的欄位（產品策略、活動旅程、視覺、知識庫……）完全看不到，用戶以為
 * 沒存。這裡一次回傳：
 *   · 原始資料（品牌定位 JSON、每個產品、每個活動、基本資料欄位、視覺），client 用策略層同一份 schema（positioningSchema / copyAssets /
 *     visualAssets）逐欄攤開——標題與欄位名跟策略層頁面一字不差；
 *   · 每一種寫作情境的大腦（只寫品牌／寫某個產品／寫某個活動），item 帶 source，
 *     client 用它把每一欄對到「讀了／只讀前段／沒讀到／只存著」。
 *
 * server 不 import client 的 schema（tsconfig 分開），所以欄位攤開放在 client 做。
 */
import localPool from "../../../localDb";
import { buildBrandBrain, BRAIN_CAPACITY, type BrainItem } from "./brandContext";
import { listRegulations } from "./brandRegulations";

/** 產品／活動太多時只算最近更新的這麼多個——每個都要跑一次大腦。 */
const MAX_ENTITIES = 30;

export interface MemoryBrain { usedChars: number; items: BrainItem[] }

export interface BrandMemory {
  capacity: number;
  brand: {
    name: string; industry: string; description: string; tagline: string; positioningSummary: string;
    website: string; socialLinks: Record<string, string>; targetCountry: string; outputLanguage: string;
    positioning: any;
  };
  /** 只寫品牌、不選產品活動時讀到的大腦（含市場、品牌、文字、舊資料）。 */
  brandBrain: MemoryBrain;
  products: Array<{ id: number; name: string; positioning: any; photoCount: number; brain: MemoryBrain }>;
  events: Array<{ id: number; name: string; startAt: string | null; endAt: string | null; positioning: any; brain: MemoryBrain }>;
  visual: { swatchCount: number; swatches: string[]; brandPhotoCount: number };
  /** 2026-09-30 策略層「法規」tray 的卡（停用的也列，只是不算用量）。 */
  regulations: Array<{ id: number; title: string; body: string; enabled: boolean }>;
}

const parse = (v: any): any => {
  if (v == null) return null;
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return null; }
};
const str = (v: any) => (v == null ? "" : String(v));
const rowsOf = async (sql: string, params: any[]): Promise<any[]> => {
  try {
    const [r]: any = await localPool.execute(sql, params);
    return Array.isArray(r) ? r : [];
  } catch {
    // 表或欄位在某些環境不存在（舊資料庫）——少一區不能讓整頁掛掉。
    return [];
  }
};

/** 產品／活動那一份大腦只留自己那一類的行；品牌那部分在 brandBrain 已經列過。 */
const onlyCategory = (b: { usedChars: number; items: BrainItem[] }, category: "product" | "event"): MemoryBrain =>
  ({ usedChars: b.usedChars, items: b.items.filter((i) => i.category === category) });

export async function loadBrandMemory(brandId: number, userId: number): Promise<BrandMemory | null> {
  const [brandRow] = await rowsOf(
    `SELECT name, industry, description, tagline, positioningSummary, website, socialLinks,
            targetCountry, outputLanguage, positioning
       FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
    [brandId, userId],
  );
  if (!brandRow) return null;

  const [colorRow] = await rowsOf(`SELECT brand_colors FROM brands WHERE id = ? LIMIT 1`, [brandId]);
  const colors = parse(colorRow?.brand_colors);
  const swatches: string[] = Array.isArray(colors?.swatches)
    ? colors.swatches.map((s: any) => str(s?.hex)).filter(Boolean)
    : [];

  const [productRows, eventRows, photoRows, regulations] = await Promise.all([
    rowsOf(`SELECT id, name, positioning FROM products WHERE brandId = ? ORDER BY updatedAt DESC LIMIT ${MAX_ENTITIES}`, [brandId]),
    rowsOf(`SELECT id, name, startAt, endAt, positioning FROM events WHERE brandId = ? ORDER BY updatedAt DESC LIMIT ${MAX_ENTITIES}`, [brandId]),
    rowsOf(`SELECT scope, scopeId, COUNT(*) AS c FROM asset_photos WHERE brandId = ? GROUP BY scope, scopeId`, [brandId]),
    listRegulations(brandId).catch(() => []),
  ]);

  const photoCount = (scope: string, scopeId: number) =>
    Number(photoRows.find((r) => r.scope === scope && Number(r.scopeId) === scopeId)?.c ?? 0);
  const brandPhotoCount = photoRows.filter((r) => r.scope === "brand").reduce((n, r) => n + Number(r.c ?? 0), 0);

  const [brandBrain, productBrains, eventBrains] = await Promise.all([
    buildBrandBrain(brandId),
    Promise.all(productRows.map((p) => buildBrandBrain(brandId, Number(p.id), null))),
    Promise.all(eventRows.map((e) => buildBrandBrain(brandId, null, Number(e.id)))),
  ]);

  return {
    capacity: BRAIN_CAPACITY,
    brand: {
      name: str(brandRow.name), industry: str(brandRow.industry), description: str(brandRow.description),
      tagline: str(brandRow.tagline), positioningSummary: str(brandRow.positioningSummary), website: str(brandRow.website),
      socialLinks: (parse(brandRow.socialLinks) ?? {}) as Record<string, string>,
      targetCountry: str(brandRow.targetCountry), outputLanguage: str(brandRow.outputLanguage),
      positioning: parse(brandRow.positioning) ?? {},
    },
    brandBrain: { usedChars: brandBrain.usedChars, items: brandBrain.items },
    products: productRows.map((p, i) => ({
      id: Number(p.id), name: str(p.name), positioning: parse(p.positioning) ?? {},
      photoCount: photoCount("product", Number(p.id)), brain: onlyCategory(productBrains[i]!, "product"),
    })),
    events: eventRows.map((e, i) => ({
      id: Number(e.id), name: str(e.name),
      startAt: e.startAt ? new Date(e.startAt).toISOString() : null, endAt: e.endAt ? new Date(e.endAt).toISOString() : null,
      positioning: parse(e.positioning) ?? {}, brain: onlyCategory(eventBrains[i]!, "event"),
    })),
    visual: { swatchCount: swatches.length, swatches: swatches.slice(0, 8), brandPhotoCount },
    // 記憶算的是進大腦的審查重點；還沒確認審查重點的卡當成未啟用。
    regulations: regulations.map((r) => ({ id: r.id, title: r.title, body: r.digest, enabled: r.active })),
  };
}
