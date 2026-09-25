/**
 * probe-director-knows-price — 總監到底「看不看得到」使用者已經填的售價。
 *
 * 2026-09-25（CJ「明明我在此產品中，有寫價格，但是產品顧問，還是重複問我價格，
 * 這不應該發生」）：這件事有兩層，要分開驗，因為修錯層會白修——
 *
 *   第一層（決定性）：脈絡裡到底有沒有那個數字。用的是 strategistChatRouter
 *     **匯出的同一支** gatherBrandContext()，不是複製一份組裝邏輯。
 *   第二層（行為）：脈絡裡有了，模型會不會還是照問。這層是機率性的，所以實際
 *     跑一輪 LLM，把回答印出來，並檢查它有沒有反問價格。
 *
 * 唯讀：不寫任何 DB（不經過 sendMessage，不留對話紀錄），只呼叫一次 LLM。
 * 用法：./node_modules/.bin/tsx scripts/probe-director-knows-price.ts [brandId] [productId]
 */
import localPool from "../server/localDb.js";
import { gatherBrandContext, buildSystemPrompt } from "../server/strategy/routers/strategistChatRouter.js";
import { listDirectorsForBrand } from "../server/strategy/core/strategistDirectory.js";

const QUESTION = "這支產品的價格帶對嗎？跟誰比？";

async function main() {
  const brandId = Number(process.argv[2] || 2972);          // 預設：懶得煮的Tom老闆
  const [bRows]: any = await localPool.execute(
    `SELECT id, name, userId, industry FROM brands WHERE id = ? LIMIT 1`, [brandId],
  );
  const brand = (bRows as any[])[0];
  if (!brand) { console.error(`brand ${brandId} not found`); process.exit(1); }

  // 有售價的那支產品最能重現症狀
  let productId = Number(process.argv[3] || 0);
  const [pRows]: any = await localPool.execute(
    `SELECT id, name, positioning FROM products WHERE brandId = ? ORDER BY updatedAt DESC LIMIT 50`, [brandId],
  );
  const priced = (pRows as any[]).find((r) => {
    const pos = typeof r.positioning === "string" ? (() => { try { return JSON.parse(r.positioning); } catch { return null; } })() : r.positioning;
    return typeof pos?.price === "string" && pos.price.trim();
  });
  if (!productId) productId = Number(priced?.id ?? 0);
  const expectPrice = (() => {
    const row = (pRows as any[]).find((r) => Number(r.id) === productId) ?? priced;
    const pos = typeof row?.positioning === "string" ? (() => { try { return JSON.parse(row.positioning); } catch { return null; } })() : row?.positioning;
    return typeof pos?.price === "string" ? pos.price.trim() : null;
  })();

  console.log(`品牌 #${brand.id} ${brand.name}｜產品 #${productId || "(無)"}｜DB 裡的售價：${expectPrice ?? "(沒有填)"}`);
  if (!expectPrice) { console.log("這個品牌沒有任何填了售價的產品——這支 probe 重現不了症狀。"); await localPool.end(); return; }
  console.log("=".repeat(78));

  const digits = expectPrice.replace(/[^0-9]/g, "");   // 「NT$560」→「560」

  // ── 第一層：清單（沒有選定產品時，總監只有這個）──
  const listCtx = await gatherBrandContext(brandId, Number(brand.userId), null);
  const line = listCtx.split("\n").find((l) => l.includes(digits) && /售價/.test(l));
  console.log(`${line ? "✓" : "✗"} 產品清單帶了售價${line ? `：${line.slice(0, 120)}` : `——脈絡裡找不到「售價…${digits}」`}`);

  // ── 第一層之二：選定了產品（聚焦該產品的完整定位）──
  const oneCtx = await gatherBrandContext(brandId, Number(brand.userId), productId);
  const focused = oneCtx.split("\n").find((l) => /產品售價/.test(l) && l.includes(digits));
  console.log(`${focused ? "✓" : "✗"} 聚焦單一產品時帶了售價${focused ? `：${focused.trim().slice(0, 90)}` : ""}`);

  // ── 第二層：模型實際會不會再問一次 ──
  const directors = await listDirectorsForBrand(brand.industry ?? null, "product");
  const director = directors[0] ?? null;
  console.log(`\n人選：${director ? `${director.name}（${director.roleLabel}）` : "(拿不到人選，用無人設的 prompt)"}`);

  const { invokeLLM } = await import("../server/platform/core/llm.js");
  const system = buildSystemPrompt(director, listCtx);
  const t0 = Date.now();
  const r = await invokeLLM({
    messages: [
      { role: "system", content: system },
      { role: "user", content: `${QUESTION}（就講「${(priced?.name ?? "").slice(0, 20)}」這支）` },
    ],
    maxTokens: 700,
  });
  const reply = String(r.choices?.[0]?.message?.content ?? "").trim();
  console.log(`（${((Date.now() - t0) / 1000).toFixed(1)}s）問：「${QUESTION}」`);
  console.log("-".repeat(78));
  console.log(reply.slice(0, 1400));
  console.log("-".repeat(78));

  // 反問價格的句型——這就是 CJ 遇到的那一句
  const ASKS_PRICE = /(實際售價|售價是多少|價格是多少|現在.{0,6}賣多少|定價是多少|多少錢|報一下價)/;
  const asked = ASKS_PRICE.test(reply);
  const quoted = reply.includes(digits);
  console.log(`${asked ? "✗" : "✓"} ${asked ? "仍然反問了售價" : "沒有反問售價"}`);
  console.log(`${quoted ? "✓" : "✗"} ${quoted ? `回答裡覆述了 ${digits}` : `回答裡沒出現 ${digits}（沒覆述數字，使用者看不出他讀到了）`}`);

  await localPool.end();
  process.exit(asked ? 1 : 0);
}

main().catch((e) => { console.error("probe failed:", e); process.exit(1); });
