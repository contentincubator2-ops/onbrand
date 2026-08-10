/**
 * import-listening-json — load a normalised social-listening export (from
 * opview-xlsx-to-json.py) into `listening_mentions` for a brand/scope.
 *
 * Lets us ingest a brand's OWN licensed exports (OpView etc.) — filling the
 * FB/IG social volume our free collectors can't reach — and have it show on the
 * 品牌聲量 / 競品聲量 pages (which read the accumulating store). The source's own
 * 情緒 label is preserved (not re-scored).
 *
 * Usage:
 *   python scripts/opview-xlsx-to-json.py "IRIS…xlsx" iris.json
 *   npx tsx scripts/import-listening-json.ts --brand=2957 --file=iris.json
 *   npx tsx scripts/import-listening-json.ts --brand=2957 --file=iris.json --scope=listening.own_brand
 *   npx tsx scripts/import-listening-json.ts --file=iris.json --dry-run   # parse+map only, no DB
 */
import * as dotenv from "dotenv";
dotenv.config();
import {
  ensureMentionsTable, upsertMention, LISTENING_TASK_KEYS,
  type ListeningTaskKey, type RunResultItem, type Sentiment, type SourceType,
} from "../server/_core/listeningScopes";
import * as fs from "fs";

function argVal(flag: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.split("=")[1]! : null;
}

interface Row { publishedAt?: string; sourceType?: string; source?: string; sentiment?: string; title?: string; excerpt?: string; url?: string; }

async function main() {
  const dry = process.argv.includes("--dry-run");
  const file = argVal("--file");
  const scope = (argVal("--scope") ?? "listening.own_brand") as ListeningTaskKey;
  const brandId = Number(argVal("--brand") ?? "0");
  if (!file) { console.error("✗ --file=<normalised .json> required"); process.exit(1); }
  if (!LISTENING_TASK_KEYS.includes(scope)) { console.error(`✗ bad --scope; one of ${LISTENING_TASK_KEYS.join(", ")}`); process.exit(1); }
  if (!dry && !(brandId > 0)) { console.error("✗ --brand=<id> required (or use --dry-run)"); process.exit(1); }

  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  const rows: Row[] = Array.isArray(parsed) ? parsed : (parsed.rows ?? []);
  const okSent = new Set(["positive", "negative", "neutral"]);
  const items = rows
    .filter((r) => (r.title || r.excerpt) && r.publishedAt)
    .map((r) => ({
      item: {
        title: String(r.title || r.excerpt || "").slice(0, 512),
        source: String(r.source || "").slice(0, 255),
        excerpt: String(r.excerpt || "").slice(0, 2000),
        url: r.url || undefined,
        sourceType: (r.sourceType || "web") as SourceType,
        publishedAt: r.publishedAt,
      } as RunResultItem,
      sentiment: (okSent.has(String(r.sentiment)) ? r.sentiment : undefined) as Sentiment | undefined,
    }));

  console.log(`[import] file=${file} rows=${rows.length} → importable=${items.length} scope=${scope}${dry ? " (DRY RUN)" : ` brand=${brandId}`}`);
  if (dry) {
    const by = (k: (i: typeof items[number]) => string) => items.reduce<Record<string, number>>((a, i) => (a[k(i)] = (a[k(i)] ?? 0) + 1, a), {});
    console.log("  sourceType:", JSON.stringify(by((i) => i.item.sourceType!)));
    console.log("  sentiment :", JSON.stringify(by((i) => i.sentiment ?? "(none)")));
    const dates = items.map((i) => i.item.publishedAt!).sort();
    console.log("  dateRange :", dates[0], "→", dates[dates.length - 1]);
    for (const i of items.slice(0, 4)) console.log(`   e.g. ${i.item.publishedAt} | ${i.item.sourceType} | ${i.sentiment} | ${i.item.title.slice(0, 40)}`);
    process.exit(0);
  }

  await ensureMentionsTable();
  let neu = 0, upd = 0;
  for (const { item, sentiment } of items) {
    const r = await upsertMention(brandId, scope, item, sentiment);
    if (r === "new") neu++; else upd++;
  }
  console.log(`[import] done → ${neu} new, ${upd} updated into listening_mentions (brand ${brandId}, ${scope})`);
  process.exit(0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
