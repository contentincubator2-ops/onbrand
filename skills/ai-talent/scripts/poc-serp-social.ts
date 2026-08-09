/**
 * poc-serp-social — Tier B POC (CJ-approved 2026-08「先做小規模 POC 驗證量級」).
 *
 * Measures how many FB / IG / TikTok / Threads SOCIAL mentions a Google-SERP
 * API surfaces for a brand — the coverage OpView licenses and our free layer
 * (GDELT/RSS/PTT/YouTube) can't reach. This is a MEASUREMENT harness, not a
 * production path; it prints per-platform hit counts so we can decide whether
 * to turn collectSocialSerp on in the daily ingest.
 *
 * No account/payment is created by this repo — get a FREE key (2,500 credits)
 * at https://serper.dev, then:
 *   SERPER_API_KEY=xxxx npx tsx scripts/poc-serp-social.ts --brand=2957
 *   SERPER_API_KEY=xxxx npx tsx scripts/poc-serp-social.ts --brand=2957 --days=90
 */
import * as dotenv from "dotenv";
dotenv.config();
import localPool from "../server/localDb";
import { loadBrandCtx, collectSocialSerp } from "../server/_core/listeningScopes";

function argVal(flag: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.split("=")[1] : null;
}

async function main() {
  if (!process.env.SERPER_API_KEY) {
    console.error("✗ 需要 SERPER_API_KEY。免費申請（2,500 credits）：https://serper.dev");
    console.error("  用法：SERPER_API_KEY=xxxx npx tsx scripts/poc-serp-social.ts --brand=2957 [--days=30]");
    process.exit(1);
  }
  const brandId = Number(argVal("--brand") ?? "2957");
  const days = Number(argVal("--days") ?? "30");
  const brand = await loadBrandCtx(brandId);
  if (!brand) { console.error(`✗ brand ${brandId} not found`); process.exit(1); }

  console.log(`\n=== SERP 社群 POC ===`);
  console.log(`品牌 ${brandId} "${brand.name}" (${brand.isTaiwan ? "TW" : "intl"}) · 近 ${days} 天 · 來源限 FB/IG/TikTok/Threads\n`);

  const queries: Array<{ label: string; q: string }> = [{ label: "品牌(自己)", q: brand.name }];
  if (brand.industry) queries.push({ label: "產業", q: brand.industry });
  if (brand.competitors.length) queries.push({ label: "競爭者", q: brand.competitors.slice(0, 3).join(" OR ") });

  const platforms = ["facebook.com", "instagram.com", "tiktok.com", "threads.net", "other"];
  const grand: Record<string, number> = {}; platforms.forEach((p) => (grand[p] = 0));
  let total = 0;

  for (const { label, q } of queries) {
    const items = await collectSocialSerp(q, brand.isTaiwan, days, 40);
    total += items.length;
    const per: Record<string, number> = {}; platforms.forEach((p) => (per[p] = 0));
    for (const it of items) {
      const host = platforms.find((p) => p !== "other" && (it.url ?? "").includes(p)) ?? "other";
      per[host]++; grand[host]++;
    }
    console.log(`[${label}] q="${q}" → ${items.length} 則`);
    console.log("  平台分布:", platforms.map((p) => `${p.replace(".com", "").replace(".net", "")}:${per[p]}`).join("  "));
    for (const it of items.slice(0, 5)) console.log("   -", (it.publishedAt ?? "日期不明").slice(0, 16), "|", it.source, "|", it.title.slice(0, 48));
    console.log("");
    await new Promise((r) => setTimeout(r, 1200)); // gentle pacing
  }

  console.log(`=== 總計 ${total} 則社群提及 ===`);
  console.log("平台分布:", platforms.map((p) => `${p.replace(".com", "").replace(".net", "")}:${grand[p]}`).join("  "));
  console.log(`\n→ 這是免費層（GDELT/RSS/PTT/YouTube）抓不到的社群量。× 每日累積 × 品牌數 = 常態化用量與成本預估。`);
  console.log(`  Serper 計價約 $0.30–1 / 1,000 查詢；每品牌每天約 ${queries.length}×4 scope ≈ ${queries.length * 4} 次查詢。`);
  process.exit(0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
