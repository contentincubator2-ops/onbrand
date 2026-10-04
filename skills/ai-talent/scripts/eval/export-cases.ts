/**
 * export-cases.ts — 在 dev VM 上跑真的任務卡，把「題目＋品牌資料＋實際產出」匯出成考卷，
 * 交給 foundry_eval.py 用 Microsoft Foundry 評分。
 *
 * 2026-10-04（CJ「第一步，我選擇 microsoft foundry」）。
 *
 * 為什麼在 VM 上、in-process 跑：
 *   要評的是「使用者按下去實際會拿到的東西」——真的品牌大腦、真的任務卡、真的模型鏈。
 *   在本機用假資料跑出來的分數，證明不了 dev 站的品質。
 *
 * 不落地、不扣點：runOrchestra 不傳 userId 就不會 recordTaskRun（跟自建卡的試寫同一招），
 * 所以考卷不會塞進 /projects。只評文字：runImageGen 關掉——圖片要另外的評法，而且貴。
 *
 * 題目怎麼來：
 *   每個品牌 × 每個通路，取前台實際列出的卡（近三個月爆款結構），每通路 PER_CHANNEL 張。
 *   每題的輸入用這個品牌自己的產品名輪流帶，模擬使用者會打的那種一句話。
 *
 * 評審看得到什麼：
 *   【任務】卡名、通路、形式、說明、這次的輸入；【品牌資料】就是模型寫的時候讀的那份
 *   品牌大腦（buildBrandPrefix）。所以「品牌事實正確」是拿同一份資料對答案，不是憑印象。
 *
 * 輸出：每題一行 `EVALCASE <base64(JSON)>` 印到 stdout（base64 是因為 CI log 會把長行與
 * 特殊字元弄壞）。最後一行 `EVALDONE n=<題數> empty=<空白產出數>`。
 *
 * 用法（VM）：
 *   BRAND_IDS=2972 PER_CHANNEL=2 ./node_modules/.bin/tsx scripts/eval/export-cases.ts
 */
import localPool from "../../server/localDb";
import { runOrchestra } from "../../server/content/core/engine/quickTaskOrchestra";
import { buildTaskCatalogIndex } from "../../server/content/core/catalog/taskCatalogIndex";
import { isRecentViral } from "../../server/content/core/catalog/taskSource";
import { resolveTaskTemplate, resolveOrchestraConfig } from "../../server/content/core/catalog/taskRegistry";
import { buildBrandPrefix } from "../../server/strategy/core/brand/brandContext";

const CHANNEL_ZH: Record<string, string> = {
  facebook: "Facebook", instagram: "Instagram", threads: "Threads", line: "LINE 官方帳號",
  tiktok: "TikTok", email: "電子報", website: "官網",
};
const BRAIN_MAX = 7000;

const text = (v: unknown, k: "zh" | "en" = "zh"): string =>
  typeof v === "string" ? v : (v && typeof v === "object" ? String((v as any)[k] ?? (v as any).zh ?? "") : "");

/** 一個版本實際交到使用者手上的文字：主文＋多卡（輪播／相簿）的每一張。 */
function variantText(v: any): string {
  const parts: string[] = [];
  if (typeof v?.caption === "string" && v.caption.trim()) parts.push(v.caption.trim());
  if (Array.isArray(v?.cards)) {
    v.cards.forEach((c: any, i: number) => {
      const line = [c?.headline, c?.body, c?.caption].filter((x) => typeof x === "string" && x.trim()).join("｜");
      if (line) parts.push(`［第 ${i + 1} 張］${line}`);
    });
  }
  return parts.join("\n\n");
}

