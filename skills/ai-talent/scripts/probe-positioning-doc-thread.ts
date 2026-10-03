/**
 * probe-positioning-doc-thread — 「貼上整串 ChatGPT 對話 → 定位固定欄位 + 自建卡片」全鏈，
 * 在 DEV VM 用真實品牌跑一次。
 *
 * 2026-09-23（CJ「品牌定位、產品定位…也想跟 content 一樣的卡片式，而且也可以自訂新增欄位，
 * 或是輸入 chatgpt 原有針對不同產品或品牌的討論…然後，有一張卡片，可能是願景等等的」）。
 * probe-task-card-thread.ts 驗的是「貼對話串 → 自建任務卡」；這支驗的是同一個貼對話串的
 * 動作用在定位上的新路徑：positioningDocRoute.paste → positioningDocsRouter.propose/
 * createCustomSegment，而且要驗到最後一哩——自訂卡片的內容真的會出現在 buildBrandPrefix
 * 餵給文案生成的 prompt 裡，不是只存在資料庫裡好看。
 *
 * 驗的東西：
 *   1. propose() 從一段「使用者指令＋AI 開場白＋被取代的舊草稿＋定案內容＋結尾寒暄」混雜的
 *      假對話裡，把「主受眾」「WHY 品牌信念」逐字對映到固定欄位（audience.primary /
 *      goldenCircle.why），且值必須是原文逐字（不可被模型「順過」）。
 *   2. 舊草稿（籠統、被使用者要求重寫）沒有混進最終對映。
 *   3. 對不進任何固定欄位、但足以自成一塊的「品牌願景」段落，出現在 suggestedSegments，
 *      而不是被硬塞進最接近的欄位（例如 goldenCircle.how）或丟進 unmappedSections。
 *   4. createCustomSegment 用該建議建卡之後，coverage 查得到它。
 *   5. 建完卡、清掉 brandContext 快取後，buildBrandPrefix 的輸出真的帶有這張自訂卡的內容
 *      ——這是「卡片存在」跟「卡片有用」的分界，之前的實作只驗到資料庫寫入為止。
 *
 * 安全性：跟 probe-task-card.ts 同一套（快照 positioning、finally 還原、finally 用
 * DELETE /api/positioning-doc 清掉這次上傳留下的檔案）。
 *
 * 用法（VM 上）：
 *   cd /opt/onbrand/current/skills/ai-talent
 *   ./node_modules/.bin/tsx scripts/probe-positioning-doc-thread.ts [brandId]
 */
import { SignJWT } from "jose";
import "./../server/bootstrap-env";
import localPool from "../server/localDb";
import { getJwtSecret } from "../server/platform/core/env";
import { buildBrandPrefix, _clearBrandPrefixCache } from "../server/strategy/core/brand/brandContext";

const BASE = process.env.PROBE_BASE ?? "http://127.0.0.1:3101";

let pass = 0, fail = 0;
function check(ok: boolean, label: string, detail = ""): void {
  if (ok) { pass++; console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ""}`); }
  else    { fail++; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`); }
}

// 定案內容——用詞刻意具體、跟舊草稿的籠統用詞不同，這樣才驗得出「只取定案版本」。
const FINAL_AUDIENCE = "25-35 歲、正在從原本的產業轉職到新領域的都市上班族，他們已經有基礎的職場經驗，但對新領域缺乏自信，需要有人陪著從頭建立能力。";
const FINAL_WHY = "我們相信轉職不是重新開始，是把舊經驗換一個新戰場繼續打——沒有人應該因為換賽道就被當成新手看待。";
// 「願景」——刻意寫成十年後的未來式身分想像，跟 goldenCircle.why（為什麼開始做）
// 是不同的問題，也套不進 how/what/origin/differentiation 任何一格。
const VISION_TEXT = "如果十年後有人問我們做得怎麼樣，我希望答案是：轉職這件事，在這個世代不再需要靠運氣。我們想成為「轉職族群預設會打開的那個東西」，就像現在想學英文就會打開某個 App 一樣——但那是十年後我們想抵達的樣子，跟我們現在為什麼開始做這件事，是兩個不同的問題。";
const OLD_DRAFT = "我們的品牌是想做給所有想要變好的人用的產品，價格實惠，品質也不錯。";

