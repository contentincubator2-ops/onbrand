/**
 * probe-orchestra.ts — server-side smoke test of the Plan B orchestra.
 *
 * Runs runOrchestra in-process on the VM (skips HTTP / auth) so we can
 * verify per-variant LLM fanout + post-processing actually works without
 * relying on the user clicking the UI to discover failures.
 *
 * Usage on VM:
 *   cd /opt/marketing-os && npx tsx skills/ai-talent/scripts/probe-orchestra.ts
 *
 * Exits 0 if all 3 variants come back with non-empty captions; 1 otherwise.
 */
import { runOrchestra } from "../server/_core/quickTaskOrchestra";
import { FB_30S_TASKS, FB_30S_ORCHESTRA } from "../server/_core/quickTaskFB";
import { IG_30S_TASKS, IG_30S_ORCHESTRA } from "../server/_core/quickTaskIG";

(async () => {
  // Pass taskId via env: TASK_ID=ig-30-caption-short npx tsx ...
  const taskId = process.env.TASK_ID || "fb-30-pure-text-hook";
  const template =
    FB_30S_TASKS.find((t) => t.id === taskId) ??
    IG_30S_TASKS.find((t) => t.id === taskId);
  const config =
    FB_30S_ORCHESTRA[taskId] ?? IG_30S_ORCHESTRA[taskId];
  if (!template || !config) {
    console.error("✗ template or config missing for", taskId);
    process.exit(1);
  }

  // Default inputs vary by task input key. Caller can override via env.
  const inputs: Record<string, string> = {};
  const inputKey = template.primary_input?.key ?? template.inputs[0]?.key ?? "topic";
  inputs[inputKey] = process.env.TASK_INPUT ||
    "桂冠『美味健力餐任選14包』：一包=24g 蛋白質+7.5g 膳食纖維，無防腐劑、無味精、無香料。64 折只要 1888 元，剩最後 161 件——10 秒完成組合，冷凍宅配到府。";

  console.log(`\nProbing orchestra: ${taskId}`);
  console.log(`Config: ${config.variants} variants, runImageGen=${config.runImageGen}`);
  console.log(`Input article_body length: ${inputs.article_body.length} chars\n`);

  const startedAt = Date.now();
  const result = await runOrchestra({ template, config, inputs });
  const elapsedMs = Date.now() - startedAt;

  console.log(`Result (${(elapsedMs / 1000).toFixed(1)}s):`);
  console.log(`  ok=${result.ok}, errors=${JSON.stringify(result.errors)}`);
  console.log(`  totalLatencyMs=${result.totalLatencyMs}`);
  console.log(`  captionAgent=${result.captionAgent?.name ?? "none"}`);
  console.log(`  imageAgent=${result.imageAgent?.name ?? "none"}`);
  console.log(`  variants=${result.variants.length}`);

  let pass = 0;
  let fail = 0;
  for (let i = 0; i < result.variants.length; i++) {
    const v = result.variants[i];
    if (!v) {
      console.log(`  [${i}] <undefined>`);
      fail++;
      continue;
    }
    const captionLen = v.caption.length;
    const ok = captionLen > 0;
    if (ok) pass++; else fail++;
    console.log(
      `  [${i}] ${ok ? "✓" : "✗"} ${v.label}: ${captionLen} chars` +
      (v.image?.style ? ` · style="${v.image.style.slice(0, 60)}…"` : "") +
      (v.caption ? `\n      preview: ${v.caption.slice(0, 80).replace(/\n/g, " ")}…` : ""),
    );
  }

  console.log(`\n=== ${pass} pass / ${fail} fail ===`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("✗ probe crashed:", e?.message ?? e);
  console.error(e?.stack);
  process.exit(1);
});
