/**
 * verify-piapi.ts — sanity-check the PiAPI key against ideogram (image, sync)
 * and kling (video, async). Prints HTTP status + parsed task_id / output URL,
 * downloads the image/video to /tmp so we know the full round-trip works.
 *
 * Run on VM (where PIAPI_KEY env is set):
 *   cd /opt/marketing-os && npx tsx skills/ai-talent/scripts/verify-piapi.ts
 *
 * Exits 0 on full success, 1 on any failure. Used to flip mediaModels.ts
 * piapi/* entries from "soon" → "ready" after a key refresh.
 */
import { writeFileSync } from "fs";

const PIAPI_BASE = process.env.PIAPI_BASE_URL ?? "https://api.piapi.ai/api/v1";
const KEY = process.env.PIAPI_KEY ?? process.env.PIAPI_API_KEY ?? "";

if (!KEY) {
  console.error("✗ PIAPI_KEY env var not set");
  process.exit(1);
}

async function submit(model: string, task_type: string, input: any): Promise<{ taskId: string; raw: any }> {
  const resp = await fetch(`${PIAPI_BASE}/task`, {
    method: "POST",
    headers: { "x-api-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ model, task_type, input }),
  });
  const text = await resp.text();
  let body: any = {};
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!resp.ok) throw new Error(`submit ${resp.status}: ${text.slice(0, 400)}`);
  const taskId = body?.data?.task_id ?? body?.task_id;
  if (!taskId) throw new Error(`no task_id in response: ${text.slice(0, 400)}`);
  return { taskId, raw: body };
}

async function poll(taskId: string, maxMs = 240_000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    await new Promise((r) => setTimeout(r, 3000));
    const resp = await fetch(`${PIAPI_BASE}/task/${taskId}`, { headers: { "x-api-key": KEY } });
    if (!resp.ok) {
      console.warn(`  poll ${resp.status} — retrying`);
      continue;
    }
    const body: any = await resp.json();
    const status = String(body?.data?.status ?? body?.status ?? "").toLowerCase();
    process.stdout.write(`  status=${status} (${Math.round((Date.now() - start) / 1000)}s)\n`);
    if (status === "completed" || status === "success") return body?.data ?? body;
    if (status === "failed" || status === "error") throw new Error(`task failed: ${JSON.stringify(body).slice(0, 300)}`);
  }
  throw new Error(`timed out after ${Math.round(maxMs / 1000)}s`);
}

async function dl(url: string, savePath: string): Promise<void> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${r.status}`);
  writeFileSync(savePath, Buffer.from(await r.arrayBuffer()));
}

async function pickUrl(out: any): Promise<string> {
  return out?.image_url ?? out?.image?.url
      ?? out?.video_url ?? out?.video?.url
      ?? (Array.isArray(out?.images) ? out.images[0]?.url ?? out.images[0] : null)
      ?? (Array.isArray(out?.videos) ? out.videos[0]?.url ?? out.videos[0] : null)
      ?? out?.url
      ?? "";
}

(async () => {
  let pass = 0;
  let fail = 0;

  // ── Test 1: FLUX schnell (image, fast — PiAPI canonical model) ────
  console.log("\n[1/2] FLUX schnell — image / sync");
  try {
    const { taskId } = await submit("Qubico/flux1-schnell", "txt2img", {
      prompt: "minimal black-and-white logo for a marketing technology brand named 'Marketing OS', sans-serif wordmark",
      width: 1024,
      height: 1024,
    });
    console.log(`  submitted task_id=${taskId}`);
    const data = await poll(taskId, 90_000);
    const url = await pickUrl(data?.output ?? data?.result ?? data);
    if (!url) throw new Error("no output URL in completed task");
    console.log(`  output url=${url}`);
    await dl(url, "/tmp/piapi-flux-test.png");
    console.log(`  ✓ saved /tmp/piapi-flux-test.png`);
    pass++;
  } catch (e: any) {
    console.error(`  ✗ ${e.message ?? e}`);
    fail++;
  }

  // ── Test 2: Kling v2 master (video, async) ────────────────────────
  console.log("\n[2/2] Kling v2 master — video / async");
  try {
    const { taskId } = await submit("kling", "video_generation", {
      prompt: "A red sports car drifting through a neon-lit Tokyo street at night, cinematic, 5 seconds",
      duration: 5,
      aspect_ratio: "16:9",
      version: "2.0-master",
      mode: "pro",
    });
    console.log(`  submitted task_id=${taskId}`);
    const data = await poll(taskId, 240_000);
    const url = await pickUrl(data?.output ?? data?.result ?? data);
    if (!url) throw new Error("no output URL in completed task");
    console.log(`  output url=${url}`);
    await dl(url, "/tmp/piapi-kling-test.mp4");
    console.log(`  ✓ saved /tmp/piapi-kling-test.mp4`);
    pass++;
  } catch (e: any) {
    console.error(`  ✗ ${e.message ?? e}`);
    fail++;
  }

  console.log(`\n=== ${pass} pass / ${fail} fail ===`);
  console.log(pass === 2
    ? "✓ PiAPI key verified for image + video. Flip piapi/* entries to status=\"ready\" if not already."
    : "✗ At least one test failed. Do NOT flip statuses. Check key / quota / response shape and adjust PIAPI_MAP in mediaGen.ts.");
  process.exit(fail > 0 ? 1 : 0);
})();
