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

/**
 * 讀回「我們自己存的」PNG。只認 URL_PREFIX/<brandId>/<檔名>.png 這個形狀，且 brandId 必須
 * 對得上——否則回 null。呼叫端拿到的網址來自用戶端，不能讓它指到任意檔案。
 */
export async function readGeneratedImage(brandId: number, url: string): Promise<Buffer | null> {
  const prefix = `${URL_PREFIX}/${brandId}/`;
  if (typeof url !== "string" || !url.startsWith(prefix)) return null;
  const name = url.slice(prefix.length);
  if (!/^[A-Za-z0-9-]+\.png$/.test(name)) return null;
  try {
    return await fs.readFile(join(GENERATED_IMAGE_STORAGE_ROOT, String(brandId), name));
  } catch {
    return null;
  }
}
