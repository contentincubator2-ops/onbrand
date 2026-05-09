/**
 * test-orchestra-all.ts — exercise every 30s task through runOrchestra and
 * report which task passed (≥1 variant with non-empty caption) vs failed.
 *
 * Usage on VM:
 *   cd /opt/marketing-os/app/skills/ai-talent
 *   npx tsx scripts/test-orchestra-all.ts [pilot|full]
 *
 *   pilot = 1 task per channel (~10 tasks, ~5min)
 *   full  = every task (~90 tasks, ~30-45min)
 *
 * Tasks are run sequentially to avoid Anthropic burst limits. Test inputs
 * are generic ("新品上市" etc) — won't produce great copy but proves the
 * orchestra/LLM/persistence chain works end-to-end.
 */
import { FB_30S_TASKS, getOrchestraConfig } from "../server/_core/quickTaskFB";
import { IG_30S_TASKS, getIGOrchestraConfig } from "../server/_core/quickTaskIG";
import { YT_30S_TASKS, getYTOrchestraConfig } from "../server/_core/quickTaskYT";
import { TT_30S_TASKS, getTTOrchestraConfig } from "../server/_core/quickTaskTikTok";
import { LI_30S_TASKS, getLIOrchestraConfig } from "../server/_core/quickTaskLI";
import { EMAIL_30S_TASKS, getEmailOrchestraConfig } from "../server/_core/quickTaskEmail";
import { PR_30S_TASKS, getPROrchestraConfig } from "../server/_core/quickTaskPR";
import { BRAND_30S_TASKS, getBrandOrchestraConfig } from "../server/_core/quickTaskBrand";
import { RESEARCH_30S_TASKS, getResearchOrchestraConfig } from "../server/_core/quickTaskResearch";
import { runOrchestra } from "../server/_core/quickTaskOrchestra";

type Mode = "pilot" | "full";
const mode: Mode = (process.argv[2] as Mode) || "pilot";

interface ChannelDef {
  channel: string;
  tasks: any[];
  getConfig: (id: string) => any;
}

const channels: ChannelDef[] = [
  { channel: "FB", tasks: FB_30S_TASKS, getConfig: getOrchestraConfig },
  { channel: "IG", tasks: IG_30S_TASKS, getConfig: getIGOrchestraConfig },
  { channel: "YT", tasks: YT_30S_TASKS, getConfig: getYTOrchestraConfig },
  { channel: "TT", tasks: TT_30S_TASKS, getConfig: getTTOrchestraConfig },
  { channel: "LI", tasks: LI_30S_TASKS, getConfig: getLIOrchestraConfig },
  { channel: "EM", tasks: EMAIL_30S_TASKS, getConfig: getEmailOrchestraConfig },
  { channel: "PR", tasks: PR_30S_TASKS, getConfig: getPROrchestraConfig },
  { channel: "BR", tasks: BRAND_30S_TASKS, getConfig: getBrandOrchestraConfig },
  { channel: "RS", tasks: RESEARCH_30S_TASKS, getConfig: getResearchOrchestraConfig },
];

/** Build a generic input that satisfies the task's primary_input.key. */
function buildInputs(template: any): Record<string, string> {
  const inputs: Record<string, string> = {};
  const generic = "本月推出全新會員優惠：消費滿千折百，再送限定贈品。預計帶動回購率 25%。";
  for (const f of template.inputs ?? []) {
    if (f.required) inputs[f.key] = generic;
  }
  // Most tasks use one of these keys
  if (template.primary_input?.key && !inputs[template.primary_input.key]) {
    inputs[template.primary_input.key] = generic;
  }
  return inputs;
}

interface Result {
  channel: string;
  taskId: string;
  ok: boolean;
  variantsWithCaption: number;
  totalVariants: number;
  latencyMs: number;
  outputId: number | null;
  error?: string;
}

async function testTask(channel: string, template: any, getConfig: (id: string) => any): Promise<Result> {
  const t0 = Date.now();
  try {
    const config = getConfig(template.id);
    if (!config) {
      return { channel, taskId: template.id, ok: false, variantsWithCaption: 0, totalVariants: 0, latencyMs: 0, outputId: null, error: "no config" };
    }
    const inputs = buildInputs(template);
    const r = await runOrchestra({
      template,
      config,
      inputs,
      brandId: undefined, // skip brand context to keep test isolated
      userId: 1, // CJ test user
      tier: "30s",
    });
    const variants = (r as any).variants ?? [];
    const okCount = variants.filter((v: any) => v.caption?.trim().length > 0).length;
    const outputId = (r as any).outputId ?? null;
    return {
      channel,
      taskId: template.id,
      ok: okCount > 0 && outputId !== null,
      variantsWithCaption: okCount,
      totalVariants: variants.length,
      latencyMs: Date.now() - t0,
      outputId,
      error: okCount === 0 ? `errors: ${(r as any).errors?.join(" | ")}` : (outputId === null ? "no outputId persisted" : undefined),
    };
  } catch (e: any) {
    return { channel, taskId: template.id, ok: false, variantsWithCaption: 0, totalVariants: 0, latencyMs: Date.now() - t0, outputId: null, error: e?.message ?? String(e) };
  }
}

async function main() {
  console.log(`\n════════ ORCHESTRA TEST (${mode}) ════════`);
  console.log(`Started: ${new Date().toISOString()}\n`);

  const results: Result[] = [];
  for (const ch of channels) {
    const subset = mode === "pilot" ? ch.tasks.slice(0, 1) : ch.tasks;
    for (const t of subset) {
      process.stdout.write(`[${ch.channel}] ${t.id}... `);
      const r = await testTask(ch.channel, t, ch.getConfig);
      results.push(r);
      const tag = r.ok ? "✓" : "✗";
      console.log(`${tag} ${r.variantsWithCaption}/${r.totalVariants} ${r.latencyMs}ms${r.outputId ? ` outputId=${r.outputId}` : ""}${r.error ? ` — ${r.error.slice(0, 100)}` : ""}`);
    }
  }

  console.log(`\n════════ SUMMARY ════════`);
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`Total: ${results.length}, Passed: ${passed}, Failed: ${failed}`);

  if (failed > 0) {
    console.log(`\n── FAILURES ──`);
    for (const r of results.filter((r) => !r.ok)) {
      console.log(`  ✗ [${r.channel}] ${r.taskId} — ${r.error ?? "?"}`);
    }
  }

  // Per-channel summary
  console.log(`\n── PER CHANNEL ──`);
  for (const ch of channels) {
    const chResults = results.filter((r) => r.channel === ch.channel);
    if (chResults.length === 0) continue;
    const ok = chResults.filter((r) => r.ok).length;
    console.log(`  ${ch.channel}: ${ok}/${chResults.length}`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
