/**
 * probe-task-card-thread — 「貼上整串 ChatGPT 對話 → 變成自建任務卡」全鏈，在 DEV VM 用真實品牌跑一次。
 *
 * 2026-09-23（CJ「確認任務卡的功能，是否可以自己加入 chatgpt 對話串，變成一個自建任務卡」）。
 * probe-task-card.ts 驗的是「一篇一篇貼範例」那條路；這支驗的是 TaskCardComposer 的「貼上整串 AI
 * 對話」模式（brandTaskCard.extractSamples）——這才是使用者實際問的那個功能，之前沒有真的跑過。
 *
 * 驗的東西：
 *   1. extractSamples 從一段「使用者指令＋AI 解釋＋被取代的舊稿＋真正的三篇成品＋結尾寒暄」混雜在
 *      一起的假對話裡，抓對「只有三篇最終成品」——指令、解釋、舊稿都要被丟掉。
 *   2. 抓到的文字逐字等於原對話裡的那三段（verbatimSamples 的「只准引用不准創作」）。
 *   3. 抓出來的樣本接著真的能走完 create → 反推 SKILL → dryRun → publish 全鏈（跟 probe-task-card.ts
 *      同一套驗證，只是起點換成貼對話串而不是手打範例）。
 *
 * 安全性：跟 probe-task-card.ts 同一套（快照 positioning、finally 還原、finally 刪卡）。
 *
 * 用法（VM 上）：
 *   cd /opt/onbrand/current/skills/ai-talent
 *   ./node_modules/.bin/tsx scripts/probe-task-card-thread.ts [brandId]
 */
import { SignJWT } from "jose";
import "./../server/bootstrap-env";
import localPool from "../server/localDb";
import { getJwtSecret } from "../server/platform/core/env";
import { resolveTask } from "../server/content/core/catalog/taskRegistry";
import { registerBrandTaskCardSource } from "../server/content/core/catalog/brandTaskCards";

registerBrandTaskCardSource();

const BASE = process.env.PROBE_BASE ?? "http://127.0.0.1:3101";

let pass = 0, fail = 0;
function check(ok: boolean, label: string, detail = ""): void {
  if (ok) { pass++; console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ""}`); }
  else    { fail++; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`); }
}

// 三段「最終成品」——文字刻意跟被取代的舊稿不同，這樣才驗得出抽取工具有沒有抓錯版本。
const FINAL_A = `北歐風不是留白就好，是留白的地方要留給你真正在乎的東西。\n週年慶到 3/31，滿 2000 免運，還送手工蜂蠟蠋一支——不是湊單品，是我們自己家裡也在點的那款。`;
const FINAL_B = `有人問我們，為什麼櫃子做得比市面上厚兩公分。\n因為北歐冬天長，家具要撐得住整個冬天被當成書桌、餐桌、有時候還是小孩的城堡。週年慶滿 2000 免運，加碼送蜂蠟蠋。`;
const FINAL_C = `週末搬新家的人，通常都低估了自己需要多少層板。\n週年慶期間下單，滿 2000 元免運，第一批 100 名加送一支手工蜂蠟蠋。囤貨的季節，先把家準備好。`;
const OLD_DRAFT_A = `北歐風家具品牌週年慶熱烈開跑！即日起至3/31，凡購買滿2000元即可享有免運優惠，還有精美贈品等你拿，數量有限，手刀搶購趁現在！！`;

const FAKE_THREAD = `使用者：幫我寫 3 篇北歐風家具品牌的週年慶促購文，中文，重點放免運（滿 2000）跟贈品（手工蜂蠟蠋），語氣不要太像廣告

AI 助手：好的，這是第一版三個方向：

版本一：
${OLD_DRAFT_A}

版本二：
（先給你一個方向，等你回饋再細寫其他兩個）

需要我往哪個方向調整嗎？

使用者：第一篇太像制式促銷文了，整批重寫，語氣要像真的品牌小編在講一件自己在乎的事，不要用驚嘆號跟「數量有限」這種詞

AI 助手：了解，這是重寫後的三篇：

版本一（最終）：
${FINAL_A}

版本二（最終）：
${FINAL_B}

版本三（最終）：
${FINAL_C}

這三篇分別從「留白哲學」「用料細節」「搬家情境」切入，都把免運門檻跟贈品放進去但不生硬。需要我再調整哪一篇嗎？

使用者：不用了，很好，謝謝`;

