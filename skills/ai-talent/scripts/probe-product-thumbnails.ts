/**
 * probe-product-thumbnails — 產品列表的縮圖到底挑不挑得到圖？用真資料看。
 *
 * 2026-09-25（CJ「我在產品的彈跳視窗中，有選擇一張主題，但沒有出現在產品列表的縮圖
 * 當中」）：這件事有兩種可能的斷點，光讀程式碼分不出來——
 *   (1) 寫入端沒寫進去：assetPhotos.mirrorPrimaryToProduct() 把主圖寫到
 *       products.positioning.$.imageUrl，那支 UPDATE 用 `WHERE id=? AND userId=?`，
 *       而且失敗只 console.warn。真的沒寫進去的話，前端再怎麼改也不會有圖。
 *   (2) 讀取端濾掉了：列表原本只收 /^https?:\/\//，而上傳的照片是根相對路徑。
 *
 * 所以這支同時印出兩邊：asset_photos 裡的主圖、products.positioning 裡實際存的值，
 * 以及前端**同一支** picker（client/.../lib/productImage.ts）對那個值的判斷。
 *
 * 唯讀。用法：./node_modules/.bin/tsx scripts/probe-product-thumbnails.ts [brandId]
 */
import localPool from "../server/localDb.js";
import { pickProductImageUrl } from "../client/src/v2/strategy/lib/productImage.js";

async function main() {
  const brandId = Number(process.argv[2] || 0);

  // 沒指定品牌就掃「有上傳過產品照片」的那幾個品牌——那才是會出現這個症狀的地方。
  const [brandRows]: any = brandId
    ? await localPool.execute(`SELECT id, name FROM brands WHERE id = ? LIMIT 1`, [brandId])
    : await localPool.execute(
        `SELECT b.id, b.name FROM brands b
           JOIN asset_photos ap ON ap.brandId = b.id AND ap.scope = 'product'
          GROUP BY b.id, b.name ORDER BY MAX(ap.createdAt) DESC LIMIT 5`,
      );
  const brands = brandRows as any[];
  if (!brands.length) { console.log("找不到有上傳產品照片的品牌——這個症狀重現不了。"); await localPool.end(); return; }

  for (const brand of brands) {
    const [products]: any = await localPool.execute(
      `SELECT id, name, positioning FROM products WHERE brandId = ? ORDER BY id LIMIT 30`, [brand.id],
    );
    const [photos]: any = await localPool.execute(
      `SELECT scopeId, url, isPrimary, filename FROM asset_photos
        WHERE brandId = ? AND scope = 'product' ORDER BY scopeId, isPrimary DESC`, [brand.id],
    );
    const byProduct = new Map<number, any[]>();
    for (const ph of photos as any[]) {
      const list = byProduct.get(Number(ph.scopeId)) ?? [];
      list.push(ph);
      byProduct.set(Number(ph.scopeId), list);
    }

    console.log(`\n品牌 #${brand.id} ${brand.name}｜產品 ${(products as any[]).length} 支｜上傳的產品照 ${(photos as any[]).length} 張`);
    console.log("=".repeat(78));

    for (const p of products as any[]) {
      const mine = byProduct.get(Number(p.id)) ?? [];
      const primary = mine.find((x) => Number(x.isPrimary) === 1) ?? null;
      const picked = pickProductImageUrl(p.positioning);
      const pos = typeof p.positioning === "string"
        ? (() => { try { return JSON.parse(p.positioning); } catch { return {}; } })()
        : (p.positioning ?? {});
      const stored = typeof pos?.imageUrl === "string" ? pos.imageUrl : null;

      const marks: string[] = [];
      // 症狀 (1)：使用者設了主圖，但 positioning.imageUrl 沒跟上 → 寫入端壞。
      if (primary && stored !== primary.url) marks.push(`✗ 寫入端沒同步：asset_photos 主圖=${primary.url}，positioning.imageUrl=${stored ?? "(空)"}`);
      // 症狀 (2)：DB 有值，但 picker 挑不出來 → 讀取端壞（就是這次修掉的那條）。
      if (stored && !picked) marks.push(`✗ 讀取端濾掉了：DB 有 ${stored}，picker 回 undefined`);
      if (primary && picked === primary.url) marks.push("✓ 主圖 → 縮圖 一路通");
      if (!primary && picked) marks.push(`· 沒有上傳照片，縮圖用其他來源：${picked}`);
      if (!primary && !picked) marks.push("· 沒照片也沒其他圖源（列表會顯示「尚無圖片」，正確）");

      console.log(`#${p.id} ${String(p.name).slice(0, 22).padEnd(22)} 照片 ${String(mine.length).padStart(2)} 張｜${marks.join("；")}`);
    }
  }

  await localPool.end();
  process.exit(0);
}

main().catch((e) => { console.error("probe failed:", e); process.exit(1); });
