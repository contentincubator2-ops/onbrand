/**
 * 策略層活動頁的底圖模板：每組一張左邊主視覺（直式）＋一張右邊故事圖（橫式），gpt-image-2。
 * 結果進 repo：
 *   client/public/campaign-backdrops/<id>-left.webp    640×960
 *   client/public/campaign-backdrops/<id>-right.webp   1200×800
 *   client/src/v2/strategy/lib/campaignBackdropIds.json  兩張都有的模板 id（前端靠它決定能不能選）
 *
 * 2026-09-30（CJ「汽車業是從起點到終點的地圖，餐飲是從原料做成菜，文具是將不同的
 * 零件組合成一隻馬克筆」→「左邊和右邊的底圖，我們有固定模板，但用戶也可以自己選擇」）。
 *
 * 模板 id 與中文名在 client/src/v2/strategy/lib/campaignBackdrops.ts；這裡只放畫面描述。
 * 兩邊的 id 由 server/strategy/core/campaignBackdropVocab.test.ts 比對。
 *
 * 平常不在本機跑——要 OPENAI_API_KEY（有額度的那把），由
 * .github/workflows/ops-gen-campaign-backdrops.yml 在 runner 上跑。
 *
 * 環境變數：
 *   IDS=kitchen,marker   只畫這幾組
 *   FORCE=1              已經有圖也重畫
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { generateStillImage, GPT_IMAGE_2 } from "../server/content/core/stillImageModels";
import { coverFilePath } from "../server/content/core/mediaGen";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IMG_DIR = join(ROOT, "client/public/campaign-backdrops");
const IDS_FILE = join(ROOT, "client/src/v2/strategy/lib/campaignBackdropIds.json");

/**
 * 背景要安靜：上面還要疊字、疊地圖。所以只用中性色，一個 logo 橘當重點（全站「不要
 * 彩色」，2026-09-29）。圖上不放字（模型畫不出正確中文）。
 */
export const BACKDROP_STYLE = [
  "Soft, calm editorial line illustration used as a quiet background inside a web app.",
  "Thin even charcoal (#3F3F46) outlines. Fills only in white and very light warm gray (#EEEEEC). Plain off-white background (#FAFAF9) that reaches every edge.",
  "Exactly one small muted orange (#F37E4A) accent, on the element named below — nothing else orange.",
  "Low contrast, airy, generous empty space. No gradients, no shadows, no 3D, no photorealism, no texture, no people's faces.",
  "Absolutely no text, letters, numbers, signs, logos, labels or UI anywhere in the image.",
].join(" ");

const LEFT_LAYOUT = "Tall portrait frame. The subject sits in the lower half, centered. The top 45% of the frame is empty background.";
const RIGHT_LAYOUT = "Wide landscape frame. One continuous journey runs horizontally across the middle third, from the left edge (start) to the right edge (finish), in four or five clearly separate steps spaced evenly. The top quarter and the bottom quarter are empty background.";

export const BACKDROP_SCENES: Record<string, { left: string; right: string }> = {
  roadtrip: {
    left: "A car seen from behind, driving on an open road that runs straight toward a distant horizon; dashed center line leading forward. Orange accent: the car's tail lights.",
    right: "A simple top-down route map: a winding road starting at a map pin on the left, passing a few tiny towns, ending at a checkered finish flag on the right. Orange accent: the finish flag.",
  },
  kitchen: {
    left: "A finished plated dish on a plain table, gentle steam rising, a fork beside the plate. Orange accent: the garnish on the dish.",
    right: "Raw ingredients (a few vegetables and a piece of meat) on the left, then chopping on a cutting board, then a pan cooking on a stove, then plating, then a finished dish on the right. Orange accent: the finished dish.",
  },
  marker: {
    left: "One finished marker pen lying diagonally with its cap off beside it, having just drawn a single curved stroke on a sheet of paper. Orange accent: the drawn stroke.",
    right: "Separate marker parts laid out on the left (cap, empty barrel, ink cartridge, felt nib), then the parts sliding together, then an assembled marker, then the marker drawing a line on the right. Orange accent: the drawn line.",
  },
  garden: {
    left: "A small potted plant in full bloom standing on a windowsill. Orange accent: the flower.",
    right: "A seed in a mound of soil on the left, then a small sprout, then a young leafy plant, then a plant with a bud, then a flower in full bloom on the right. Orange accent: the bloom.",
  },
  blueprint: {
    left: "A finished small modern building with a door and a few windows, standing on flat ground. Orange accent: the door.",
    right: "A rolled-out blueprint sheet on the left, then a poured foundation, then a building frame, then walls going up, then the finished building on the right. Orange accent: the finished building's door.",
  },
};

const prompt = (layout: string, scene: string) => `${BACKDROP_STYLE}\n\n${layout}\n\nScene: ${scene}`;

async function draw(p: string, size: "1024x1536" | "1536x1024"): Promise<Buffer | string> {
  const r = await generateStillImage(GPT_IMAGE_2, { prompt: p, size } as any);
  if (r.status !== "ready" || !r.url) return r.errorMsg ?? "image failed";
  const file = coverFilePath(r.url);
  if (!file) return `unexpected url ${r.url}`;
  return readFileSync(file);
}

async function toWebp(png: Buffer, w: number, h: number): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp(png).removeAlpha().resize(w, h, { fit: "cover" }).webp({ quality: 80 }).toBuffer();
}

async function main(): Promise<void> {
  mkdirSync(IMG_DIR, { recursive: true });
  mkdirSync(process.env.COVERS_DIR ?? "/tmp/covers", { recursive: true });
  const only = (process.env.IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const force = process.env.FORCE === "1";
  const failed: string[] = [];

  const jobs: Array<{ id: string; side: "left" | "right" }> = [];
  for (const id of Object.keys(BACKDROP_SCENES)) {
    if (only.length && !only.includes(id)) continue;
    for (const side of ["left", "right"] as const) {
      if (force || !existsSync(join(IMG_DIR, `${id}-${side}.webp`))) jobs.push({ id, side });
    }
  }
  console.log(`[backdrops] todo=${jobs.length}`);

  await Promise.all(jobs.map(async ({ id, side }) => {
    const scene = BACKDROP_SCENES[id]![side];
    const out = side === "left"
      ? await draw(prompt(LEFT_LAYOUT, scene), "1024x1536")
      : await draw(prompt(RIGHT_LAYOUT, scene), "1536x1024");
    if (typeof out === "string") { failed.push(`${id}-${side} (${out.slice(0, 160)})`); return; }
    const webp = side === "left" ? await toWebp(out, 640, 960) : await toWebp(out, 1200, 800);
    writeFileSync(join(IMG_DIR, `${id}-${side}.webp`), webp);
    console.log(`[backdrops] ${id}-${side} ok`);
  }));

  // 清單＝兩張都有的模板。
  const ids = Object.keys(BACKDROP_SCENES)
    .filter((id) => existsSync(join(IMG_DIR, `${id}-left.webp`)) && existsSync(join(IMG_DIR, `${id}-right.webp`)))
    .sort();
  writeFileSync(IDS_FILE, JSON.stringify(ids) + "\n");
  console.log(`[backdrops] with-images=${ids.join(",")} failed=${failed.length}`);
  for (const f of failed) console.log(`[backdrops] FAILED ${f}`);
}

// 測試只 import 描述，不要真的跑。
if (process.argv[1] && /gen-campaign-backdrops/.test(process.argv[1])) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