async function main(): Promise<void> {
  const argBrand = parseInt(process.argv[2] ?? "", 10);

  console.log("=== 0. 挑一個真實品牌 ===");
  const [rows]: any = await localPool.execute(
    argBrand
      ? `SELECT id, name, userId FROM brands WHERE id = ? LIMIT 1`
      : `SELECT id, name, userId FROM brands WHERE positioning IS NOT NULL ORDER BY id DESC LIMIT 1`,
    argBrand ? [argBrand] : [],
  );
  const brand = (rows as any[])[0];
  if (!brand) { console.log("  ❌ 找不到品牌，中止"); process.exit(1); }
  console.log(`  品牌 #${brand.id}「${brand.name}」owner=${brand.userId}`);

  const [snapRows]: any = await localPool.execute(
    `SELECT positioning AS p FROM brands WHERE id = ? LIMIT 1`, [brand.id],
  );
  const snap = (snapRows as any[])[0]?.p ?? null;
  const snapText = snap == null ? null : (typeof snap === "string" ? snap : JSON.stringify(snap));

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(brand.userId))
    .setIssuedAt().setExpirationTime("30m")
    .sign(new TextEncoder().encode(getJwtSecret()));

  const unwrap = (r: Response, json: any) => ({
    ok: r.ok, status: r.status,
    data: json?.result?.data,
    err: json?.error?.message ?? json?.error?.json?.message,
  });
  /** mutation：POST，input 放 body。 */
  const call = async (path: string, input: any) => {
    const r = await fetch(`${BASE}/trpc/${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    return unwrap(r, await r.json().catch(() => ({})));
  };
  /** query：**GET**，input 走 query string（跟 probe-task-card.ts 踩過的同一個坑——
   *  用 POST 打 query 會被 tRPC 拒絕，data 回 undefined，卻不會報錯，容易誤判成「拿不到」）。 */
  const query = async (path: string, input: any) => {
    const url = `${BASE}/trpc/${path}?input=${encodeURIComponent(JSON.stringify(input))}`;
    const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    return unwrap(r, await r.json().catch(() => ({})));
  };

  let cardId: string | null = null;
  try {
    console.log("\n=== 1. extractSamples：貼上整串假對話，看抽出什麼 ===");
    const extracted = await call("brandTaskCard.extractSamples", {
      brandId: brand.id, text: FAKE_THREAD,
    });
    check(extracted.ok, "extractSamples 呼叫成功", extracted.ok ? "" : extracted.err);
    const samples: string[] = extracted.data?.samples ?? [];
    console.log(`  抽到 ${samples.length} 篇，dropped=${extracted.data?.dropped ?? "?"}`);
    samples.forEach((s, i) => console.log(`  ── 篇 ${i + 1} (${s.length} 字) ──\n  ${s.replace(/\n/g, "\n  ")}`));

    check(samples.length === 3, "抓到 3 篇（不是 1、不是 5）", `實際 ${samples.length} 篇`);
    check(samples.some((s) => s.includes(FINAL_A.slice(0, 15))), "抓到最終版 A");
    check(samples.some((s) => s.includes(FINAL_B.slice(0, 15))), "抓到最終版 B");
    check(samples.some((s) => s.includes(FINAL_C.slice(0, 15))), "抓到最終版 C");
    check(!samples.some((s) => s.includes("手刀搶購")), "被取代的舊稿（第一版）沒有混進來");
    check(!samples.some((s) => s.includes("需要我再調整") || s.includes("好的，這是") || s.includes("了解，這是")), "AI 的開場白／收尾詢問沒有混進來");
    check(!samples.some((s) => s.includes("幫我寫 3 篇") || s.includes("整批重寫")), "使用者自己下的指令沒有混進來");

    if (samples.length < 2) throw new Error("抽取品質不足，後面的全鏈驗證沒有意義");

    console.log("\n=== 2. 用抽出來的樣本走完整條鏈（跟 probe-task-card.ts 同一套） ===");
    const created = await call("brandTaskCard.create", {
      brandId: brand.id,
      name: `probe 對話串導入 ${Date.now().toString(36)}`,
      channel: "facebook",
      samples,
      primaryQuestion: "這次促銷的重點是什麼？",
      primaryPlaceholder: "例：週年慶、滿額免運、贈品",
      askFields: [],
      variants: 1,
    });
    check(created.ok && !!created.data?.cardId, "建卡", created.ok ? created.data.cardId : created.err);
    cardId = created.data?.cardId ?? null;
    if (!cardId) throw new Error("沒有 cardId，後面沒得驗");

    let card: any = null;
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 4000));
      const got = await query("brandTaskCard.get", { brandId: brand.id, cardId });
      card = got.data;
      if (card?.skill || card?.status === "failed") break;
      process.stdout.write(`  …反推 SKILL 中（step ${card?.currentStep}/${card?.totalSteps}）\r`);
    }
    console.log("");
    if (card?.status === "failed") { check(false, "SKILL 反推", card.lastError); throw new Error("反推失敗"); }
    check(!!card?.skill, "SKILL 反推完成", `${card?.skill?.length ?? 0} 字`);
    // 免運門檻「2000」是我們自己塞進 prompt 的量測數字之外的「事實」，商品事實（蜂蠟蠋、免運金額）
    // 不該被寫死——跟 probe-task-card.ts 驗的是同一條「事實不外流」規則。
    const skill: string = card.skill ?? "";
    check(!skill.includes("蜂蠟蠋"), "沒有把範例裡的具體贈品寫死進規則", skill.includes("蜂蠟蠋") ? "洩漏：蜂蠟蠋" : "");

    console.log("\n=== 3. dryRun 試寫 ===");
    const dry = await call("brandTaskCard.dryRun", {
      brandId: brand.id, cardId,
      inputs: { topic: "母親節活動，滿 1500 免運，送香氛蠟燭" },
    });
    check(dry.ok && !!dry.data?.caption, "試寫產出文字", dry.ok ? `${dry.data.chars} 字` : dry.err);
    if (dry.data?.caption) console.log("  " + String(dry.data.caption).replace(/\n/g, "\n  ").slice(0, 500));

    console.log("\n=== 4. publish → 六個入口共用的解析器查得到 ===");
    const pub = await call("brandTaskCard.publish", { brandId: brand.id, cardId });
    check(pub.ok, "上架", pub.ok ? "" : pub.err);
    const resolved = await resolveTask(cardId);
    check(!!resolved, "上架後解析得到");
    check(resolved?.source === "custom", "來源標成 custom");
  } catch (e: any) {
    check(false, "probe 中斷", String(e?.message ?? e).slice(0, 300));
  } finally {
    if (cardId) {
      await fetch(`${BASE}/trpc/brandTaskCard.remove`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ brandId: brand.id, cardId }),
      }).catch(() => {});
    }
    await localPool.execute(`UPDATE brands SET positioning = ? WHERE id = ?`, [snapText, brand.id]);
    const [afterRows]: any = await localPool.execute(
      `SELECT positioning AS p FROM brands WHERE id = ? LIMIT 1`, [brand.id],
    );
    const after = (afterRows as any[])[0]?.p ?? null;
    const afterText = after == null ? null : (typeof after === "string" ? after : JSON.stringify(after));
    check(afterText === snapText, "positioning 已還原成探測前的原狀");
  }

  console.log(`\n=== 結果：${pass} 通過 / ${fail} 失敗 ===`);
  await localPool.end().catch(() => {});
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("probe 爆了：", e);
  await localPool.end().catch(() => {});
  process.exit(1);
});
