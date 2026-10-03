/**
 * 圖片任務卡實跑探測：每張卡真的打模型、檢查交付尺寸與比例。
 *   npx tsx scripts/probe-image-cards.ts [cardId[:model] ...]
 * 預設跑 4 張涵蓋 gpt-image-2 自訂尺寸、非 Nano 比例、1MB 上限、Nano 原生比例；
 * 再拿第一張做「對話修改」與「延伸成限時動態 9:16」（都是帶參考圖在新比例重新生成）。
 */
import "dotenv/config";
import sharp from "sharp";
import { getImageSpec } from "../server/platform/core/media/platformImageSpecs";
import { renderImageCard } from "../server/content/core/imageCards";
import { localCoverFile } from "../server/platform/core/media/imageFetch";
import { readFileSync } from "fs";

const args = process.argv.slice(2);
const runs = (args.length ? args : [
  "ig-img-feed-45:gpt-image-2",
  "web-img-og:gpt-image-2",
  "line-img-richmenu-large:gpt-image-2",
  "line-img-richmsg:nano-banana",
]).map((a) => { const [id, model] = a.split(":"); return { id: id!, model: model ?? "gpt-image-2" }; });

const brand = { brandName: "Morning Pour", positioning: "specialty coffee for slow mornings", colourHints: ["#6B4F3A", "#F2E8DC"] };
const scene = "A ceramic pour-over coffee set on a light oak table by a window, soft morning sunlight, steam rising, a few coffee beans scattered, calm and warm mood.";

(async () => {
  let fail = 0;
  let firstUrl: string | null = null;
  const check = async (label: string, specId: string, out: Awaited<ReturnType<typeof renderImageCard>>, sec: string) => {
    const spec = getImageSpec(specId)!;
    if (out.status !== "ready" || !out.url) { console.log(`✗ ${label} ${sec}s: ${out.failureKind} ${out.errorMsg?.slice(0, 200)}`); fail++; return null; }
    const m = await sharp(readFileSync(localCoverFile(out.url)!)).metadata();
    const ok = m.width === spec.width && m.height === spec.height && (!spec.maxBytes || (out.bytes ?? 0) <= spec.maxBytes);
    console.log(`${ok ? "✓" : "✗"} ${label} [${out.modelId}] ${sec}s → ${m.width}x${m.height} ${((out.bytes ?? 0) / 1024).toFixed(0)}KB  ${out.url}`);
    if (!ok) fail++;
    return out.url;
  };
  for (const r of runs) {
    const spec = getImageSpec(r.id);
    if (!spec) { console.log(`✗ ${r.id}: unknown card`); fail++; continue; }
    const t0 = Date.now();
    const out = await renderImageCard({ spec, scenePromptEn: scene, brand, brandId: 0, modelChoice: r.model });
    const url = await check(r.id, r.id, out, ((Date.now() - t0) / 1000).toFixed(1));
    if (url && !firstUrl) firstUrl = url;
  }
  if (firstUrl && !args.length) {
    const base = runs[0]!.id;
    let t0 = Date.now();
    const refined = await renderImageCard({
      spec: getImageSpec(base)!, scenePromptEn: scene, brand, brandId: 0,
      referenceImageUrl: firstUrl, instruction: "暖一點，產品放大一些",
    });
    await check(`${base} 對話修改「暖一點，產品放大一些」`, base, refined, ((Date.now() - t0) / 1000).toFixed(1));
    t0 = Date.now();
    const ext = await renderImageCard({
      spec: getImageSpec("ig-img-story")!, scenePromptEn: scene, brand, brandId: 0, referenceImageUrl: firstUrl,
    });
    await check(`${base} → 延伸 ig-img-story 9:16`, "ig-img-story", ext, ((Date.now() - t0) / 1000).toFixed(1));
  }
  process.exit(fail ? 1 : 0);
})();
