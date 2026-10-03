/**
 * probe-task-card — 自建任務卡的全鏈，在 DEV VM 上用真實品牌跑一次。
 *
 * 這支會真的花 LLM 錢（反推 SKILL + 試寫各一次），而且**應該花** —— 這個功能的
 * 核心就是「從貼上的成品反推出可用的寫作規則」，不真的跑一次等於沒驗。
 *
 * 驗的東西：
 *   1. create → 背景反推 SKILL 真的會完成（輪詢等它）
 *   2. SKILL 的品質下限：夠長、有規則感、**沒有把範例裡的具體事實抄進規則**
 *      （那會讓這張卡永遠在寫同一篇 —— 這是 prompt 明文禁止的第二條）
 *   3. dryRun 產出真的文字，且**不落地 mission_outputs**（不然 /projects 會被塞爆）
 *   4. publish 之後 taskRegistry 六個入口共用的解析器查得到這張卡
 *   5. 未 publish 的卡解析不到（閘門有效）
 *
 * 安全性：開頭快照 positioning 整欄，finally 還原並逐字元比對。跑在真實品牌上。
 *
 * 用法（在 VM 上）：
 *   cd /opt/onbrand/current/skills/ai-talent
 *   ./node_modules/.bin/tsx scripts/probe-task-card.ts [brandId]
 */
import { SignJWT } from "jose";
import "./../server/bootstrap-env";
import localPool from "../server/localDb";
import { getJwtSecret } from "../server/platform/core/env";
import { resolveTask } from "../server/content/core/taskRegistry";
import { getBrandTaskCard, registerBrandTaskCardSource } from "../server/content/core/brandTaskCards";

// probe 是獨立的 node process。`taskRegistry` 的 SOURCES 是模組層狀態，server
// process 靠 routers/index.ts → brandTaskCardRouter 的 side-effect 帶進來；
// 這裡沒有那條路，所以要自己註冊，否則 resolveTask 永遠回 null（而且會誤報成
// 「閘門有效」——第一次跑就是這樣騙過自己的）。
registerBrandTaskCardSource();

const BASE = process.env.PROBE_BASE ?? "http://127.0.0.1:3101";

let pass = 0, fail = 0;
function check(ok: boolean, label: string, detail = ""): void {
  if (ok) { pass++; console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ""}`); }
  else    { fail++; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`); }
}

/**
 * 三篇「促購文」範例，故意都塞了具體事實（商品名、價格、日期）——
 * SKILL 不可以把這些抄進規則，否則這張卡永遠在賣熱可可。
 */
