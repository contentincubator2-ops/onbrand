/**
 * probe-product-positioning-en-dry — 英文市場（US／en）的產品定位，接上同品牌區隔段落後
 * 產出是不是正確英文？DEV 沒有英文品牌底下有產品，所以用 3 支模擬產品實跑「核心」「競爭」
 * 兩步，只印、不寫 DB（2026-10-02）。
 */
import localPool from "../server/localDb.js";
// @ts-ignore — VM 上的暫存複本
import { buildProductPositioningSteps } from "../server/strategy/core/_probe_positioningSteps.js";
// @ts-ignore
import { buildSiblingBlock } from "../server/strategy/core/_probe_productSiblings.js";
import { buildMarketContext } from "../server/strategy/core/marketProfiles.js";

const CJK = /[\u3400-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/g;
const PRODUCTS = [
  { name: "Dual-Tip Brush Markers 24-Set", url: "https://example-art.com/products/dual-tip-brush-markers-24" },
  { name: "Washable Gel Crayons for Kids", url: "https://example-art.com/products/gel-crayons-kids" },
  { name: "Watercolor Pencils 48 Colors", url: "https://example-art.com/products/watercolor-pencils-48" },
];
const BRAND_CLAIM = "Color without limits｜Affordable artist-grade color tools that make everyday creativity easy for families and hobbyists.";

async function main() {
  const marketContext = await buildMarketContext("US", "en", null);
  const steps = buildProductPositioningSteps({ lang: "zh-TW", outputLanguage: "en" });
  const core = steps.find((s: any) => s.id === "core")!;
  const comp = steps.find((s: any) => s.id === "competition")!;
  const out = await Promise.all(PRODUCTS.map(async (p) => {
    const siblingContext = buildSiblingBlock({
      productName: p.name, productUrl: p.url, brandName: "Example Art Co.", brandClaim: BRAND_CLAIM,
      siblings: PRODUCTS.filter((x) => x !== p).map((x) => ({ name: x.name })), descriptionIsSiteWide: true,
    });
    const ctx: any = {
      userId: 0, entityKind: "product", entityId: 0, brandName: p.name, industry: "Art supplies / stationery",
      marketContext, siblingContext, outputLanguage: "en", prevOutputs: {}, recordUsage: async () => {},
    };
    const [c1, c2] = await Promise.all([core.run(ctx), comp.run(ctx)]);
    return { p, c1: c1.core, c2: c2.competition };
  }));
  let cjkTotal = 0;
  for (const { p, c1, c2 } of out) {
    const all = JSON.stringify({ c1, c2 });
    const hits = all.match(CJK) ?? [];
    cjkTotal += hits.length;
    console.log(`\n${p.name}   CJK 字元=${hits.length}${hits.length ? ` ⚠ ${hits.slice(0, 20).join("")}` : ""}`);
    console.log(`  tagline (zhTagline 欄) : ${c1.zhTagline}`);
    console.log(`  enTagline             : ${c1.enTagline}`);
    console.log(`  oneLiner              : ${c1.oneLineValueProp}`);
    console.log(`  core                  : ${String(c1.coreStatement).slice(0, 220)}`);
    console.log(`  USP                   : ${String(c2.uniqueUsp).slice(0, 260)}`);
    console.log(`  commonUsp             : ${String(c2.commonUsp).slice(0, 140)}`);
    console.log(`  competitors           : ${(c2.competitors ?? []).map((c: any) => `${c.name} — ${String(c.position).slice(0, 60)}`).join(" | ")}`);
  }
  console.log(`\nCJK 總計：${cjkTotal}`);
  await localPool.end();
}
main().catch(async (e) => { console.error(e); await localPool.end(); process.exit(1); });
