/**
 * probe-scene-refine — 用真實品牌／產品資料，實跑「AI 潤飾場景」看產出品質。
 *
 * 2026-09-24（CJ「加入AI潤飾的按鈕，可以讓我們幫他補充提示詞，確認產出結果會好
 * 一些」）：「會好一些」不能靠宣稱，要看得到潤前潤後的對照。這支餵幾種使用者真的
 * 會打的爛提示詞（「餐桌」「有人在吃」，甚至空白），把潤出來的原文印出來。
 *
 * 跑的是 content/core/scenePromptRefiner.ts 的**同一支函式**（不是複製的 prompt），
 * 所以這裡看到的就是使用者按下按鈕會拿到的東西。
 *
 * 唯讀（除了 LLM 呼叫本身）。
 * 用法：./node_modules/.bin/tsx scripts/probe-scene-refine.ts [brandId] [productId]
 */
import localPool from "../server/localDb.js";
import { refineScenePrompt } from "../server/content/core/scenePromptRefiner.js";

/** 使用者真的會打的東西——短、含糊、或什麼都沒寫。 */
const CASES = ["餐桌", "有人在吃", "一家人吃飯很溫馨", ""];

async function main() {
  const brandId = Number(process.argv[2] || 2972);   // 預設：懶得煮的Tom老闆
  const [brandRows]: any = await localPool.execute(
    `SELECT id, name, userId FROM brands WHERE id = ? LIMIT 1`, [brandId],
  );
  const brand = (brandRows as any[])[0];
  if (!brand) { console.error(`brand ${brandId} not found`); process.exit(1); }

  let productId = Number(process.argv[3] || 0);
  if (!productId) {
    const [pRows]: any = await localPool.execute(
      `SELECT id, name FROM products WHERE brandId = ? ORDER BY updatedAt DESC LIMIT 1`, [brandId],
    );
    productId = Number((pRows as any[])[0]?.id ?? 0);
    console.log(`自動挑了產品：#${productId} ${(pRows as any[])[0]?.name ?? "(無)"}`);
  }

  console.log(`品牌 #${brand.id} ${brand.name}｜產品 #${productId || "(不帶產品)"}`);
  console.log("=".repeat(76));

  for (const scene of CASES) {
    console.log(`\n── 使用者寫的：${scene ? `「${scene}」` : "（空白）"} ──`);
    const t0 = Date.now();
    try {
      const refined = await refineScenePrompt({
        brandId, userId: Number(brand.userId), productId: productId || null, scene,
      });
      console.log(`   （${((Date.now() - t0) / 1000).toFixed(1)}s，${refined.length} 字）`);
      console.log(`   ${refined}`);
      // 硬規則有沒有被違反——這幾個詞出現就是 prompt 沒守住（會跟系統後面自動
      // 加的渲染指令打架，或讓模型去重畫產品）。
      const leaks = ["8K", "photorealistic", "超寫實", "editorial", "contact shadow", "浮水印", "logo"]
        .filter((w) => refined.toLowerCase().includes(w.toLowerCase()));
      if (leaks.length) console.log(`   ⚠ 出現不該有的技術詞：${leaks.join("、")}`);
    } catch (e: any) {
      console.log(`   ✗ 潤飾失敗：${String(e?.message ?? e).slice(0, 200)}`);
    }
  }

  await localPool.end();
  process.exit(0);
}

main().catch((e) => { console.error("probe failed:", e); process.exit(1); });
