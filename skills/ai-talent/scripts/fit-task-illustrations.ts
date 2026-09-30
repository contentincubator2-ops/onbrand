/**
 * 把 client/public/task-illustrations 裡的圖重新裁成「內容填滿框」的版本（fitToFrame）。
 * 2026-09-30 第一批 301 張是 480×320 等比縮圖，主體在 104px 的框裡太小，用這支補救；
 * 之後新產的圖在 gen-task-illustrations 裡就會直接走 fitToFrame，不必再跑。
 * 冪等：已經是 480×340 的就跳過。
 */
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { fitToFrame, FRAME_H, FRAME_W } from "../server/content/core/taskIllustration";

const DIR = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "client/public/task-illustrations");

async function main(): Promise<void> {
  const sharp = (await import("sharp")).default;
  let done = 0, skipped = 0;
  for (const f of readdirSync(DIR).filter((x) => x.endsWith(".webp"))) {
    const file = join(DIR, f);
    const buf = readFileSync(file);
    const meta = await sharp(buf).metadata();
    if (meta.width === FRAME_W && meta.height === FRAME_H) { skipped++; continue; }
    writeFileSync(file, await fitToFrame(buf));
    done++;
  }
  console.log(`[fit] refit=${done} skipped=${skipped}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
