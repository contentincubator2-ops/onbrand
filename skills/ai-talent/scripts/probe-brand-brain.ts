/**
 * probe-brand-brain — 用部署中的 buildBrandBrain，對真實品牌量品牌大腦的用量。
 *
 *   npx tsx scripts/probe-brand-brain.ts            # 定位資料最多的 15 個品牌
 *   npx tsx scripts/probe-brand-brain.ts 2992 2964  # 指定品牌
 *
 * 2026-09-29（CJ「檢查大腦」tray）：BRAIN_CAPACITY 要用真實資料校準——
 * 印出每個品牌的總用量、各類別字數、只記住一部分／超載的筆數。唯讀，不印內文。
 */
import localPool from "../server/localDb";
import { buildBrandBrain, BRAIN_CAPACITY } from "../server/strategy/core/brandContext";

async function main() {
  let ids = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (!ids.length) {
    const [rows]: any = await localPool.execute(
      `SELECT id FROM brands WHERE positioning IS NOT NULL ORDER BY CHAR_LENGTH(positioning) DESC LIMIT 15`,
    );
    ids = (rows as any[]).map((r) => Number(r.id));
  }
  console.log(`容量 BRAIN_CAPACITY = ${BRAIN_CAPACITY}`);
  const used: number[] = [];
  for (const id of ids) {
    const b = await buildBrandBrain(id);
    const byCat: Record<string, number> = {};
    for (const i of b.items) byCat[i.category] = (byCat[i.category] ?? 0) + i.keptChars;
    const trimmed = b.items.filter((i) => i.status === "trimmed");
    const overflow = b.items.filter((i) => i.status === "overflow");
    used.push(b.usedChars);
    console.log(
      `品牌 ${id} | 用量 ${b.usedChars}／${b.capacity}（${Math.round((b.usedChars / b.capacity) * 100)}%）`
      + ` | 筆數 ${b.items.length} | 只記一部分 ${trimmed.length} | 超載 ${overflow.length}`
      + ` | ${Object.entries(byCat).map(([k, v]) => `${k}:${v}`).join(" ")}`,
    );
    if (trimmed.length) console.log(`    只記一部分：${trimmed.map((i) => `${i.label}(${i.keptChars}/${i.storedChars})`).join("、").slice(0, 400)}`);
    if (overflow.length) console.log(`    超載：${overflow.map((i) => `${i.label}(${i.storedChars})`).join("、").slice(0, 400)}`);
  }
  used.sort((a, b) => a - b);
  console.log(`\n${ids.length} 個品牌；用量 min ${used[0] ?? 0} / 中位數 ${used[Math.floor(used.length / 2)] ?? 0} / max ${used[used.length - 1] ?? 0}`);
  await localPool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
