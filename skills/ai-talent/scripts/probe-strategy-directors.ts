/**
 * probe-strategy-directors — 在真的資料庫上印出「三位策略總監」挑人結果。
 *
 * 2026-09-23：strategistDirectory.ts 的挑人規則（角色固定、產業命中就用
 * 產業的人、對不上退回預設）只靠 mock 測試守不住一件事——真實 mos_db 裡
 * 到底有沒有那些人、使用者品牌的 industry 欄位實際長什麼樣、LIKE 比對打
 * 不打得到。這支就是拿真資料跑一次給人看。
 *
 * 唯讀：只有 SELECT，不寫任何東西。
 *
 * 用法（在 VM 上，/opt/onbrand/current/skills/ai-talent）：
 *   ./node_modules/.bin/tsx scripts/probe-strategy-directors.ts
 *   ./node_modules/.bin/tsx scripts/probe-strategy-directors.ts 2992
 */
import localPool from "../server/localDb.js";
import { listDirectorsForBrand, searchDirectors, industryCodeOf, STRATEGIST_ROLES } from "../server/strategy/core/strategistDirectory.js";

function line(s = "") { console.log(s); }

function show(label: string, directors: Awaited<ReturnType<typeof listDirectorsForBrand>>) {
  line(`── ${label} ──`);
  if (directors.length === 0) { line("  (一位都沒找到)"); return; }
  for (const d of directors) {
    line(`  [${d.roleLabel}] ${d.name}（${d.title}）#${d.agentId} ${d.slug}${d.isFallback ? "  ← fallback" : ""}`);
    line(`      專長：${(d.specialty ?? "(無)").slice(0, 70)}`);
    line(`      經歷：${(d.experience ?? "(無)").replace(/\n/g, " / ").slice(0, 90)}`);
    line(`      招牌問題：${d.signatureQuestions[0] ?? "(無)"}`);
  }
}

async function main() {
  const argBrand = Number(process.argv[2]);
  line(`角色定義：${STRATEGIST_ROLES.map((r) => `${r.label}(${r.slugPrefix})`).join("、")}`);
  line();

  // 1) 幾個真實品牌——優先用指令列指定的，否則挑最近更新、有填產業的幾個。
  const [brandRows]: any = argBrand
    ? await localPool.execute(`SELECT id, name, industry FROM brands WHERE id = ? LIMIT 1`, [argBrand])
    : await localPool.execute(
        `SELECT id, name, industry FROM brands
          WHERE industry IS NOT NULL AND industry <> ''
          ORDER BY updatedAt DESC LIMIT 5`,
      );
  const brands = brandRows as Array<{ id: number; name: string; industry: string | null }>;
  line(`真實品牌 ${brands.length} 個：`);
  for (const b of brands) {
    line();
    show(
      `品牌 #${b.id} ${b.name}｜industry = ${JSON.stringify(b.industry)} → 產業代碼 ${industryCodeOf(b.industry) ?? "(對不到)"}`,
      await listDirectorsForBrand(b.industry),
    );
  }

  // 2) 產業命中 vs 對不上，各示範一次——證明兩條路都真的會走到。
  line();
  show("industry = 美妝保養（預期命中產業）", await listDirectorsForBrand("美妝保養"));
  line();
  show("industry = 色彩文具（預期全部 fallback）", await listDirectorsForBrand("色彩文具"));

  // 3)「換更多人選」搜尋
  line();
  for (const kw of ["定價", "美妝", "B2B"]) {
    const found = await searchDirectors(kw, 5);
    line(`搜尋「${kw}」→ ${found.length} 位：${found.map((d) => `${d.name}(${d.title})`).join("、") || "(無)"}`);
  }

  await localPool.end();
}

main().catch((e) => { console.error("probe failed:", e); process.exit(1); });
