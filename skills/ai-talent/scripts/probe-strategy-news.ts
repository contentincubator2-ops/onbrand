/**
 * probe-strategy-news — 策略監測「只抓 7 天內新聞」在真實 key 上跑一次，唯讀。
 *
 * 2026-09-30（CJ「確定只有在 7 天內的新聞和內容」「專心抓新聞，就很好了」）：
 * 跟 runStrategyScan 同一套：scout（newsOnly）→ 回原文讀發布日 → classifyEvidence。
 * 不叫 digest LLM、不寫資料庫——只看「抓回來幾則、幾則確定在 7 天內」。
 * 本機的 API key 都失效了，所以只能在 dev VM 上跑（op-probe-strategy-news.yml）。
 */
import localPool from "../server/localDb.js";
import { perplexityScout } from "../server/content/core/scouts/perplexityScout.js";
import { fetchPublishedDate, normalizeDate } from "../server/strategy/core/publishedDate.js";
import { classifyEvidence, ensureWatches, NEWS_WINDOW_DAYS } from "../server/strategy/core/strategyMonitor.js";

async function main() {
  const brandId = Number(process.argv[2] || 2977);
  const [rows]: any = await localPool.execute(`SELECT id, name, userId, industry FROM brands WHERE id = ? LIMIT 1`, [brandId]);
  const brand = (rows as any[])[0];
  if (!brand) { console.error(`brand ${brandId} not found`); process.exit(1); }
  const watch = (await ensureWatches({ userId: Number(brand.userId), brandId })).find((w) => w.scope === "brand");
  console.log(`brand #${brandId} ${brand.name}  industry=${brand.industry ?? "-"}`);
  console.log(`keywords=${watch?.keywords.join("、")}  competitors=${watch?.competitors.join("、")}`);

  const t0 = Date.now();
  const items = await perplexityScout.fetch({
    brandId, brandName: String(brand.name), industry: brand.industry || undefined,
    keywords: [String(brand.name), ...(watch?.keywords ?? [])], competitors: watch?.competitors ?? [],
    industryTags: brand.industry ? [String(brand.industry)] : [],
    days: NEWS_WINDOW_DAYS, limit: 12, newsOnly: true, loadCred: async () => null,
  });
  console.log(`\nscout 回 ${items.length} 則（${items[0]?.scoutId ?? "-"}，${Math.round((Date.now() - t0) / 1000)}s）`);

  let kept = 0;
  for (const it of items) {
    const fromPage = await fetchPublishedDate(it.url);
    const fromApi = it.scoutId === "tavily" ? normalizeDate(it.publishedAt) : null;
    const d = fromPage ?? fromApi;
    const ok = classifyEvidence({ url: it.url, publishedAt: d }) === "news";
    if (ok) kept++;
    console.log(`${ok ? "✓ 採用" : "✗ 不採用"}  原文日期=${d ?? "讀不到"}  （模型寫的=${it.publishedAt ?? "-"}）  ${it.source}  ${String(it.title).slice(0, 50)}`);
    console.log(`         ${String(it.url ?? "").slice(0, 120)}`);
  }
  console.log(`\n結果：${items.length} 則中 ${kept} 則確定是近 ${NEWS_WINDOW_DAYS} 天的新聞`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
