/**
 * probe-positioning-director — 策略總監人設到底有沒有改變定位產出？唯讀 A/B。
 *
 * 2026-09-30（CJ「總監的人設應該會影響產出」）：同一個品牌、同一步（預設 competition＋trends，
 * 都不依賴前面步驟），各跑兩次：不帶人設（舊行為）vs 帶這位品牌定位總監的人設＋工作守則。
 * 只呼叫 step.run，不經過 positioningJobRunner——不寫 positioning、不建 job。
 *
 * 用法：tsx scripts/probe-positioning-director.ts <brandId> [stepId,stepId]
 */
import localPool from "../server/localDb.js";
import { buildBrandPositioningSteps } from "../server/strategy/core/positioningSteps.js";
import { listDirectorsForBrand } from "../server/strategy/core/strategistDirectory.js";
import { loadDirectorPersona } from "../server/strategy/core/positioningDirector.js";
import type { StepContext } from "../server/strategy/core/positioningJobRunner.js";

async function main() {
  const brandId = Number(process.argv[2] || 2977);
  const stepIds = String(process.argv[3] || "competition,trends").split(",");
  const [rows]: any = await localPool.execute(`SELECT * FROM brands WHERE id = ? LIMIT 1`, [brandId]);
  const b = (rows as any[])[0];
  if (!b) { console.error(`brand ${brandId} not found`); process.exit(1); }
  const industry: string | null = b.industry ?? null;

  const directors = await listDirectorsForBrand(industry, "brand");
  const pick = directors.find((d) => d.roleId === "brand_positioning") ?? directors[0];
  if (!pick) { console.error("no director"); process.exit(1); }
  const persona = await loadDirectorPersona(pick.agentId, industry);
  console.log(`brand #${brandId} ${b.brandName ?? b.name}  industry=${industry ?? "-"}`);
  console.log(`director #${pick.agentId} ${pick.name}（${pick.title}）  persona=${persona?.block.length ?? 0} chars`);
  console.log(`---- persona block (head) ----\n${(persona?.block ?? "").slice(0, 600)}\n----`);

  const steps = buildBrandPositioningSteps({ lang: "zh-TW", outputLanguage: b.outputLanguage ?? undefined });
  const base: Omit<StepContext, "directorPersona"> = {
    userId: Number(b.userId), entityKind: "brand", entityId: brandId,
    brandName: String(b.brandName ?? b.name ?? ""), industry: industry ?? undefined,
    description: b.description ?? undefined, prevOutputs: {},
    recordUsage: async () => {},
  };

  for (const id of stepIds) {
    const step = steps.find((s) => s.id === id);
    if (!step) { console.log(`(skip unknown step ${id})`); continue; }
    const [plain, withDir] = await Promise.all([
      step.run({ ...base }),
      step.run({ ...base, directorPersona: persona?.block }),
    ]);
    console.log(`\n════════ step ${id} ════════`);
    console.log(`── A 不帶人設 ──\n${JSON.stringify(plain, null, 1).slice(0, 2500)}`);
    console.log(`── B ${pick.name} ──\n${JSON.stringify(withDir, null, 1).slice(0, 2500)}`);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
