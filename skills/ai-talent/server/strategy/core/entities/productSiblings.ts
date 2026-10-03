/**
 * productSiblings — 讓同一品牌底下的每支產品，定位寫得出彼此的差別。
 *
 * 2026-10-02（CJ「產品頁面當中，每一個產品產出的定位，怎麼都是一樣的」）：用 DEV 真資料
 * （op-probe-product-positioning-diff）查到 SoWork 品牌 6 支產品的定位幾乎同一套話——
 * 「顧問把關策略＋AI 擴大規模」，其中兩支連標語都一字不差。原因有兩層：
 *
 *   (1) 輸入就是一樣的。sowork.ai 是前端渲染的站，每個商品頁回來的 <title>／meta 都是
 *       全站共用的「SoWork.ai — 顧問的策略深度 × AI 的執行規模」，匯入時被當成產品描述
 *       存進 6 支產品。pipeline 拿到的「產品資料」其實是品牌標語。
 *   (2) 每支產品的定位是各自獨立跑的，prompt 裡沒有任何一句說「同品牌還有哪些產品、
 *       你要跟它們不一樣」。資料一薄，模型就回到母品牌的共通論述。
 *
 * 所以這裡做兩件事：把「好幾支產品共用的描述」認出來、不再當產品事實；並把同品牌其他
 * 產品＋母品牌定位當成「要區隔的對象」交給每一步 prompt。
 */
import localPool from "../../../localDb";

export interface SiblingProduct {
  name: string;
  /** 已跑過定位的話，它的一句話價值主張／標語——讓模型知道哪些角度已經被用掉了。 */
  claim?: string;
}

/** 匯入時寫進 description 的固定格式：「<頁面標題>」，定價 X。商品頁：<url>。只取引號內那段。 */
export function coreOfSeedDescription(desc: string | null | undefined): string {
  let t = String(desc ?? "").trim();
  t = t.replace(/[。.]?\s*商品頁[:：]\s*\S+\s*$/u, "");
  t = t.replace(/[，,]\s*定價\s*[^，,。]*$/u, "");
  t = t.replace(/^「([\s\S]*)」$/u, "$1");
  return t.trim();
}

/**
 * 同一品牌裡，有沒有 ≥ 2 支產品的描述（去掉價格／網址後）一模一樣——那就是全站共用文字，
 * 不是產品資料。回傳這些共用文字的集合。
 */
export function findSharedDescriptions(descriptions: Array<string | null | undefined>): Set<string> {
  const count = new Map<string, number>();
  for (const d of descriptions) {
    const core = coreOfSeedDescription(d);
    if (core.length < 4) continue;
    count.set(core, (count.get(core) ?? 0) + 1);
  }
  return new Set(Array.from(count).filter(([, n]) => n >= 2).map(([k]) => k));
}

/**
 * 商品頁抓回來的標題／描述是不是全站共用的？判斷依據：跟其他產品共用的描述相同或互相包含
 * （前端渲染的站每頁都回首頁 <title>，匯入時就被當成每支產品的描述存下來）。
 */
export function isSiteWideText(text: string | undefined, shared: Set<string>): boolean {
  const t = String(text ?? "").trim();
  if (!t) return false;
  if (shared.has(t)) return true;
  for (const s of shared) if (s && (t.includes(s) || s.includes(t))) return true;
  return false;
}

