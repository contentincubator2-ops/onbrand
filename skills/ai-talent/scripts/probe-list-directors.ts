/**
 * probe-list-directors — 直接呼叫 strategistChat.listDirectors 這支 procedure，
 * 看它在真實資料上到底回什麼。
 *
 * 2026-09-25（CJ 回報：產品清單頁展開策略總監，顯示「目前在 mos_db 找不到可用的
 * 策略總監人選」）：core 的 listDirectorsForBrand 在 probe 裡明明找得到三位，所以
 * 問題不在挑人邏輯，而在這支 procedure 這一層（權限、參數、或例外）。用 tRPC 的
 * createCaller 跑真的那支，才知道使用者按下去時伺服器實際發生什麼事。
 */
import localPool from "../server/localDb.js";
import { strategistChatRouter } from "../server/strategy/routers/strategistChatRouter.js";

async function main() {
  const brandId = Number(process.argv[2] || 2972);
  const [rows]: any = await localPool.execute(
    `SELECT id, name, userId FROM brands WHERE id = ? LIMIT 1`, [brandId],
  );
  const brand = (rows as any[])[0];
  if (!brand) { console.error(`brand ${brandId} not found`); process.exit(1); }
  const caller = strategistChatRouter.createCaller({ user: { id: Number(brand.userId) } } as any);

  for (const scope of ["brand", "product"] as const) {
    console.log(`\n── listDirectors({ brandId: ${brandId}, scope: "${scope}" }) ──`);
    try {
      const r: any = await caller.listDirectors({ brandId, scope });
      console.log(`   回了 ${r.directors.length} 位（brandIndustry=${JSON.stringify(r.brandIndustry)}）`);
      for (const d of r.directors) console.log(`   · [${d.roleLabel}] ${d.name} #${d.agentId} ${d.slug}`);
    } catch (e: any) {
      console.log(`   ✗ 丟例外：${e?.code ?? ""} ${String(e?.message ?? e).slice(0, 300)}`);
    }
  }

  // 沒帶 scope（舊前端 / 快取的請求）會怎樣
  console.log(`\n── listDirectors 不帶 scope ──`);
  try {
    const r: any = await caller.listDirectors({ brandId });
    console.log(`   回了 ${r.directors.length} 位，scope=${r.scope}`);
  } catch (e: any) {
    console.log(`   ✗ 丟例外：${String(e?.message ?? e).slice(0, 200)}`);
  }

  await localPool.end();
  process.exit(0);
}
main().catch((e) => { console.error("probe failed:", e); process.exit(1); });
