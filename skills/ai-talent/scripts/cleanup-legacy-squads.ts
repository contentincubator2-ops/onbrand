/**
 * cleanup-legacy-squads.ts
 * 停用 IDs 1–46 的超老格式 squads（缺少 workspace/methodology/showcases 等新欄位，
 * 且部分 agents 欄位異常多達 60-80 人）。
 *
 * 操作：軟刪除（is_active = 0），保留資料可復原。
 * Usage: npm run db:cleanup-legacy
 */
import { createPool } from "mysql2/promise";
import * as dotenv from "dotenv";

dotenv.config();

// IDs 1–46：tw- / sea- / mkt- / intl- / event- / wom- / affiliate- / 各種 -squad 等超老格式
const LEGACY_IDS = Array.from({ length: 46 }, (_, i) => i + 1); // [1, 2, ..., 46]

async function main() {
  const pool = createPool({
    host:     process.env.DB_HOST!,
    user:     process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_NAME!,
    ssl: { rejectUnauthorized: false },
    charset:  "utf8mb4",
  });

  const conn = await pool.getConnection();
  try {
    // 先列出將被停用的 squads
    const [rows] = await conn.execute(
      `SELECT id, slug, name, is_active FROM squads WHERE id IN (${LEGACY_IDS.join(",")}) ORDER BY id ASC`
    ) as any[];

    const squads = rows as any[];
    console.log(`\n將停用 ${squads.length} 個超老格式 squads：\n`);
    for (const s of squads) {
      console.log(`  [${s.id}] ${s.slug} — ${s.name} (is_active: ${s.is_active})`);
    }

    // 執行軟刪除
    const [result] = await conn.execute(
      `UPDATE squads SET is_active = 0, updated_at = NOW() WHERE id IN (${LEGACY_IDS.join(",")})`
    ) as any[];

    console.log(`\n✅ 已停用 ${(result as any).affectedRows} 個 squads (is_active → 0)`);

    // 確認結果
    const [remaining] = await conn.execute(
      `SELECT COUNT(*) as cnt FROM squads WHERE is_active = 1`
    ) as any[];
    console.log(`✅ 剩餘 active squads: ${(remaining as any[])[0].cnt}`);

  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[cleanup-legacy] ERROR:", err.message ?? err);
  process.exit(1);
});
