/**
 * meetingSources — 會議可以引用的「證據來源」：品牌在 OnBrand 裡每一頁的實際內容，
 * 編號 S1、S2…，每一個都帶「在哪一頁」的連結。
 *
 * 2026-09-26（CJ「剛剛指出的問題，我希望都可以引用到該頁面的證據」）：第一版會議只有
 * 策略監測情報（E 編號）可以引用，其他全部標「會中討論」——但總監講的「雪花牛排產品頁
 * 文案偏溫情」「有品項沒填售價」其實都是從品牌自己的資料看出來的，只是沒標出處，
 * 用戶沒辦法點過去核對。
 *
 * 規則：
 *   - 來源的內容就是餵給總監的那段文字（同一份），所以引用的「原文」可以逐字核對。
 *   - 模型給的 quote 必須是來源內容的子字串，不是就丟掉 quote、只留來源——
 *     不讓模型編一句「產品頁上寫著…」。
 */
import localPool from "../../localDb";
import { productLine } from "./brandCatalog";
import { flattenSegment, type MeetingScope } from "./strategyMeetings";

export interface MeetingSource { code: string; label: string; href: string; text: string }

const BRAND_SEGMENTS: Array<[string, string]> = [
  ["goldenCircle", "黃金圈"], ["tagline", "品牌標語"], ["origin", "品牌起源"], ["values", "價值觀"],
  ["audience", "目標受眾"], ["competition", "競爭格局"], ["differentiation", "差異化"],
  ["trends", "趨勢"], ["voice", "品牌語氣"], ["facts", "品牌事實"],
];
const PRODUCT_SEGMENTS: Array<[string, string]> = [
  ["core", "核心定位"], ["audience", "目標族群"], ["value", "價值主張"], ["competition", "競品比較"],
  ["strategy", "產品策略"], ["marketing", "行銷溝通"],
];
const COPY_ASSETS: Array<[string, string]> = [
  ["voice", "聲音指南"], ["voice_principles", "聲音原則"], ["preferred_terms", "偏好用詞"],
  ["banned_words", "禁用詞"], ["cta_library", "CTA 範例"], ["hook_library", "鉤子庫"],
];

const parse = (v: unknown): any => {
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return {}; } }
  return v ?? {};
};

function assetText(a: any): string {
  if (!a) return "";
  if (typeof a.text === "string") return a.text.trim();
  if (Array.isArray(a.items)) return a.items.map(String).join("、");
  if (Array.isArray(a.pairs)) return a.pairs.map((p: any) => `${p.from ?? "?"}→${p.to ?? "?"}`).join("、");
  return "";
}

export async function buildMeetingSources(args: { userId: number; brandId: number; scope: MeetingScope; scopeId: number }): Promise<MeetingSource[]> {
  const out: MeetingSource[] = [];
  const add = (label: string, href: string, text: string) => {
    const t = text.trim();
    if (!t) return;
    out.push({ code: `S${out.length + 1}`, label, href, text: t.length > 500 ? `${t.slice(0, 500)}…` : t });
  };
  const b = args.brandId;

  const [bRows]: any = await localPool.execute(`SELECT positioning FROM brands WHERE id = ? AND userId = ? LIMIT 1`, [b, args.userId]);
  const bpos = parse((bRows as any[])[0]?.positioning);

  // 產品範圍的會：這個產品自己的每一格排最前面。
  if (args.scope === "product") {
    const [pRows]: any = await localPool.execute(
      `SELECT id, name, positioning FROM products WHERE id = ? AND brandId = ? AND userId = ? LIMIT 1`, [args.scopeId, b, args.userId],
    );
    const p = (pRows as any[])[0];
    if (p) {
      const ppos = parse(p.positioning);
      for (const [id, label] of PRODUCT_SEGMENTS) {
        add(`產品「${p.name}」定位・${label}`, `/brands/edit?cat=positioning&b=${b}&p=${p.id}`, flattenSegment(ppos[id], 500));
      }
    }
  }

  for (const [id, label] of BRAND_SEGMENTS) {
    add(`品牌定位・${label}`, `/brands/edit?cat=positioning&b=${b}`, flattenSegment(bpos[id], 500));
  }

  const assets = bpos?._assets ?? {};
  for (const [key, label] of COPY_ASSETS) add(`文字頁・${label}`, `/brands/edit?cat=copy&b=${b}`, assetText(assets[key]));

  const [prodRows]: any = await localPool.execute(
    `SELECT id, name, positioning FROM products WHERE brandId = ? AND userId = ? ORDER BY updatedAt DESC LIMIT 12`, [b, args.userId],
  );
  (prodRows as any[]).forEach((r, i) => {
    if (args.scope === "product" && Number(r.id) === args.scopeId) return;
    // 產品卡片上看得到的那幾樣（售價／規格／標語／USP／受眾）——同 brandCatalog 的判準。
    add(`產品「${r.name}」`, `/brands/edit?cat=positioning&b=${b}&p=${r.id}`, productLine(i + 1, r).replace(/^\d+\.\s*/, ""));
  });
  return out;
}

export function sourcesBlock(sources: MeetingSource[]): string {
  return sources.map((s) => `[${s.code}] ${s.label}：${s.text}`).join("\n");
}

/** 引用的原文必須逐字出現在來源裡（忽略空白差異）；不是就回 null。 */
export function verifyQuote(quote: unknown, source: MeetingSource | undefined): string | null {
  if (!source || typeof quote !== "string") return null;
  const q = quote.trim().replace(/^[「『"]|[」』"]$/g, "");
  if (q.length < 2) return null;
  const norm = (s: string) => s.replace(/\s+/g, "");
  return norm(source.text).includes(norm(q)) ? q.slice(0, 160) : null;
}
