/**
 * probe-variant-angles — 情感版／理性版／數據版 寫出來的內文，跟名稱對得上嗎？（DEV VM，真實 LLM）
 *
 * 2026-09-22（CJ：標成「理性版」的貼文通篇是氣味與感覺）。variantAngles.ts 讓每個版本名稱都有寫法
 * 定義；這支用真的模型跑一次 fb-30-caption-short（三版），把三篇全文印出來，並做兩個粗略檢查：
 *   - 數據版開頭 80 字內有數字（checkAngle 也擋這個）
 *   - 三篇的開頭不一樣（不再是同一篇換三個標籤）
 * 語氣對不對只有人讀得出來，所以全文都印，不假裝能機器評分。
 * 不落地：不給 userId，所以不寫 mission_outputs。
 *
 * 用法（VM 上）：cd /opt/onbrand/current/skills/ai-talent && ./node_modules/.bin/tsx scripts/probe-variant-angles.ts [brandId]
 */
import "./../server/bootstrap-env";
import localPool from "../server/localDb";
import { runOrchestra } from "../server/content/core/quickTaskOrchestra";
import { FB_30S_TASKS, FB_30S_ORCHESTRA } from "../server/content/core/quickTaskFB";
import { checkAngle } from "../server/content/core/variantAngles";

const TASK_ID = process.env.TASK_ID || "fb-30-caption-short";
const TOPIC = process.env.TASK_INPUT ||
  "Kinloch Anderson 洛蒙德湖系列首支登場：No. 01 洛蒙德湖，有空間噴霧、擴香、香氛蠟燭三種使用方式，把蘇格蘭最大淡水湖的安靜帶回家。";

async function main(): Promise<void> {
  const argBrand = parseInt(process.argv[2] ?? "", 10);
  const [rows]: any = await localPool.execute(
    argBrand
      ? `SELECT id, name FROM brands WHERE id = ? LIMIT 1`
      : `SELECT id, name FROM brands WHERE name LIKE '%金安德森%' OR name LIKE '%Kinloch%' ORDER BY id DESC LIMIT 1`,
    argBrand ? [argBrand] : [],
  );
  const brand = (rows as any[])[0];
  console.log(`brand: ${brand ? `#${brand.id} ${brand.name}` : "(none found — running without a brand)"}`);

  const template = FB_30S_TASKS.find((t) => t.id === TASK_ID);
  const config = FB_30S_ORCHESTRA[TASK_ID];
  if (!template || !config) { console.error("template/config missing for", TASK_ID); process.exit(1); }
  console.log(`task: ${TASK_ID}  labels: ${config.variantLabels.slice(0, config.variants).join(" / ")}`);
  console.log(`task systemPrompt defines the labels itself? ${config.variantLabels.some((l) => template.systemPrompt.includes(l))}\n`);

  const inputKey = template.primary_input?.key ?? template.inputs[0]?.key ?? "topic";
  const t0 = Date.now();
  const result = await runOrchestra({
    template, config, inputs: { [inputKey]: TOPIC }, tier: "30s",
    ...(brand ? { brandId: brand.id } : {}),
  });
  console.log(`ok=${result.ok} errors=${JSON.stringify(result.errors)} ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

  let fail = 0;
  const openings: string[] = [];
  for (const v of result.variants) {
    console.log(`━━ ${v.label} (${v.caption.length} 字)`);
    console.log(v.caption.split("\n").map((l: string) => `   | ${l}`).join("\n"));
    const angleMiss = checkAngle(v.label, v.caption, template.systemPrompt);
    if (angleMiss) { fail++; console.log(`   ❌ ${angleMiss}`); }
    openings.push(v.caption.trim().slice(0, 12));
    console.log("");
  }
  const distinct = new Set(openings).size === openings.length;
  console.log(`三篇開頭各不相同：${distinct ? "✅" : "❌"}  (${openings.map((o) => `「${o}」`).join(" ")})`);
  if (!distinct) fail++;
  console.log(`\n=== ${fail === 0 ? "PASS" : `${fail} problem(s)`} ===`);
  await localPool.end();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
