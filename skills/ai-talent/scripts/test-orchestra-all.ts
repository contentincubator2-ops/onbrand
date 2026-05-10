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
// 60s collections
import { FB_60S_TASKS_V2, FB_60S_ORCHESTRA } from "../server/_core/quickTaskFB60";
import { IG_60S_TASKS, IG_60S_ORCHESTRA } from "../server/_core/quickTaskIG60";
import { YT_60S_TASKS, YT_60S_ORCHESTRA } from "../server/_core/quickTaskYT60";
import {
  TT_60S_TASKS, TT_60S_ORCHESTRA,
  LI_60S_TASKS, LI_60S_ORCHESTRA,
  EMAIL_60S_TASKS, EMAIL_60S_ORCHESTRA,
  PR_60S_TASKS, PR_60S_ORCHESTRA,
  BRAND_60S_TASKS, BRAND_60S_ORCHESTRA,
  RESEARCH_60S_TASKS, RESEARCH_60S_ORCHESTRA,
} from "../server/_core/quickTaskMulti60";
// 100s collections
import {
  FB_100S_TASKS, FB_100S_ORCHESTRA,
  IG_100S_TASKS, IG_100S_ORCHESTRA,
  YT_100S_TASKS, YT_100S_ORCHESTRA,
  MULTI_100S_TASKS, MULTI_100S_ORCHESTRA,
} from "../server/_core/quickTask100";
import { runOrchestra } from "../server/_core/quickTaskOrchestra";

type Mode = "pilot" | "full" | "tier-30" | "tier-60" | "tier-99" | "remaining";
const mode: Mode = (process.argv[2] as Mode) || "pilot";

// Helper: orchestra config map → getter function
const fromMap = (m: Record<string, any>) => (id: string) => m[id] ?? null;

interface ChannelDef {
  channel: string;
  tier: "30s" | "60s" | "100s";
  tasks: any[];
  getConfig: (id: string) => any;
}

const channels30s: ChannelDef[] = [
  { channel: "FB", tier: "30s", tasks: FB_30S_TASKS, getConfig: getOrchestraConfig },
  { channel: "IG", tier: "30s", tasks: IG_30S_TASKS, getConfig: getIGOrchestraConfig },
  { channel: "YT", tier: "30s", tasks: YT_30S_TASKS, getConfig: getYTOrchestraConfig },
  { channel: "TT", tier: "30s", tasks: TT_30S_TASKS, getConfig: getTTOrchestraConfig },
  { channel: "LI", tier: "30s", tasks: LI_30S_TASKS, getConfig: getLIOrchestraConfig },
  { channel: "EM", tier: "30s", tasks: EMAIL_30S_TASKS, getConfig: getEmailOrchestraConfig },
  { channel: "PR", tier: "30s", tasks: PR_30S_TASKS, getConfig: getPROrchestraConfig },
  { channel: "BR", tier: "30s", tasks: BRAND_30S_TASKS, getConfig: getBrandOrchestraConfig },
  { channel: "RS", tier: "30s", tasks: RESEARCH_30S_TASKS, getConfig: getResearchOrchestraConfig },
];
const channels60s: ChannelDef[] = [
  { channel: "FB60", tier: "60s", tasks: FB_60S_TASKS_V2, getConfig: fromMap(FB_60S_ORCHESTRA) },
  { channel: "IG60", tier: "60s", tasks: IG_60S_TASKS, getConfig: fromMap(IG_60S_ORCHESTRA) },
  { channel: "YT60", tier: "60s", tasks: YT_60S_TASKS, getConfig: fromMap(YT_60S_ORCHESTRA) },
  { channel: "TT60", tier: "60s", tasks: TT_60S_TASKS, getConfig: fromMap(TT_60S_ORCHESTRA) },
  { channel: "LI60", tier: "60s", tasks: LI_60S_TASKS, getConfig: fromMap(LI_60S_ORCHESTRA) },
  { channel: "EM60", tier: "60s", tasks: EMAIL_60S_TASKS, getConfig: fromMap(EMAIL_60S_ORCHESTRA) },
  { channel: "PR60", tier: "60s", tasks: PR_60S_TASKS, getConfig: fromMap(PR_60S_ORCHESTRA) },
  { channel: "BR60", tier: "60s", tasks: BRAND_60S_TASKS, getConfig: fromMap(BRAND_60S_ORCHESTRA) },
  { channel: "RS60", tier: "60s", tasks: RESEARCH_60S_TASKS, getConfig: fromMap(RESEARCH_60S_ORCHESTRA) },
];
const channels99s: ChannelDef[] = [
  { channel: "FB99", tier: "100s", tasks: FB_100S_TASKS, getConfig: fromMap(FB_100S_ORCHESTRA) },
  { channel: "IG99", tier: "100s", tasks: IG_100S_TASKS, getConfig: fromMap(IG_100S_ORCHESTRA) },
  { channel: "YT99", tier: "100s", tasks: YT_100S_TASKS, getConfig: fromMap(YT_100S_ORCHESTRA) },
  { channel: "MULTI99", tier: "100s", tasks: MULTI_100S_TASKS, getConfig: fromMap(MULTI_100S_ORCHESTRA) },
];

const channels: ChannelDef[] =
  mode === "tier-60"  ? channels60s :
  mode === "tier-99"  ? channels99s :
  mode === "tier-30"  ? channels30s :
  mode === "remaining" ? [...channels30s.slice(3), ...channels60s, ...channels99s] : // skip FB/IG/YT 30s (already verified by CJ)
  channels30s; // pilot / full default to 30s

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

async function testTask(channel: string, tier: "30s"|"60s"|"100s", template: any, getConfig: (id: string) => any): Promise<Result> {
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
      brandId: undefined,
      userId: 1,
      tier,
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
      const r = await testTask(ch.channel, ch.tier, t, ch.getConfig);
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
