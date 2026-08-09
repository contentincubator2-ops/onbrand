/**
 * poc-fb-apify — Tier B PAID POC (CJ-approved 2026-08「建 FB 付費爬蟲 collector」).
 *
 * Facebook is the one social platform with no free publish date. This harness
 * MEASURES what the paid path yields: SERP finds FB pages mentioning the term,
 * then the Apify FB Posts Scraper returns those pages' recent posts WITH real
 * ISO dates. Prints dated posts + a rough cost so we can decide whether to wire
 * collectFacebookApify into the daily ingest (it is intentionally NOT wired yet).
 *
 * Needs a FREE-tier-or-paid Apify token + a SERP key. Nothing is created by the
 * repo; you run it with your own keys:
 *   APIFY_TOKEN=xxx SERPAPI_API_KEY=yyy npx tsx scripts/poc-fb-apify.ts --term=小安素 --days=90
 *
 * ⚠️ Each run scrapes real FB posts and BILLS your Apify account (~US$2/1,000
 * posts). Keep --days modest for the POC.
 */
import * as dotenv from "dotenv";
dotenv.config();
import { collectFacebookApify } from "../server/_core/listeningScopes";

function argVal(flag: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.split("=")[1]! : null;
}

async function main() {
  if (!process.env.APIFY_TOKEN) { console.error("✗ 需要 APIFY_TOKEN（apify.com）。"); process.exit(1); }
  if (!process.env.SERPAPI_API_KEY && !process.env.SERPER_API_KEY) { console.error("✗ 需要 SERPAPI_API_KEY 或 SERPER_API_KEY（用來發現 FB 粉專）。"); process.exit(1); }
  const term = argVal("--term") ?? "小安素";
  const days = Number(argVal("--days") ?? "90");

  console.log(`\n=== FB Apify POC ===\n關鍵字「${term}」· 近 ${days} 天 · SERP 找粉專 → Apify 取貼文日期\n`);
  const t0 = Date.now();
  const items = await collectFacebookApify(term, true, days, 20);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  const cutoff = new Date(Date.now() - days * 86400000);
  let undated = 0, stale = 0;
  for (const it of items) {
    const d = it.publishedAt ? String(it.publishedAt).slice(0, 10) : null;
    if (!d) undated++; else if (new Date(d) < cutoff) stale++;
    console.log(`  ${d ?? "undated"} | ${String(it.source).slice(0, 18).padEnd(18)} | ${it.title.slice(0, 40)}`);
  }
  console.log(`\n=== ${items.length} 則有日期的 FB 貼文（${secs}s）| undated=${undated} stale=${stale} ===`);
  console.log(`→ 這是免費層＋URL 解碼都拿不到的 FB 社群量（有真實發布日）。`);
  console.log(`  成本：Apify FB Posts Scraper 約 US$2/1,000 貼文；每次抓最多 5 個粉專 × resultsLimit。`);
  console.log(`  若數量/日期/成本 OK，回報給我，我把 collectFacebookApify 接進每日 ingest（slow 背景路徑，非即時）。`);
  process.exit(0);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
