/**
 * Scan (and optionally delete) product records whose names match the
 * non-product gate — news / promo / notice junk that the (now removed)
 * website-scan feature ingested as "products"
 * (e.g. 夏日穿搭推薦 / 新品快訊 / 低價優惠專區 / 請慎防詐騙).
 *
 * 2026-09-24：掃描官網的功能已移除（CJ 指示），所以不會再產生新的垃圾列；
 * 這支留著是為了清掉資料庫裡還在的舊資料。規則搬到 scripts/lib/nonProductNames.ts。
 *
 * Usage:
 *   npx tsx scripts/clean-nonproduct-records.ts            # scan only (default)
 *   npx tsx scripts/clean-nonproduct-records.ts --delete   # delete the listed rows
 */
import * as dotenv from "dotenv";
dotenv.config();
import { createPool } from "mysql2/promise";
import { looksLikeNonProduct } from "./lib/nonProductNames";

async function main() {
  const doDelete = process.argv.includes("--delete");
  const pool = createPool({
    host:     process.env.LOCAL_DB_HOST     || "localhost",
    user:     process.env.LOCAL_DB_USER     || "mos_user",
    password: (() => {
      const p = process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD;
      if (!p) throw new Error("LOCAL_DB_PASSWORD must be set");
      return p;
    })(),
    database: process.env.LOCAL_DB_NAME || "mos_db",
    connectionLimit: 2,
  });

  const [rows]: any = await pool.query(
    `SELECT p.id, p.name, p.brandId, b.name AS brandName, p.createdAt
       FROM products p
       LEFT JOIN brands b ON b.id = p.brandId
      ORDER BY p.brandId, p.id`,
  );
  const all = rows as Array<{ id: number; name: string; brandId: number; brandName: string | null; createdAt: any }>;
  const suspects = all.filter((r) => looksLikeNonProduct(String(r.name ?? "")));

  console.log(`total products: ${all.length}`);
  console.log(`suspect non-products: ${suspects.length}`);
  console.log("");
  let curBrand = -1;
  for (const s of suspects) {
    if (s.brandId !== curBrand) {
      curBrand = s.brandId;
      console.log(`── brand ${s.brandId} · ${s.brandName ?? "?"} ──`);
    }
    console.log(`  #${s.id}  ${s.name}`);
  }

  if (doDelete && suspects.length > 0) {
    const ids = suspects.map((s) => s.id);
    const [res]: any = await pool.query(`DELETE FROM products WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
    console.log(`\nDELETED ${Number(res?.affectedRows ?? 0)} rows`);
  } else if (doDelete) {
    console.log("\nnothing to delete");
  } else {
    console.log("\n(scan only — rerun with --delete to remove the rows above)");
  }
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
