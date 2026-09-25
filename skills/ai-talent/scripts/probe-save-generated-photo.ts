/**
 * probe-save-generated-photo — 「把生成圖存進產品」這條路，用真資料實走一次。
 *
 * 2026-09-25（CJ「剛剛用了新的AI修圖功能…我想增加一個功能，可以儲存在現有產品下，
 * 或是取代原圖」）：這條路有三段會各自壞掉，而且壞掉的樣子在 UI 上都是「轉一下然後
 * 沒事發生」——(1) 抓不回模型商的圖、(2) 寫不進硬碟、(3) 寫得進硬碟但 DB 沒進去。
 * 所以這支把三段分別驗：DB 有沒有那一列、硬碟上檔案在不在、大小對不對。
 *
 * **會寫入**，但寫的是自己剛建的那一張，而且驗完**立刻刪掉**（連同硬碟檔案），
 * 所以跑完 dev 資料庫跟跑之前一樣。預設用「開發測試用」品牌，不動客戶資料；
 * 也刻意不帶 makePrimary，不去動任何產品現在的主圖。
 *
 * 不呼叫任何生圖模型——只拿 generated_images 裡**已經生成好**的圖。
 *
 * 用法：./node_modules/.bin/tsx scripts/probe-save-generated-photo.ts [brandId] [productId]
 */
import { promises as fs } from "fs";
import localPool from "../server/localDb.js";
import {
  savePhotoFromUrl, removePhoto, listPhotos, photoStorageRoot,
} from "../server/strategy/core/assetPhotos.js";
import { localUploadFile } from "../server/content/core/imageFetch.js";

async function main() {
  const brandId = Number(process.argv[2] || 2958);     // 預設：開發測試用
  const [bRows]: any = await localPool.execute(`SELECT id, name, userId FROM brands WHERE id = ? LIMIT 1`, [brandId]);
  const brand = (bRows as any[])[0];
  if (!brand) { console.error(`brand ${brandId} not found`); process.exit(1); }

  let productId = Number(process.argv[3] || 0);
  if (!productId) {
    const [pRows]: any = await localPool.execute(
      `SELECT id, name FROM products WHERE brandId = ? ORDER BY id LIMIT 1`, [brandId],
    );
    productId = Number((pRows as any[])[0]?.id ?? 0);
  }
  if (!productId) { console.error(`brand ${brandId} 底下沒有產品，換一個品牌再跑`); process.exit(1); }

  const [gRows]: any = await localPool.execute(
    `SELECT id, url, model FROM generated_images
      WHERE brandId = ? AND status = 'ready' AND url IS NOT NULL
      ORDER BY id DESC LIMIT 1`, [brandId],
  );
  const gen = (gRows as any[])[0];
  if (!gen) {
    console.log(`品牌 #${brandId} 還沒有生成好的圖可以存——先在 UI 生一張再跑這支。`);
    await localPool.end(); return;
  }

  console.log(`品牌 #${brand.id} ${brand.name}｜產品 #${productId}`);
  console.log(`來源生成圖 #${gen.id}（${gen.model}）：${String(gen.url).slice(0, 90)}`);
  const before = await listPhotos("product", productId);
  console.log(`存之前：產品照片 ${before.length} 張，主圖＝${before.find((p) => p.isPrimary)?.url ?? "(無)"}`);
  console.log("=".repeat(78));

  const saved = await savePhotoFromUrl({
    userId: Number(brand.userId), brandId, scope: "product", scopeId: productId,
    sourceUrl: String(gen.url), filename: `probe-${Date.now()}`, makePrimary: false,
  });
  if ("error" in saved) { console.log(`✗ 存不進去：${saved.error}`); await localPool.end(); process.exit(1); }

  console.log(`✓ DB 寫入：${saved.id}｜${saved.url}｜${saved.mimeType}｜${(saved.sizeBytes / 1024).toFixed(0)}KB`);

  // 硬碟上真的有那個檔案嗎？（DB 有列但檔案不在＝之後每次顯示都是破圖）
  const file = localUploadFile(saved.url);
  if (!file) { console.log(`✗ 存出來的網址不是合法的上傳路徑：${saved.url}`); }
  else {
    try {
      const stat = await fs.stat(file);
      const sameSize = stat.size === saved.sizeBytes;
      console.log(`${sameSize ? "✓" : "✗"} 硬碟檔案：${file}（${stat.size} bytes${sameSize ? "" : `，DB 記的是 ${saved.sizeBytes}`}）`);
    } catch {
      console.log(`✗ 硬碟上找不到檔案：${file}`);
    }
  }

  const mid = await listPhotos("product", productId);
  const primaryUnchanged = (mid.find((p) => p.isPrimary)?.url ?? null) === (before.find((p) => p.isPrimary)?.url ?? null);
  console.log(`${primaryUnchanged ? "✓" : "✗"} 沒帶 makePrimary 時主圖不該變動（現在 ${mid.length} 張）`);

  // ── 收尾：把 probe 自己建的那一張刪掉，dev 維持原狀 ──
  await removePhoto({
    userId: Number(brand.userId), scope: "product", scopeId: productId,
    photoId: saved.id, storageRoot: photoStorageRoot(),
  });
  const after = await listPhotos("product", productId);
  const restored = after.length === before.length
    && (after.find((p) => p.isPrimary)?.url ?? null) === (before.find((p) => p.isPrimary)?.url ?? null);
  console.log(`${restored ? "✓" : "✗"} 已清乾淨：回到 ${after.length} 張，主圖＝${after.find((p) => p.isPrimary)?.url ?? "(無)"}`);

  await localPool.end();
  process.exit(0);
}

main().catch((e) => { console.error("probe failed:", e); process.exit(1); });
