/**
 * probe-product-image — does 產品保真生圖 really run on gpt-image-2?
 *
 * 2026-09-21 (CJ「生圖，正式環境的生圖，都採用 gpt image 2」): the product path
 * moved from Nano Banana to gpt-image-2's /v1/images/edits surface. Its failure
 * mode is quiet — the caller falls back to Nano Banana, i.e. the old behaviour —
 * so prod can look healthy while the instruction is not in effect. This calls
 * the DEPLOYED adapter with a REAL product photo so the request under test is
 * exactly what the app sends.
 *
 * Read-mostly: one generated PNG lands in the covers dir, no DB row is touched.
 *   PRODUCT_ID / BRAND_ID  optional — pin the product or the brand
 *   MODEL_ID               optional — defaults to openai/gpt-image-2
 */
import mysql from "mysql2/promise";
import { statSync } from "fs";
import { dispatchGenerate } from "../server/_core/mediaGen";
import { fetchImageBuffer } from "../server/_core/imageFetch";

/** Same candidate keys as mediaRouter.listProductImages — keep them in step. */
function productImageUrl(positioning: unknown): string | null {
  let p: any = positioning;
  if (typeof p === "string") { try { p = JSON.parse(p); } catch { return null; } }
  const candidates = [
    p?.imageUrl, p?.image,
    p?._interim?.imageUrl, p?._interim?.image,
    Array.isArray(p?.images) ? p.images[0] : null,
    Array.isArray(p?._interim?.images) ? p._interim.images[0] : null,
    Array.isArray(p?._assets?.photos)
      ? (typeof p._assets.photos[0] === "string" ? p._assets.photos[0] : p._assets.photos[0]?.url)
      : null,
  ];
  for (const c of candidates) if (typeof c === "string" && /^https?:\/\//.test(c)) return c;
  return null;
}

const conn = await mysql.createConnection({
  host: process.env.LOCAL_DB_HOST ?? "127.0.0.1",
  user: process.env.LOCAL_DB_USER ?? "mos_user",
  password: process.env.LOCAL_DB_PASSWORD,
  database: process.env.LOCAL_DB_NAME ?? "mos_db",
});

const where: string[] = ["positioning IS NOT NULL"];
const args: any[] = [];
if (process.env.PRODUCT_ID) { where.push("id = ?"); args.push(Number(process.env.PRODUCT_ID)); }
if (process.env.BRAND_ID)   { where.push("brandId = ?"); args.push(Number(process.env.BRAND_ID)); }
const [rows] = await conn.execute(
  `SELECT id, brandId, name, positioning FROM products WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT 300`,
  args,
) as any;
await conn.end();

// A stored photo URL can be long dead (91APP links expire), and the app hides
// those with the same check — so skip them here too instead of reporting the
// dead link as a generation failure.
let picked: { id: number; brandId: number; name: string; url: string } | null = null;
let candidates = 0;
let dead = 0;
for (const row of rows as any[]) {
  const url = productImageUrl(row.positioning);
  if (!url) continue;
  candidates += 1;
  try {
    await fetchImageBuffer(url, { timeoutMs: 15_000 });
  } catch {
    dead += 1;
    continue;
  }
  picked = { id: Number(row.id), brandId: Number(row.brandId), name: String(row.name ?? ""), url };
  break;
}
console.log(`scanned ${(rows as any[]).length} products, ${candidates} with a photo, ${dead} dead link(s) skipped`);
if (!picked) {
  console.log("No product with a REACHABLE photo — nothing to probe.");
  process.exit(0);
}
console.log(`product #${picked.id} (brand ${picked.brandId}) ${picked.name}`);
console.log(`reference: ${picked.url}`);

const modelId = process.env.MODEL_ID ?? "openai/gpt-image-2";
const t0 = Date.now();
try {
  const r = await dispatchGenerate(modelId, {
    prompt:
      "Place the referenced product on a sunlit marble kitchen counter, soft morning " +
      "light, shallow depth of field. Reproduce the product exactly as shown — same " +
      "shape, materials, colours and every printed label. No text anywhere else.",
    imageUrl: picked.url,
    aspectRatio: "1:1",
    brandId: picked.brandId,
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`${modelId}: status=${r.status} model=${r.modelId} ${secs}s`);
  if (r.errorMsg) console.log(`errorMsg: ${r.errorMsg}`);
  if (r.url) {
    const path = `${process.env.COVERS_DIR ?? "/opt/onbrand/covers"}/${r.url.split("/").pop()}`;
    const sharp = (await import("sharp")).default;
    const meta = await sharp(path).metadata();
    console.log(`saved ${path} ${meta.width}x${meta.height} ${statSync(path).size} bytes`);
    console.log(r.modelId === modelId
      ? "VERDICT: the edit surface delivered — product-faithful runs on gpt-image-2."
      : `VERDICT: answered by ${r.modelId}, not ${modelId} — check the adapter.`);
  } else {
    console.log("VERDICT: no image — the caller would fall back to Nano Banana here.");
    process.exitCode = 1;
  }
} catch (e: any) {
  console.log(`${modelId} THREW after ${((Date.now() - t0) / 1000).toFixed(1)}s: ${e?.message ?? e}`);
  console.log("VERDICT: no image — the caller would fall back to Nano Banana here.");
  process.exitCode = 1;
}
