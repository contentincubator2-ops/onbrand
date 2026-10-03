/**
 * probe-positioning-doc — 在 DEV VM 上用真實資料跑一次「上傳定位文件」全鏈。
 *
 * typecheck 與單元測試證明不了的三件事，只有真的在機器上跑才知道：
 *   1. dev VM 到底有沒有 python3 + lxml（抽取器整條路徑靠它）
 *   2. HTTP 層（express.raw、JWT、品牌權限）接不接得起來
 *   3. 產品／活動定位的 canonical 修正，套在**真的資料**上有沒有效
 *
 * 安全性：會寫入 positioning，所以開頭先把整欄原封不動快照起來，結束時還原並
 * 逐字元比對。任何一步炸掉都走 finally 還原 —— 這支是拿真實品牌在跑的。
 *
 * 用法（在 VM 上）：
 *   cd /opt/onbrand/current/skills/ai-talent
 *   ./node_modules/.bin/tsx scripts/probe-positioning-doc.ts [brandId]
 */
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { SignJWT } from "jose";
import "./../server/bootstrap-env";
import localPool from "../server/localDb";
import { getJwtSecret } from "../server/platform/core/env";
import { buildBrandPrefix } from "../server/strategy/core/brand/brandContext";
import {
  coverageOf, promptFieldsFor, loadPositioning,
} from "../server/strategy/core/positioning/positioningDocs";

const exec = promisify(execFile);
const BASE = process.env.PROBE_BASE ?? "http://127.0.0.1:3101";

let pass = 0, fail = 0;
function check(ok: boolean, label: string, detail = ""): void {
  if (ok) { pass++; console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ""}`); }
  else    { fail++; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`); }
}

const FIXTURE = `品牌信念
我們相信一個家最重要的不是坪數，是住進去以後家人願不願意待在客廳。

我們怎麼做
每一案都先住進基地一週，記錄光線走過的路徑，再開始畫圖。不接可以蓋但不該蓋的案子。

說話的方式
我們會寫「這面牆會擋掉四點以後的西曬」，不會寫「採光極佳」。
不用奢華、頂級、尊爵這三個詞。

我們的客人
第二次購屋、三十五到五十歲、看過十個以上建案而且都覺得長得一樣的人。
他們最怕的是花了一輩子的錢，買到一個跟隔壁一模一樣的殼。

我們的驗收標準
交屋後半年回訪，如果客廳沒有變成家裡待最久的地方，這一案就是沒做到。
`;

