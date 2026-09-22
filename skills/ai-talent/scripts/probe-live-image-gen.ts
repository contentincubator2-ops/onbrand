/**
 * probe-live-image-gen — 真的用網站在跑的那段程式碼（stillImageModels.generateStillImage）
 * 生一張圖，不繞過 dispatchGenerate，也不假造 key 有沒有額度。
 *
 * 2026-09-22（CJ 更新了 dev VM 的 OpenAI key 之後）：diagnose 模式的直接 fetch 只證明「key 本身
 * 能用」，不證明「網站這個 process 讀到的就是這把 key」。這支在同一個 process 裡跑
 * generateStillImage(undefined, …)，跟 image.generate／genOneImage 走同一條路（含同模型
 * 重試一次的邏輯），才是真的端到端驗證。不落地：不寫 generated_images，不扣點。
 *
 * 用法（VM 上）：cd /opt/onbrand/current/skills/ai-talent && ./node_modules/.bin/tsx scripts/probe-live-image-gen.ts
 */
import "./../server/bootstrap-env";
import { generateStillImage } from "../server/content/core/stillImageModels";

async function main(): Promise<void> {
  console.log(`OPENAI_API_KEY present in this process: ${!!process.env.OPENAI_API_KEY} (len=${(process.env.OPENAI_API_KEY ?? "").length})`);
  const t0 = Date.now();
  const r = await generateStillImage(undefined, {
    prompt: "A minimalist product photo of a single amber glass perfume bottle on a light wood table, soft natural light, no text.",
    size: "1024x1024",
  }, { attemptTimeoutMs: 60_000 });
  const ms = Date.now() - t0;
  console.log(`status=${r.status} model=${r.modelId} attempts=${r.attempts} ${ms}ms`);
  if (r.status === "ready") {
    console.log(`url=${r.url}`);
    console.log("=== PASS ===");
    process.exit(0);
  }
  console.log(`failureKind=${r.failureKind} errorMsg=${r.errorMsg}`);
  console.log("=== FAIL ===");
  process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
