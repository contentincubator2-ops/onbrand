/**
 * probe-product-positioning-dryrun — 用新版產品 prompt 實跑「核心定位」與「競爭定位」兩步，
 * 只印結果、不寫 DB。驗證同品牌各產品的定位是否已經分得開（2026-10-02）。
 *
 * 由 op-probe-product-positioning-diff.yml 帶著本 commit 的 positioningSteps／productSiblings
 * 上 VM（暫存檔名 _probe_*），跑完即刪。用法：tsx scripts/<this> <brandId>
 */
import localPool from "../server/localDb.js";
// @ts-ignore — VM 上的暫存複本
import { buildProductPositioningSteps } from "../server/strategy/core/positioning/_probe_positioningSteps.js";
// @ts-ignore
import { loadProductSiblingContext, isSiteWideText } from "../server/strategy/core/entities/_probe_productSiblings.js";
import { fetchProductMeta } from "../server/strategy/core/entities/productMeta.js";
import { buildMarketContext } from "../server/strategy/core/brand/marketProfiles.js";

const parse = (v: any) => { if (v == null) return {}; if (typeof v !== "string") return v; try { return JSON.parse(v); } catch { return {}; } };

async function main() {
  const brandId = Number(process.argv[2] || 2977);
  const [br]: any = await localPool.execute(
    `SELECT targetCountry, outputLanguage, marketContextOverride, targetAudience FROM brands WHERE id = ?`, [brandId]);
  const b = (br as any[])[0] ?? {};
  const marketContext = b.targetCountry ? await buildMarketContext(b.targetCountry, b.outputLanguage, b.marketContextOverride) : undefined;
  const officialAudience = typeof b.targetAudience === "string" && b.targetAudience.trim() ? b.targetAudience.trim() : undefined;
  const steps = buildProductPositioningSteps({ lang: "zh-TW", outputLanguage: b.outputLanguage ?? undefined });
  const core = steps.find((s: any) => s.id === "core")!;
  const comp = steps.find((s: any) => s.id === "competition")!;

  const [products]: any = await localPool.execute(`SELECT id, name, positioning FROM products WHERE brandId = ? ORDER BY id LIMIT 8`, [brandId]);
  await Promise.all((products as any[]).map(async (p) => {
    const pos = parse(p.positioning);
    const sib = await loadProductSiblingContext(Number(p.id));
    let description = pos?.description ?? pos?._interim?.description ?? pos?.summary;
    if (sib.descriptionIsSiteWide) description = undefined;
    const website = pos?.productUrl ?? pos?.website;
    let realContent: string | undefined;
    if (website) {
      const meta = await fetchProductMeta(website);
      const siteWide = meta.source !== "jsonld" && (isSiteWideText(meta.name, sib.sharedDescriptions) || isSiteWideText(meta.description, sib.sharedDescriptions));
      const name = siteWide ? undefined : meta.name; const desc = siteWide ? undefined : meta.description;
      if (meta.source !== "none" && (name || desc || meta.price)) {
        realContent = ["【商品頁資訊】", name ? `名稱：${name}` : "", meta.price ? `價格：${meta.price}` : "", desc ? `說明：${desc}` : "", `商品頁：${website}`].filter(Boolean).join("\n");
      }
    }
    const ctx: any = {
      userId: 0, entityKind: "product", entityId: Number(p.id), brandName: p.name, description,
      realContent, marketContext, officialAudience, siblingContext: sib.block || undefined,
      outputLanguage: b.outputLanguage ?? undefined, prevOutputs: {}, recordUsage: async () => {},
    };
    const [c1, c2] = await Promise.all([core.run(ctx), comp.run(ctx)]);
    p._out = { block: sib.block, siteWide: sib.descriptionIsSiteWide, realContent: !!realContent, old: { tagline: pos?.core?.zhTagline, usp: pos?.competition?.uniqueUsp }, c1, c2 };
  }));
  console.log("── 第一支產品收到的區隔段落 ──" + (products as any[])[0]?._out?.block);
  for (const p of products as any[]) {
    const o = p._out;
    console.log(`\n#${p.id} ${p.name}  描述判為全站共用=${o.siteWide}  商品頁資訊=${o.realContent}`);
    console.log(`  舊 標語：${o.old.tagline ?? "∅"}`);
    console.log(`  新 標語：${o.c1.core.zhTagline}`);
    console.log(`  新 一句話：${o.c1.core.oneLineValueProp}`);
    console.log(`  新 核心：${String(o.c1.core.coreStatement).slice(0, 160)}`);
    console.log(`  舊 USP ：${String(o.old.usp ?? "∅").slice(0, 120)}`);
    console.log(`  新 USP ：${String(o.c2.competition.uniqueUsp).slice(0, 200)}`);
    console.log(`  新 競品：${(o.c2.competition.competitors ?? []).map((c: any) => c.name).join("、")}`);
  }
  await localPool.end();
}
main().catch(async (e) => { console.error(e); await localPool.end(); process.exit(1); });
