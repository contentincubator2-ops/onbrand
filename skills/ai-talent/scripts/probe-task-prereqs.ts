/**
 * probe-task-prereqs — 用戶自建任務卡的兩個前置修正，在 DEV VM 上驗一次。
 *
 * 兩件事單元測試證明不了：
 *   1. 收斂後的 taskRegistry 在**部署出去的那份程式碼**上真的解析得到每一張卡
 *      （尤其是 regenerateVariant 原本漏掉的 KOL）。
 *   2. intake 的必填檢查在**真的 HTTP 請求**上擋得下來，而且訊息說得出是哪一格
 *      —— 而不是丟一個帶 key 的英文訊息給使用者看。
 *
 * 刻意不做的事：不真的跑完一張 60s 卡。那要花 LLM 錢也要一分鐘，而它證明的是
 * orchestra 能不能跑（本來就能），不是這次改的東西。被 intake 擋下來的請求在
 * 扣點之前就結束，所以這支不會動到任何人的點數。
 *
 * 用法（在 VM 上）：
 *   cd /opt/onbrand/current/skills/ai-talent
 *   ./node_modules/.bin/tsx scripts/probe-task-prereqs.ts
 */
import { SignJWT } from "jose";
import "./../server/bootstrap-env";
import localPool from "../server/localDb";
import { getJwtSecret } from "../server/platform/core/env";
import { resolveTask, resolveTaskTemplateSync } from "../server/content/core/taskRegistry";
import { intakeExtraFields } from "../server/content/core/taskIntake";
import { KOL_30S_TASKS } from "../server/content/core/quickTaskKOL";
import { WEBSITE_30S_TASKS } from "../server/content/core/quickTaskWebsite";
import { PACKS } from "../server/strategy/core/brandPacks";

const BASE = process.env.PROBE_BASE ?? "http://127.0.0.1:3101";

let pass = 0, fail = 0;
function check(ok: boolean, label: string, detail = ""): void {
  if (ok) { pass++; console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ""}`); }
  else    { fail++; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`); }
}

/** 這 7 張卡宣告了 primary 以外的必填欄位，2026-09-02 之前完全問不到。 */
const REQUIRED_CARDS: Record<string, string[]> = {
  "fb-60-link-full":       ["context"],
  "fb-60-countdown-5day":  ["key_offer"],
  "fb-60-launch-kit":      ["event_when", "event_why"],
  "fb-60-live-suite":      ["key_points"],
  "ig-60-countdown-5day":  ["key_offer"],
  "fb-99-launch-toolkit":  ["event_when", "event_why"],
  "fb-99-livestream-9seg": ["key_points"],
};

async function main(): Promise<void> {
  console.log("=== 1. taskRegistry：部署出去的那份真的解析得到每一張卡 ===");

  const kolMisses: string[] = [];
  for (const t of KOL_30S_TASKS) if (!(await resolveTask(t.id))) kolMisses.push(t.id);
  check(kolMisses.length === 0,
    `KOL ${KOL_30S_TASKS.length} 張全部解析得到（regenerateVariant 原本漏這條）`,
    kolMisses.join("、"));

  const webMisses: string[] = [];
  for (const t of WEBSITE_30S_TASKS) if (!(await resolveTask(t.id))) webMisses.push(t.id);
  check(webMisses.length === 0, `官網 ${WEBSITE_30S_TASKS.length} 張全部解析得到`, webMisses.join("、"));

  const packCards = PACKS.flatMap((p) => p.cards).filter((c: any) => c.kind === "custom");
  const packMisses: string[] = [];
  for (const c of packCards) {
    const id = (c as any).template.id;
    const r = await resolveTask(id);
    if (!r || r.source !== "custom") packMisses.push(id);
  }
  check(packMisses.length === 0, `brandPack 自訂卡 ${packCards.length} 張全部解析得到`, packMisses.join("、"));

  console.log("\n=== 2. intake：7 張卡的必填欄位現在渲染得出來 ===");
  for (const [taskId, keys] of Object.entries(REQUIRED_CARDS)) {
    const tpl = resolveTaskTemplateSync(taskId);
    if (!tpl) { check(false, `${taskId} 解析不到`); continue; }
    const got = intakeExtraFields(tpl as any).filter((f) => f.required).map((f) => f.key).sort();
    check(JSON.stringify(got) === JSON.stringify([...keys].sort()),
      `${taskId} 必填欄位`, got.join("、"));
  }

  console.log("\n=== 3. HTTP：沒填必填時真的被擋，而且訊息看得懂 ===");
  const [rows]: any = await localPool.execute(
    `SELECT id, name, userId FROM brands WHERE positioning IS NOT NULL ORDER BY id DESC LIMIT 1`,
  );
  const brand = (rows as any[])[0];
  if (!brand) { console.log("  ❌ 找不到品牌，中止"); process.exit(1); }
  console.log(`  用品牌 #${brand.id}「${brand.name}」`);

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(brand.userId))
    .setIssuedAt().setExpirationTime("10m")
    .sign(new TextEncoder().encode(getJwtSecret()));

  const call = async (path: string, input: any) => {
    const r = await fetch(`${BASE}/trpc/${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    return { status: r.status, json: (await r.json().catch(() => ({}))) as any };
  };

  // fb-60-launch-kit 需要 event_when / event_why。只給主問題應該被擋 ——
  // 而且是在扣點之前，所以這支 probe 不會花掉任何人的點數。
  const tpl = resolveTaskTemplateSync("fb-60-launch-kit")!;
  const requiredLabels = intakeExtraFields(tpl as any).filter((f) => f.required).map((f) => f.label);

  const bad = await call("quickTask.runOrchestra60", {
    taskId: "fb-60-launch-kit",
    inputs: { topic: "春季新品上市" },
    brandId: brand.id,
  });
  const msg = String(bad.json?.error?.message ?? bad.json?.error?.json?.message ?? "");
  // 400 而不是 500：使用者少填一格是輸入問題，不是伺服器壞了。回 500 會讓它
  // 混進 error_log 的錯誤堆，那張表本來就已經難讀。
  check(bad.status === 400, "缺必填時回 400（不是 500）", `HTTP ${bad.status}`);
  check(msg.includes("還缺必填欄位"), "訊息是給人看的中文", msg.slice(0, 120));
  for (const label of requiredLabels) {
    check(msg.includes(label), `訊息點名了「${label}」`);
  }
  // key 是給程式看的，不該出現在使用者面前。
  check(!msg.includes("event_when") && !msg.includes("event_why"),
    "訊息用 label 不用 key", msg.slice(0, 120));

  // 對照組：沒有額外必填的卡不該被這道新關卡誤擋。
  const plain = resolveTaskTemplateSync("fb-30-caption-short");
  check(intakeExtraFields(plain as any).filter((f) => f.required).length === 0,
    "一般卡沒有被誤加必填（fb-30-caption-short）");

  console.log(`\n=== 結果：${pass} 通過 / ${fail} 失敗 ===`);
  await localPool.end().catch(() => {});
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("probe 爆了：", e);
  await localPool.end().catch(() => {});
  process.exit(1);
});
