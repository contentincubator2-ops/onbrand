/**
 * 圖片任務卡實跑探測：每張卡真的打模型、檢查交付尺寸與比例。
 *   npx tsx scripts/probe-image-cards.ts [cardId[:model] ...]
 * 預設跑 4 張涵蓋 gpt-image-2 自訂尺寸、非 Nano 比例、1MB 上限、Nano 原生比例。
 */
import "dotenv/config";
import sharp from "sharp";
import { getImageSpec } from "../server/content/core/platformImageSpecs";
import { renderImageCard } from "../server/content/core/imageCards";
import { localCoverFile } from "../server/content/core/imageFetch";
import { readFileSync } from "fs";

const args = process.argv.slice(2);
const runs = (args.length ? args : [
  "ig-img-feed-45:gpt-image-2",
  "web-img-og:gpt-image-2",
  "line-img-richmenu-large:gpt-image-2",
  "ig-img-story:nano-banana",
]).map((a) => { const [id, model] = a.split(":"); return { id: id!, model: model ?? "gpt-image-2" }; });

const brand = { brandName: "Morning Pour", positioning: "specialty coffee for slow mornings", colourHints: ["#6B4F3A", "#F2E8DC"] };
const scene = "A ceramic pour-over coffee set on a light oak table by a window, soft morning sunlight, steam rising, a few coffee beans scattered, calm and warm mood.";

(async () => {
  let fail = 0;
  for (const r of runs) {
    const spec = getImageSpec(r.id);
    if (!spec) { console.log(`✗ ${r.id}: unknown card`); fail++; continue; }
    const t0 = Date.now();
    const out = await renderImageCard({ spec, scenePromptEn: scene, brand, brandId: 0, modelChoice: r.model });
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    if (out.status !== "ready" || !out.url) { console.log(`✗ ${r.id} [${r.model}] ${sec}s: ${out.failureKind} ${out.errorMsg?.slice(0, 200)}`); fail++; continue; }
    const file = localCoverFile(out.url)!;
    const m = await sharp(readFileSync(file)).metadata();
    const okSize = m.width === spec.width && m.height === spec.height;
    const okBytes = !spec.maxBytes || (out.bytes ?? 0) <= spec.maxBytes;
    console.log(`${okSize && okBytes ? "✓" : "✗"} ${r.id} [${out.modelId}] ${sec}s → ${m.width}x${m.height} ${(out.bytes! / 1024).toFixed(0)}KB  ${file}`);
    if (!okSize || !okBytes) fail++;
  }
  process.exit(fail ? 1 : 0);
})();