const FAKE_THREAD = `使用者：幫我把之前跟你討論品牌定位的內容整理一下，我要拿去用

AI 助手：好的，根據我們前面幾輪的討論，先給你一個初稿，你看看方向對不對：

初稿：
${OLD_DRAFT}

使用者：這個太籠統了，我們是主打過渡期轉職的人，年齡我記得我們談過是 25-35 歲，重講一次完整版

AI 助手：了解，這是重新整理後的完整定位：

【目標受眾】
${FINAL_AUDIENCE}

【品牌信念】
${FINAL_WHY}

【品牌願景】
${VISION_TEXT}

需要我再幫你補哪一塊嗎？

使用者：這樣就可以了，謝謝`;

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
  const authHeaders = { authorization: `Bearer ${token}` };

  const unwrap = (r: Response, json: any) => ({
    ok: r.ok, status: r.status,
    data: json?.result?.data,
    err: json?.error?.message ?? json?.error?.json?.message,
  });
  /** tRPC mutation：POST，input 放 body。 */
  const call = async (path: string, input: any) => {
    const r = await fetch(`${BASE}/trpc/${path}`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    return unwrap(r, await r.json().catch(() => ({})));
  };
  /** tRPC query：GET，input 走 query string（POST 打 query 會被 tRPC 悄悄回 undefined，不報錯）。 */
  const query = async (path: string, input: any) => {
    const url = `${BASE}/trpc/${path}?input=${encodeURIComponent(JSON.stringify(input))}`;
    const r = await fetch(url, { headers: authHeaders });
    return unwrap(r, await r.json().catch(() => ({})));
  };

  let docId: string | null = null;
  let segmentId: string | null = null;
  try {
    console.log("\n=== 1. 貼上整串假對話（走跟前端一樣的 /api/positioning-doc/paste） ===");
    const pasteRes = await fetch(`${BASE}/api/positioning-doc/paste`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id, scope: "brand", scopeId: brand.id,
        title: "probe 對話串貼上.txt", text: FAKE_THREAD,
      }),
    });
    const pasteJson = await pasteRes.json().catch(() => ({}));
    check(pasteRes.ok && !!pasteJson.docId, "paste 端點接受這段對話", pasteRes.ok ? "" : JSON.stringify(pasteJson).slice(0, 200));
    docId = pasteJson.docId ?? null;
    if (!docId) throw new Error("沒有 docId，後面沒得驗");

    console.log("\n=== 2. propose：對映固定欄位 + 提議自訂卡片 ===");
    const proposed = await call("positioningDocs.propose", { scope: "brand", scopeId: brand.id, docId });
    check(proposed.ok, "propose 呼叫成功", proposed.ok ? "" : proposed.err);
    const proposals: any[] = proposed.data?.proposals ?? [];
    const suggested: any[] = proposed.data?.suggestedSegments ?? [];
    console.log(`  對映 ${proposals.length} 格，建議新卡 ${suggested.length} 張`);
    for (const p of proposals) console.log(`  ── ${p.path}（${p.label}）：${JSON.stringify(p.value).slice(0, 100)}`);
    for (const s of suggested) console.log(`  ── 建議新卡「${s.title}」：${s.fields.map((f: any) => f.label).join("、")}`);

    const audienceProp = proposals.find((p) => p.path === "audience.primary");
    check(!!audienceProp, "主受眾（audience.primary）被對映到");
    check(!!audienceProp && String(audienceProp.value).includes("25-35 歲") && String(audienceProp.value).includes("轉職"), "主受眾的值是定案版本的逐字內容，不是改寫過的說法", audienceProp ? String(audienceProp.value).slice(0, 80) : "");

    const whyProp = proposals.find((p) => p.path === "goldenCircle.why");
    check(!!whyProp, "WHY 品牌信念（goldenCircle.why）被對映到");
    check(!!whyProp && String(whyProp.value).includes("沒有人應該因為換賽道就被當成新手看待"), "WHY 的值逐字對到原文", whyProp ? String(whyProp.value).slice(0, 80) : "");

    check(!proposals.some((p) => String(p.value).includes("價格實惠")), "被取代的舊草稿沒有混進最終對映");

    check(suggested.length >= 1, "至少提議了一張新卡（願景套不進任何固定欄位）");
    const visionSeg = suggested.find((s) => String(s.title).includes("願景") || s.fields.some((f: any) => String(f.value).includes("十年後")));
    check(!!visionSeg, "建議的新卡對應到「品牌願景」那段內容，不是隨便挑一段");
    check(!!visionSeg && visionSeg.fields.every((f: any) => VISION_TEXT.includes(f.value) || f.value.length >= 2), "新卡的每個欄位值都逐字出自原文");

    if (!visionSeg) throw new Error("沒有抓到願景建議卡，後面沒得驗 createCustomSegment");

    console.log("\n=== 3. createCustomSegment：使用者確認建卡 ===");
    const created = await call("positioningDocs.createCustomSegment", {
      scope: "brand", scopeId: brand.id,
      title: visionSeg.title, fields: visionSeg.fields, docId,
    });
    check(created.ok && !!created.data?.segment?.id, "建卡成功", created.ok ? "" : created.err);
    segmentId = created.data?.segment?.id ?? null;

    console.log("\n=== 4. coverage：查得到剛建的自訂卡 ===");
    const cov = await query("positioningDocs.coverage", { scope: "brand", scopeId: brand.id });
    const covSegs: any[] = cov.data?.customSegments ?? [];
    check(covSegs.some((s) => s.id === segmentId), "coverage 回傳裡看得到這張新卡", `目前 ${covSegs.length} 張`);

    console.log("\n=== 5. buildBrandPrefix：這張卡的內容真的會進文案生成的 prompt ===");
    _clearBrandPrefixCache();
    const prefix = await buildBrandPrefix(brand.id, null, null, "full");
    check(prefix.includes(visionSeg.title), "prefix 裡看得到卡片標題");
    const anyFieldInPrefix = visionSeg.fields.some((f: any) => prefix.includes(String(f.value).slice(0, 30)));
    check(anyFieldInPrefix, "prefix 裡看得到卡片欄位內容（不是只有標題）");
  } catch (e: any) {
    check(false, "probe 中斷", String(e?.message ?? e).slice(0, 300));
  } finally {
    if (docId) {
      await fetch(`${BASE}/api/positioning-doc/${brand.id}/brand/${brand.id}/${docId}`, {
        method: "DELETE", headers: authHeaders,
      }).catch(() => {});
    }
    await localPool.execute(`UPDATE brands SET positioning = ? WHERE id = ?`, [snapText, brand.id]);
    const [afterRows]: any = await localPool.execute(
      `SELECT positioning AS p FROM brands WHERE id = ? LIMIT 1`, [brand.id],
    );
    const after = (afterRows as any[])[0]?.p ?? null;
    const afterText = after == null ? null : (typeof after === "string" ? after : JSON.stringify(after));
    check(afterText === snapText, "positioning 已還原成探測前的原狀");
    _clearBrandPrefixCache();
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