const SAMPLES = [
  `冷氣團來了。冰箱最上層那排熱可可，是我們去年冬天賣得最好的東西。\n不是因為它便宜，是因為泡起來只要 90 秒，而通勤前你只有 90 秒。\n今天到週日，兩盒 499。想撐過這波的，先囤起來。`,
  `有人問我們為什麼不做無糖版。\n因為我們試過，甜度砍掉之後那股可可的厚度就不見了，喝起來像在喝溫水。\n我們寧願你一週喝兩次真的好喝的，也不要你天天喝一杯將就的。\n經典款這週補貨到齊，一盒 279。`,
  `週末在店裡看到一位客人，買了六盒，說是要放辦公室給同事。\n她說：「不用問誰要，放在那裡，加班的人自己會拿。」\n我們做這個產品的時候沒想過這個用法，但這大概是它最好的樣子。\n六盒組 1499，這週限量 40 組。`,
];

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

  // 整欄快照。finally 一定要還原 —— 這支是拿真實品牌在跑的。
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
  /** query：**GET**，input 走 query string。用 POST 打 query 會被 tRPC 拒絕，
   *  回傳的 data 是 undefined —— 第一次跑就是這樣讓三個檢查全紅的。 */
  const query = async (path: string, input: any) => {
    const url = `${BASE}/trpc/${path}?input=${encodeURIComponent(JSON.stringify(input))}`;
    const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    return unwrap(r, await r.json().catch(() => ({})));
  };

  let cardId: string | null = null;
  try {
    console.log("\n=== 1. create → 背景反推 SKILL ===");
    const created = await call("brandTaskCard.create", {
      brandId: brand.id,
      name: `probe 促購文 ${Date.now().toString(36)}`,
      channel: "facebook",
      samples: SAMPLES,
      primaryQuestion: "這次要促銷哪個商品？",
      primaryPlaceholder: "例：冬季限定熱可可",
      askFields: [{ label: "優惠截止日", type: "text", required: true, placeholder: "例：12/31" }],
      variants: 1,
    });
    check(created.ok && !!created.data?.cardId, "建卡", created.ok ? created.data.cardId : created.err);
    cardId = created.data?.cardId ?? null;
    if (!cardId) throw new Error("沒有 cardId，後面沒得驗");

    // 字數是量出來的，不是問來的 —— 三篇範例約 120–140 字。
    const measured = created.data.card.measured;
    console.log(`  量出來的區間：${measured.minChars}–${measured.maxChars} 字（中位數 ${measured.medianChars}，${measured.count} 篇）`);
    check(measured.count === 3 && measured.minChars > 0 && measured.maxChars > measured.minChars,
      "字數區間從範例量出來（沒問使用者）");

    // 輪詢等背景反推完成。
    let card: any = null;
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 4000));
      card = await getBrandTaskCard(brand.id, cardId);
      if (card?.skill || card?.status === "failed") break;
      process.stdout.write(`  …生成中（step ${card?.currentStep}/${card?.totalSteps}）\r`);
    }
    console.log("");
    if (card?.status === "failed") {
      check(false, "SKILL 反推", card.lastError);
      throw new Error("SKILL 反推失敗，後面的驗證沒有意義");
    }
    check(!!card?.skill, "SKILL 反推完成", `${card?.skill?.length ?? 0} 字`);

    console.log("\n=== 2. SKILL 的品質下限 ===");
    const skill: string = card.skill;
    check(skill.length >= 300, "夠長（規則寫不進 300 字以內）", `${skill.length} 字`);
    // prompt 明文禁止把範例裡的具體事實抄進規則 —— 抄了這張卡就永遠在賣熱可可。
    // 價格由 factLeaks 合約擋（驗證→重試→修補）；商品名靠 prompt。
    const LEAKED = ["熱可可", "499", "279", "1499", "六盒組", "無糖版"];
    const leaks = LEAKED.filter((w) => skill.includes(w));
    check(leaks.length === 0, "沒有把範例裡的具體事實寫進規則", leaks.length ? `洩漏：${leaks.join("、")}` : "");
    // 規則感：可檢查的規則通常會列點或編號。
    check(/(^|\n)\s*(\d+[.、)]|[-•*])/.test(skill), "有條列出來的規則");

    console.log("\n=== 3. dryRun 試寫 ===");
    // mission_outputs 沒有 userId 欄位（只有 missionId）。用時間戳判斷試寫有沒有
    // 新增任何一列 —— 一列都不該有。
    const [tsRows]: any = await localPool.execute(`SELECT NOW() AS t`);
    const since = (tsRows as any[])[0].t;

    const dry = await call("brandTaskCard.dryRun", {
      brandId: brand.id, cardId,
      inputs: { topic: "冬季新品薑茶，主打通勤前 60 秒沖泡", promo_ends: "1/15" },
    });
    check(dry.ok && !!dry.data?.caption, "試寫產出文字", dry.ok ? `${dry.data.chars} 字（區間 ${dry.data.expected.minChars}–${dry.data.expected.maxChars}，inRange=${dry.data.inRange}）` : dry.err);
    if (dry.data?.caption) {
      console.log("  ── 試寫結果 ──");
      console.log("  " + String(dry.data.caption).replace(/\n/g, "\n  ").slice(0, 700));
    }

    const [newRows]: any = await localPool.execute(
      `SELECT COUNT(*) AS n FROM mission_outputs WHERE createdAt >= ?`, [since],
    );
    const added = Number((newRows as any[])[0]?.n ?? 0);
    check(added === 0, "試寫沒有落地 mission_outputs（/projects 不會被塞半成品）", `新增 ${added} 列`);

    console.log("\n=== 4. publish 前後的閘門 ===");
    check((await resolveTask(cardId)) === null, "未上架的卡解析不到（閘門有效）");

    const pub = await call("brandTaskCard.publish", { brandId: brand.id, cardId });
    check(pub.ok, "上架", pub.ok ? "" : pub.err);

    const resolved = await resolveTask(cardId);
    check(!!resolved, "上架後六個入口共用的解析器查得到");
    check(resolved?.source === "custom", "來源標成 custom", resolved?.source);
    check(resolved?.template.systemPrompt === skill, "systemPrompt 就是那份 SKILL");
    check(resolved?.config.variants === 1, "config 的版本數對得上");

    console.log("\n=== 5. 出現在任務頁的清單裡 ===");
    const listed = await query("quickTask.listFB", { brandId: brand.id });
    const found = ((listed.data as any[]) ?? []).find((t) => t.id === cardId);
    check(!!found, "listFB 列得出這張卡");
    check(found?.platform === "facebook", "掛在正確的頻道", found?.platform);
    check(!!found?.ownCardId, "標記成「我自己的卡」（UI 靠這個給編輯入口）");
  } catch (e: any) {
    check(false, "probe 中斷", String(e?.message ?? e).slice(0, 200));
  } finally {
    // 先走 API 刪卡（順便驗 remove），再整欄還原兜底。
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
