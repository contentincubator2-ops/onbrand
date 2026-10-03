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
import { refineScenePrompt } from "../server/content/core/image/scenePromptRefiner.js";

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
      // 2026-09-24 第一次實跑抓到的真 bug：使用者寫「一家人」，潤出來畫面裡
      // 一個人都沒有；使用者只寫「餐桌」，卻自己加了威士忌跟啤酒。潤飾是補，
      // 不是改——這兩條要一直守著。
      // 2026-09-24 第二次實跑：這個檢查器自己誤報過一次——潤出來寫「一個穿著
      // 居家T恤的男性」，而當時的正則只找「人／他／她」，於是報了「有人不見了」。
      // 誤報比漏報更糟：人會學會忽略 ⚠。所以「畫面裡有人」用一組夠寬的詞判斷。
      const PERSON_RE = /人|他|她|男性|女性|男子|女子|父母|孩子|小孩|家人|爸|媽|顧客|客人|手持|伸手|低頭/;
      const kept = ["一家人", "有人", "早晨", "夜晚", "戶外"].filter((w) => scene.includes(w));
      const dropped = kept.filter((w) => {
        if (refined.includes(w)) return false;
        if (w === "一家人") return !/家人|一家|父母|孩子|小孩|全家/.test(refined);
        if (w === "有人") return !PERSON_RE.test(refined);
        return true;
      });
      if (dropped.length) console.log(`   ⚠ 使用者寫的元素不見了：${dropped.join("、")}`);
      const added = ["威士忌", "啤酒", "紅酒", "香菸", "酒杯"].filter((w) => refined.includes(w) && !scene.includes(w));
      if (added.length) console.log(`   ⚠ 自己加了使用者沒提到的東西：${added.join("、")}`);
    } catch (e: any) {
      console.log(`   ✗ 潤飾失敗：${String(e?.message ?? e).slice(0, 200)}`);
    }
  }

  await localPool.end();
  process.exit(0);
}

main().catch((e) => { console.error("probe failed:", e); process.exit(1); });
