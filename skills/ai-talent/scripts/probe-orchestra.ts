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
import { YT_30S_TASKS, YT_30S_ORCHESTRA } from "../server/_core/quickTaskYT";
import { TT_30S_TASKS, TT_30S_ORCHESTRA } from "../server/_core/quickTaskTikTok";
import { LI_30S_TASKS, LI_30S_ORCHESTRA } from "../server/_core/quickTaskLI";
import { EMAIL_30S_TASKS, EMAIL_30S_ORCHESTRA } from "../server/_core/quickTaskEmail";
import { PR_30S_TASKS, PR_30S_ORCHESTRA } from "../server/_core/quickTaskPR";
import { BRAND_30S_TASKS, BRAND_30S_ORCHESTRA } from "../server/_core/quickTaskBrand";
import { RESEARCH_30S_TASKS, RESEARCH_30S_ORCHESTRA } from "../server/_core/quickTaskResearch";
import { FB_60S_TASKS_V2, FB_60S_ORCHESTRA as FB60_ORCH } from "../server/_core/quickTaskFB60";
import { IG_60S_TASKS, IG_60S_ORCHESTRA as IG60_ORCH } from "../server/_core/quickTaskIG60";
import { YT_60S_TASKS, YT_60S_ORCHESTRA as YT60_ORCH } from "../server/_core/quickTaskYT60";
import { MULTI_60S_TASKS, MULTI_60S_ORCHESTRA as M60_ORCH } from "../server/_core/quickTaskMulti60";
import { ALL_99S_TASKS, ALL_99S_ORCHESTRA as ORCH_100 } from "../server/_core/quickTask100";

(async () => {
  const taskId = process.env.TASK_ID || "fb-30-pure-text-hook";
  const template =
    FB_30S_TASKS.find((t) => t.id === taskId) ??
    IG_30S_TASKS.find((t) => t.id === taskId) ??
    YT_30S_TASKS.find((t) => t.id === taskId) ??
    TT_30S_TASKS.find((t) => t.id === taskId) ??
    LI_30S_TASKS.find((t) => t.id === taskId) ??
    EMAIL_30S_TASKS.find((t) => t.id === taskId) ??
    PR_30S_TASKS.find((t) => t.id === taskId) ??
    BRAND_30S_TASKS.find((t) => t.id === taskId) ??
    RESEARCH_30S_TASKS.find((t) => t.id === taskId) ??
    FB_60S_TASKS_V2.find((t) => t.id === taskId) ??
    IG_60S_TASKS.find((t) => t.id === taskId) ??
    YT_60S_TASKS.find((t) => t.id === taskId) ??
    MULTI_60S_TASKS.find((t) => t.id === taskId) ??
    ALL_99S_TASKS.find((t) => t.id === taskId);
  const config =
    FB_30S_ORCHESTRA[taskId] ?? IG_30S_ORCHESTRA[taskId] ?? YT_30S_ORCHESTRA[taskId] ?? TT_30S_ORCHESTRA[taskId] ?? LI_30S_ORCHESTRA[taskId] ?? EMAIL_30S_ORCHESTRA[taskId] ?? PR_30S_ORCHESTRA[taskId] ?? BRAND_30S_ORCHESTRA[taskId] ?? RESEARCH_30S_ORCHESTRA[taskId] ?? FB60_ORCH[taskId] ?? IG60_ORCH[taskId] ?? YT60_ORCH[taskId] ?? M60_ORCH[taskId] ?? ORCH_100[taskId];
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
  console.log(`Input [${inputKey}]: ${(inputs[inputKey] ?? "").slice(0, 80)}…\n`);

  const startedAt = Date.now();
  const tierEnv = (process.env.TIER as "30s" | "60s" | "99s") || "30s";
  // 2026-07-29: optional USER_ID/BRAND_ID make the probe PERSIST to
  // mission_outputs (recordTaskRun only writes when userId is set), so the
  // result is openable in the real UI at /run:<outputId> instead of only
  // existing in this log. Omit them for a pure non-persisting smoke test.
  const userIdEnv = process.env.USER_ID ? Number(process.env.USER_ID) : undefined;
  const brandIdEnv = process.env.BRAND_ID ? Number(process.env.BRAND_ID) : undefined;
  const productIdEnv = process.env.PRODUCT_ID ? Number(process.env.PRODUCT_ID) : undefined;
  const result = await runOrchestra({
    template, config, inputs, tier: tierEnv,
    ...(userIdEnv ? { userId: userIdEnv } : {}),
    ...(brandIdEnv ? { brandId: brandIdEnv } : {}),
    ...(productIdEnv ? { productId: productIdEnv } : {}),
  });
  if ((result as any).outputId) {
    console.log(`  PERSISTED outputId=${(result as any).outputId} → https://onbrand.sowork.ai/run:${(result as any).outputId}`);
  }
  console.log(`Tier: ${tierEnv}`);
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
    // 2026-08-22: an 80-char preview is enough to prove "a caption came
    // back", but not to review a structured deliverable (直播流程表 /
    // newsjack 四欄 / 分鏡) where the FORMAT is the thing under test.
    if (process.env.FULL && v.caption) {
      console.log(v.caption.split("\n").map((l) => `      | ${l}`).join("\n"));
    }
    if (v.image?.url) console.log(`      image[${v.image.status}]: ${v.image.url}`);
    else if (v.image?.status && v.image.status !== "skipped") {
      console.log(`      image[${v.image.status}]: ${v.image.errorMsg ?? "no url"}`);
    }
    // Storyboard / carousel cards — each card carries its own image, and a
    // board with missing frames is the failure mode that matters here.
    if (Array.isArray(v.cards) && v.cards.length > 0) {
      const okCards = v.cards.filter((c: any) => c?.image?.status === "ready").length;
      console.log(`      cards: ${okCards}/${v.cards.length} frames with images`);
      v.cards.forEach((c: any, j: number) => {
        console.log(
          `        [${j + 1}] ${String(c?.headline ?? "").slice(0, 30)} — ` +
          (c?.image?.url ? c.image.url : `${c?.image?.status ?? "?"}: ${c?.image?.errorMsg ?? "no url"}`),
        );
      });
    }
    // Tier-1 video formats — undefined for every non-video task.
    if (v.video) {
      console.log(
        v.video.url
          ? `      VIDEO[${v.video.status}]: ${v.video.url}`
          : `      VIDEO[${v.video.status}]: ${v.video.errorMsg ?? "no url"}`,
      );
    }
  }

  console.log(`\n=== ${pass} pass / ${fail} fail ===`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("✗ probe crashed:", e?.message ?? e);
  console.error(e?.stack);
  process.exit(1);
});