(async () => {
  const brandIds = String(process.env.BRAND_IDS ?? "").split(",").map((s) => Number(s.trim())).filter((n) => n > 0);
  if (!brandIds.length) throw new Error("BRAND_IDS 沒給");
  const perChannel = Math.max(1, Number(process.env.PER_CHANNEL ?? 2));
  const channels = String(process.env.CHANNELS ?? Object.keys(CHANNEL_ZH).join(",")).split(",").map((s) => s.trim()).filter(Boolean);
  // 可指定只跑哪幾張卡（重跑不及格的題目時用）。
  const onlyTasks = new Set(String(process.env.TASK_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean));

  const catalog = buildTaskCatalogIndex().filter((t) =>
    channels.includes(String(t.platform)) && String(t.tier) === "30s" && isRecentViral(t.source as any));

  let n = 0, empty = 0;
  for (const brandId of brandIds) {
    const [bRows]: any = await localPool.execute(`SELECT id, name, industry FROM brands WHERE id = ? LIMIT 1`, [brandId]);
    const brand = (bRows as any[])[0];
    if (!brand) { console.log(`SKIP brand ${brandId}: 不存在`); continue; }
    const [pRows]: any = await localPool.execute(`SELECT id, name FROM products WHERE brandId = ? ORDER BY id ASC LIMIT 6`, [brandId]);
    const products: Array<{ id: number; name: string }> = (pRows as any[]).filter((p) => p?.name);
    console.log(`BRAND ${brandId} ${brand.name}｜產業 ${brand.industry ?? "?"}｜產品 ${products.length}`);

    let turn = 0;
    for (const ch of channels) {
      const cards = catalog.filter((t) => t.platform === ch && (!onlyTasks.size || onlyTasks.has(t.id))).slice(0, onlyTasks.size ? 99 : perChannel);
      for (const card of cards) {
        const template: any = await resolveTaskTemplate(card.id);
        const config: any = await resolveOrchestraConfig(card.id);
        if (!template || !config) { console.log(`SKIP ${card.id}: 沒有 template／config`); continue; }

        const product = products.length ? products[turn % products.length]! : null;
        turn++;
        const topic = product
          ? `這次主打「${product.name}」，想吸引第一次購買的人`
          : `介紹${brand.name}，讓沒聽過的人想多了解`;
        const inputKey = template.primary_input?.key ?? template.inputs?.[0]?.key ?? "topic";

        const started = Date.now();
        let response = "", err = "";
        try {
          const result: any = await runOrchestra({
            template,
            config: { ...config, runImageGen: false },
            inputs: { [inputKey]: topic },
            brandId,
            ...(product ? { productId: product.id } : {}),
            tier: "30s",
          });
          response = variantText(result?.variants?.[0]);
          if (!response) err = `ok=${result?.ok} errors=${JSON.stringify(result?.errors ?? []).slice(0, 200)}`;
        } catch (e: any) {
          err = String(e?.message ?? e).slice(0, 200);
        }
        const brain = (await buildBrandPrefix(brandId, product?.id ?? null, null, "full", ch).catch(() => "")).slice(0, BRAIN_MAX);

        const query = [
          `【任務】通路：${CHANNEL_ZH[ch] ?? ch}。任務卡：${text(template.label) || card.labelZh}（形式 ${card.postType}）。`,
          text(template.description) ? `任務說明：${text(template.description)}` : "",
          `使用者這次的輸入：${topic}`,
          `目標市場：台灣（繁體中文）。`,
          `【品牌資料】`,
          brain || `品牌：${brand.name}（沒有讀到品牌資料）`,
        ].filter(Boolean).join("\n");

        // 空白產出照樣出題：任務顯示成功、產出空白，正是要被評成不及格的失敗。
        if (!response) { empty++; response = "（產出為空白）"; }
        const row = {
          id: `${brandId}:${card.id}`, brandId, brandName: brand.name, channel: ch, taskId: card.id,
          taskLabel: text(template.label) || card.labelZh, topic, query, response,
          empty: response === "（產出為空白）", error: err || null, latencyMs: Date.now() - started,
        };
        console.log(`EVALCASE ${Buffer.from(JSON.stringify(row), "utf8").toString("base64")}`);
        console.log(`  ${row.id} ${row.empty ? "EMPTY " + err : response.length + " 字"} ${(row.latencyMs / 1000).toFixed(1)}s`);
        n++;
      }
    }
  }
  console.log(`EVALDONE n=${n} empty=${empty}`);
  await (localPool as any).end?.();
  process.exit(0);
})().catch((e) => { console.error("EXPORT FAILED", e?.message ?? e); console.error(e?.stack); process.exit(1); });
