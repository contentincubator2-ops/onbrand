/**
 * generatedImageStore — persist a locally-composited PNG (not hosted by any
 * provider) to disk and hand back a served URL.
 *
 * 2026-09-10（避開產品變形計畫）：productSceneComposer 產出的是我們自己用
 * sharp 拼出來的 buffer，沒有任何 provider URL 可以指——跟 covers／
 * asset-photos 同一套本機硬碟＋express.static 模式（repo 裡沒有 S3）。
 */
import { randomUUID } from "crypto";
import { join } from "path";
import { promises as fs } from "fs";

export const GENERATED_IMAGE_STORAGE_ROOT =
  process.env.GENERATED_IMAGE_DIR ?? join(process.cwd(), "storage", "generated-images");
const URL_PREFIX = process.env.GENERATED_IMAGE_URL_PREFIX ?? "/static/generated-images";

export async function writeGeneratedImage(brandId: number, pngBuffer: Buffer): Promise<string> {
  const dir = join(GENERATED_IMAGE_STORAGE_ROOT, String(brandId));
  await fs.mkdir(dir, { recursive: true });
  const fileName = `${Date.now()}-${randomUUID().slice(0, 8)}.png`;
  await fs.writeFile(join(dir, fileName), pngBuffer);
  return `${URL_PREFIX}/${brandId}/${fileName}`;
}