async function main(): Promise<void> {
  const argBrand = parseInt(process.argv[2] ?? "", 10);

  console.log("=== 0. 環境 ===");
  try {
    const { stdout } = await exec(process.env.PYTHON_BIN ?? "python3", ["-c", "import lxml,sys;print(sys.version.split()[0])"]);
    check(true, "python3 + lxml", stdout.trim());
  } catch (e: any) {
    check(false, "python3 + lxml", String(e?.message ?? e).slice(0, 160));
    console.log("\n抽取器整條路徑依賴這個，缺了上傳一定失敗。先裝再跑。");
  }

  console.log("\n=== 1. 抽取器（真的跑一次 python）===");
  const tmp = join(tmpdir(), `probe-positioning-${Date.now()}.txt`);
  await fs.writeFile(tmp, FIXTURE, "utf-8");
  try {
    const { stdout } = await exec(
      process.env.PYTHON_BIN ?? "python3",
      [join(process.cwd(), "scripts", "positioning", "extract_doc.py"), tmp],
      { maxBuffer: 16 * 1024 * 1024 },
    );
    const parsed = JSON.parse(stdout);
    const doc = parsed.docs?.[0];
    check(!!doc, "抽得出文件");
    check((doc?.sections?.length ?? 0) >= 4, "認出用戶自己的段落", `${doc?.sections?.length} 節`);
    const heads = (doc?.sections ?? []).map((s: any) => s.heading).filter(Boolean);
    check(heads.includes("說話的方式"), "標題判斷正確", heads.join(" / "));
  } catch (e: any) {
    check(false, "抽取器", String(e?.stderr || e?.message || e).slice(0, 200));
  } finally {
    await fs.unlink(tmp).catch(() => {});
  }

  console.log("\n=== 2. 挑一個真實品牌 ===");
  const [brandRows]: any = await localPool.execute(
    argBrand
      ? `SELECT id, name, userId FROM brands WHERE id = ? LIMIT 1`
      : `SELECT id, name, userId FROM brands WHERE positioning IS NOT NULL ORDER BY id DESC LIMIT 1`,
    argBrand ? [argBrand] : [],
  );
  const brand = (brandRows as any[])[0];
  if (!brand) { console.log("  ❌ 找不到品牌，中止"); process.exit(1); }
  console.log(`  品牌 #${brand.id}「${brand.name}」owner=${brand.userId}`);

  const pos = await loadPositioning("brand", brand.id, brand.userId);
  const cov = coverageOf(pos, "brand");
  console.log(`  引擎讀得到的品牌欄位：${cov.filled.length}/${promptFieldsFor("brand").length} 有值`);
  if (cov.missing.length) console.log(`  缺：${cov.missing.map((f) => f.label).join("、")}`);

  console.log("\n=== 3. 產品／活動 canonical 修正（真實資料）===");
  const [prodRows]: any = await localPool.execute(
    `SELECT id, name FROM products WHERE userId = ? AND positioning IS NOT NULL ORDER BY id DESC LIMIT 1`,
    [brand.userId],
  );
  const product = (prodRows as any[])[0];
  if (!product) {
    console.log("  ⚠️  這個帳號沒有帶定位的產品，跳過（不是失敗）");
  } else {
    const ppos = await loadPositioning("product", product.id, brand.userId);
    const pcov = coverageOf(ppos, "product");
    const prefix = await buildBrandPrefix(brand.id, product.id);
    console.log(`  產品 #${product.id}「${product.name}」canonical 有值：${pcov.filled.map((f) => f.label).join("、") || "(無)"}`);
    for (const f of pcov.filled) {
      const raw = f.path.split(".").reduce<any>((a, k) => (a == null ? a : a[k]), ppos);
      const needle = typeof raw === "string" ? raw.slice(0, 24)
                   : Array.isArray(raw) && typeof raw[0] === "string" ? String(raw[0]).slice(0, 24) : null;
      if (needle) check(prefix.includes(needle), `產品「${f.label}」進了 prompt`);
    }
    check(!prefix.includes("[object Object]"), "prompt 裡沒有 [object Object]");
  }

  const [evRows]: any = await localPool.execute(
    `SELECT id, name FROM events WHERE userId = ? AND positioning IS NOT NULL ORDER BY id DESC LIMIT 1`,
    [brand.userId],
  );
  const event = (evRows as any[])[0];
  if (!event) {
    console.log("  ⚠️  這個帳號沒有帶定位的活動，跳過（不是失敗）");
  } else {
    const epos = await loadPositioning("event", event.id, brand.userId);
    const ecov = coverageOf(epos, "event");
    const prefix = await buildBrandPrefix(brand.id, null, event.id);
    console.log(`  活動 #${event.id}「${event.name}」canonical 有值：${ecov.filled.map((f) => f.label).join("、") || "(無)"}`);
    check(!prefix.includes("[object Object]"), "活動 prompt 裡沒有 [object Object]（舊碼會有）");
    for (const f of ecov.filled.slice(0, 4)) {
      const raw = f.path.split(".").reduce<any>((a, k) => (a == null ? a : a[k]), epos);
      const needle = typeof raw === "string" ? raw.slice(0, 24) : null;
      if (needle) check(prefix.includes(needle), `活動「${f.label}」進了 prompt`);
    }
  }

  console.log("\n=== 4. HTTP 全鏈（upload → propose → apply）===");
  // 整欄快照。這支是拿真實品牌在跑的，finally 一定要還原。
  const [snapRows]: any = await localPool.execute(
    `SELECT positioning AS p FROM brands WHERE id = ? LIMIT 1`, [brand.id],
  );
  const snapshot: string | null = (snapRows as any[])[0]?.p ?? null;
  const snapText = snapshot == null ? null : (typeof snapshot === "string" ? snapshot : JSON.stringify(snapshot));

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(brand.userId))
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(getJwtSecret()));
  const auth = { authorization: `Bearer ${token}` };

  let docId: string | null = null;
  try {
    const up = await fetch(`${BASE}/api/positioning-doc/upload`, {
      method: "POST",
      headers: {
        ...auth,
        "content-type": "application/octet-stream",
        "x-brand-id": String(brand.id),
        "x-scope": "brand",
        "x-scope-id": String(brand.id),
        "x-filename": "probe-brandbook.txt",
      },
      body: FIXTURE,
    });
    const upJson: any = await up.json().catch(() => ({}));
    check(up.ok, "上傳 + 抽取", up.ok ? `docId=${String(upJson.docId).slice(0, 8)}…` : JSON.stringify(upJson).slice(0, 200));
    docId = upJson.docId ?? null;

    if (docId) {
      const readRes = await fetch(
        `${BASE}/api/positioning-doc/doc?brandId=${brand.id}&scope=brand&scopeId=${brand.id}&docId=${docId}`,
        { headers: auth },
      );
      const readJson: any = await readRes.json().catch(() => ({}));
      check(readRes.ok && (readJson.doc?.sections?.length ?? 0) >= 4,
        "讀得回用戶自己的段落結構", `${readJson.doc?.sections?.length} 節`);

      // propose 走 LLM。dev 的 provider 常常是降級的，所以這一步失敗只回報、
      // 不判整支 probe 死 —— 它證明的是 LLM 可用性，不是這個功能的接線。
      const listRes = await fetch(`${BASE}/api/positioning-doc/list?brandId=${brand.id}&scope=brand&scopeId=${brand.id}`, { headers: auth });
      const listJson: any = await listRes.json().catch(() => ({}));
      check(listRes.ok && (listJson.docs ?? []).some((d: any) => d.id === docId), "清單看得到這份文件");

      // ── propose：功能的核心，也是唯一會花 LLM 錢的一步 ──────────────────
      // dev 的 provider 常常是降級的，所以這一步失敗只回報、不判整支 probe 死
      // —— 它證明的是 LLM 可用性，不是這個功能的接線。
      const trpc = async (path: string, input: any) => {
        const r = await fetch(`${BASE}/trpc/${path}`, {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify(input),
        });
        return { ok: r.ok, json: await r.json().catch(() => ({})) as any };
      };

      const prop = await trpc("positioningDocs.propose", { scope: "brand", scopeId: brand.id, docId });
      const result = prop.json?.result?.data;
      if (!prop.ok || !result) {
        console.log(`  ⚠️  propose 失敗（多半是 LLM provider 降級，不是接線問題）：${JSON.stringify(prop.json).slice(0, 300)}`);
      } else {
        check(result.proposals.length > 0, "LLM 對到欄位", `${result.proposals.length}/${result.total} 格`);
        for (const p of result.proposals) {
          console.log(`     · ${p.label} ← 「${p.fromHeading}」：${JSON.stringify(p.value).slice(0, 90)}`);
        }
        console.log(`     未對映段落：${result.unmapped.map((u: any) => u.heading).join("、") || "(無)"}`);

        // 「只准引用不准創作」是這個功能最重要的保證。逐格確認值真的出自原文
        // —— 編一句出來會直接變成品牌對外的說法。
        const norm = (t: string) => t.replace(/[\s　，。、；：「」（）()·]/g, "");
        const src = norm(FIXTURE);
        const invented = result.proposals.filter((p: any) => {
          const vals = typeof p.value === "string" ? [p.value]
                     : Array.isArray(p.value) ? p.value.map((v: any) => typeof v === "string" ? v : v.ours ?? "")
                     : [];
          // 允許節錄：取值裡最長的一段連續 12 字，必須在原文找得到。
          return vals.some((v: string) => {
            const n = norm(v);
            if (n.length < 12) return false;
            for (let i = 0; i + 12 <= n.length; i += 4) if (src.includes(n.slice(i, i + 12))) return false;
            return true;
          });
        });
        check(invented.length === 0, "對映的值都出自原文（沒有創作）",
          invented.length ? invented.map((p: any) => p.label).join("、") : "");

        const appRes = await trpc("positioningDocs.applyMapping", {
          scope: "brand", scopeId: brand.id, docId,
          accepted: result.proposals.map((p: any) => ({ path: p.path, value: p.value })),
          injectSections: result.unmapped.map((u: any) => u.index),
        });
        const appData = appRes.json?.result?.data;
        check(!!appRes.ok && !!appData?.ok, "套用寫得進 positioning",
          appData ? `寫入 ${appData.applied.filled.length} 格、補充 ${appData.applied.injectedContext.length} 字` : JSON.stringify(appRes.json).slice(0, 200));

        if (appData?.ok) {
          // 套用後，那幾格必須真的出現在下一次組出來的 prompt 裡 —— 這是整條鏈
          // 的終點，寫進資料庫但沒進 prompt 等於沒做。
          const after = await buildBrandPrefix(brand.id);
          const sample = result.proposals.find((p: any) => typeof p.value === "string" && p.value.length > 12);
          if (sample) check(after.includes(String(sample.value).slice(0, 12)), `套用後「${sample.label}」進了 prompt`);
          if (appData.applied.injectedContext) {
            check(after.includes(appData.applied.injectedContext.slice(0, 20)), "補充段落也進了 prompt");
          }
        }
      }
    }
  } finally {
    if (docId) {
      await fetch(`${BASE}/api/positioning-doc/${brand.id}/brand/${brand.id}/${docId}`, {
        method: "DELETE", headers: auth,
      }).catch(() => {});
    }
    // 還原並逐字元比對 —— 「我以為我還原了」不算還原。
    await localPool.execute(`UPDATE brands SET positioning = ? WHERE id = ?`, [snapText, brand.id]);
    const [afterRows]: any = await localPool.execute(`SELECT positioning AS p FROM brands WHERE id = ? LIMIT 1`, [brand.id]);
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
