/**
 * probe-product-positioning-diff — 同一品牌底下的產品定位是不是長得一樣？用真資料看。
 *
 * 2026-10-02（CJ「產品頁面當中，每一個產品產出的定位，怎麼都是一樣的」）：
 * 印出每支產品餵給定位 pipeline 的輸入（描述／商品頁網址）與產出（標語／USP／受眾），
 * 並標出同品牌內完全相同的欄位。唯讀、不呼叫模型。
 *
 * 用法：./node_modules/.bin/tsx scripts/probe-product-positioning-diff.ts [brandId]
 */
import localPool from "../server/localDb.js";

const parse = (v: any) => {
  if (v == null) return {};
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return {}; }
};
const clip = (s: any, n = 70) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t || "∅";
};

async function main() {
  const brandId = Number(process.argv[2] || 0);
  const [brandRows]: any = brandId
    ? await localPool.execute(`SELECT id, brandName AS name FROM brands WHERE id = ?`, [brandId])
    : await localPool.execute(
        `SELECT b.id, b.brandName AS name FROM brands b JOIN products p ON p.brandId = b.id
          WHERE JSON_EXTRACT(p.positioning, '$.core') IS NOT NULL
          GROUP BY b.id, b.brandName HAVING COUNT(*) >= 2
          ORDER BY MAX(p.updatedAt) DESC LIMIT 6`);

  for (const b of brandRows as any[]) {
    const [products]: any = await localPool.execute(
      `SELECT id, name, positioning, updatedAt FROM products WHERE brandId = ? ORDER BY id LIMIT 20`, [b.id]);
    const [jobs]: any = await localPool.execute(
      `SELECT entityId, status, currentStep, totalSteps, startedAt, finishedAt, lastError
         FROM positioning_jobs WHERE entityKind='product' AND entityId IN (SELECT id FROM products WHERE brandId = ?)
        ORDER BY startedAt DESC`, [b.id]);
    console.log(`\n品牌 #${b.id} ${b.name}｜產品 ${(products as any[]).length}`);
    console.log("=".repeat(78));
    const seen: Record<string, Map<string, number[]>> = { tagline: new Map(), usp: new Map(), audience: new Map(), core: new Map() };
    for (const p of products as any[]) {
      const pos = parse(p.positioning);
      const job = (jobs as any[]).find((j) => Number(j.entityId) === Number(p.id));
      const f = {
        tagline: pos?.core?.zhTagline ?? pos?.tagline?.zhTagline ?? "",
        usp: pos?.competition?.uniqueUsp ?? "",
        audience: pos?.audience?.primary ?? "",
        core: pos?.core?.coreStatement ?? "",
      };
      for (const k of Object.keys(f) as (keyof typeof f)[]) {
        if (!f[k]) continue;
        const list = seen[k].get(f[k]) ?? []; list.push(p.id); seen[k].set(f[k], list);
      }
      console.log(`\n#${p.id} ${p.name}  (updated ${p.updatedAt?.toISOString?.() ?? p.updatedAt})`);
      console.log(`  keys      : ${Object.keys(pos).join(",")}`);
      console.log(`  輸入 描述  : ${clip(pos?.description ?? pos?._interim?.description ?? pos?.summary, 90)}`);
      console.log(`  輸入 網址  : ${clip(pos?.productUrl ?? pos?.website, 90)}`);
      console.log(`  core.name : ${clip(pos?.core?.name)}`);
      console.log(`  標語       : ${clip(f.tagline)}`);
      console.log(`  核心       : ${clip(f.core, 110)}`);
      console.log(`  USP       : ${clip(f.usp, 110)}`);
      console.log(`  受眾       : ${clip(f.audience, 110)}`);
      console.log(`  競品       : ${clip(JSON.stringify(pos?.competition?.competitors ?? []), 110)}`);
      console.log(`  _director : ${clip(JSON.stringify(pos?._director ?? null))}`);
      console.log(`  job       : ${job ? `${job.status} ${job.currentStep}/${job.totalSteps} ${job.startedAt?.toISOString?.() ?? job.startedAt} err=${clip(job.lastError, 60)}` : "none"}`);
    }
    for (const [k, m] of Object.entries(seen)) {
      for (const [v, ids] of m) if (ids.length > 1) console.log(`  ⚠ ${k} 完全相同於產品 ${ids.join(",")}：${clip(v, 60)}`);
    }
  }
  await localPool.end();
}
main().catch(async (e) => { console.error(e); await localPool.end(); process.exit(1); });
