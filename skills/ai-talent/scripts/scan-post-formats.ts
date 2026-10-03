/**
 * scan-post-formats — 每月掃描各市場的 Facebook 熱門貼文形式，寫進候選佇列。
 *
 * 2026-08-23 (CJ「安排定期任務掃描當地熱門的 facebook 貼文，補充為 task」)
 *
 * 由 .github/workflows/op-scan-post-formats.yml 每月觸發，也可以手動跑：
 *   npx tsx scripts/scan-post-formats.ts            # 掃 brands 表裡所有市場
 *   npx tsx scripts/scan-post-formats.ts --dry-run  # 只印不寫
 *   npx tsx scripts/scan-post-formats.ts --market TW --market JP
 *   npx tsx scripts/scan-post-formats.ts --days 60 --limit 10
 *
 * 設計上這支只負責「發現」，不建卡。候選進佇列等人審 —— 自動建卡會繞過
 * 30s SOP 的「probe E2E 失敗不上線」，產一張沒人驗過的卡比沒有卡更糟。
 */

import {
  buildFbCatalog,
  resolveMarkets,
  scanOneMarket,
  type ScanMarket,
} from "../server/content/core/catalog/postFormatScout";
import { upsertCandidates } from "../server/content/core/catalog/postFormatStore";

function arg(name: string): string[] {
  const out: string[] = [];
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === `--${name}` && argv[i + 1]) out.push(argv[i + 1]!);
  }
  return out;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const dryRun = flag("dry-run");
  const only = arg("market").map((m) => m.toUpperCase());
  const days = Number(arg("days")[0] ?? 45);
  const limit = Number(arg("limit")[0] ?? 8);

  console.log(`[scan] post-format scan starting${dryRun ? " (dry-run)" : ""}`);

  let markets: ScanMarket[];
  try {
    markets = await resolveMarkets();
  } catch (e: any) {
    console.error(`[scan] 無法讀取 brands 表的市場清單：${e?.message ?? e}`);
    process.exit(1);
  }

  if (only.length > 0) {
    const before = markets.length;
    markets = markets.filter((m) => only.includes(m.country));
    console.log(`[scan] --market 過濾：${before} → ${markets.length}`);
  }

  if (markets.length === 0) {
    console.log("[scan] brands 表裡沒有任何市場 — 沒有東西可掃，正常結束");
    process.exit(0);
  }

  const catalog = buildFbCatalog();
  console.log(`[scan] 已覆蓋清單：${catalog.length} 張 FB 卡`);
  console.log(`[scan] 市場：${markets.map((m) => `${m.country}(${m.brandCount})`).join(", ")}`);

  let totalFormats = 0;
  let totalTopics = 0;
  let totalInserted = 0;
  let totalMerged = 0;
  let totalDropped = 0;
  const failedMarkets: string[] = [];

  // 逐一跑，不併發 —— grounding 呼叫很重，而且每月一次沒有延遲壓力
  for (const market of markets) {
    console.log(`\n── ${market.country} / ${market.language} ──`);
    const res = await scanOneMarket(market, catalog, { days, limit });

    if (res.error) {
      // grounding 沒有憑證或逾時。**不 fallback 到無搜尋的 LLM** —— 那條路
      // 產出的 URL 是編的。少一個市場的資料，好過一整頁假證據。
      console.error(`  ✗ 掃描失敗：${res.error}`);
      failedMarkets.push(market.country);
      continue;
    }

    const formats = res.candidates.filter((c) => c.kind === "format");
    const topics = res.candidates.filter((c) => c.kind === "topic");
    totalFormats += formats.length;
    totalTopics += topics.length;

    console.log(`  形式 ${formats.length} 筆 / 題材 ${topics.length} 筆`);
    for (const c of res.candidates) {
      const dup = c.duplicateOf ? ` [已有 ${c.duplicateOf}]` : "";
      console.log(`    · [${c.kind}] ${c.name}${dup}  (${c.evidence.length} 條佐證)`);
    }

    // 丟掉的一定要講 —— 靜默截斷會讓「這個月沒發現」和「模型回了垃圾」
    // 長得一模一樣
    if (res.dropped.length > 0) {
      totalDropped += res.dropped.length;
      console.log(`  丟棄 ${res.dropped.length} 筆：`);
      for (const d of res.dropped) console.log(`    · ${d.reason}: ${d.name}`);
    }

    if (dryRun) continue;
    if (res.candidates.length === 0) continue;

    try {
      const { inserted, merged } = await upsertCandidates(res.candidates);
      totalInserted += inserted;
      totalMerged += merged;
      console.log(`  寫入：新增 ${inserted} / 併入既有 ${merged}`);
    } catch (e: any) {
      console.error(`  ✗ 寫入失敗：${e?.message ?? e}`);
      failedMarkets.push(`${market.country}(write)`);
    }
  }

  console.log("\n── 總計 ──");
  console.log(`  形式 ${totalFormats} / 題材 ${totalTopics} / 丟棄 ${totalDropped}`);
  if (!dryRun) console.log(`  新增 ${totalInserted} / 併入既有 ${totalMerged}`);
  if (failedMarkets.length > 0) {
    console.log(`  失敗市場：${failedMarkets.join(", ")}`);
  }
  console.log(
    totalInserted > 0
      ? `\n✅ 有 ${totalInserted} 筆新候選待審：/admin/post-formats`
      : "\n✅ 掃描完成，這個月沒有新候選（正常 — 形式是有限集合，不會每月都長新的）",
  );

  // 全部市場都失敗才算工作失敗；部分失敗照樣把成功的寫進去
  process.exit(failedMarkets.length === markets.length ? 1 : 0);
}

main().catch((e) => {
  console.error("[scan] 未預期的錯誤：", e);
  process.exit(1);
});