/** 純函式：組出接在產品 prompt 後面的「同品牌其他產品／母品牌定位」段落。 */
export function buildSiblingBlock(args: {
  productName: string;
  productUrl?: string;
  siblings: SiblingProduct[];
  brandName?: string;
  brandClaim?: string;
  descriptionIsSiteWide?: boolean;
}): string {
  const lines: string[] = [];
  if (args.productUrl) lines.push(`商品頁網址：${args.productUrl}（網址路徑也透露這支產品是什麼）`);
  if (args.descriptionIsSiteWide) {
    lines.push(
      `注意：這支產品的商品頁只讀到全站共用的標題／描述，沒有產品專屬內容。` +
      `請從產品名稱、網址與品類去推論它「具體是什麼、解決什麼問題」，不要把品牌口號當成這支產品的賣點。`,
    );
  }
  if (args.brandClaim) {
    lines.push(
      `【母品牌${args.brandName ? `「${args.brandName}」` : ""}的共通定位（所有產品共享的底色）】${args.brandClaim}`,
    );
  }
  if (args.siblings.length) {
    lines.push(`【同品牌的其他產品——這支產品的定位必須跟它們明顯不同】`);
    for (const s of args.siblings) lines.push(`- ${s.name}${s.claim ? `：${s.claim}` : ""}`);
  }
  if (args.brandClaim || args.siblings.length) {
    lines.push(
      `區隔規則：這份定位要回答「為什麼選『${args.productName}』，而不是同品牌其他產品」。` +
      `標語、核心定位、獨家賣點、主要使用情境都要寫出這支產品自己的東西；` +
      `母品牌的共通理念只能當背景，不可以直接拿來當這支產品的標語或獨家賣點，` +
      `也不要沿用上面其他產品已經用掉的說法。`,
    );
  }
  return lines.length ? `\n\n${lines.join("\n")}` : "";
}

const parse = (v: any) => {
  if (v == null) return {};
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return {}; }
};
const short = (s: unknown, n: number) => {
  const t = typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "";
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

/** 同品牌最多列幾支——太多會吃掉 prompt，而且區隔效果在前幾支就夠了。 */
const MAX_SIBLINGS = 12;

/**
 * 讀這支產品的兄弟產品與母品牌定位，組成 prompt 段落；同時告訴呼叫端這支產品的描述是不是
 * 全站共用文字（是的話就不要再當產品事實餵給模型）。失敗回空——定位照舊跑。
 */
export async function loadProductSiblingContext(productId: number): Promise<{
  block: string;
  descriptionIsSiteWide: boolean;
  sharedDescriptions: Set<string>;
}> {
  const empty = { block: "", descriptionIsSiteWide: false, sharedDescriptions: new Set<string>() };
  try {
    const [rows]: any = await localPool.execute(
      `SELECT id, name, brandId, positioning FROM products
        WHERE brandId = (SELECT brandId FROM products WHERE id = ?) ORDER BY id`,
      [productId],
    );
    const all = rows as any[];
    const me = all.find((r) => Number(r.id) === productId);
    if (!me) return empty;
    const myPos = parse(me.positioning);
    const shared = findSharedDescriptions(all.map((r) => parse(r.positioning)?.description));
    const myCore = coreOfSeedDescription(myPos?.description);
    const descriptionIsSiteWide = !!myCore && shared.has(myCore);

    const siblings: SiblingProduct[] = all
      .filter((r) => Number(r.id) !== productId)
      .slice(0, MAX_SIBLINGS)
      .map((r) => {
        const p = parse(r.positioning);
        const claim = short(p?.core?.oneLineValueProp || p?.core?.zhTagline || "", 60);
        return { name: String(r.name ?? "").slice(0, 80), ...(claim ? { claim } : {}) };
      });

    let brandName: string | undefined;
    let brandClaim: string | undefined;
    if (me.brandId) {
      const [br]: any = await localPool.execute(
        `SELECT name, positioning FROM brands WHERE id = ? LIMIT 1`, [me.brandId]);
      const b = (br as any[])[0];
      if (b) {
        brandName = b.name ?? undefined;
        const bp = parse(b.positioning);
        const claim = [
          short(bp?.tagline?.zhTagline ?? bp?.tagline?.enTagline, 40),
          short(bp?.differentiation?.summary ?? bp?.goldenCircle?.why, 160),
        ].filter(Boolean).join("｜");
        if (claim) brandClaim = claim;
      }
    }

    const productUrl = typeof myPos?.productUrl === "string" ? myPos.productUrl
      : typeof myPos?.website === "string" ? myPos.website : undefined;

    return {
      block: buildSiblingBlock({
        productName: String(me.name ?? ""),
        productUrl,
        siblings,
        brandName,
        brandClaim,
        descriptionIsSiteWide,
      }),
      descriptionIsSiteWide,
      sharedDescriptions: shared,
    };
  } catch (e: any) {
    console.warn(`[productSiblings] load failed for product ${productId} (non-fatal):`, e?.message ?? e);
    return empty;
  }
}
